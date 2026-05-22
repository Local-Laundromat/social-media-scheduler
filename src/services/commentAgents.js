/**
 * Multi-Agent Comment Management System
 *
 * Uses LangGraph to orchestrate multiple specialized AI agents for
 * autonomous comment monitoring, analysis, and response generation.
 *
 * Meet the Comment Management Team:
 * 1. Nova 💭 - The Sentiment Analyzer (detects emotional tone)
 * 2. Echo 🔍 - The Intent Detective (identifies comment purpose)
 * 3. Atlas ⚡ - The Priority Scorer (rates urgency)
 * 4. Sage ✍️ - The Response Writer (creates brand-appropriate replies)
 * 5. Quinn 🤖 - The Auto-Reply Decision Maker (human review vs auto-reply)
 */

// Node.js 18 compatibility
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = require('crypto').webcrypto;
}

const { Annotation, StateGraph, END, START } = require("@langchain/langgraph");
const { ChatOpenAI } = require("@langchain/openai");
const { PromptTemplate } = require("@langchain/core/prompts");
const { StringOutputParser } = require("@langchain/core/output_parsers");

// Agent personalities
const COMMENT_AGENTS = {
  NOVA: { name: 'Nova', emoji: '💭', role: 'Sentiment Analyzer', action: 'analyzing sentiment' },
  ECHO: { name: 'Echo', emoji: '🔍', role: 'Intent Detective', action: 'detecting intent' },
  ATLAS: { name: 'Atlas', emoji: '⚡', role: 'Priority Scorer', action: 'scoring priority' },
  SAGE: { name: 'Sage', emoji: '✍️', role: 'Response Writer', action: 'crafting reply' },
  QUINN: { name: 'Quinn', emoji: '🤖', role: 'Auto-Reply Decision Maker', action: 'routing decision' }
};

/**
 * Comment Analysis State Schema
 */
const CommentState = Annotation.Root({
  // Input
  commentText: Annotation({ default: "" }),
  platform: Annotation({ default: "instagram" }),
  authorName: Annotation({ default: "User" }),
  postContext: Annotation({ default: "" }),
  brandInfo: Annotation({ default: {} }),

  // Analysis Results
  sentiment: Annotation({ default: "neutral" }), // positive, negative, neutral
  sentimentScore: Annotation({ default: 0 }), // -1 to 1
  intent: Annotation({ default: "general" }), // question, inquiry, praise, complaint, spam
  priority: Annotation({ default: "medium" }), // high, medium, low
  urgency: Annotation({ default: false }),

  // Response Generation
  suggestedReply: Annotation({ default: "" }),
  alternativeReplies: Annotation({ default: [] }),

  // Routing Decision
  shouldAutoReply: Annotation({ default: false }),
  requiresHumanReview: Annotation({ default: true }),
  escalationReason: Annotation({ default: "" }),

  // Metadata
  processingSteps: Annotation({ default: [] }),
  confidenceScore: Annotation({ default: 0 }),
  error: Annotation({ default: null })
});

/**
 * Get OpenAI model instance
 */
function getModel(apiKey) {
  if (!apiKey || apiKey === 'not-configured') {
    throw new Error('OpenAI API key not configured');
  }

  return new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0.3, // Lower for more consistent analysis
    openAIApiKey: apiKey
  });
}

/**
 * Agent 1: Nova - Sentiment Analyzer
 * Analyzes emotional tone of the comment
 */
async function sentimentAnalyzerAgent(state, config) {
  const apiKey = config?.configurable?.openaiApiKey;

  try {
    console.log(`[CommentAgents] ${COMMENT_AGENTS.NOVA.emoji} ${COMMENT_AGENTS.NOVA.name} is ${COMMENT_AGENTS.NOVA.action}...`);
    const model = getModel(apiKey);

    const prompt = `Analyze the sentiment of this social media comment.

Comment: "${state.commentText}"
Author: ${state.authorName}
Platform: ${state.platform}

Provide a JSON response with:
{
  "sentiment": "positive" | "negative" | "neutral",
  "score": (number from -1.0 to 1.0),
  "reasoning": "brief explanation"
}

Be especially sensitive to:
- Sarcasm and irony
- Mixed emotions
- Cultural context
- Emoji meanings`;

    const jsonModel = model.bind({ response_format: { type: "json_object" } });
    const response = await jsonModel.invoke(prompt);

    let result;
    try {
      result = JSON.parse(response.content);
    } catch (e) {
      // Fallback parsing
      const sentimentMatch = response.content.match(/"sentiment"\s*:\s*"(\w+)"/);
      const scoreMatch = response.content.match(/"score"\s*:\s*(-?\d+\.?\d*)/);

      result = {
        sentiment: sentimentMatch ? sentimentMatch[1] : 'neutral',
        score: scoreMatch ? parseFloat(scoreMatch[1]) : 0,
        reasoning: 'Parsed from response'
      };
    }

    return {
      sentiment: result.sentiment || 'neutral',
      sentimentScore: result.score || 0,
      processingSteps: [...state.processingSteps, `Sentiment: ${result.sentiment} (${result.score})`]
    };

  } catch (error) {
    console.error('[SentimentAgent] Error:', error);
    return {
      sentiment: 'neutral',
      sentimentScore: 0,
      error: `Sentiment analysis failed: ${error.message}`
    };
  }
}

/**
 * Agent 2: Echo - Intent Detective
 * Identifies the purpose/type of the comment
 */
async function intentClassifierAgent(state, config) {
  const apiKey = config?.configurable?.openaiApiKey;

  try {
    console.log(`[CommentAgents] ${COMMENT_AGENTS.ECHO.emoji} ${COMMENT_AGENTS.ECHO.name} is ${COMMENT_AGENTS.ECHO.action}...`);
    const model = getModel(apiKey);

    const prompt = `Classify the intent of this social media comment.

Comment: "${state.commentText}"
Sentiment: ${state.sentiment}
Platform: ${state.platform}

Classify into ONE of these categories:
- "question": Asking for information
- "inquiry": Business/purchase interest
- "praise": Positive feedback, compliment
- "complaint": Negative feedback, issue
- "spam": Spam, irrelevant, promotional
- "general": Casual engagement, emoji-only

Respond with JSON:
{
  "intent": "one of the above",
  "confidence": (0.0 to 1.0),
  "keywords": ["key", "words"],
  "requiresResponse": true/false
}`;

    const jsonModel = model.bind({ response_format: { type: "json_object" } });
    const response = await jsonModel.invoke(prompt);

    const result = JSON.parse(response.content);

    return {
      intent: result.intent || 'general',
      confidenceScore: result.confidence || 0.5,
      requiresHumanReview: result.intent === 'complaint' || result.intent === 'inquiry',
      processingSteps: [...state.processingSteps, `Intent: ${result.intent} (confidence: ${result.confidence})`]
    };

  } catch (error) {
    console.error('[IntentAgent] Error:', error);
    return {
      intent: 'general',
      confidenceScore: 0.5,
      error: state.error || `Intent classification failed: ${error.message}`
    };
  }
}

/**
 * Agent 3: Atlas - Priority Scorer
 * Determines urgency and priority level
 */
async function priorityScorerAgent(state, config) {
  const apiKey = config?.configurable?.openaiApiKey;

  try {
    console.log(`[CommentAgents] ${COMMENT_AGENTS.ATLAS.emoji} ${COMMENT_AGENTS.ATLAS.name} is ${COMMENT_AGENTS.ATLAS.action}...`);
    const model = getModel(apiKey);

    const prompt = `Determine the priority level of this comment requiring response.

Comment: "${state.commentText}"
Sentiment: ${state.sentiment} (${state.sentimentScore})
Intent: ${state.intent}

Assign priority based on:
- Negative sentiment + complaint = HIGH
- Inquiry/question = MEDIUM to HIGH
- Praise = LOW to MEDIUM
- Spam = LOW
- Time-sensitive language (e.g., "urgent", "ASAP") = HIGH

Respond with JSON:
{
  "priority": "high" | "medium" | "low",
  "urgency": true/false,
  "reasoning": "brief explanation",
  "suggestedResponseTime": "immediate" | "within_1hr" | "within_24hr"
}`;

    const jsonModel = model.bind({ response_format: { type: "json_object" } });
    const response = await jsonModel.invoke(prompt);

    const result = JSON.parse(response.content);

    return {
      priority: result.priority || 'medium',
      urgency: result.urgency || false,
      processingSteps: [...state.processingSteps, `Priority: ${result.priority}${result.urgency ? ' (URGENT)' : ''}`]
    };

  } catch (error) {
    console.error('[PriorityAgent] Error:', error);
    return {
      priority: 'medium',
      urgency: false,
      error: state.error || `Priority scoring failed: ${error.message}`
    };
  }
}

/**
 * Agent 4: Sage - Response Writer
 * Creates brand-appropriate reply suggestions
 */
async function responseGeneratorAgent(state, config) {
  const apiKey = config?.configurable?.openaiApiKey;

  try {
    console.log(`[CommentAgents] ${COMMENT_AGENTS.SAGE.emoji} ${COMMENT_AGENTS.SAGE.name} is ${COMMENT_AGENTS.SAGE.action}...`);
    const model = getModel(apiKey);

    const brandName = state.brandInfo.company || 'our team';
    const brandVoice = state.brandInfo.voice || 'professional and friendly';
    const contactEmail = state.brandInfo.contactInfo?.email || '';
    const contactPhone = state.brandInfo.contactInfo?.phone || '';

    const prompt = `Generate a response to this ${state.platform} comment.

Comment: "${state.commentText}"
Author: ${state.authorName}
Intent: ${state.intent}
Sentiment: ${state.sentiment}

Brand Information:
- Company: ${brandName}
- Voice: ${brandVoice}
- Email: ${contactEmail}
- Phone: ${contactPhone}

Guidelines:
- Match the brand voice perfectly
- Keep under 50 words for ${state.platform}
- Use 1-2 appropriate emojis
- Be helpful and authentic
- ${state.intent === 'complaint' ? 'Apologize and offer solution' : ''}
- ${state.intent === 'inquiry' ? 'Provide contact info' : ''}
- ${state.intent === 'question' ? 'Answer directly or guide to resources' : ''}
- ${state.intent === 'praise' ? 'Thank them warmly' : ''}

Generate 3 response options:
1. Formal/Professional
2. Friendly/Casual
3. Empathetic/Personal

Respond with JSON:
{
  "primary": "main suggested reply",
  "alternatives": ["option 2", "option 3"],
  "tone": "description of tone used"
}`;

    const jsonModel = model.bind({ response_format: { type: "json_object" } });
    const response = await jsonModel.invoke(prompt);

    const result = JSON.parse(response.content);

    return {
      suggestedReply: result.primary || "Thank you for your comment! 😊",
      alternativeReplies: result.alternatives || [],
      processingSteps: [...state.processingSteps, `Generated ${1 + (result.alternatives?.length || 0)} reply options`]
    };

  } catch (error) {
    console.error('[ResponseAgent] Error:', error);

    // Fallback template responses
    const fallbackReplies = {
      question: `Thanks for your question! Please DM us or email ${state.brandInfo.contactInfo?.email || 'us'} for more details. 😊`,
      inquiry: `We'd love to help! Please contact us to discuss further. 🏡`,
      praise: `Thank you so much for your kind words! We really appreciate it! ❤️`,
      complaint: `We're sorry to hear that. Please DM us so we can make this right.`,
      general: `Thanks for your comment! 😊`
    };

    return {
      suggestedReply: fallbackReplies[state.intent] || fallbackReplies.general,
      alternativeReplies: [],
      error: state.error || `Response generation failed, using template: ${error.message}`
    };
  }
}

/**
 * Agent 5: Quinn - Auto-Reply Decision Maker
 * Decides if auto-reply is safe or needs human review
 */
async function escalationRouterAgent(state, config) {
  const apiKey = config?.configurable?.openaiApiKey;

  try {
    console.log(`[CommentAgents] ${COMMENT_AGENTS.QUINN.emoji} ${COMMENT_AGENTS.QUINN.name} is making ${COMMENT_AGENTS.QUINN.action}...`);
    const model = getModel(apiKey);

    const prompt = `Decide if this comment response can be auto-posted or needs human review.

Comment: "${state.commentText}"
Intent: ${state.intent}
Sentiment: ${state.sentiment} (${state.sentimentScore})
Priority: ${state.priority}
Suggested Reply: "${state.suggestedReply}"

Auto-reply is SAFE for:
- Simple praise/thanks
- Basic questions with clear answers
- General positive engagement
- Spam (ignore, no reply)

Requires HUMAN REVIEW for:
- Complaints or negative feedback
- Complex questions
- Business inquiries
- Legal/sensitive topics
- Anything mentioning refunds, lawsuits, problems
- Low confidence responses

Respond with JSON:
{
  "autoReply": true/false,
  "reasoning": "explanation",
  "riskLevel": "low" | "medium" | "high"
}`;

    const jsonModel = model.bind({ response_format: { type: "json_object" } });
    const response = await jsonModel.invoke(prompt);

    const result = JSON.parse(response.content);

    const shouldAuto = result.autoReply &&
                       state.confidenceScore > 0.7 &&
                       state.priority !== 'high' &&
                       !state.urgency;

    return {
      shouldAutoReply: shouldAuto,
      requiresHumanReview: !shouldAuto,
      escalationReason: shouldAuto ? '' : (result.reasoning || 'Requires manual review'),
      processingSteps: [...state.processingSteps, `Decision: ${shouldAuto ? 'AUTO-REPLY' : 'HUMAN REVIEW'}`]
    };

  } catch (error) {
    console.error('[EscalationAgent] Error:', error);
    return {
      shouldAutoReply: false,
      requiresHumanReview: true,
      escalationReason: 'Error in routing decision - defaulting to human review',
      error: state.error || `Escalation routing failed: ${error.message}`
    };
  }
}

/**
 * Build and compile the multi-agent workflow
 */
const workflow = new StateGraph(CommentState)
  .addNode("sentimentAnalyzer", sentimentAnalyzerAgent)
  .addNode("intentClassifier", intentClassifierAgent)
  .addNode("priorityScorer", priorityScorerAgent)
  .addNode("responseGenerator", responseGeneratorAgent)
  .addNode("escalationRouter", escalationRouterAgent)
  .addEdge(START, "sentimentAnalyzer")
  .addEdge("sentimentAnalyzer", "intentClassifier")
  .addEdge("intentClassifier", "priorityScorer")
  .addEdge("priorityScorer", "responseGenerator")
  .addEdge("responseGenerator", "escalationRouter")
  .addEdge("escalationRouter", END);

const commentAgentGraph = workflow.compile();

/**
 * Convenience wrapper for processing a comment
 */
async function processComment({
  commentText,
  platform = 'instagram',
  authorName = 'User',
  postContext = '',
  brandInfo = {},
  openaiApiKey
}) {
  console.log(`[CommentAgents] Processing comment from ${authorName} on ${platform}`);

  try {
    const result = await commentAgentGraph.invoke(
      {
        commentText,
        platform,
        authorName,
        postContext,
        brandInfo,
        processingSteps: []
      },
      {
        configurable: {
          openaiApiKey: openaiApiKey || process.env.OPENAI_API_KEY
        }
      }
    );

    const decisionIcon = result.shouldAutoReply ? '✅' : '👤';
    console.log(`[CommentAgents] ${decisionIcon} ${COMMENT_AGENTS.QUINN.name}'s decision: ${result.shouldAutoReply ? 'AUTO-REPLY' : 'HUMAN REVIEW'}`);
    console.log(`[CommentAgents] Agent pipeline: ${COMMENT_AGENTS.NOVA.name} → ${COMMENT_AGENTS.ECHO.name} → ${COMMENT_AGENTS.ATLAS.name} → ${COMMENT_AGENTS.SAGE.name} → ${COMMENT_AGENTS.QUINN.name}`);

    return {
      success: true,
      analysis: {
        sentiment: result.sentiment,
        sentimentScore: result.sentimentScore,
        intent: result.intent,
        priority: result.priority,
        urgency: result.urgency,
        confidence: result.confidenceScore
      },
      response: {
        suggested: result.suggestedReply,
        alternatives: result.alternativeReplies
      },
      routing: {
        autoReply: result.shouldAutoReply,
        requiresReview: result.requiresHumanReview,
        reason: result.escalationReason
      },
      processingSteps: result.processingSteps,
      agentTeam: `${COMMENT_AGENTS.NOVA.emoji}${COMMENT_AGENTS.ECHO.emoji}${COMMENT_AGENTS.ATLAS.emoji}${COMMENT_AGENTS.SAGE.emoji}${COMMENT_AGENTS.QUINN.emoji}`,
      error: result.error
    };

  } catch (error) {
    console.error('[CommentAgents] Processing failed:', error);
    return {
      success: false,
      error: error.message,
      analysis: null,
      response: null,
      routing: {
        autoReply: false,
        requiresReview: true,
        reason: 'Processing error - requires manual review'
      }
    };
  }
}

module.exports = {
  commentAgentGraph,
  processComment,
  COMMENT_AGENTS, // Export agent personalities
  COMMENT_MANAGEMENT_TEAM: [COMMENT_AGENTS.NOVA, COMMENT_AGENTS.ECHO, COMMENT_AGENTS.ATLAS, COMMENT_AGENTS.SAGE, COMMENT_AGENTS.QUINN]
};
