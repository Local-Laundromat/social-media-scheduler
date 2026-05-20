/**
 * Autonomous AI Post Generation API
 * Uses LangGraph for self-correcting content creation
 */

const express = require('express');
const router = express.Router();
const { supabase } = require('../database/supabase');
const { generateAutonomousPost } = require('../services/agentGraph');
const { authenticateToken } = require('../middleware/auth');

/**
 * POST /api/agent/generate-post
 * Generates AI-optimized post with autonomous quality control
 *
 * Body:
 * - niche: string (e.g., "real estate", "fitness", "technology")
 * - platform: string ("facebook", "instagram", "tiktok", "linkedin")
 * - scheduledTime: ISO datetime string (optional)
 * - saveToQueue: boolean (default: true)
 */
router.post('/generate-post', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id; // From JWT authentication
    const { niche, platform, scheduledTime, saveToQueue = true } = req.body;

    // Validate required fields
    if (!niche || !platform) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: niche and platform are required'
      });
    }

    // Validate platform
    const validPlatforms = ['facebook', 'instagram', 'tiktok', 'linkedin'];
    if (!validPlatforms.includes(platform.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid platform. Must be one of: ${validPlatforms.join(', ')}`
      });
    }

    // Fetch user's brand settings from Supabase
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('company, brand_voice, brand_settings')
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error('[AgentPost] Profile fetch error:', profileError);
    }

    // Prepare brand settings
    const brandSettings = profile?.brand_settings || {
      company: profile?.company || 'our company',
      voice: profile?.brand_voice || 'professional and engaging',
      tone: 'authentic',
      style: 'conversational'
    };

    // Run autonomous agent workflow
    console.log(`[AgentPost] User ${userId} generating ${platform} post for ${niche} niche`);

    const agentResult = await generateAutonomousPost({
      niche,
      platform: platform.toLowerCase(),
      brandSettings
    });

    if (!agentResult.success) {
      return res.status(500).json({
        success: false,
        error: 'AI agent failed to generate content',
        details: agentResult.error
      });
    }

    // If saveToQueue is false, just return the draft
    if (!saveToQueue) {
      return res.status(200).json({
        success: true,
        message: 'Post generated successfully (not saved to queue)',
        post: {
          caption: agentResult.draft,
          platform: platform.toLowerCase(),
          qualityScore: agentResult.score,
          attempts: agentResult.attempts,
          qualityThresholdMet: agentResult.metadata.qualityThresholdMet
        },
        metadata: {
          niche,
          brandSettings: brandSettings.company
        }
      });
    }

    // Save to database queue
    const postData = {
      user_id: userId,
      caption: agentResult.draft,
      platforms: [platform.toLowerCase()],
      status: 'pending',
      ai_generated: true,
      ai_quality_score: agentResult.score,
      ai_attempts: agentResult.attempts,
      niche: niche,
      created_at: new Date().toISOString()
    };

    // Add scheduled time if provided
    if (scheduledTime) {
      const scheduledDate = new Date(scheduledTime);
      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid scheduledTime format. Use ISO 8601 format.'
        });
      }
      postData.scheduled_at = scheduledDate.toISOString();
    }

    const { data: newPost, error: insertError } = await supabase
      .from('posts')
      .insert([postData])
      .select()
      .single();

    if (insertError) {
      console.error('[AgentPost] Database insert error:', insertError);
      return res.status(500).json({
        success: false,
        error: 'Failed to save post to database',
        details: insertError.message
      });
    }

    console.log(`[AgentPost] Post created successfully. ID: ${newPost.id}, Score: ${agentResult.score}/10`);

    return res.status(201).json({
      success: true,
      message: 'AI post generated and queued successfully',
      post: {
        id: newPost.id,
        caption: newPost.caption,
        platform: platform.toLowerCase(),
        status: newPost.status,
        scheduledAt: newPost.scheduled_at,
        qualityScore: agentResult.score,
        attempts: agentResult.attempts,
        qualityThresholdMet: agentResult.metadata.qualityThresholdMet
      },
      metadata: {
        niche,
        brandSettings: brandSettings.company,
        feedback: agentResult.feedback
      }
    });
  } catch (error) {
    console.error('[AgentPost] Route error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

/**
 * POST /api/agent/generate-batch
 * Generate multiple posts at once for a content calendar
 *
 * Body:
 * - niche: string
 * - platforms: array of strings
 * - count: number (1-10, default 5)
 * - startDate: ISO datetime string (optional)
 * - frequency: "daily" | "weekly" | "custom" (default: "daily")
 */
router.post('/generate-batch', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { niche, platforms, count = 5, startDate, frequency = 'daily' } = req.body;

    // Validate
    if (!niche || !platforms || !Array.isArray(platforms)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: niche and platforms (array) are required'
      });
    }

    const postCount = Math.min(Math.max(1, count), 10); // Clamp 1-10

    // Fetch brand settings once
    const { data: profile } = await supabase
      .from('profiles')
      .select('company, brand_voice, brand_settings')
      .eq('id', userId)
      .single();

    const brandSettings = profile?.brand_settings || {
      company: profile?.company || 'our company',
      voice: profile?.brand_voice || 'professional and engaging'
    };

    const results = [];
    const errors = [];

    // Generate posts sequentially to avoid rate limits
    for (let i = 0; i < postCount; i++) {
      for (const platform of platforms) {
        console.log(`[AgentPost] Batch ${i + 1}/${postCount} for ${platform}`);

        try {
          const agentResult = await generateAutonomousPost({
            niche,
            platform: platform.toLowerCase(),
            brandSettings
          });

          if (agentResult.success) {
            // Calculate scheduled time
            let scheduledAt = null;
            if (startDate) {
              const baseDate = new Date(startDate);
              if (frequency === 'daily') {
                baseDate.setDate(baseDate.getDate() + i);
              } else if (frequency === 'weekly') {
                baseDate.setDate(baseDate.getDate() + (i * 7));
              }
              scheduledAt = baseDate.toISOString();
            }

            // Save to database
            const { data: newPost, error: insertError } = await supabase
              .from('posts')
              .insert([{
                user_id: userId,
                caption: agentResult.draft,
                platforms: [platform.toLowerCase()],
                status: 'pending',
                ai_generated: true,
                ai_quality_score: agentResult.score,
                ai_attempts: agentResult.attempts,
                niche: niche,
                scheduled_at: scheduledAt,
                created_at: new Date().toISOString()
              }])
              .select()
              .single();

            if (!insertError) {
              results.push({
                success: true,
                postId: newPost.id,
                platform,
                score: agentResult.score,
                scheduledAt
              });
            } else {
              errors.push({ platform, error: insertError.message });
            }
          } else {
            errors.push({ platform, error: agentResult.error });
          }

          // Rate limiting: wait 1 second between generations
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (err) {
          errors.push({ platform, error: err.message });
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: `Generated ${results.length} posts successfully`,
      results,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        total: postCount * platforms.length,
        successful: results.length,
        failed: errors.length
      }
    });
  } catch (error) {
    console.error('[AgentPost] Batch generation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Batch generation failed',
      details: error.message
    });
  }
});

/**
 * GET /api/agent/status
 * Check if agent service is available
 */
router.get('/status', (req, res) => {
  const hasApiKey = !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'not-configured');

  res.json({
    available: hasApiKey,
    service: 'LangGraph Autonomous Post Generator',
    version: '1.0.0',
    maxRetries: 3,
    qualityThreshold: 8,
    supportedPlatforms: ['facebook', 'instagram', 'tiktok', 'linkedin']
  });
});

/**
 * POST /api/agent/demo
 * Demo route - generates post without authentication (for testing only)
 * REMOVE THIS IN PRODUCTION!
 */
router.post('/demo', async (req, res) => {
  try {
    const { niche, platform } = req.body;

    if (!niche || !platform) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: niche and platform are required'
      });
    }

    const validPlatforms = ['facebook', 'instagram', 'tiktok', 'linkedin'];
    if (!validPlatforms.includes(platform.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid platform. Must be one of: ${validPlatforms.join(', ')}`
      });
    }

    console.log(`[AgentPost Demo] Generating ${platform} post for ${niche} niche`);

    const agentResult = await generateAutonomousPost({
      niche,
      platform: platform.toLowerCase(),
      brandSettings: {
        company: 'Demo Company',
        voice: 'professional and engaging',
        tone: 'authentic',
        style: 'conversational'
      }
    });

    if (!agentResult.success) {
      return res.status(500).json({
        success: false,
        error: 'AI agent failed to generate content',
        details: agentResult.error
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Post generated successfully (demo mode)',
      post: {
        caption: agentResult.draft,
        platform: platform.toLowerCase(),
        qualityScore: agentResult.score,
        attempts: agentResult.attempts,
        qualityThresholdMet: agentResult.metadata.qualityThresholdMet
      },
      metadata: {
        niche,
        feedback: agentResult.feedback
      }
    });
  } catch (error) {
    console.error('[AgentPost Demo] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Demo generation failed',
      details: error.message
    });
  }
});

module.exports = router;
