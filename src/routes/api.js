const express = require('express');
const router = express.Router();
const { supabase, getPostById, getPostsByUser, createPost, updatePost } = require('../database/supabase');
const scheduler = require('../services/scheduler');
const webhookService = require('../services/webhooks');
const { authenticateApiKey, optionalApiKey } = require('../middleware/auth');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * GET /api/posts - Get all posts
 */
router.get('/posts', optionalApiKey, async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;

    let query = supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (status) {
      query = query.eq('status', status);
    }

    const { data: posts, error } = await query;

    if (error) throw error;

    console.log(`📊 GET /api/posts - Found ${posts?.length || 0} posts`);
    res.json({ posts: posts || [] });
  } catch (err) {
    console.error('❌ GET /api/posts error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/posts/:id - Get single post
 */
router.get('/posts/:id', optionalApiKey, async (req, res) => {
  try {
    const post = await getPostById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/posts - Create new post (Supports both API key and user_id)
 */
router.post('/posts', optionalApiKey, async (req, res) => {
  try {
    console.log('📝 POST /api/posts request received:', req.body);
    const {
      user_id,
      filename,
      filepath,
      filetype,
      caption,
      platforms,
      scheduled_time,
      webhook_url,
      facebook_account_id,
      instagram_account_id,
      tiktok_account_id,
    } = req.body;

    if (!filename || !filepath || !platforms) {
      return res.status(400).json({ error: 'Missing required fields: filename, filepath, platforms' });
    }

    // Don't stringify - PostgreSQL arrays expect native arrays
    const webhook = webhook_url || req.apiKey?.webhook_url || null;

    let internalUserId = null;
    let teamId = null;

    // If user_id is provided, look up the user's internal ID and team_id
    if (user_id) {
      // First try to find by Supabase auth ID (for dashboard users)
      let { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user_id)
        .single();

      // If not found, try to find by external_user_id (for external API users)
      if (error || !profile) {
        const result = await supabase
          .from('profiles')
          .select('*')
          .eq('external_user_id', user_id)
          .single();

        profile = result.data;
        error = result.error;
      }

      if (error || !profile) {
        return res.status(404).json({
          error: 'User not found',
          message: 'Please connect your social media accounts first in the dashboard'
        });
      }

      internalUserId = profile.id;
      teamId = profile.team_id || null;
    }

    // Track if this is a "post now" request (no scheduled_time provided)
    const isPostNow = !scheduled_time;
    const scheduledTimeIso = scheduled_time || new Date().toISOString();
    const scheduleDate = new Date(scheduledTimeIso);
    const oneMinuteFromNow = Date.now() + 60 * 1000;
    // "Post now" (no scheduled_time) → pending + due immediately; future picks → scheduled
    const initialStatus = scheduleDate.getTime() > oneMinuteFromNow ? 'scheduled' : 'pending';

    // Create post - map to both old and new column names for compatibility
    const postPayload = {
      // New column names (for after migration)
      filename,
      filepath,
      filetype: filetype || 'image',
      caption: caption || '',
      // Old column names (current database schema)
      content: caption || '',
      media_url: filepath,
      media_type: filetype || 'image',
      // Common fields
      platforms: platforms, // Pass array directly, not JSON string
      scheduled_time: scheduledTimeIso,
      status: initialStatus,
      user_id: internalUserId,
      team_id: teamId,
      webhook_url: webhook
    };

    if (facebook_account_id != null && facebook_account_id !== '') {
      postPayload.facebook_account_id = Number(facebook_account_id);
    }
    if (instagram_account_id != null && instagram_account_id !== '') {
      postPayload.instagram_account_id = Number(instagram_account_id);
    }
    if (tiktok_account_id != null && tiktok_account_id !== '') {
      postPayload.tiktok_account_id = Number(tiktok_account_id);
    }

    console.log('💾 Creating post with payload:', postPayload);
    const result = await createPost(postPayload);
    console.log('✅ Post created successfully! ID:', result.id);

    // Publish now when due (so Facebook works without waiting for hourly cron + AUTO_START_SCHEDULER)
    const dueAt = new Date(result.scheduled_time || Date.now());
    const immediateEnabled = process.env.IMMEDIATE_POST_ON_CREATE !== 'false';
    const nowMs = Date.now();
    const dueMs = dueAt.getTime();
    // If this was a "post now" request OR scheduled within 60 seconds, post immediately
    const shouldPostNow = immediateEnabled && (isPostNow || dueMs <= nowMs + 60000);

    console.log('🔍 Immediate post check:', {
      postId: result.id,
      isPostNow,
      immediateEnabled,
      scheduledTime: result.scheduled_time,
      dueMs,
      nowMs,
      diff: dueMs - nowMs,
      shouldPostNow
    });

    if (shouldPostNow) {
      console.log(`📤 Triggering immediate post for post id=${result.id}`);
      // Run soon after insert (DB row must exist). Log clearly if publishing fails.
      Promise.resolve()
        .then(() => scheduler.postNow(result.id))
        .then((publishResult) => {
          console.log(
            `✓ Immediate post finished for post id=${result.id}`,
            JSON.stringify(publishResult).slice(0, 1200)
          );
        })
        .catch((err) => {
          console.error(
            `✗ Immediate post failed for post id=${result.id}:`,
            err?.message || err,
            err?.stack || ''
          );
        });
    } else {
      console.log(`⏰ Post id=${result.id} will be processed by scheduler (due in ${Math.round((dueMs - nowMs) / 1000)}s)`);
    }

    res.json({
      success: true,
      id: result.id,
      message: 'Post created successfully',
      webhook_url: webhook,
    });
  } catch (err) {
    console.error('❌ Post creation error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/posts/:id - Update post
 */
router.put('/posts/:id', optionalApiKey, async (req, res) => {
  try {
    const { caption, platforms, scheduled_time, status } = req.body;
    const data = {};

    if (caption !== undefined) {
      data.caption = caption;
    }

    if (platforms !== undefined) {
      data.platforms = JSON.stringify(platforms);
    }

    if (scheduled_time !== undefined) {
      data.scheduled_time = scheduled_time;
    }

    if (status !== undefined) {
      data.status = status;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    await updatePost(req.params.id, data);

    res.json({ message: 'Post updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/posts/:id - Delete post
 */
router.delete('/posts/:id', optionalApiKey, async (req, res) => {
  try {
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ message: 'Post deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/posts/:id/post-now - Manually post immediately
 */
router.post('/posts/:id/post-now', optionalApiKey, async (req, res) => {
  try {
    const result = await scheduler.postNow(req.params.id);
    res.json({ message: 'Post processed', result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/import-folder - Import all files from a folder
 */
router.post('/api/import-folder', optionalApiKey, async (req, res) => {
  try {
    const { user_id, folderPath, platforms, caption } = req.body;

    if (!folderPath || !platforms) {
      return res.status(400).json({ error: 'Missing folderPath or platforms' });
    }

    if (!fs.existsSync(folderPath)) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    let internalUserId = null;

    // If user_id provided, look up internal ID first
    if (user_id) {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('external_user_id', user_id)
        .single();

      if (error || !profile) {
        return res.status(404).json({
          error: 'User not found',
          message: 'Please connect your social media accounts first'
        });
      }

      internalUserId = profile.id;
    }

    const files = fs.readdirSync(folderPath);
    const imported = [];
    const errors = [];

    // Import files
    for (const filename of files) {
      const filepath = path.join(folderPath, filename);
      const stat = fs.statSync(filepath);

      if (stat.isFile()) {
        const ext = path.extname(filename).toLowerCase();
        let filetype = 'image';

        if (['.mp4', '.mov', '.avi'].includes(ext)) {
          filetype = 'video';
        } else if (!['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
          errors.push({ filename, error: 'Unsupported file type' });
          continue;
        }

        try {
          const result = await createPost({
            filename,
            filepath,
            filetype,
            caption: caption || '',
            content: caption || '',
            media_url: filepath,
            media_type: filetype,
            platforms: platforms, // Pass as array, not JSON string
            user_id: internalUserId,
            status: 'pending',
            scheduled_time: new Date().toISOString()
          });

          imported.push({ id: result.id, filename });
        } catch (err) {
          errors.push({ filename, error: err.message });
        }
      }
    }

    res.json({
      message: 'Import complete',
      imported: imported.length,
      errors: errors.length,
      details: { imported, errors },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/stats - Get dashboard statistics
 */
router.get('/stats', optionalApiKey, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('status');

    if (error) throw error;

    const stats = {
      total: data.length,
      pending: data.filter(p => p.status === 'pending').length,
      posted: data.filter(p => p.status === 'posted').length,
      failed: data.filter(p => p.status === 'failed').length
    };

    res.json({ stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/scheduler/status - Get scheduler status
 */
router.get('/scheduler/status', (req, res) => {
  res.json({
    isRunning: scheduler.isRunning,
  });
});

/**
 * POST /api/scheduler/start - Start scheduler
 */
router.post('/scheduler/start', (req, res) => {
  const { cronExpression } = req.body;
  scheduler.start(cronExpression);
  res.json({ message: 'Scheduler started', isRunning: scheduler.isRunning });
});

/**
 * POST /api/scheduler/stop - Stop scheduler
 */
router.post('/scheduler/stop', (req, res) => {
  scheduler.stop();
  res.json({ message: 'Scheduler stopped', isRunning: scheduler.isRunning });
});

// ===== API KEY MANAGEMENT =====

/**
 * GET /api/keys - Get all API keys
 */
router.get('/keys', async (req, res) => {
  try {
    const { data: keys, error } = await supabase
      .from('api_keys')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ keys: keys || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/keys - Create new API key
 */
router.post('/keys', async (req, res) => {
  try {
    const { name, account_id, webhook_url } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Generate API key
    const apiKey = 'sk_' + crypto.randomBytes(32).toString('hex');

    const { data: result, error } = await supabase
      .from('api_keys')
      .insert({
        name,
        api_key: apiKey,
        account_id: account_id || null,
        webhook_url: webhook_url || null
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      id: result.id,
      api_key: apiKey,
      message: 'API key created successfully. Save this key, it will not be shown again!',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/keys/:id - Update API key
 */
router.put('/keys/:id', async (req, res) => {
  try {
    const { name, webhook_url, is_active } = req.body;
    const data = {};

    if (name !== undefined) {
      data.name = name;
    }

    if (webhook_url !== undefined) {
      data.webhook_url = webhook_url;
    }

    if (is_active !== undefined) {
      data.is_active = is_active;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const { error } = await supabase
      .from('api_keys')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ message: 'API key updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/keys/:id - Delete API key
 */
router.delete('/keys/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('api_keys')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ message: 'API key deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== SOCIAL MEDIA ACCOUNTS MANAGEMENT =====

/**
 * GET /api/accounts - Get all social media accounts
 */
router.get('/accounts', async (req, res) => {
  try {
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ accounts: accounts || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/accounts - Create new social media account
 */
router.post('/accounts', async (req, res) => {
  try {
    const { name, type, facebook_page_token, facebook_page_id, instagram_token, instagram_account_id, is_default } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    // If setting as default, unset other defaults
    if (is_default) {
      await supabase
        .from('accounts')
        .update({ is_default: false });
    }

    const { data: result, error } = await supabase
      .from('accounts')
      .insert({
        name,
        type,
        facebook_page_token: facebook_page_token || null,
        facebook_page_id: facebook_page_id || null,
        instagram_token: instagram_token || null,
        instagram_account_id: instagram_account_id || null,
        is_default: is_default || false
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      id: result.id,
      message: 'Account created successfully',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/accounts/:id - Update account
 */
router.put('/accounts/:id', async (req, res) => {
  try {
    const { name, facebook_page_token, facebook_page_id, instagram_token, instagram_account_id, is_default } = req.body;
    const data = {};

    if (name !== undefined) {
      data.name = name;
    }

    if (facebook_page_token !== undefined) {
      data.facebook_page_token = facebook_page_token;
    }

    if (facebook_page_id !== undefined) {
      data.facebook_page_id = facebook_page_id;
    }

    if (instagram_token !== undefined) {
      data.instagram_token = instagram_token;
    }

    if (instagram_account_id !== undefined) {
      data.instagram_account_id = instagram_account_id;
    }

    if (is_default !== undefined) {
      if (is_default) {
        await supabase
          .from('accounts')
          .update({ is_default: false });
      }
      data.is_default = is_default;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const { error } = await supabase
      .from('accounts')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ message: 'Account updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/accounts/:id - Delete account
 */
router.delete('/accounts/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('accounts')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== WEBHOOK LOGS =====

/**
 * GET /api/webhook-logs - Get webhook logs
 */
router.get('/webhook-logs', async (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const { data: logs, error } = await supabase
      .from('webhook_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    res.json({ logs: logs || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
