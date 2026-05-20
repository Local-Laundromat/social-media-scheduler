/**
 * Multi-Agent Comment Management API Routes
 * Uses LangGraph orchestrated agents for intelligent comment analysis and response
 */

const express = require('express');
const router = express.Router();
const { processComment } = require('../services/commentAgents');
const { authenticateToken } = require('../middleware/auth');
const { supabase } = require('../database/supabase');

/**
 * POST /api/agent/analyze-comment
 * Analyze a comment using the multi-agent system
 */
router.post('/analyze-comment', authenticateToken, async (req, res) => {
  const {
    commentText,
    platform = 'instagram',
    authorName = 'User',
    postContext = '',
    commentId = null
  } = req.body;

  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  if (!commentText || commentText.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Comment text is required'
    });
  }

  try {
    // Get user's profile for brand info and API key
    const { data: profile } = await supabase
      .from('profiles')
      .select('company, brand_voice, brand_settings, openai_api_key')
      .eq('id', userId)
      .single();

    const openaiApiKey = profile?.openai_api_key || process.env.OPENAI_API_KEY;

    if (!openaiApiKey || openaiApiKey === 'not-configured') {
      return res.json({
        success: false,
        error: 'OpenAI API key not configured. Please add your OpenAI API key in Settings.'
      });
    }

    // Extract brand info from profile
    const brandInfo = {
      company: profile?.company || 'our team',
      voice: profile?.brand_voice || 'professional and friendly',
      contactInfo: profile?.brand_settings?.contactInfo || {}
    };

    // Process comment through multi-agent system
    const result = await processComment({
      commentText,
      platform,
      authorName,
      postContext,
      brandInfo,
      openaiApiKey
    });

    // If comment ID provided, update the database
    if (commentId && result.success) {
      await supabase
        .from('comments')
        .update({
          sentiment: result.analysis.sentiment,
          intent: result.analysis.intent,
          priority: result.analysis.priority,
          suggested_reply: result.response.suggested,
          auto_reply_safe: result.routing.autoReply,
          requires_review: result.routing.requiresReview,
          ai_analyzed_at: new Date().toISOString()
        })
        .eq('id', commentId)
        .eq('user_id', userId);
    }

    res.json(result);

  } catch (error) {
    console.error('Agent comment analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze comment',
      details: error.message
    });
  }
});

/**
 * POST /api/agent/batch-analyze-comments
 * Analyze multiple comments in batch
 */
router.post('/batch-analyze-comments', authenticateToken, async (req, res) => {
  const { commentIds } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  if (!Array.isArray(commentIds) || commentIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'commentIds array is required'
    });
  }

  try {
    // Get user's profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('company, brand_voice, brand_settings, openai_api_key')
      .eq('id', userId)
      .single();

    const openaiApiKey = profile?.openai_api_key || process.env.OPENAI_API_KEY;

    if (!openaiApiKey || openaiApiKey === 'not-configured') {
      return res.json({
        success: false,
        error: 'OpenAI API key not configured'
      });
    }

    // Fetch comments from database
    const { data: comments, error } = await supabase
      .from('comments')
      .select('*')
      .in('id', commentIds)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    const brandInfo = {
      company: profile?.company || 'our team',
      voice: profile?.brand_voice || 'professional and friendly',
      contactInfo: profile?.brand_settings?.contactInfo || {}
    };

    // Process each comment
    const results = [];
    for (const comment of comments) {
      const result = await processComment({
        commentText: comment.comment_text,
        platform: comment.platform || 'instagram',
        authorName: comment.author_name || 'User',
        postContext: comment.post_context || '',
        brandInfo,
        openaiApiKey
      });

      results.push({
        commentId: comment.id,
        ...result
      });

      // Update database
      if (result.success) {
        await supabase
          .from('comments')
          .update({
            sentiment: result.analysis.sentiment,
            intent: result.analysis.intent,
            priority: result.analysis.priority,
            suggested_reply: result.response.suggested,
            auto_reply_safe: result.routing.autoReply,
            requires_review: result.routing.requiresReview,
            ai_analyzed_at: new Date().toISOString()
          })
          .eq('id', comment.id);
      }
    }

    res.json({
      success: true,
      totalProcessed: results.length,
      results
    });

  } catch (error) {
    console.error('Batch comment analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze comments',
      details: error.message
    });
  }
});

/**
 * POST /api/agent/post-reply
 * Post an AI-suggested reply (after user approval or auto-reply)
 */
router.post('/post-reply', authenticateToken, async (req, res) => {
  const {
    commentId,
    replyText,
    isAutoReply = false
  } = req.body;

  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  if (!commentId || !replyText) {
    return res.status(400).json({
      success: false,
      error: 'commentId and replyText are required'
    });
  }

  try {
    // Get comment details
    const { data: comment, error } = await supabase
      .from('comments')
      .select('*')
      .eq('id', commentId)
      .eq('user_id', userId)
      .single();

    if (error || !comment) {
      return res.status(404).json({
        success: false,
        error: 'Comment not found'
      });
    }

    // TODO: Post reply to actual platform (Facebook/Instagram API)
    // For now, just save to database

    // Save reply to database
    const { data: reply, error: replyError } = await supabase
      .from('comment_replies')
      .insert([{
        user_id: userId,
        comment_id: commentId,
        reply_text: replyText,
        platform: comment.platform,
        is_auto_reply: isAutoReply,
        posted_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (replyError) {
      throw replyError;
    }

    // Update comment status
    await supabase
      .from('comments')
      .update({
        has_reply: true,
        replied_at: new Date().toISOString(),
        reply_method: isAutoReply ? 'auto' : 'manual'
      })
      .eq('id', commentId);

    res.json({
      success: true,
      reply,
      message: isAutoReply ? 'Auto-reply posted successfully' : 'Reply posted successfully'
    });

  } catch (error) {
    console.error('Post reply error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to post reply',
      details: error.message
    });
  }
});

/**
 * GET /api/agent/comment-stats
 * Get statistics on comment analysis
 */
router.get('/comment-stats', authenticateToken, async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'User not authenticated'
    });
  }

  try {
    // Get comment statistics
    const { data: comments, error } = await supabase
      .from('comments')
      .select('sentiment, intent, priority, auto_reply_safe, requires_review, has_reply')
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    // Calculate stats
    const stats = {
      total: comments.length,
      bySentiment: {
        positive: comments.filter(c => c.sentiment === 'positive').length,
        negative: comments.filter(c => c.sentiment === 'negative').length,
        neutral: comments.filter(c => c.sentiment === 'neutral').length
      },
      byIntent: {
        question: comments.filter(c => c.intent === 'question').length,
        inquiry: comments.filter(c => c.intent === 'inquiry').length,
        praise: comments.filter(c => c.intent === 'praise').length,
        complaint: comments.filter(c => c.intent === 'complaint').length,
        spam: comments.filter(c => c.intent === 'spam').length,
        general: comments.filter(c => c.intent === 'general').length
      },
      byPriority: {
        high: comments.filter(c => c.priority === 'high').length,
        medium: comments.filter(c => c.priority === 'medium').length,
        low: comments.filter(c => c.priority === 'low').length
      },
      autoReplySafe: comments.filter(c => c.auto_reply_safe).length,
      requiresReview: comments.filter(c => c.requires_review).length,
      replied: comments.filter(c => c.has_reply).length,
      unreplied: comments.filter(c => !c.has_reply).length
    };

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Comment stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get comment stats',
      details: error.message
    });
  }
});

/**
 * POST /api/agent/demo-comment
 * Demo endpoint to test the multi-agent system without database
 */
router.post('/demo-comment', async (req, res) => {
  const {
    commentText = "This is amazing! Where can I buy this? 🔥",
    platform = 'instagram',
    authorName = 'Demo User',
    openaiApiKey
  } = req.body;

  if (!commentText) {
    return res.status(400).json({
      success: false,
      error: 'commentText is required'
    });
  }

  try {
    const apiKey = openaiApiKey || process.env.OPENAI_API_KEY;

    if (!apiKey || apiKey === 'not-configured') {
      return res.json({
        success: false,
        error: 'OpenAI API key not configured. Add OPENAI_API_KEY to .env or provide in request body.'
      });
    }

    const brandInfo = {
      company: 'Demo Company',
      voice: 'professional and friendly',
      contactInfo: {
        email: 'contact@example.com',
        phone: '555-1234'
      }
    };

    const result = await processComment({
      commentText,
      platform,
      authorName,
      postContext: 'Demo product showcase post',
      brandInfo,
      openaiApiKey: apiKey
    });

    res.json({
      ...result,
      demoMode: true,
      tip: 'This is a demo analysis. Integrate with /api/agent/analyze-comment for production use.'
    });

  } catch (error) {
    console.error('Demo comment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze demo comment',
      details: error.message
    });
  }
});

module.exports = router;
