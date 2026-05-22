/**
 * Multi-Agent Google Business Review Management System
 *
 * Uses LangGraph to orchestrate multiple specialized AI agents for
 * autonomous review monitoring, analysis, and response generation.
 *
 * Agents:
 * 1. Sentiment Analyzer - Detects emotional tone and satisfaction
 * 2. Review Classifier - Identifies review type and key topics
 * 3. Priority Scorer - Rates urgency and business impact
 * 4. Response Generator - Creates professional, brand-appropriate replies
 * 5. Escalation Router - Decides human review vs auto-reply
 */

// Node.js 18 compatibility
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = require('crypto').webcrypto;
}

const { Annotation, StateGraph, END, START } = require("@langchain/langgraph");
const { ChatOpenAI } = require("@langchain/openai");
const { PromptTemplate } = require("@langchain/core/prompts");
const { StringOutputParser } = require("@langchain/core/output_parsers");

/**
 * Review Analysis State Schema
 */
const ReviewState = Annotation.Root({
  // Input
  reviewText: Annotation({ default: "" }),
  starRating: Annotation({ default: 5 }), // 1-5 stars
  reviewerName: Annotation({ default: "Customer" }),
  businessName: Annotation({ default: "" }),
  brandInfo: Annotation({ default: {} }),

  // Analysis Results
  sentiment: Annotation({ default: "positive" }), // positive, negative, neutral
  sentimentScore: Annotation({ default: 0 }), // -1 to 1
  reviewType: Annotation({ default: "general" }), // praise, complaint, mixed, spam, service, product
  keyTopics: Annotation({ default: [] }), // e.g., ["cleanliness", "staff", "price"]
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
 * Agent 1: Sentiment Analyzer
 * Analyzes emotional tone and customer satisfaction
 */
async function sentimentAnalyzerAgent(state, config) {
  const apiKey = config?.configurable?.openaiApiKey;

  try {
    const model = getModel(apiKey);

    const prompt = `Analyze the sentiment of this Google Business review.

Review: "${state.reviewText}"
Star Rating: ${state.starRating}/5
Reviewer: ${state.reviewerName}

Provide a JSON response with:
{
  "sentiment": "positive" | "negative" | "neutral",
  "score": (number from -1.0 to 1.0, where 1.0 is extremely positive),
  "reasoning": "brief explanation",
  "emotionalTone": "description of emotional state (e.g., 'satisfied', 'frustrated', 'disappointed')"
}

Consider:
- Star rating alignment with text
- Mixed feelings (positive overall but with complaints)
- Sarcasm or passive-aggressive language
- Cultural and contextual nuances`;

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
        sentiment: sentimentMatch ? sentimentMatch[1] : (state.starRating >= 4 ? 'positive' : state.starRating <= 2 ? 'negative' : 'neutral'),
        score: scoreMatch ? parseFloat(scoreMatch[1]) : (state.starRating - 3) / 2,
        reasoning: 'Parsed from response'
      };
    }

    return {
      sentiment: result.sentiment || 'neutral',
      sentimentScore: result.score || 0,
      processingSteps: [...state.processingSteps, `Sentiment: ${result.sentiment} (${result.score}) - ${result.emotionalTone || ''}`]
    };

  } catch (error) {
    console.error('[ReviewSentimentAgent] Error:', error);
    // Fallback to star rating
    const fallbackSentiment = state.starRating >= 4 ? 'positive' : state.starRating <= 2 ? 'negative' : 'neutral';
    return {
      sentiment: fallbackSentiment,
      sentimentScore: (state.starRating - 3) / 2,
      error: `Sentiment analysis failed: ${error.message}`
    };
  }
}

/**
 * Agent 2: Review Classifier
 * Identifies review type and key topics
 */
async function reviewClassifierAgent(state, config) {
  const apiKey = config?.configurable?.openaiApiKey;

  try {
    const model = getModel(apiKey);

    const prompt = `Classify this Google Business review and identify key topics.

Review: "${state.reviewText}"
Star Rating: ${state.starRating}/5
Sentiment: ${state.sentiment}

Classify into ONE primary category:
- "praise": Overwhelmingly positive feedback
- "complaint": Specific issues or problems mentioned
- "mixed": Both positive and negative aspects
- "spam": Irrelevant, fake, or promotional
- "service": Focus on customer service experience
- "product": Focus on product quality or offerings

Extract key topics mentioned (e.g., "cleanliness", "staff", "wait time", "price", "quality", "location", "atmosphere"):

Respond with JSON:
{
  "reviewType": "one of the above",
  "keyTopics": ["topic1", "topic2", "topic3"],
  "positiveAspects": ["what they liked"],
  "negativeAspects": ["what they didn't like"],
  "confidence": (0.0 to 1.0)
}`;

    const jsonModel = model.bind({ response_format: { type: "json_object" } });
    const response = await jsonModel.invoke(prompt);

    const result = JSON.parse(response.content);

    return {
      reviewType: result.reviewType || 'general',
      keyTopics: result.keyTopics || [],
      confidenceScore: result.confidence || 0.5,
      requiresHumanReview: result.reviewType === 'complaint' || result.reviewType === 'mixed',
      processingSteps: [
        ...state.processingSteps,
        `Type: ${result.reviewType} | Topics: ${result.keyTopics?.join(', ') || 'none'}`
      ]
    };

  } catch (error) {
    console.error('[ReviewClassifierAgent] Error:', error);
    return {
      reviewType: 'general',
      keyTopics: [],
      confidenceScore: 0.5,
      error: state.error || `Review classification failed: ${error.message}`
    };
  }
}

/**
 * Agent 3: Priority Scorer
 * Determines urgency and business impact
 */
async function priorityScorerAgent(state, config) {
  const apiKey = config?.configurable?.openaiApiKey;

  try {
    const model = getModel(apiKey);

    const prompt = `Determine the priority and business impact of this review.

Review: "${state.reviewText}"
Star Rating: ${state.starRating}/5
Sentiment: ${state.sentiment} (${state.sentimentScore})
Type: ${state.reviewType}
Topics: ${state.keyTopics.join(', ')}

Priority Guidelines:
- 1-2 stars with specific complaints = HIGH (damage to reputation)
- 5 stars with detailed praise = MEDIUM (opportunity to thank and build loyalty)
- 3 stars (neutral/mixed) = MEDIUM (opportunity to improve)
- Generic praise (4-5 stars, short) = LOW
- Spam or fake = LOW

Consider:
- Review visibility (detailed reviews get more views)
- Reputation risk (negative reviews need quick response)
- Opportunity for brand building (exceptional service stories)

Respond with JSON:
{
  "priority": "high" | "medium" | "low",
  "urgency": true/false,
  "businessImpact": "description",
  "recommendedResponseTime": "immediate" | "within_24hr" | "within_3days",
  "reasoning": "brief explanation"
}`;

    const jsonModel = model.bind({ response_format: { type: "json_object" } });
    const response = await jsonModel.invoke(prompt);

    const result = JSON.parse(response.content);

    return {
      priority: result.priority || 'medium',
      urgency: result.urgency || false,
      processingSteps: [
        ...state.processingSteps,
        `Priority: ${result.priority}${result.urgency ? ' (URGENT)' : ''} - ${result.recommendedResponseTime}`
      ]
    };

  } catch (error) {
    console.error('[ReviewPriorityAgent] Error:', error);
    // Fallback: low star ratings are high priority
    const fallbackPriority = state.starRating <= 2 ? 'high' : state.starRating >= 5 ? 'medium' : 'low';
    return {
      priority: fallbackPriority,
      urgency: state.starRating === 1,
      error: state.error || `Priority scoring failed: ${error.message}`
    };
  }
}

/**
 * Agent 4: Response Generator
 * Creates professional, empathetic reply suggestions
 */
async function responseGeneratorAgent(state, config) {
  const apiKey = config?.configurable?.openaiApiKey;

  try {
    const model = getModel(apiKey);

    const businessName = state.businessName || state.brandInfo.company || 'our business';

    // Use brand voice settings from profile
    const brandVoice = state.brandInfo.brand_voice || {};
    const tone = brandVoice.tone || 'friendly';
    const customDescription = brandVoice.custom_description || '';
    const emojiUsage = brandVoice.emoji_usage || 'moderate';
    const responseLength = brandVoice.response_length || 'medium';
    const contactEmail = brandVoice.contact_email || state.brandInfo.contactInfo?.email || '';
    const contactPhone = brandVoice.contact_phone || state.brandInfo.contactInfo?.phone || '';

    // Build tone description
    const toneDescriptions = {
      'friendly': 'warm, approachable, and conversational',
      'professional': 'polished, formal, and business-appropriate',
      'playful': 'fun, energetic, and lighthearted',
      'expert': 'knowledgeable, authoritative, and confident',
      'custom': customDescription || 'professional and friendly'
    };
    const toneDescription = tone === 'custom' ? customDescription : toneDescriptions[tone];

    // Build emoji guidance
    const emojiGuidance = {
      'heavy': 'Use 2-3 emojis throughout the response for warmth and energy',
      'moderate': 'Use 1 emoji strategically (optional)',
      'light': 'Use 0-1 emoji only if highly appropriate',
      'none': 'Do not use any emojis - professional text only'
    };

    // Build length guidance (Google reviews support longer responses than comments)
    const lengthGuidance = {
      'brief': 'Keep response concise, under 50 words',
      'medium': 'Keep response balanced, under 100 words',
      'detailed': 'Provide thorough response, up to 150 words if needed'
    };

    const prompt = `Generate a professional response to this Google Business review.

Review: "${state.reviewText}"
Star Rating: ${state.starRating}/5
Reviewer: ${state.reviewerName}
Type: ${state.reviewType}
Sentiment: ${state.sentiment}
Key Topics: ${state.keyTopics.join(', ')}

Business Information:
- Name: ${businessName}
- Brand Voice: ${toneDescription}
- Email: ${contactEmail}
- Phone: ${contactPhone}

Style Guidelines:
- Voice & Tone: ${toneDescription}
- Emoji Usage: ${emojiGuidance[emojiUsage]}
- Response Length: ${lengthGuidance[responseLength]}
- Be authentic and personalized (not generic templates)
- Match brand voice perfectly
- Sound human, not robotic

Response Guidelines:
${state.starRating >= 4 ? `
- Thank the reviewer warmly and specifically
- Highlight what they mentioned (use their words)
- Invite them back
- Keep it genuine and personal (not generic)
` : ''}
${state.starRating <= 2 ? `
- Apologize sincerely for their experience
- Acknowledge specific issues they mentioned
- Offer to make it right (invite to contact you)
- Show commitment to improvement
- Be empathetic and professional (don't be defensive)
` : ''}
${state.starRating === 3 ? `
- Thank them for feedback
- Address both positive and negative points
- Show commitment to improvement
- Invite further conversation
` : ''}

Generate 3 response variations that match the brand voice:
1. Main suggestion (perfectly matches brand voice)
2. Alternative approach (slightly different angle)
3. Backup option (safe, professional)

Respond with JSON:
{
  "primary": "main suggested reply",
  "alternatives": ["variation 2", "variation 3"],
  "tone": "description of tone used"
}`;

    const jsonModel = model.bind({ response_format: { type: "json_object" } });
    const response = await jsonModel.invoke(prompt);

    const result = JSON.parse(response.content);

    return {
      suggestedReply: result.primary || generateFallbackReply(state),
      alternativeReplies: result.alternatives || [],
      processingSteps: [
        ...state.processingSteps,
        `Generated ${1 + (result.alternatives?.length || 0)} reply options (tone: ${result.tone})`
      ]
    };

  } catch (error) {
    console.error('[ReviewResponseAgent] Error:', error);

    return {
      suggestedReply: generateFallbackReply(state),
      alternativeReplies: [],
      error: state.error || `Response generation failed, using template: ${error.message}`
    };
  }
}

/**
 * Generate fallback template response
 */
function generateFallbackReply(state) {
  const businessName = state.businessName || state.brandInfo.company || 'our team';

  if (state.starRating >= 4) {
    return `Thank you so much for your wonderful review, ${state.reviewerName}! We're thrilled to hear you had a great experience. We look forward to seeing you again soon! - ${businessName}`;
  } else if (state.starRating <= 2) {
    return `We're very sorry to hear about your experience, ${state.reviewerName}. This isn't the standard we hold ourselves to. Please contact us so we can make this right. - ${businessName}`;
  } else {
    return `Thank you for your feedback, ${state.reviewerName}. We appreciate you taking the time to share your experience. We're always working to improve and would love to hear more. - ${businessName}`;
  }
}

/**
 * Agent 5: Escalation Router
 * Decides if auto-reply is safe or needs human review
 */
async function escalationRouterAgent(state, config) {
  const apiKey = config?.configurable?.openaiApiKey;

  try {
    const model = getModel(apiKey);

    const prompt = `Decide if this review response can be auto-posted or needs human review.

Review: "${state.reviewText}"
Star Rating: ${state.starRating}/5
Type: ${state.reviewType}
Sentiment: ${state.sentiment} (${state.sentimentScore})
Priority: ${state.priority}
Suggested Reply: "${state.suggestedReply}"

Auto-reply is SAFE for:
- Simple 5-star praise with no specific issues
- Generic positive reviews (4-5 stars, short text)
- High confidence, low risk responses

Requires HUMAN REVIEW for:
- All 1-2 star reviews (reputation critical)
- Reviews mentioning specific problems or complaints
- Mixed reviews (3 stars or positive + negative)
- Reviews mentioning legal issues, health/safety, discrimination
- Anything mentioning refunds, lawsuits, violations
- Reviews that seem fake or suspicious
- Complex situations requiring judgment

Google Business reviews are PUBLIC and PERMANENT, so err on the side of human review.

Respond with JSON:
{
  "autoReply": true/false,
  "reasoning": "detailed explanation",
  "riskLevel": "low" | "medium" | "high"
}`;

    const jsonModel = model.bind({ response_format: { type: "json_object" } });
    const response = await jsonModel.invoke(prompt);

    const result = JSON.parse(response.content);

    // Safety checks: Only auto-reply for very safe scenarios
    const shouldAuto = result.autoReply &&
                       state.confidenceScore > 0.75 &&
                       state.starRating >= 4 &&
                       state.priority === 'low' &&
                       !state.urgency &&
                       state.reviewType === 'praise';

    return {
      shouldAutoReply: shouldAuto,
      requiresHumanReview: !shouldAuto,
      escalationReason: shouldAuto ? '' : (result.reasoning || 'Requires manual review for quality assurance'),
      processingSteps: [
        ...state.processingSteps,
        `Decision: ${shouldAuto ? 'AUTO-REPLY (low risk)' : 'HUMAN REVIEW'} - Risk: ${result.riskLevel}`
      ]
    };

  } catch (error) {
    console.error('[ReviewEscalationAgent] Error:', error);
    // Default to human review for safety
    return {
      shouldAutoReply: false,
      requiresHumanReview: true,
      escalationReason: 'Error in routing decision - defaulting to human review for safety',
      error: state.error || `Escalation routing failed: ${error.message}`
    };
  }
}

/**
 * Build and compile the multi-agent workflow
 */
const workflow = new StateGraph(ReviewState)
  .addNode("sentimentAnalyzer", sentimentAnalyzerAgent)
  .addNode("reviewClassifier", reviewClassifierAgent)
  .addNode("priorityScorer", priorityScorerAgent)
  .addNode("responseGenerator", responseGeneratorAgent)
  .addNode("escalationRouter", escalationRouterAgent)
  .addEdge(START, "sentimentAnalyzer")
  .addEdge("sentimentAnalyzer", "reviewClassifier")
  .addEdge("reviewClassifier", "priorityScorer")
  .addEdge("priorityScorer", "responseGenerator")
  .addEdge("responseGenerator", "escalationRouter")
  .addEdge("escalationRouter", END);

const reviewAgentGraph = workflow.compile();

/**
 * Convenience wrapper for processing a review
 */
async function processReview({
  reviewText,
  starRating = 5,
  reviewerName = 'Customer',
  businessName = '',
  brandInfo = {},
  openaiApiKey
}) {
  console.log(`[ReviewAgents] Processing ${starRating}-star review from ${reviewerName}`);

  try {
    const result = await reviewAgentGraph.invoke(
      {
        reviewText,
        starRating,
        reviewerName,
        businessName,
        brandInfo,
        processingSteps: []
      },
      {
        configurable: {
          openaiApiKey: openaiApiKey || process.env.OPENAI_API_KEY
        }
      }
    );

    console.log(`[ReviewAgents] Completed. Decision: ${result.shouldAutoReply ? 'AUTO' : 'REVIEW'}`);
    console.log(`[ReviewAgents] Processing steps:`, result.processingSteps);

    return {
      success: true,
      analysis: {
        sentiment: result.sentiment,
        sentimentScore: result.sentimentScore,
        reviewType: result.reviewType,
        keyTopics: result.keyTopics,
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
      error: result.error
    };

  } catch (error) {
    console.error('[ReviewAgents] Processing failed:', error);
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
  reviewAgentGraph,
  processReview
};
