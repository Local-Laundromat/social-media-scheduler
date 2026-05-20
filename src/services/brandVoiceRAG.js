/**
 * Brand Voice RAG (Retrieval-Augmented Generation) Service
 *
 * This service uses LangChain to create a RAG system that learns your brand voice
 * from past successful captions and generates new content that matches your style.
 *
 * Features:
 * - Stores successful captions in a vector database
 * - Retrieves similar past captions for context
 * - Generates new captions matching your brand voice
 * - Learns and improves over time
 */

const { ChatOpenAI, OpenAIEmbeddings } = require("@langchain/openai");
const { Chroma } = require("@langchain/community/vectorstores/chroma");
const { PromptTemplate } = require("@langchain/core/prompts");
const { RunnableSequence } = require("@langchain/core/runnables");
const { StringOutputParser } = require("@langchain/core/output_parsers");
const { Document } = require("@langchain/core/documents");
const { supabase } = require('../database/supabase');

class BrandVoiceRAG {
  constructor() {
    this.vectorStoreCache = new Map();
    this.embeddingsCache = new Map();
  }

  /**
   * Initialize or get vector store for a user
   */
  async getVectorStore(userId, openaiApiKey) {
    const cacheKey = `${userId}_${openaiApiKey || 'default'}`;

    if (this.vectorStoreCache.has(cacheKey)) {
      return this.vectorStoreCache.get(cacheKey);
    }

    const apiKey = openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === 'not-configured') {
      throw new Error('OpenAI API key not configured');
    }

    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: apiKey,
      modelName: "text-embedding-3-small" // Faster and cheaper
    });

    this.embeddingsCache.set(cacheKey, embeddings);

    // Create collection name from user ID
    const collectionName = `brand_voice_${userId.replace(/-/g, '_')}`;

    try {
      // Try to load existing vector store
      const vectorStore = await Chroma.fromExistingCollection(
        embeddings,
        { collectionName, url: process.env.CHROMA_URL || "http://localhost:8000" }
      );

      this.vectorStoreCache.set(cacheKey, vectorStore);
      return vectorStore;
    } catch (error) {
      // Collection doesn't exist, create it
      console.log(`Creating new vector store for user ${userId}`);
      return await this.initializeVectorStore(userId, apiKey);
    }
  }

  /**
   * Initialize vector store with user's successful captions
   */
  async initializeVectorStore(userId, openaiApiKey) {
    const apiKey = openaiApiKey || process.env.OPENAI_API_KEY;

    // Fetch user's top-performing captions
    const { data: posts, error } = await supabase
      .from('posts')
      .select('id, caption, platforms, created_at, status')
      .eq('user_id', userId)
      .not('caption', 'is', null)
      .neq('caption', '')
      .order('created_at', { ascending: false })
      .limit(100); // Index last 100 posts

    if (error) {
      console.error('Error fetching posts for RAG:', error);
      throw error;
    }

    if (!posts || posts.length === 0) {
      console.log(`No captions found for user ${userId}`);
      // Create empty vector store
      const embeddings = new OpenAIEmbeddings({
        openAIApiKey: apiKey,
        modelName: "text-embedding-3-small"
      });

      const collectionName = `brand_voice_${userId.replace(/-/g, '_')}`;

      return await Chroma.fromDocuments(
        [],
        embeddings,
        { collectionName, url: process.env.CHROMA_URL || "http://localhost:8000" }
      );
    }

    // Create documents from captions
    const documents = posts
      .filter(p => p.caption && p.caption.trim().length > 10)
      .map(post => new Document({
        pageContent: post.caption,
        metadata: {
          postId: post.id,
          platforms: post.platforms,
          status: post.status,
          createdAt: post.created_at,
        }
      }));

    if (documents.length === 0) {
      throw new Error('No valid captions found to initialize RAG');
    }

    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: apiKey,
      modelName: "text-embedding-3-small"
    });

    const collectionName = `brand_voice_${userId.replace(/-/g, '_')}`;

    console.log(`Initializing vector store with ${documents.length} captions for user ${userId}`);

    const vectorStore = await Chroma.fromDocuments(
      documents,
      embeddings,
      { collectionName, url: process.env.CHROMA_URL || "http://localhost:8000" }
    );

    const cacheKey = `${userId}_${apiKey || 'default'}`;
    this.vectorStoreCache.set(cacheKey, vectorStore);

    return vectorStore;
  }

  /**
   * Add new caption to vector store
   */
  async addCaption(userId, caption, metadata = {}, openaiApiKey) {
    try {
      const vectorStore = await this.getVectorStore(userId, openaiApiKey);

      const document = new Document({
        pageContent: caption,
        metadata: {
          ...metadata,
          addedAt: new Date().toISOString()
        }
      });

      await vectorStore.addDocuments([document]);

      console.log(`Added caption to vector store for user ${userId}`);
      return { success: true };
    } catch (error) {
      console.error('Error adding caption to vector store:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate caption using RAG - retrieves similar past captions for context
   */
  async generateCaption({
    userId,
    imageDescription,
    platforms = ['facebook', 'instagram'],
    postType = 'post',
    company = '',
    openaiApiKey
  }) {
    const apiKey = openaiApiKey || process.env.OPENAI_API_KEY;

    if (!apiKey || apiKey === 'not-configured') {
      return {
        success: false,
        error: 'OpenAI API key not configured'
      };
    }

    try {
      // Get vector store
      const vectorStore = await this.getVectorStore(userId, apiKey);

      // Search for similar captions
      const similarCaptions = await vectorStore.similaritySearch(
        imageDescription,
        5 // Get top 5 similar captions
      );

      // Create context from similar captions
      const captionExamples = similarCaptions
        .map((doc, idx) => {
          const platforms = doc.metadata.platforms || 'unknown';
          return `Example ${idx + 1} (${platforms}):\n"${doc.pageContent}"`;
        })
        .join('\n\n');

      // Create LangChain RAG prompt
      const ragPromptTemplate = new PromptTemplate({
        template: `You are a professional social media manager for {company}.

You have access to past successful captions from this brand. Your task is to generate a new caption that matches the brand's voice and style.

=== PAST SUCCESSFUL CAPTIONS ===
{captionExamples}

=== NEW POST DETAILS ===
Image/Content Description: {imageDescription}
Platforms: {platforms}
Post Type: {postType}

=== INSTRUCTIONS ===
1. Analyze the tone, style, emoji usage, and hashtag patterns from the past captions
2. Generate a new caption that matches this brand voice perfectly
3. Optimize for the specified platforms: {platforms}
4. Keep it engaging, authentic, and on-brand
5. Use emojis strategically (based on past usage patterns)
6. Include relevant hashtags at the end (2-5 hashtags)

Generate a caption that feels like it came from the same person/brand as the examples above.

CAPTION:`,
        inputVariables: ["company", "captionExamples", "imageDescription", "platforms", "postType"]
      });

      // Create chat model
      const model = new ChatOpenAI({
        modelName: "gpt-4o-mini",
        temperature: 0.7,
        openAIApiKey: apiKey
      });

      // Create chain
      const chain = RunnableSequence.from([
        ragPromptTemplate,
        model,
        new StringOutputParser()
      ]);

      // Generate caption
      const caption = await chain.invoke({
        company: company || 'our brand',
        captionExamples: captionExamples || 'No past captions available yet. Generate a professional, engaging caption.',
        imageDescription,
        platforms: platforms.join(', '),
        postType
      });

      return {
        success: true,
        caption: caption.trim(),
        similarCaptionsUsed: similarCaptions.length,
        method: 'RAG-powered (learning from your past captions)'
      };

    } catch (error) {
      console.error('RAG caption generation error:', error);

      // Fallback to simple generation
      return await this.fallbackCaptionGeneration({
        imageDescription,
        platforms,
        company,
        openaiApiKey: apiKey
      });
    }
  }

  /**
   * Fallback caption generation (no RAG, direct GPT)
   */
  async fallbackCaptionGeneration({ imageDescription, platforms, company, openaiApiKey }) {
    const model = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0.7,
      openAIApiKey: openaiApiKey || process.env.OPENAI_API_KEY
    });

    const prompt = `Generate an engaging social media caption for: ${imageDescription}
Company: ${company || 'our business'}
Platforms: ${platforms.join(', ')}

Make it professional, engaging, and include 2-5 relevant hashtags.`;

    const response = await model.invoke(prompt);

    return {
      success: true,
      caption: response.content.trim(),
      similarCaptionsUsed: 0,
      method: 'Direct generation (no past captions yet - RAG will improve over time)'
    };
  }

  /**
   * Analyze brand voice patterns
   */
  async analyzeBrandVoice(userId, openaiApiKey) {
    try {
      const vectorStore = await this.getVectorStore(userId, openaiApiKey);

      // Get all captions
      const { data: posts } = await supabase
        .from('posts')
        .select('caption, platforms')
        .eq('user_id', userId)
        .not('caption', 'is', null)
        .neq('caption', '')
        .limit(50);

      if (!posts || posts.length === 0) {
        return {
          success: false,
          error: 'No captions found to analyze'
        };
      }

      // Use GPT to analyze patterns
      const apiKey = openaiApiKey || process.env.OPENAI_API_KEY;
      const model = new ChatOpenAI({
        modelName: "gpt-4o-mini",
        temperature: 0.3,
        openAIApiKey: apiKey
      });

      const allCaptions = posts.map(p => p.caption).join('\n\n---\n\n');

      const analysisPrompt = `Analyze these social media captions and identify brand voice patterns:

${allCaptions}

Provide a detailed analysis including:
1. Overall tone (professional, casual, playful, etc.)
2. Emoji usage patterns
3. Hashtag strategy
4. Sentence structure and length
5. Key phrases or words frequently used
6. Audience targeting approach

Format as JSON with these keys: tone, emojiStyle, hashtagStrategy, writingStyle, keyPhrases, audienceApproach`;

      const response = await model.invoke(analysisPrompt);

      return {
        success: true,
        analysis: response.content,
        totalCaptionsAnalyzed: posts.length
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Clear vector store cache (call when user updates captions significantly)
   */
  clearCache(userId) {
    const keysToDelete = [];
    for (const key of this.vectorStoreCache.keys()) {
      if (key.startsWith(`${userId}_`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => {
      this.vectorStoreCache.delete(key);
      this.embeddingsCache.delete(key);
    });
    console.log(`Cleared RAG cache for user ${userId}`);
  }
}

// Singleton instance
const brandVoiceRAG = new BrandVoiceRAG();

module.exports = brandVoiceRAG;
