/**
 * Autonomous Content Planning Agent
 *
 * Uses LangGraph to analyze bulk uploaded assets and create an optimized
 * content calendar with strategic narrative flow and engagement timing.
 *
 * Agents:
 * 1. Asset Analyzer - Analyzes uploaded files for themes, quality, variety
 * 2. Narrative Strategist - Groups content into cohesive story arcs
 * 3. Timing Optimizer - Determines optimal posting times based on engagement data
 * 4. Calendar Builder - Constructs final schedule with spacing and variety
 */

// Node.js 18 compatibility
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = require('crypto').webcrypto;
}

const { Annotation, StateGraph, END, START } = require("@langchain/langgraph");
const { ChatOpenAI } = require("@langchain/openai");
const { PromptTemplate } = require("@langchain/core/prompts");
const { supabase } = require('../database/supabase');

/**
 * Content Planning State Schema
 */
const PlanningState = Annotation.Root({
  // Input
  userId: Annotation({ default: "" }),
  files: Annotation({ default: [] }), // Array of file objects with name, type, url
  niche: Annotation({ default: "general" }),
  schedulePattern: Annotation({ default: "daily" }), // daily, weekdays, 3x-week, etc.
  platforms: Annotation({ default: [] }),
  startDate: Annotation({ default: null }),

  // Analysis Results
  assetAnalysis: Annotation({ default: null }),
  contentThemes: Annotation({ default: [] }),
  narrativeGroups: Annotation({ default: [] }),

  // Timing Optimization
  optimalTimes: Annotation({ default: [] }),
  engagementWindows: Annotation({ default: {} }),

  // Final Output
  contentCalendar: Annotation({ default: [] }),
  strategyExplanation: Annotation({ default: "" }),

  // Metadata
  processingSteps: Annotation({ default: [] }),
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
    temperature: 0.6, // Slightly creative for content strategy
    openAIApiKey: apiKey
  });
}

/**
 * Agent 1: Asset Analyzer
 * Analyzes uploaded files for themes, content types, and quality
 */
async function assetAnalyzerAgent(state, config) {
  const apiKey = config?.configurable?.openaiApiKey;

  try {
    const model = getModel(apiKey);

    // Create file summary
    const fileList = state.files.map((f, i) => {
      const type = f.type?.includes('video') ? 'VIDEO' : 'IMAGE';
      return `${i + 1}. ${f.name} (${type})`;
    }).join('\n');

    const prompt = `Analyze these ${state.files.length} content assets for a ${state.niche} business:

${fileList}

Analyze and identify:
1. Main content themes and topics
2. Content type distribution (product shots, lifestyle, educational, behind-the-scenes, etc.)
3. Visual style patterns
4. Potential content pillars (categories to organize posts)
5. Suggested narrative flow to maximize engagement

Respond with JSON:
{
  "totalAssets": ${state.files.length},
  "contentTypes": {
    "product": 0,
    "lifestyle": 0,
    "educational": 0,
    "behindScenes": 0,
    "testimonial": 0,
    "promotional": 0
  },
  "identifiedThemes": ["theme1", "theme2"],
  "contentPillars": [
    {
      "name": "pillar name",
      "description": "what this pillar covers",
      "assetIndexes": [0, 5, 12]
    }
  ],
  "qualityScore": 8.5,
  "varietyScore": 7.0,
  "recommendations": ["suggestion 1", "suggestion 2"]
}`;

    const jsonModel = model.bind({ response_format: { type: "json_object" } });
    const response = await jsonModel.invoke(prompt);

    const analysis = JSON.parse(response.content);

    return {
      assetAnalysis: analysis,
      contentThemes: analysis.identifiedThemes || [],
      processingSteps: [
        ...state.processingSteps,
        `Analyzed ${state.files.length} assets: ${analysis.contentPillars?.length || 0} content pillars identified`
      ]
    };

  } catch (error) {
    console.error('[AssetAnalyzer] Error:', error);
    return {
      error: `Asset analysis failed: ${error.message}`,
      processingSteps: [...state.processingSteps, `Asset analysis failed`]
    };
  }
}

/**
 * Agent 2: Narrative Strategist
 * Groups content into cohesive story arcs and campaign themes
 */
async function narrativeStrategistAgent(state, config) {
  const apiKey = config?.configurable?.openaiApiKey;

  try {
    const model = getModel(apiKey);

    const prompt = `You are a Content Strategy Director for a ${state.niche} business.

Asset Analysis:
- Total assets: ${state.files.length}
- Content pillars: ${JSON.stringify(state.assetAnalysis?.contentPillars || [])}
- Themes: ${state.contentThemes.join(', ')}

Schedule pattern: ${state.schedulePattern}
Platforms: ${state.platforms.join(', ')}

Create a cohesive content narrative strategy:
1. Group assets into story arcs (3-5 posts that build on each other)
2. Ensure variety and balance across pillars
3. Create natural flow from awareness → engagement → conversion
4. Consider platform best practices

Respond with JSON:
{
  "overallStrategy": "One paragraph explaining the content narrative",
  "narrativeGroups": [
    {
      "groupName": "Arc name (e.g., 'Product Launch Week')",
      "objective": "What this arc achieves",
      "assetIndexes": [0, 3, 7],
      "recommendedOrder": "Sequential or distributed",
      "keyMessage": "Main message",
      "expectedImpact": "Awareness/Engagement/Conversion"
    }
  ],
  "contentMix": {
    "educational": 30,
    "promotional": 20,
    "engagement": 50
  }
}`;

    const jsonModel = model.bind({ response_format: { type: "json_object" } });
    const response = await jsonModel.invoke(prompt);

    const strategy = JSON.parse(response.content);

    return {
      narrativeGroups: strategy.narrativeGroups || [],
      strategyExplanation: strategy.overallStrategy || '',
      processingSteps: [
        ...state.processingSteps,
        `Created ${strategy.narrativeGroups?.length || 0} narrative story arcs`
      ]
    };

  } catch (error) {
    console.error('[NarrativeStrategist] Error:', error);
    return {
      error: state.error || `Narrative strategy failed: ${error.message}`,
      processingSteps: [...state.processingSteps, `Narrative strategy failed`]
    };
  }
}

/**
 * Agent 3: Timing Optimizer
 * Determines optimal posting times based on engagement data and industry best practices
 */
async function timingOptimizerAgent(state, config) {
  const apiKey = config?.configurable?.openaiApiKey;

  try {
    const model = getModel(apiKey);

    // Fetch user's past posting performance
    const { data: pastPosts } = await supabase
      .from('posts')
      .select('scheduled_time, status, platforms')
      .eq('user_id', state.userId)
      .eq('status', 'posted')
      .order('created_at', { ascending: false })
      .limit(50);

    // Analyze posting patterns
    const postingPatterns = analyzePostingPatterns(pastPosts || []);

    const prompt = `You are a Social Media Timing Optimization Expert for ${state.niche} industry.

Platforms: ${state.platforms.join(', ')}
Schedule pattern: ${state.schedulePattern}
Number of posts to schedule: ${state.files.length}

${pastPosts && pastPosts.length > 0 ? `
Historical performance data:
- Past successful posting times: ${JSON.stringify(postingPatterns.successfulHours)}
- Most active days: ${JSON.stringify(postingPatterns.activeDays)}
` : 'No historical data - use industry best practices'}

Create an optimized posting schedule:
1. Determine best times for each platform
2. Space posts for maximum reach (avoid cannibalization)
3. Align with narrative groups (story arcs should be close together)
4. Consider timezone and audience behavior

Respond with JSON:
{
  "engagementWindows": {
    "facebook": { "days": ["monday", "wednesday"], "hours": [9, 13, 17] },
    "instagram": { "days": ["tuesday", "thursday"], "hours": [11, 15, 19] },
    "tiktok": { "days": ["friday", "saturday"], "hours": [18, 20, 21] }
  },
  "timingStrategy": "Explanation of timing approach",
  "optimalTimes": [
    {
      "dayOfWeek": "monday",
      "hour": 9,
      "reasoning": "High engagement for B2B audience",
      "platforms": ["facebook"]
    }
  ]
}`;

    const jsonModel = model.bind({ response_format: { type: "json_object" } });
    const response = await jsonModel.invoke(prompt);

    const timing = JSON.parse(response.content);

    return {
      engagementWindows: timing.engagementWindows || {},
      optimalTimes: timing.optimalTimes || [],
      processingSteps: [
        ...state.processingSteps,
        `Optimized timing: ${timing.optimalTimes?.length || 0} time slots identified`
      ]
    };

  } catch (error) {
    console.error('[TimingOptimizer] Error:', error);
    return {
      error: state.error || `Timing optimization failed: ${error.message}`,
      processingSteps: [...state.processingSteps, `Timing optimization failed`]
    };
  }
}

/**
 * Agent 4: Calendar Builder
 * Constructs final schedule with proper spacing, variety, and narrative flow
 */
async function calendarBuilderAgent(state, config) {
  try {
    const startDate = state.startDate ? new Date(state.startDate) : new Date();
    const calendar = [];

    // Schedule pattern mapping
    const patterns = {
      'daily': { postsPerWeek: 7, days: [0, 1, 2, 3, 4, 5, 6] },
      'weekdays': { postsPerWeek: 5, days: [1, 2, 3, 4, 5] },
      '3x-week': { postsPerWeek: 3, days: [1, 3, 5] }, // Mon, Wed, Fri
      '2x-week': { postsPerWeek: 2, days: [1, 4] }, // Mon, Thu
      'weekly': { postsPerWeek: 1, days: [1] } // Monday
    };

    const pattern = patterns[state.schedulePattern] || patterns['daily'];
    let currentDate = new Date(startDate);
    let fileIndex = 0;

    // Group files by narrative groups
    const narrativeMap = new Map();
    state.narrativeGroups.forEach(group => {
      group.assetIndexes?.forEach(idx => {
        narrativeMap.set(idx, group);
      });
    });

    // Build calendar
    while (fileIndex < state.files.length) {
      const dayOfWeek = currentDate.getDay();

      // Check if this day is in posting schedule
      if (pattern.days.includes(dayOfWeek)) {
        const file = state.files[fileIndex];
        const narrativeGroup = narrativeMap.get(fileIndex);

        // Determine optimal hour for this post
        let optimalHour = 9; // Default
        if (state.optimalTimes && state.optimalTimes.length > 0) {
          const timingForDay = state.optimalTimes.find(t =>
            t.dayOfWeek?.toLowerCase() === getDayName(dayOfWeek).toLowerCase()
          );
          optimalHour = timingForDay?.hour || 9;
        }

        const scheduledTime = new Date(currentDate);
        scheduledTime.setHours(optimalHour, 0, 0, 0);

        calendar.push({
          assetIndex: fileIndex,
          fileName: file.name,
          fileUrl: file.url || file.preview,
          fileType: file.type,
          scheduledTime: scheduledTime.toISOString(),
          platforms: state.platforms,
          narrativeGroup: narrativeGroup?.groupName || 'Standalone',
          contentPillar: narrativeGroup?.objective || 'General',
          suggestedCaption: `[AI will generate based on ${narrativeGroup?.keyMessage || 'asset'}]`,
          reasoning: `Part of ${narrativeGroup?.groupName || 'content mix'} - ${narrativeGroup?.objective || 'engagement focus'}`
        });

        fileIndex++;
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return {
      contentCalendar: calendar,
      processingSteps: [
        ...state.processingSteps,
        `Built calendar: ${calendar.length} posts scheduled over ${Math.ceil(calendar.length / pattern.postsPerWeek)} weeks`
      ]
    };

  } catch (error) {
    console.error('[CalendarBuilder] Error:', error);
    return {
      error: state.error || `Calendar building failed: ${error.message}`,
      processingSteps: [...state.processingSteps, `Calendar building failed`]
    };
  }
}

/**
 * Helper: Analyze posting patterns from historical data
 */
function analyzePostingPatterns(posts) {
  const hourCounts = {};
  const dayCounts = {};

  posts.forEach(post => {
    if (post.scheduled_time) {
      const date = new Date(post.scheduled_time);
      const hour = date.getHours();
      const day = date.getDay();

      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    }
  });

  const successfulHours = Object.entries(hourCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour]) => parseInt(hour));

  const activeDays = Object.entries(dayCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([day]) => getDayName(parseInt(day)));

  return { successfulHours, activeDays };
}

/**
 * Helper: Get day name from day number
 */
function getDayName(dayNumber) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[dayNumber] || 'monday';
}

/**
 * Build and compile the multi-agent workflow
 */
const workflow = new StateGraph(PlanningState)
  .addNode("analyzeAssets", assetAnalyzerAgent)
  .addNode("createNarrative", narrativeStrategistAgent)
  .addNode("optimizeTiming", timingOptimizerAgent)
  .addNode("buildCalendar", calendarBuilderAgent)
  .addEdge(START, "analyzeAssets")
  .addEdge("analyzeAssets", "createNarrative")
  .addEdge("createNarrative", "optimizeTiming")
  .addEdge("optimizeTiming", "buildCalendar")
  .addEdge("buildCalendar", END);

const contentPlanningGraph = workflow.compile();

/**
 * Convenience wrapper for planning content
 */
async function planContent({
  userId,
  files,
  niche = 'general',
  schedulePattern = 'daily',
  platforms = ['facebook', 'instagram'],
  startDate = null,
  openaiApiKey
}) {
  console.log(`[ContentPlanner] Planning ${files.length} posts for user ${userId}`);

  try {
    const result = await contentPlanningGraph.invoke(
      {
        userId,
        files,
        niche,
        schedulePattern,
        platforms,
        startDate,
        processingSteps: []
      },
      {
        configurable: {
          openaiApiKey: openaiApiKey || process.env.OPENAI_API_KEY
        }
      }
    );

    console.log(`[ContentPlanner] Completed. Calendar: ${result.contentCalendar.length} posts`);
    console.log(`[ContentPlanner] Processing steps:`, result.processingSteps);

    return {
      success: true,
      calendar: result.contentCalendar,
      strategy: {
        explanation: result.strategyExplanation,
        themes: result.contentThemes,
        narrativeGroups: result.narrativeGroups,
        assetAnalysis: result.assetAnalysis
      },
      processingSteps: result.processingSteps,
      error: result.error
    };

  } catch (error) {
    console.error('[ContentPlanner] Planning failed:', error);
    return {
      success: false,
      error: error.message,
      calendar: [],
      strategy: null
    };
  }
}

module.exports = {
  contentPlanningGraph,
  planContent
};
