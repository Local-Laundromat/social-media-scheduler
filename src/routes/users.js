const express = require('express');
const router = express.Router();
const { supabase, getPostsByUser } = require('../database/supabase');

/**
 * GET /api/users/:userId - Get user by external_user_id
 * This endpoint is used by the embed page to check connection status
 */
router.get('/:userId', async (req, res) => {
  const externalUserId = req.params.userId;

  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('external_user_id', externalUserId)
      .single();

    if (error || !profile) {
      // User doesn't exist yet, return empty state
      return res.json({
        user: null,
        exists: false,
      });
    }

    // Get connected social accounts
    const { data: fbAccounts } = await supabase
      .from('facebook_accounts')
      .select('page_id, page_name')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .limit(1);

    const { data: igAccounts } = await supabase
      .from('instagram_accounts')
      .select('account_id, username')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .limit(1);

    // Don't expose tokens in response
    const safeUser = {
      id: profile.id,
      external_user_id: profile.external_user_id,
      name: profile.name,
      email: profile.email,
      app_name: profile.app_name,
      facebook_page_id: fbAccounts && fbAccounts.length > 0 ? fbAccounts[0].page_id : null,
      facebook_page_name: fbAccounts && fbAccounts.length > 0 ? fbAccounts[0].page_name : null,
      facebook_connected: fbAccounts && fbAccounts.length > 0,
      instagram_account_id: igAccounts && igAccounts.length > 0 ? igAccounts[0].account_id : null,
      instagram_username: igAccounts && igAccounts.length > 0 ? igAccounts[0].username : null,
      instagram_connected: igAccounts && igAccounts.length > 0,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
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
  const userId = req.params.userId;
  const { status, limit = 50 } = req.query;

  console.log(`📊 GET /api/users/${userId}/posts - Fetching posts...`);

  try {
    // Try to find user by Supabase auth ID first (for dashboard users)
    let { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    // If not found, try external_user_id (for API users)
    if (profileError || !profile) {
      console.log('  → User not found by Supabase ID, trying external_user_id...');
      const result = await supabase
        .from('profiles')
        .select('*')
        .eq('external_user_id', userId)
        .single();

      profile = result.data;
      profileError = result.error;
    }

    if (profileError || !profile) {
      console.log(`  ❌ User not found: ${userId}`);
      return res.json({ posts: [] });
    }

    console.log(`  ✓ Found user: ${profile.name || profile.email} (ID: ${profile.id}, Team: ${profile.team_id || 'none'})`);

    // Get posts for this user's team (if they have one) or just their posts
    let query = supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (profile.team_id) {
      console.log(`  → Querying posts for team_id: ${profile.team_id}`);
      query = query.eq('team_id', profile.team_id);
    } else {
      console.log(`  → Querying posts for user_id: ${profile.id}`);
      query = query.eq('user_id', profile.id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data: posts, error } = await query;

    if (error) throw error;

    console.log(`  ✅ Found ${posts?.length || 0} posts`);

    // Log first post details for debugging
    if (posts && posts.length > 0) {
      const firstPost = posts[0];
      console.log(`  📝 Sample post:`, {
        id: firstPost.id,
        filename: firstPost.filename,
        caption: firstPost.caption?.substring(0, 30),
        platforms: firstPost.platforms,
        scheduled_time: firstPost.scheduled_time,
        status: firstPost.status,
        created_at: firstPost.created_at
      });
    }

    res.json({ posts: posts || [] });
  } catch (error) {
    console.error('❌ Get posts error:', error);
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
    // Check if profile exists
    const { data: existingProfile, error: findError } = await supabase
      .from('profiles')
      .select('*')
      .eq('external_user_id', externalUserId)
      .single();

    if (existingProfile && !findError) {
      // Update existing profile
      const updates = {};
      if (name) updates.name = name;
      if (email) updates.email = email;
      updates.updated_at = new Date().toISOString();

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('external_user_id', externalUserId);

      if (error) throw error;

      res.json({
        success: true,
        id: existingProfile.id,
        external_user_id: externalUserId,
        message: 'User updated successfully',
      });
    } else {
      // Create new profile
      const { data: result, error } = await supabase
        .from('profiles')
        .insert({
          external_user_id: externalUserId,
          app_name,
          name,
          email
        })
        .select()
        .single();

      if (error) throw error;

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
    // Get user profile ID
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('external_user_id', externalUserId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Deactivate social account
    if (platform === 'facebook') {
      const { error } = await supabase
        .from('facebook_accounts')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('user_id', profile.id);

      if (error) throw error;
    } else if (platform === 'instagram') {
      const { error } = await supabase
        .from('instagram_accounts')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('user_id', profile.id);

      if (error) throw error;
    }

    res.json({
      success: true,
      message: `${platform} disconnected successfully`,
    });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/users - List all users (admin only - for dashboard)
 */
router.get('/', async (req, res) => {
  const { app_name, limit = 100 } = req.query;

  try {
    let query = supabase
      .from('profiles')
      .select('id, external_user_id, name, email, app_name, created_at')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (app_name) {
      query = query.eq('app_name', app_name);
    }

    const { data: profiles, error } = await query;

    if (error) throw error;

    // Get social account connection status for each profile
    const usersWithConnections = await Promise.all((profiles || []).map(async (profile) => {
      const { data: fbAccounts } = await supabase
        .from('facebook_accounts')
        .select('id')
        .eq('user_id', profile.id)
        .eq('is_active', true)
        .limit(1);

      const { data: igAccounts } = await supabase
        .from('instagram_accounts')
        .select('id')
        .eq('user_id', profile.id)
        .eq('is_active', true)
        .limit(1);

      return {
        ...profile,
        facebook_connected: fbAccounts && fbAccounts.length > 0,
        instagram_connected: igAccounts && igAccounts.length > 0
      };
    }));

    res.json({ users: usersWithConnections });
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
    updateData.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', userId);

    if (error) throw error;

    res.json({
      success: true,
      message: 'User updated successfully'
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/users/:userId - Delete user and all their posts
 */
router.delete('/:userId', async (req, res) => {
  const externalUserId = req.params.userId;

  try {
    // First get profile ID
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('external_user_id', externalUserId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete all posts for this user
    await supabase
      .from('posts')
      .delete()
      .eq('user_id', profile.id);

    // Delete social accounts
    await supabase
      .from('facebook_accounts')
      .delete()
      .eq('user_id', profile.id);

    await supabase
      .from('instagram_accounts')
      .delete()
      .eq('user_id', profile.id);

    await supabase
      .from('tiktok_accounts')
      .delete()
      .eq('user_id', profile.id);

    // Delete profile
    await supabase
      .from('profiles')
      .delete()
      .eq('id', profile.id);

    res.json({
      success: true,
      message: 'User and all their data deleted successfully',
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
