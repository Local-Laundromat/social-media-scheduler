/**
 * LangGraph Autonomous Post Generation Agent
 * Self-correcting workflow: Draft → Critique → Improve → Publish
 *
 * Meet the Content Planning Team:
 * - Lily 📝: The Creative Writer (generates engaging drafts)
 * - Marcus 🎯: The Quality Critic (ensures excellence)
 * - Kai 📊: The Strategy Optimizer (refines with feedback)
 */

// Node.js 18 compatibility: polyfill crypto for uuid module
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = require('crypto').webcrypto;
}

const { Annotation, StateGraph, END, START } = require("@langchain/langgraph");
const { ChatOpenAI } = require("@langchain/openai");

// Maximum retry attempts before accepting draft
const MAX_RETRIES = 3;
const QUALITY_THRESHOLD = 8; // Score out of 10

// Agent personalities
const AGENTS = {
  LILY: { name: 'Lily', emoji: '📝', role: 'Creative Writer', action: 'drafting' },
  MARCUS: { name: 'Marcus', emoji: '🎯', role: 'Quality Critic', action: 'reviewing' },
  KAI: { name: 'Kai', emoji: '📊', role: 'Strategy Optimizer', action: 'optimizing' }
};

/**
 * State schema for the agent workflow
 */
const GraphState = Annotation.Root({
  niche: Annotation({ default: "" }),
  platform: Annotation({ default: "instagram" }),
  brandSettings: Annotation({ default: null }),
  draft: Annotation({ default: "" }),
  critiqueScore: Annotation({ default: 0 }),
  feedback: Annotation({ default: "" }),
  retryCount: Annotation({ default: 0 }),
  error: Annotation({ default: null }),
  agentStatus: Annotation({ default: "" }), // Current agent activity for UI
  agentLog: Annotation({ default: [] }), // Activity history
});

/**
 * Get OpenAI model instance
 */
function getModel() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || apiKey === 'not-configured') {
    throw new Error('OPENAI_API_KEY not configured in environment variables');
  }

  return new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0.7,
    openAIApiKey: apiKey
  });
}

/**
 * Node 1: Draft Writer Agent (Lily)
 * Generates social media post optimized for platform
 */
async function draftNode(state) {
  try {
    const agentLog = [...(state.agentLog || [])];
    const attemptNum = (state.retryCount || 0) + 1;
    const status = attemptNum === 1
      ? `${AGENTS.LILY.emoji} ${AGENTS.LILY.name} is ${AGENTS.LILY.action} your ${state.platform} post...`
      : `${AGENTS.KAI.emoji} ${AGENTS.KAI.name} is ${AGENTS.KAI.action} based on ${AGENTS.MARCUS.name}'s feedback (attempt ${attemptNum})...`;

    agentLog.push({ agent: attemptNum === 1 ? 'Lily' : 'Kai', action: attemptNum === 1 ? 'drafting' : 'optimizing', timestamp: new Date().toISOString() });
    console.log(`[AgentGraph] ${status}`);

    const model = getModel();

    const brandContext = state.brandSettings
      ? `Brand Guidelines:\n${JSON.stringify(state.brandSettings, null, 2)}`
      : "Standard professional tone with engaging personality";

    const platform = state.platform || 'instagram';
    const niche = state.niche || 'general business';

    // Platform-specific guidelines
    const platformGuidelines = {
      facebook: 'Conversational tone, up to 500 characters, encourage comments and shares, use questions',
      instagram: 'Visual storytelling, 150-300 characters, strong first line, strategic line breaks, emoji-rich, hashtags at end',
      tiktok: 'Short and punchy, max 150 characters, trendy language, call-to-action, lots of hashtags',
      linkedin: 'Professional yet personable, thought leadership, 200-400 characters, industry insights',
    };

    const guideline = platformGuidelines[platform.toLowerCase()] || platformGuidelines.instagram;

    const feedbackSection = state.feedback
      ? `\n\nCRITICAL FEEDBACK FROM PREVIOUS ATTEMPT (Attempt ${state.retryCount + 1}/${MAX_RETRIES}):\n${state.feedback}\n\nYou MUST address all these issues in your new draft.`
      : '';

    const prompt = `You are an elite Social Media Marketing Specialist with 10+ years of experience creating viral content.

Your task: Write a high-converting ${platform} post for the ${niche} niche.

Platform Guidelines for ${platform}:
${guideline}

${brandContext}

Requirements:
- NO generic AI hooks like "Hey there!" or "In today's digital world..."
- Start with a STRONG first sentence that stops the scroll
- Use natural, conversational language
- Include 1-3 strategic emojis (not excessive)
- End with a clear call-to-action or engagement question
- For Instagram/TikTok: Include 5-10 relevant hashtags at the very end
- Match the brand voice perfectly${feedbackSection}

Write ONLY the post caption. No explanations or meta-commentary.`;

    const response = await model.invoke(prompt);
    const draft = response.content.trim();

    return {
      draft,
      retryCount: (state.retryCount || 0) + 1,
      error: null,
      agentStatus: status,
      agentLog
    };
  } catch (error) {
    console.error('[AgentGraph] Draft generation error:', error);
    return {
      error: `Failed to generate draft: ${error.message}`,
      retryCount: (state.retryCount || 0) + 1
    };
  }
}

/**
 * Node 2: Critique Agent (Marcus)
 * Evaluates draft quality and provides feedback
 */
async function critiqueNode(state) {
  try {
    // If draft generation failed, skip critique
    if (state.error || !state.draft) {
      return {
        critiqueScore: 0,
        feedback: state.error || "No draft to critique"
      };
    }

    const agentLog = [...(state.agentLog || [])];
    const status = `${AGENTS.MARCUS.emoji} ${AGENTS.MARCUS.name} is ${AGENTS.MARCUS.action} the quality...`;
    agentLog.push({ agent: 'Marcus', action: 'reviewing', timestamp: new Date().toISOString() });
    console.log(`[AgentGraph] ${status}`);

    const model = getModel();
    const platform = state.platform || 'instagram';

    const prompt = `You are a strict Social Media Quality Auditor with expertise in ${platform} content strategy.

Analyze this draft post for ${platform}:

"${state.draft}"

Scoring Criteria (1-10 scale):
1. Hook Strength: Does the first sentence grab attention? (No generic AI openings)
2. Platform Optimization: Does it follow ${platform} best practices for format and length?
3. Engagement Potential: Will this get comments/shares/saves?
4. Authenticity: Does it sound human, not robotic?
5. Call-to-Action: Is there a clear next step for the reader?

Penalties:
- Generic AI phrases ("Hey there!", "In today's world", "Let's dive in"): -3 points
- Too long or too short for platform: -2 points
- Weak or missing CTA: -1 point
- Overuse of emojis (more than 5): -2 points
- Poor hashtag strategy (if applicable): -1 point

You MUST respond with ONLY valid JSON in this exact format:
{
  "score": 8,
  "feedback": "Specific issues to fix, or empty string if passing"
}`;

    const jsonModel = model.bind({ response_format: { type: "json_object" } });
    const response = await jsonModel.invoke(prompt);

    let result;
    try {
      result = JSON.parse(response.content);
    } catch (parseError) {
      console.error('[AgentGraph] JSON parse error:', response.content);
      // Fallback: extract score with regex
      const scoreMatch = response.content.match(/"score"\s*:\s*(\d+)/);
      const score = scoreMatch ? parseInt(scoreMatch[1]) : 5;
      result = {
        score,
        feedback: "Unable to parse full critique - please review manually"
      };
    }

    // Validate score
    const score = typeof result.score === 'number' ? result.score : 5;
    const validScore = Math.max(1, Math.min(10, score)); // Clamp between 1-10

    return {
      critiqueScore: validScore,
      feedback: result.feedback || "",
      agentStatus: status,
      agentLog
    };
  } catch (error) {
    console.error('[AgentGraph] Critique error:', error);
    // Default to low score to trigger retry
    return {
      critiqueScore: 5,
      feedback: `Critique failed: ${error.message}. Defaulting to retry.`
    };
  }
}

/**
 * Conditional routing: Decide if we should continue or finish
 */
function shouldContinue(state) {
  // Stop if error occurred
  if (state.error) {
    console.log(`[AgentGraph] ❌ Stopping due to error: ${state.error}`);
    return END;
  }

  // Stop if quality threshold met
  if (state.critiqueScore >= QUALITY_THRESHOLD) {
    console.log(`[AgentGraph] ✅ ${AGENTS.MARCUS.name} approved! Score: ${state.critiqueScore}/${QUALITY_THRESHOLD}. Ready to publish.`);
    return END;
  }

  // Stop if max retries reached
  if (state.retryCount >= MAX_RETRIES) {
    console.log(`[AgentGraph] ⏰ Max attempts reached (${state.retryCount}/${MAX_RETRIES}). Using best draft with score ${state.critiqueScore}.`);
    return END;
  }

  // Otherwise, retry with feedback
  console.log(`[AgentGraph] 🔄 ${AGENTS.MARCUS.name} says: Score ${state.critiqueScore}/${QUALITY_THRESHOLD}. Sending to ${AGENTS.KAI.name} for optimization...`);
  return "writer";
}

/**
 * Build and compile the agent workflow graph
 */
const workflow = new StateGraph(GraphState)
  .addNode("writer", draftNode)
  .addNode("critic", critiqueNode)
  .addEdge(START, "writer")
  .addEdge("writer", "critic")
  .addConditionalEdges("critic", shouldContinue);

const autonomousPostGenerator = workflow.compile();

/**
 * Convenience wrapper function with better error handling
 */
async function generateAutonomousPost(config) {
  const { niche, platform, brandSettings } = config;

  console.log(`[AgentGraph] Starting autonomous post generation for ${platform} in ${niche} niche`);

  try {
    const result = await autonomousPostGenerator.invoke({
      niche,
      platform: platform || 'instagram',
      brandSettings: brandSettings || null,
      draft: "",
      critiqueScore: 0,
      feedback: "",
      retryCount: 0,
      error: null
    });

    // Check if we got a valid result
    if (result.error) {
      throw new Error(result.error);
    }

    if (!result.draft) {
      throw new Error('Agent failed to generate any draft content');
    }

    console.log(`[AgentGraph] ✨ Content ready! Final score: ${result.critiqueScore}/10 after ${result.retryCount} attempts`);

    return {
      success: true,
      draft: result.draft,
      score: result.critiqueScore,
      attempts: result.retryCount,
      feedback: result.feedback,
      agentLog: result.agentLog || [],
      metadata: {
        platform,
        niche,
        qualityThresholdMet: result.critiqueScore >= QUALITY_THRESHOLD,
        agents: `${AGENTS.LILY.name} → ${AGENTS.MARCUS.name}${result.retryCount > 1 ? ` → ${AGENTS.KAI.name}` : ''}`
      }
    };
  } catch (error) {
    console.error('[AgentGraph] Autonomous generation failed:', error);
    return {
      success: false,
      error: error.message,
      draft: null
    };
  }
}

module.exports = {
  autonomousPostGenerator,
  generateAutonomousPost,
  AGENTS, // Export agent personalities
  CONTENT_PLANNING_TEAM: [AGENTS.LILY, AGENTS.MARCUS, AGENTS.KAI]
};
