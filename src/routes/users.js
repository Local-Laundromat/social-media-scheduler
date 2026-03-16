const express = require('express');
const router = express.Router();
const db = require('../database/db');

/**
 * GET /api/users/:userId - Get user by external_user_id
 * This endpoint is used by the embed page to check connection status
 */
router.get('/:userId', (req, res) => {
  const externalUserId = req.params.userId;

  db.get(
    'SELECT * FROM users WHERE external_user_id = ?',
    [externalUserId],
    (err, user) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!user) {
        // User doesn't exist yet, return empty state
        return res.json({
          user: null,
          exists: false,
        });
      }

      // Don't expose tokens in response
      const safeUser = {
        id: user.id,
        external_user_id: user.external_user_id,
        name: user.name,
        email: user.email,
        app_name: user.app_name,
        facebook_page_id: user.facebook_page_id,
        facebook_page_name: user.facebook_page_name,
        facebook_connected: user.facebook_connected,
        instagram_account_id: user.instagram_account_id,
        instagram_username: user.instagram_username,
        instagram_connected: user.instagram_connected,
        created_at: user.created_at,
        updated_at: user.updated_at,
      };

      res.json({
        user: safeUser,
        exists: true,
      });
    }
  );
});

/**
 * GET /api/users/:userId/posts - Get all posts for a user
 */
router.get('/:userId/posts', (req, res) => {
  const externalUserId = req.params.userId;
  const { status, limit = 50 } = req.query;

  // First get the user's internal ID
  db.get(
    'SELECT id FROM users WHERE external_user_id = ?',
    [externalUserId],
    (err, user) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!user) {
        return res.json({ posts: [] });
      }

      // Get posts for this user
      let query = 'SELECT * FROM posts WHERE user_id = ?';
      const params = [user.id];

      if (status) {
        query += ' AND status = ?';
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
    }
  );
});

/**
 * POST /api/users - Create or update user
 * Used by parent apps (OmniBroker/Sun Production) to register users
 */
router.post('/', (req, res) => {
  const { user_id, app_name, name, email } = req.body;

  if (!user_id || !app_name) {
    return res.status(400).json({ error: 'user_id and app_name are required' });
  }

  const externalUserId = `${app_name}_${user_id}`;

  // Check if user exists
  db.get(
    'SELECT * FROM users WHERE external_user_id = ?',
    [externalUserId],
    (err, existingUser) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (existingUser) {
        // Update existing user
        db.run(
          `UPDATE users SET
            name = COALESCE(?, name),
            email = COALESCE(?, email),
            updated_at = CURRENT_TIMESTAMP
          WHERE external_user_id = ?`,
          [name, email, externalUserId],
          function (err) {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            res.json({
              success: true,
              id: existingUser.id,
              external_user_id: externalUserId,
              message: 'User updated successfully',
            });
          }
        );
      } else {
        // Create new user
        db.run(
          `INSERT INTO users (external_user_id, app_name, name, email)
           VALUES (?, ?, ?, ?)`,
          [externalUserId, app_name, name, email],
          function (err) {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            res.json({
              success: true,
              id: this.lastID,
              external_user_id: externalUserId,
              message: 'User created successfully',
            });
          }
        );
      }
    }
  );
});

/**
 * POST /api/users/:userId/disconnect/:platform - Disconnect a platform
 */
router.post('/:userId/disconnect/:platform', (req, res) => {
  const externalUserId = req.params.userId;
  const platform = req.params.platform;

  if (!['facebook', 'instagram'].includes(platform)) {
    return res.status(400).json({ error: 'Invalid platform. Must be facebook or instagram' });
  }

  let updateQuery = '';
  if (platform === 'facebook') {
    updateQuery = `UPDATE users SET
      facebook_page_token = NULL,
      facebook_page_id = NULL,
      facebook_page_name = NULL,
      facebook_connected = 0,
      updated_at = CURRENT_TIMESTAMP
    WHERE external_user_id = ?`;
  } else {
    updateQuery = `UPDATE users SET
      instagram_token = NULL,
      instagram_account_id = NULL,
      instagram_username = NULL,
      instagram_connected = 0,
      updated_at = CURRENT_TIMESTAMP
    WHERE external_user_id = ?`;
  }

  db.run(updateQuery, [externalUserId], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      message: `${platform} disconnected successfully`,
    });
  });
});

/**
 * GET /api/users - List all users (admin only - for dashboard)
 */
router.get('/', (req, res) => {
  const { app_name, limit = 100 } = req.query;

  let query = 'SELECT id, external_user_id, name, email, app_name, facebook_connected, instagram_connected, created_at FROM users';
  const params = [];

  if (app_name) {
    query += ' WHERE app_name = ?';
    params.push(app_name);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(limit));

  db.all(query, params, (err, users) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ users });
  });
});

/**
 * PUT /api/users/:userId - Update user information
 */
router.put('/:userId', (req, res) => {
  const userId = req.params.userId;
  const { name, company, webhook_url } = req.body;

  const updates = [];
  const params = [];

  if (name !== undefined) {
    updates.push('name = ?');
    params.push(name);
  }

  if (company !== undefined) {
    updates.push('company = ?');
    params.push(company);
  }

  if (webhook_url !== undefined) {
    updates.push('webhook_url = ?');
    params.push(webhook_url);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(userId);

  db.run(
    `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
    params,
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        success: true,
        message: 'User updated successfully'
      });
    }
  );
});

/**
 * DELETE /api/users/:userId - Delete user and all their posts
 */
router.delete('/:userId', (req, res) => {
  const externalUserId = req.params.userId;

  // First get user ID
  db.get(
    'SELECT id FROM users WHERE external_user_id = ?',
    [externalUserId],
    (err, user) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Delete all posts for this user
      db.run('DELETE FROM posts WHERE user_id = ?', [user.id], (err) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }

        // Delete user
        db.run('DELETE FROM users WHERE id = ?', [user.id], function (err) {
          if (err) {
            return res.status(500).json({ error: err.message });
          }

          res.json({
            success: true,
            message: 'User and all their posts deleted successfully',
          });
        });
      });
    }
  );
});

module.exports = router;
