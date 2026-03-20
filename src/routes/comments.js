/**
 * AI Comment Responder API Routes
 * Manages comment monitoring and AI-generated responses
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('./authApi');
const commentMonitor = require('../services/commentMonitor');
const db = require('../database/db');

/**
 * GET /api/comments/monitor - Get new comments with AI suggestions
 */
router.get('/monitor', authenticateToken, async (req, res) => {
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
router.post('/reply', authenticateToken, async (req, res) => {
  try {
    const { platform, commentId, replyText } = req.body;
    const userId = req.userId;

    if (!platform || !commentId || !replyText) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: platform, commentId, replyText'
      });
    }

    // Get user's access tokens
    db.get(
      'SELECT * FROM users WHERE id = ?',
      [userId],
      async (err, user) => {
        if (err || !user) {
          return res.status(404).json({
            success: false,
            error: 'User not found'
          });
        }

        let result;

        if (platform === 'facebook') {
          result = await commentMonitor.postFacebookReply(
            commentId,
            replyText,
            user.facebook_page_token || user.facebook_access_token
          );
        } else if (platform === 'instagram') {
          result = await commentMonitor.postInstagramReply(
            commentId,
            replyText,
            user.instagram_token || user.instagram_access_token
          );
        } else {
          return res.status(400).json({
            success: false,
            error: 'Invalid platform. Use "facebook" or "instagram"'
          });
        }

        if (result.success) {
          // Log the reply
          db.run(
            `INSERT INTO comment_replies (user_id, platform, comment_id, reply_text, reply_id, created_at)
             VALUES (?, ?, ?, ?, ?, datetime('now'))`,
            [userId, platform, commentId, replyText, result.id]
          );

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
      }
    );

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
router.post('/analyze', authenticateToken, async (req, res) => {
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
    db.get(
      'SELECT company, email FROM users WHERE id = ?',
      [userId],
      async (err, user) => {
        const analysis = await commentMonitor.analyzeComment(commentText);
        const suggestedReply = await commentMonitor.generateReply(
          { text: commentText },
          analysis,
          {
            company: user?.company,
            contactInfo: { email: user?.email }
          }
        );

        res.json({
          success: true,
          analysis,
          suggestedReply
        });
      }
    );

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
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const limit = parseInt(req.query.limit) || 50;

    db.all(
      `SELECT * FROM comment_replies
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, limit],
      (err, replies) => {
        if (err) {
          return res.status(500).json({
            success: false,
            error: 'Failed to fetch history'
          });
        }

        res.json({
          success: true,
          count: replies?.length || 0,
          replies: replies || []
        });
      }
    );

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
router.post('/auto-reply/toggle', authenticateToken, async (req, res) => {
  try {
    const { enabled } = req.body;
    const userId = req.userId;

    db.run(
      `UPDATE users SET auto_reply_enabled = ? WHERE id = ?`,
      [enabled ? 1 : 0, userId],
      (err) => {
        if (err) {
          return res.status(500).json({
            success: false,
            error: 'Failed to update setting'
          });
        }

        res.json({
          success: true,
          autoReplyEnabled: enabled
        });
      }
    );

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
