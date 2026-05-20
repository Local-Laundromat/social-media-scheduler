/**
 * Content Planning Agent API Routes
 * Autonomous content calendar generation using LangGraph
 */

const express = require('express');
const router = express.Router();
const { planContent } = require('../services/contentPlanningAgent');
const { authenticateToken } = require('../middleware/auth');
const { verifyActivePaidUser, logUsage, logFailure } = require('../middleware/verifySubscription');
const { supabase } = require('../database/supabase');

/**
 * POST /api/content-planner/auto-plan
 * Analyze bulk uploaded files and create optimized content calendar
 *
 * PROTECTED: Requires active paid subscription and available quota
 */
router.post('/auto-plan', authenticateToken, verifyActivePaidUser, async (req, res) => {
  const {
    files, // Array of { name, type, url, preview }
    schedulePattern = 'daily', // daily, weekdays, 3x-week, 2x-week, weekly
    platforms = ['facebook', 'instagram'],
    startDate = null,
    niche = 'general'
  } = req.body;

  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Files array is required and must not be empty'
    });
  }

  try {
    // Get user's profile for API key and niche
    const { data: profile } = await supabase
      .from('profiles')
      .select('openai_api_key, company')
      .eq('id', userId)
      .single();

    const openaiApiKey = profile?.openai_api_key || process.env.OPENAI_API_KEY;

    if (!openaiApiKey || openaiApiKey === 'not-configured') {
      return res.json({
        success: false,
        error: 'OpenAI API key not configured. Please add your OpenAI API key in Settings.'
      });
    }

    // Use company name as niche if not provided
    const businessNiche = niche !== 'general' ? niche : (profile?.company || 'general business');

    // Run the 4-agent planning workflow
    const result = await planContent({
      userId,
      files,
      niche: businessNiche,
      schedulePattern,
      platforms,
      startDate: startDate || new Date().toISOString(),
      openaiApiKey
    });

    if (!result.success) {
      // Log failure for analytics
      await logFailure(userId, 'content_planner', result.error || 'Unknown error');
      return res.status(500).json(result);
    }

    // Log successful usage (increments quota if not BYOK)
    const estimatedTokens = files.length * 100; // Rough estimate: 100 tokens per file
    const estimatedCost = (estimatedTokens / 1000000) * 0.15; // GPT-4o-mini pricing
    await logUsage(userId, 'content_planner', estimatedTokens, estimatedCost);

    res.json({
      success: true,
      calendar: result.calendar,
      strategy: result.strategy,
      processingSteps: result.processingSteps,
      summary: {
        totalPosts: result.calendar.length,
        schedulePattern,
        platforms,
        startDate: result.calendar[0]?.scheduledTime,
        endDate: result.calendar[result.calendar.length - 1]?.scheduledTime,
        narrativeGroups: result.strategy?.narrativeGroups?.length || 0
      },
      subscription: req.userSubscription, // Include subscription info for client
      tip: `AI analyzed ${files.length} assets and created ${result.calendar.length} strategically planned posts with ${result.strategy?.narrativeGroups?.length || 0} narrative story arcs.`
    });

  } catch (error) {
    console.error('Content planning error:', error);
    await logFailure(userId, 'content_planner', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to generate content plan',
      details: error.message
    });
  }
});

/**
 * POST /api/content-planner/create-from-plan
 * Create actual posts in database from the AI-generated plan
 */
router.post('/create-from-plan', authenticateToken, async (req, res) => {
  const { calendar, autoGenerateCaptions = false } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  if (!calendar || !Array.isArray(calendar)) {
    return res.status(400).json({
      success: false,
      error: 'Calendar array is required'
    });
  }

  try {
    const postsToInsert = calendar.map(item => ({
      user_id: userId,
      media_url: item.fileUrl,
      caption: item.suggestedCaption || '',
      platforms: item.platforms.join(','),
      scheduled_time: item.scheduledTime,
      status: 'pending',
      post_type: 'post',
      ai_generated: true,
      metadata: {
        narrativeGroup: item.narrativeGroup,
        contentPillar: item.contentPillar,
        reasoning: item.reasoning
      },
      created_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from('posts')
      .insert(postsToInsert)
      .select();

    if (error) throw error;

    res.json({
      success: true,
      message: `Successfully created ${data.length} posts from content plan`,
      posts: data,
      tip: autoGenerateCaptions
        ? 'AI captions will be generated for each post based on narrative context'
        : 'You can edit captions before the posts are published'
    });

  } catch (error) {
    console.error('Create posts from plan error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create posts',
      details: error.message
    });
  }
});

/**
 * POST /api/content-planner/demo
 * Demo endpoint to test the planning workflow
 */
router.post('/demo', async (req, res) => {
  const {
    fileCount = 10,
    schedulePattern = 'daily',
    platforms = ['facebook', 'instagram'],
    niche = 'real estate',
    openaiApiKey
  } = req.body;

  try {
    const apiKey = openaiApiKey || process.env.OPENAI_API_KEY;

    if (!apiKey || apiKey === 'not-configured') {
      return res.json({
        success: false,
        error: 'OpenAI API key not configured. Add OPENAI_API_KEY to .env or provide in request body.'
      });
    }

    // Generate demo files
    const demoFiles = Array.from({ length: fileCount }, (_, i) => ({
      name: `demo-property-${i + 1}.jpg`,
      type: 'image/jpeg',
      url: `https://example.com/demo-${i + 1}.jpg`,
      preview: `https://example.com/demo-${i + 1}.jpg`
    }));

    const result = await planContent({
      userId: 'demo-user',
      files: demoFiles,
      niche,
      schedulePattern,
      platforms,
      startDate: new Date().toISOString(),
      openaiApiKey: apiKey
    });

    res.json({
      ...result,
      demoMode: true,
      tip: 'This is a demo analysis. Use /api/content-planner/auto-plan with real uploaded files for production.'
    });

  } catch (error) {
    console.error('Demo planning error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run demo',
      details: error.message
    });
  }
});

/**
 * GET /api/content-planner/analysis/:userId
 * Get content analysis insights for a user
 */
router.get('/analysis/:userId', authenticateToken, async (req, res) => {
  const userId = req.params.userId;

  // Verify user can access this data
  if (userId !== req.user?.id) {
    return res.status(403).json({
      success: false,
      error: 'Unauthorized access'
    });
  }

  try {
    // Fetch user's posts for analysis
    const { data: posts, error } = await supabase
      .from('posts')
      .select('platforms, scheduled_time, status, metadata')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    // Analyze patterns
    const analysis = {
      totalPosts: posts.length,
      platformDistribution: {},
      narrativeGroups: new Set(),
      contentPillars: new Set(),
      postingPatterns: {
        mostActiveDay: null,
        mostActiveHour: null,
        averagePostsPerWeek: 0
      }
    };

    posts.forEach(post => {
      // Platform distribution
      const platforms = post.platforms?.split(',') || [];
      platforms.forEach(p => {
        analysis.platformDistribution[p] = (analysis.platformDistribution[p] || 0) + 1;
      });

      // Narrative groups and pillars
      if (post.metadata?.narrativeGroup) {
        analysis.narrativeGroups.add(post.metadata.narrativeGroup);
      }
      if (post.metadata?.contentPillar) {
        analysis.contentPillars.add(post.metadata.contentPillar);
      }
    });

    analysis.narrativeGroups = Array.from(analysis.narrativeGroups);
    analysis.contentPillars = Array.from(analysis.contentPillars);

    res.json({
      success: true,
      analysis
    });

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze content',
      details: error.message
    });
  }
});

module.exports = router;
