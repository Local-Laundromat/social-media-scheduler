const express = require('express');
const router = express.Router();
const db = require('../database/db');
const scheduler = require('../services/scheduler');
const webhookService = require('../services/webhooks');
const { authenticateApiKey, optionalApiKey } = require('../middleware/auth');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * GET /api/posts - Get all posts
 */
router.get('/posts', optionalApiKey, (req, res) => {
  const { status, limit = 100 } = req.query;

  let query = 'SELECT * FROM posts';
  const params = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(limit));

  db.all(query, params, (err, posts) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ posts });
  });
});

/**
 * GET /api/posts/:id - Get single post
 */
router.get('/posts/:id', optionalApiKey, (req, res) => {
  db.get('SELECT * FROM posts WHERE id = ?', [req.params.id], (err, post) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json({ post });
  });
});

/**
 * POST /api/posts - Create new post (Supports both API key and user_id)
 */
router.post('/posts', optionalApiKey, (req, res) => {
  const { user_id, filename, filepath, filetype, caption, platforms, scheduled_time, webhook_url } = req.body;

  if (!filename || !filepath || !platforms) {
    return res.status(400).json({ error: 'Missing required fields: filename, filepath, platforms' });
  }

  const platformsJson = JSON.stringify(platforms);
  const accountId = req.account?.id || null;
  const apiKey = req.apiKey?.api_key || null;
  const webhook = webhook_url || req.apiKey?.webhook_url || null;

  // If user_id is provided, look up the user's internal ID
  if (user_id) {
    db.get(
      'SELECT id FROM users WHERE external_user_id = ?',
      [user_id],
      (err, user) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        if (!user) {
          return res.status(404).json({
            error: 'User not found',
            message: 'Please connect your social media accounts first in the embed page'
          });
        }

        // Create post with user_id
        db.run(
          `INSERT INTO posts (filename, filepath, filetype, caption, platforms, scheduled_time, user_id, account_id, api_key, webhook_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [filename, filepath, filetype || 'image', caption || '', platformsJson, scheduled_time || null, user.id, accountId, apiKey, webhook],
          function (err) {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            res.json({
              success: true,
              id: this.lastID,
              message: 'Post created successfully',
              webhook_url: webhook,
            });
          }
        );
      }
    );
  } else {
    // No user_id - use old account-based system
    db.run(
      `INSERT INTO posts (filename, filepath, filetype, caption, platforms, scheduled_time, account_id, api_key, webhook_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [filename, filepath, filetype || 'image', caption || '', platformsJson, scheduled_time || null, accountId, apiKey, webhook],
      function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({
          success: true,
          id: this.lastID,
          message: 'Post created successfully',
          webhook_url: webhook,
        });
      }
    );
  }
});

/**
 * PUT /api/posts/:id - Update post
 */
router.put('/posts/:id', optionalApiKey, (req, res) => {
  const { caption, platforms, scheduled_time, status } = req.body;
  const updates = [];
  const params = [];

  if (caption !== undefined) {
    updates.push('caption = ?');
    params.push(caption);
  }

  if (platforms !== undefined) {
    updates.push('platforms = ?');
    params.push(JSON.stringify(platforms));
  }

  if (scheduled_time !== undefined) {
    updates.push('scheduled_time = ?');
    params.push(scheduled_time);
  }

  if (status !== undefined) {
    updates.push('status = ?');
    params.push(status);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  params.push(req.params.id);

  db.run(
    `UPDATE posts SET ${updates.join(', ')} WHERE id = ?`,
    params,
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Post not found' });
      }
      res.json({ message: 'Post updated successfully' });
    }
  );
});

/**
 * DELETE /api/posts/:id - Delete post
 */
router.delete('/posts/:id', optionalApiKey, (req, res) => {
  db.run('DELETE FROM posts WHERE id = ?', [req.params.id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json({ message: 'Post deleted successfully' });
  });
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
router.post('/api/import-folder', optionalApiKey, (req, res) => {
  const { user_id, folderPath, platforms, caption } = req.body;

  if (!folderPath || !platforms) {
    return res.status(400).json({ error: 'Missing folderPath or platforms' });
  }

  if (!fs.existsSync(folderPath)) {
    return res.status(404).json({ error: 'Folder not found' });
  }

  const files = fs.readdirSync(folderPath);
  const imported = [];
  const errors = [];
  const accountId = req.account?.id || null;

  // Helper function to import files
  const importFiles = (internalUserId) => {
    files.forEach((filename) => {
      const filepath = path.join(folderPath, filename);
      const stat = fs.statSync(filepath);

      if (stat.isFile()) {
        const ext = path.extname(filename).toLowerCase();
        let filetype = 'image';

        if (['.mp4', '.mov', '.avi'].includes(ext)) {
          filetype = 'video';
        } else if (!['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
          errors.push({ filename, error: 'Unsupported file type' });
          return;
        }

        const platformsJson = JSON.stringify(platforms);

        db.run(
          `INSERT INTO posts (filename, filepath, filetype, caption, platforms, account_id, user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [filename, filepath, filetype, caption || '', platformsJson, accountId, internalUserId],
          function (err) {
            if (err) {
              errors.push({ filename, error: err.message });
            } else {
              imported.push({ id: this.lastID, filename });
            }
          }
        );
      }
    });

    setTimeout(() => {
      res.json({
        message: 'Import complete',
        imported: imported.length,
        errors: errors.length,
        details: { imported, errors },
      });
    }, 500);
  };

  // If user_id provided, look up internal ID first
  if (user_id) {
    db.get(
      'SELECT id FROM users WHERE external_user_id = ?',
      [user_id],
      (err, user) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        if (!user) {
          return res.status(404).json({
            error: 'User not found',
            message: 'Please connect your social media accounts first'
          });
        }

        importFiles(user.id);
      }
    );
  } else {
    importFiles(null);
  }
});

/**
 * GET /api/stats - Get dashboard statistics
 */
router.get('/stats', optionalApiKey, (req, res) => {
  db.get(
    `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'posted' THEN 1 ELSE 0 END) as posted,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
     FROM posts`,
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ stats: row });
    }
  );
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
router.get('/keys', (req, res) => {
  db.all('SELECT id, name, api_key, account_id, webhook_url, is_active, created_at, last_used_at FROM api_keys ORDER BY created_at DESC', (err, keys) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ keys });
  });
});

/**
 * POST /api/keys - Create new API key
 */
router.post('/keys', (req, res) => {
  const { name, account_id, webhook_url } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  // Generate API key
  const apiKey = 'sk_' + crypto.randomBytes(32).toString('hex');

  db.run(
    `INSERT INTO api_keys (name, api_key, account_id, webhook_url)
     VALUES (?, ?, ?, ?)`,
    [name, apiKey, account_id || null, webhook_url || null],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({
        success: true,
        id: this.lastID,
        api_key: apiKey,
        message: 'API key created successfully. Save this key, it will not be shown again!',
      });
    }
  );
});

/**
 * PUT /api/keys/:id - Update API key
 */
router.put('/keys/:id', (req, res) => {
  const { name, webhook_url, is_active } = req.body;
  const updates = [];
  const params = [];

  if (name !== undefined) {
    updates.push('name = ?');
    params.push(name);
  }

  if (webhook_url !== undefined) {
    updates.push('webhook_url = ?');
    params.push(webhook_url);
  }

  if (is_active !== undefined) {
    updates.push('is_active = ?');
    params.push(is_active ? 1 : 0);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  params.push(req.params.id);

  db.run(
    `UPDATE api_keys SET ${updates.join(', ')} WHERE id = ?`,
    params,
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'API key not found' });
      }
      res.json({ message: 'API key updated successfully' });
    }
  );
});

/**
 * DELETE /api/keys/:id - Delete API key
 */
router.delete('/keys/:id', (req, res) => {
  db.run('DELETE FROM api_keys WHERE id = ?', [req.params.id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'API key not found' });
    }
    res.json({ message: 'API key deleted successfully' });
  });
});

// ===== SOCIAL MEDIA ACCOUNTS MANAGEMENT =====

/**
 * GET /api/accounts - Get all social media accounts
 */
router.get('/accounts', (req, res) => {
  db.all('SELECT id, name, type, facebook_page_id, instagram_account_id, is_default, created_at FROM accounts ORDER BY is_default DESC, created_at DESC', (err, accounts) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ accounts });
  });
});

/**
 * POST /api/accounts - Create new social media account
 */
router.post('/accounts', (req, res) => {
  const { name, type, facebook_page_token, facebook_page_id, instagram_token, instagram_account_id, is_default } = req.body;

  if (!name || !type) {
    return res.status(400).json({ error: 'Name and type are required' });
  }

  // If setting as default, unset other defaults
  if (is_default) {
    db.run('UPDATE accounts SET is_default = 0');
  }

  db.run(
    `INSERT INTO accounts (name, type, facebook_page_token, facebook_page_id, instagram_token, instagram_account_id, is_default)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name, type, facebook_page_token || null, facebook_page_id || null, instagram_token || null, instagram_account_id || null, is_default ? 1 : 0],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({
        success: true,
        id: this.lastID,
        message: 'Account created successfully',
      });
    }
  );
});

/**
 * PUT /api/accounts/:id - Update account
 */
router.put('/accounts/:id', (req, res) => {
  const { name, facebook_page_token, facebook_page_id, instagram_token, instagram_account_id, is_default } = req.body;
  const updates = [];
  const params = [];

  if (name !== undefined) {
    updates.push('name = ?');
    params.push(name);
  }

  if (facebook_page_token !== undefined) {
    updates.push('facebook_page_token = ?');
    params.push(facebook_page_token);
  }

  if (facebook_page_id !== undefined) {
    updates.push('facebook_page_id = ?');
    params.push(facebook_page_id);
  }

  if (instagram_token !== undefined) {
    updates.push('instagram_token = ?');
    params.push(instagram_token);
  }

  if (instagram_account_id !== undefined) {
    updates.push('instagram_account_id = ?');
    params.push(instagram_account_id);
  }

  if (is_default !== undefined) {
    if (is_default) {
      db.run('UPDATE accounts SET is_default = 0');
    }
    updates.push('is_default = ?');
    params.push(is_default ? 1 : 0);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(req.params.id);

  db.run(
    `UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`,
    params,
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Account not found' });
      }
      res.json({ message: 'Account updated successfully' });
    }
  );
});

/**
 * DELETE /api/accounts/:id - Delete account
 */
router.delete('/accounts/:id', (req, res) => {
  db.run('DELETE FROM accounts WHERE id = ?', [req.params.id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json({ message: 'Account deleted successfully' });
  });
});

// ===== WEBHOOK LOGS =====

/**
 * GET /api/webhook-logs - Get webhook logs
 */
router.get('/webhook-logs', (req, res) => {
  const { limit = 50 } = req.query;

  db.all(
    'SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT ?',
    [parseInt(limit)],
    (err, logs) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ logs });
    }
  );
});

module.exports = router;
