/**
 * RAG-Powered Caption Generation Routes
 * Uses LangChain + ChromaDB to learn from past captions and generate brand-consistent content
 */

const express = require('express');
const router = express.Router();
const brandVoiceRAG = require('../services/brandVoiceRAG');
const { authenticateToken } = require('../middleware/auth');
const { supabase } = require('../database/supabase');

/**
 * POST /api/rag/generate-caption
 * Generate caption using RAG (learns from your past captions)
 */
router.post('/generate-caption', authenticateToken, async (req, res) => {
  const {
    image_url,
    image_description,
    company,
    platforms = ['facebook', 'instagram'],
    post_type = 'post'
  } = req.body;

  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  if (!image_description && !image_url) {
    return res.status(400).json({
      success: false,
      error: 'Either image_description or image_url is required'
    });
  }

  try {
    // Get user's OpenAI API key
    const { data: profile } = await supabase
      .from('profiles')
      .select('openai_api_key')
      .eq('id', userId)
      .single();

    const openaiApiKey = profile?.openai_api_key || process.env.OPENAI_API_KEY;

    if (!openaiApiKey || openaiApiKey === 'not-configured') {
      return res.json({
        success: false,
        error: 'OpenAI API key not configured. Please add your OpenAI API key in Settings.'
      });
    }

    // Generate image description if URL provided but no description
    let description = image_description;
    if (!description && image_url) {
      // Use GPT-4 Vision to analyze image
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: openaiApiKey });

      const visionResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Describe this image in detail for social media caption generation. Focus on key visual elements, mood, and subject matter.'
              },
              {
                type: 'image_url',
                image_url: { url: image_url }
              }
            ]
          }
        ],
        max_tokens: 200
      });

      description = visionResponse.choices[0].message.content;
    }

    // Generate caption using RAG
    const result = await brandVoiceRAG.generateCaption({
      userId,
      imageDescription: description,
      platforms,
      postType: post_type,
      company: company || profile?.company || '',
      openaiApiKey
    });

    if (!result.success) {
      return res.status(500).json(result);
    }

    res.json({
      success: true,
      caption: result.caption,
      similarCaptionsUsed: result.similarCaptionsUsed,
      method: result.method,
      tip: result.similarCaptionsUsed === 0
        ? 'RAG learning mode: As you create more posts, the AI will learn your brand voice and generate better captions!'
        : `RAG found ${result.similarCaptionsUsed} similar past captions to match your brand voice`
    });

  } catch (error) {
    console.error('RAG caption generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate caption',
      details: error.message
    });
  }
});

/**
 * POST /api/rag/add-caption
 * Add a caption to the RAG vector store (called automatically when posts are created)
 */
router.post('/add-caption', authenticateToken, async (req, res) => {
  const { caption, post_id, platforms, status } = req.body;
  const userId = req.user?.id;

  if (!userId || !caption) {
    return res.status(400).json({
      success: false,
      error: 'User ID and caption are required'
    });
  }

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('openai_api_key')
      .eq('id', userId)
      .single();

    const openaiApiKey = profile?.openai_api_key || process.env.OPENAI_API_KEY;

    const result = await brandVoiceRAG.addCaption(
      userId,
      caption,
      { postId: post_id, platforms, status },
      openaiApiKey
    );

    res.json(result);

  } catch (error) {
    console.error('Error adding caption to RAG:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/rag/initialize
 * Initialize RAG system with user's existing captions
 */
router.post('/initialize', authenticateToken, async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('openai_api_key')
      .eq('id', userId)
      .single();

    const openaiApiKey = profile?.openai_api_key || process.env.OPENAI_API_KEY;

    if (!openaiApiKey || openaiApiKey === 'not-configured') {
      return res.json({
        success: false,
        error: 'OpenAI API key not configured'
      });
    }

    // This will load/create vector store with user's captions
    await brandVoiceRAG.initializeVectorStore(userId, openaiApiKey);

    res.json({
      success: true,
      message: 'RAG system initialized successfully',
      tip: 'The AI has learned from your past captions and will now generate content matching your brand voice!'
    });

  } catch (error) {
    console.error('RAG initialization error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/rag/brand-voice-analysis
 * Analyze brand voice patterns
 */
router.get('/brand-voice-analysis', authenticateToken, async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('openai_api_key')
      .eq('id', userId)
      .single();

    const openaiApiKey = profile?.openai_api_key || process.env.OPENAI_API_KEY;

    const result = await brandVoiceRAG.analyzeBrandVoice(userId, openaiApiKey);

    res.json(result);

  } catch (error) {
    console.error('Brand voice analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/rag/refresh
 * Clear cache and refresh RAG system
 */
router.post('/refresh', authenticateToken, async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    brandVoiceRAG.clearCache(userId);

    res.json({
      success: true,
      message: 'RAG cache cleared. Next caption generation will rebuild the learning model.'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
