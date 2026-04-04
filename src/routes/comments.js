/**
 * AI Comment Responder API Routes
 * Manages comment monitoring and AI-generated responses
 */

const express = require('express');
const router = express.Router();
const { authenticateSupabase } = require('../middleware/auth');
const commentMonitor = require('../services/commentMonitor');
const { supabase } = require('../database/supabase');

/**
 * GET /api/comments/monitor - Get new comments with AI suggestions
 */
router.get('/monitor', authenticateSupabase, async (req, res) => {
  try {
    const userId = req.userId;

    const comments = await commentMonitor.monitorUserComments(userId);

    res.json({
      success: true,
      count: comments.length,
      comments: comments.map(c => ({
        ...c,
        needsReview: !c.autoReplyRecommended || c.analysis.priority === 'high'
      }))
    });

  } catch (error) {
    console.error('Comment monitoring error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to monitor comments',
      details: error.message
    });
  }
});

/**
 * POST /api/comments/reply - Post a reply to a comment
 */
router.post('/reply', authenticateSupabase, async (req, res) => {
  try {
    const { platform, commentId, replyText } = req.body;
    const userId = req.userId;

    if (!platform || !commentId || !replyText) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: platform, commentId, replyText'
      });
    }

    // Get user's access tokens from social accounts
    let facebookToken = null;
    let instagramToken = null;

    if (platform === 'facebook') {
      const { data: fbAccounts } = await supabase
        .from('facebook_accounts')
        .select('access_token')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1);

      if (fbAccounts && fbAccounts.length > 0) {
        facebookToken = fbAccounts[0].access_token;
      }
    } else if (platform === 'instagram') {
      const { data: igAccounts } = await supabase
        .from('instagram_accounts')
        .select('access_token')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1);

      if (igAccounts && igAccounts.length > 0) {
        instagramToken = igAccounts[0].access_token;
      }
    }

    let result;

    if (platform === 'facebook') {
      if (!facebookToken) {
        return res.status(400).json({
          success: false,
          error: 'Facebook account not connected'
        });
      }
      result = await commentMonitor.postFacebookReply(
        commentId,
        replyText,
        facebookToken
      );
    } else if (platform === 'instagram') {
      if (!instagramToken) {
        return res.status(400).json({
          success: false,
          error: 'Instagram account not connected'
        });
      }
      result = await commentMonitor.postInstagramReply(
        commentId,
        replyText,
        instagramToken
      );
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid platform. Use "facebook" or "instagram"'
      });
    }

    if (result.success) {
      // Log the reply
      await supabase
        .from('comment_replies')
        .insert({
          user_id: userId,
          platform,
          comment_id: commentId,
          reply_text: replyText,
          reply_id: result.id,
          created_at: new Date().toISOString()
        });

      res.json({
        success: true,
        message: 'Reply posted successfully',
        replyId: result.id
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error('Reply posting error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to post reply',
      details: error.message
    });
  }
});

/**
 * POST /api/comments/analyze - Analyze a comment and generate reply suggestion
 */
router.post('/analyze', authenticateSupabase, async (req, res) => {
  try {
    const { commentText } = req.body;
    const userId = req.userId;

    if (!commentText) {
      return res.status(400).json({
        success: false,
        error: 'Missing commentText'
      });
    }

    // Get user profile for personalized responses
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    const analysis = await commentMonitor.analyzeComment(commentText);
    const suggestedReply = await commentMonitor.generateReply(
      { text: commentText },
      analysis,
      {
        company: profile?.company || profile?.name,
        contactInfo: { email: profile?.email }
      }
    );

    res.json({
      success: true,
      analysis,
      suggestedReply
    });

  } catch (error) {
    console.error('Comment analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze comment',
      details: error.message
    });
  }
});

/**
 * GET /api/comments/history - Get reply history
 */
router.get('/history', authenticateSupabase, async (req, res) => {
  try {
    const userId = req.userId;
    const limit = parseInt(req.query.limit) || 50;

    const { data: replies, error } = await supabase
      .from('comment_replies')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.json({
      success: true,
      count: replies?.length || 0,
      replies: replies || []
    });

  } catch (error) {
    console.error('History fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch history',
      details: error.message
    });
  }
});

/**
 * POST /api/comments/auto-reply/toggle - Enable/disable auto-reply
 */
router.post('/auto-reply/toggle', authenticateSupabase, async (req, res) => {
  try {
    const { enabled } = req.body;
    const userId = req.userId;

    await supabase
      .from('profiles')
      .update({ auto_reply_enabled: enabled })
      .eq('id', userId);

    res.json({
      success: true,
      autoReplyEnabled: enabled
    });

  } catch (error) {
    console.error('Toggle error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle auto-reply',
      details: error.message
    });
  }
});

module.exports = router;
