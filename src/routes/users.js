const express = require('express');
const router = express.Router();
const { get, getAll, insert, update: updateRow, deleteRows, customQuery, customGet, run, isSupabase } = require('../database/helpers');

/**
 * GET /api/users/:userId - Get user by external_user_id
 * This endpoint is used by the embed page to check connection status
 */
router.get('/:userId', async (req, res) => {
  const externalUserId = req.params.userId;

  try {
    const user = await get('users', { external_user_id: externalUserId });

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
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/users/:userId/posts - Get all posts for a user
 */
router.get('/:userId/posts', async (req, res) => {
  const externalUserId = req.params.userId;
  const { status, limit = 50 } = req.query;

  try {
    // First get the user's internal ID
    const user = await get('users', { external_user_id: externalUserId });

    if (!user) {
      return res.json({ posts: [] });
    }

    // Get posts for this user
    let posts;
    if (status) {
      posts = await getAll('posts', { user_id: user.id, status }, {
        orderBy: 'created_at DESC',
        limit: parseInt(limit)
      });
    } else {
      posts = await getAll('posts', { user_id: user.id }, {
        orderBy: 'created_at DESC',
        limit: parseInt(limit)
      });
    }

    res.json({ posts });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/users - Create or update user
 * Used by parent apps (OmniBroker/Sun Production) to register users
 */
router.post('/', async (req, res) => {
  const { user_id, app_name, name, email } = req.body;

  if (!user_id || !app_name) {
    return res.status(400).json({ error: 'user_id and app_name are required' });
  }

  const externalUserId = `${app_name}_${user_id}`;

  try {
    // Check if user exists
    const existingUser = await get('users', { external_user_id: externalUserId });

    if (existingUser) {
      // Update existing user
      const updateData = {};
      if (name) updateData.name = name;
      if (email) updateData.email = email;

      await customQuery(
        `UPDATE users SET
          name = COALESCE(?, name),
          email = COALESCE(?, email),
          updated_at = CURRENT_TIMESTAMP
        WHERE external_user_id = ?`,
        [name, email, externalUserId],
        async () => {
          const { db } = require('../database/helpers');
          const updates = {};
          if (name) updates.name = name;
          if (email) updates.email = email;
          updates.updated_at = new Date().toISOString();

          const { error } = await db
            .from('users')
            .update(updates)
            .eq('external_user_id', externalUserId);

          if (error) throw error;
          return [];
        }
      );

      res.json({
        success: true,
        id: existingUser.id,
        external_user_id: externalUserId,
        message: 'User updated successfully',
      });
    } else {
      // Create new user
      const result = await insert('users', {
        external_user_id: externalUserId,
        app_name,
        name,
        email
      });

      res.json({
        success: true,
        id: result.id,
        external_user_id: externalUserId,
        message: 'User created successfully',
      });
    }
  } catch (error) {
    console.error('Create/update user error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/users/:userId/disconnect/:platform - Disconnect a platform
 */
router.post('/:userId/disconnect/:platform', async (req, res) => {
  const externalUserId = req.params.userId;
  const platform = req.params.platform;

  if (!['facebook', 'instagram'].includes(platform)) {
    return res.status(400).json({ error: 'Invalid platform. Must be facebook or instagram' });
  }

  try {
    let updateData;
    if (platform === 'facebook') {
      updateData = {
        facebook_page_token: null,
        facebook_page_id: null,
        facebook_page_name: null,
        facebook_connected: isSupabase ? false : 0
      };
    } else {
      updateData = {
        instagram_token: null,
        instagram_account_id: null,
        instagram_username: null,
        instagram_connected: isSupabase ? false : 0
      };
    }

    await customQuery(
      `UPDATE users SET
        ${Object.keys(updateData).map(k => `${k} = ?`).join(', ')},
        updated_at = CURRENT_TIMESTAMP
      WHERE external_user_id = ?`,
      [...Object.values(updateData), externalUserId],
      async () => {
        const { db } = require('../database/helpers');
        updateData.updated_at = new Date().toISOString();

        const { error, count } = await db
          .from('users')
          .update(updateData)
          .eq('external_user_id', externalUserId);

        if (error) throw error;
        if (count === 0) throw new Error('User not found');
        return [];
      }
    );

    res.json({
      success: true,
      message: `${platform} disconnected successfully`,
    });
  } catch (error) {
    console.error('Disconnect error:', error);
    if (error.message === 'User not found') {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/users - List all users (admin only - for dashboard)
 */
router.get('/', async (req, res) => {
  const { app_name, limit = 100 } = req.query;

  try {
    const users = await customQuery(
      `SELECT id, external_user_id, name, email, app_name, facebook_connected, instagram_connected, created_at FROM users
       ${app_name ? 'WHERE app_name = ?' : ''}
       ORDER BY created_at DESC LIMIT ?`,
      app_name ? [app_name, parseInt(limit)] : [parseInt(limit)],
      async () => {
        const { db } = require('../database/helpers');
        let query = db
          .from('users')
          .select('id, external_user_id, name, email, app_name, facebook_connected, instagram_connected, created_at');

        if (app_name) {
          query = query.eq('app_name', app_name);
        }

        query = query.order('created_at', { ascending: false }).limit(parseInt(limit));

        const { data, error } = await query;
        if (error) throw error;
        return data;
      }
    );

    res.json({ users });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/users/:userId - Update user information
 */
router.put('/:userId', async (req, res) => {
  const userId = req.params.userId;
  const { name, company, webhook_url } = req.body;

  const updateData = {};

  if (name !== undefined) {
    updateData.name = name;
  }

  if (company !== undefined) {
    updateData.company = company;
  }

  if (webhook_url !== undefined) {
    updateData.webhook_url = webhook_url;
  }

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  try {
    const result = await customQuery(
      `UPDATE users SET ${Object.keys(updateData).map(k => `${k} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...Object.values(updateData), userId],
      async () => {
        const { db } = require('../database/helpers');
        updateData.updated_at = new Date().toISOString();

        const { error, count } = await db
          .from('users')
          .update(updateData)
          .eq('id', userId);

        if (error) throw error;
        if (count === 0) throw new Error('User not found');
        return [];
      }
    );

    res.json({
      success: true,
      message: 'User updated successfully'
    });
  } catch (error) {
    console.error('Update user error:', error);
    if (error.message === 'User not found') {
      return res.status(404).json({ error: 'User not found' });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/users/:userId - Delete user and all their posts
 */
router.delete('/:userId', async (req, res) => {
  const externalUserId = req.params.userId;

  try {
    // First get user ID
    const user = await get('users', { external_user_id: externalUserId });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete all posts for this user
    await deleteRows('posts', { user_id: user.id });

    // Delete user
    await deleteRows('users', { id: user.id });

    res.json({
      success: true,
      message: 'User and all their posts deleted successfully',
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
