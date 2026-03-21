const express = require('express');
const router = express.Router();
const { get, getAll, insert, update: updateRow, deleteRows, customQuery, customGet, run, isSupabase } = require('../database/helpers');
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
    const where = status ? { status } : {};
    const posts = await getAll('posts', where, {
      orderBy: 'created_at DESC',
      limit: parseInt(limit)
    });
    res.json({ posts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/posts/:id - Get single post
 */
router.get('/posts/:id', optionalApiKey, async (req, res) => {
  try {
    const post = await get('posts', { id: req.params.id });
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
    const { user_id, filename, filepath, filetype, caption, platforms, scheduled_time, webhook_url } = req.body;

    if (!filename || !filepath || !platforms) {
      return res.status(400).json({ error: 'Missing required fields: filename, filepath, platforms' });
    }

    const platformsJson = JSON.stringify(platforms);
    const accountId = req.account?.id || null;
    const apiKey = req.apiKey?.api_key || null;
    const webhook = webhook_url || req.apiKey?.webhook_url || null;

    let internalUserId = null;
    let teamId = null;

    // If user_id is provided, look up the user's internal ID and team_id
    if (user_id) {
      const user = await get('users', { external_user_id: user_id });

      if (!user) {
        return res.status(404).json({
          error: 'User not found',
          message: 'Please connect your social media accounts first in the embed page'
        });
      }

      internalUserId = user.id;
      teamId = user.team_id || null;
    }

    // Create post
    const result = await insert('posts', {
      filename,
      filepath,
      filetype: filetype || 'image',
      caption: caption || '',
      platforms: platformsJson,
      scheduled_time: scheduled_time || null,
      user_id: internalUserId,
      team_id: teamId,
      account_id: accountId,
      api_key: apiKey,
      webhook_url: webhook
    });

    res.json({
      success: true,
      id: result.id,
      message: 'Post created successfully',
      webhook_url: webhook,
    });
  } catch (err) {
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

    const result = await updateRow('posts', { id: req.params.id }, data);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

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
    const result = await deleteRows('posts', { id: req.params.id });

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

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
      const user = await get('users', { external_user_id: user_id });

      if (!user) {
        return res.status(404).json({
          error: 'User not found',
          message: 'Please connect your social media accounts first'
        });
      }

      internalUserId = user.id;
    }

    const files = fs.readdirSync(folderPath);
    const imported = [];
    const errors = [];
    const accountId = req.account?.id || null;
    const platformsJson = JSON.stringify(platforms);

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
          const result = await insert('posts', {
            filename,
            filepath,
            filetype,
            caption: caption || '',
            platforms: platformsJson,
            account_id: accountId,
            user_id: internalUserId
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
    const stats = await customGet(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'posted' THEN 1 ELSE 0 END) as posted,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
       FROM posts`,
      [],
      async () => {
        const { db } = require('../database/helpers');
        const { data, error } = await db
          .from('posts')
          .select('status')
          .then(({ data, error }) => {
            if (error) throw error;
            const stats = {
              total: data.length,
              pending: data.filter(p => p.status === 'pending').length,
              posted: data.filter(p => p.status === 'posted').length,
              failed: data.filter(p => p.status === 'failed').length
            };
            return { data: stats, error: null };
          });
        if (error) throw error;
        return data;
      }
    );
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
    const keys = await getAll('api_keys', {}, {
      orderBy: 'created_at DESC'
    });
    res.json({ keys });
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

    const result = await insert('api_keys', {
      name,
      api_key: apiKey,
      account_id: account_id || null,
      webhook_url: webhook_url || null
    });

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
      data.is_active = is_active ? 1 : 0;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const result = await updateRow('api_keys', { id: req.params.id }, data);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'API key not found' });
    }

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
    const result = await deleteRows('api_keys', { id: req.params.id });

    if (result.changes === 0) {
      return res.status(404).json({ error: 'API key not found' });
    }

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
    const accounts = await getAll('accounts', {}, {
      orderBy: 'is_default DESC, created_at DESC'
    });
    res.json({ accounts });
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
      await run(
        'UPDATE accounts SET is_default = 0',
        [],
        async () => {
          const { db } = require('../database/helpers');
          const { error } = await db.from('accounts').update({ is_default: false });
          if (error) throw error;
        }
      );
    }

    const result = await insert('accounts', {
      name,
      type,
      facebook_page_token: facebook_page_token || null,
      facebook_page_id: facebook_page_id || null,
      instagram_token: instagram_token || null,
      instagram_account_id: instagram_account_id || null,
      is_default: is_default ? 1 : 0
    });

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
        await run(
          'UPDATE accounts SET is_default = 0',
          [],
          async () => {
            const { db } = require('../database/helpers');
            const { error } = await db.from('accounts').update({ is_default: false });
            if (error) throw error;
          }
        );
      }
      data.is_default = is_default ? 1 : 0;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const result = await run(
      `UPDATE accounts SET ${Object.keys(data).map(k => `${k} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...Object.values(data), req.params.id],
      async () => {
        const { db } = require('../database/helpers');
        const { error } = await db.from('accounts').update({ ...data, updated_at: new Date().toISOString() }).eq('id', req.params.id);
        if (error) throw error;
      }
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

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
    const result = await deleteRows('accounts', { id: req.params.id });

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

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

    const logs = await getAll('webhook_logs', {}, {
      orderBy: 'created_at DESC',
      limit: parseInt(limit)
    });

    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
