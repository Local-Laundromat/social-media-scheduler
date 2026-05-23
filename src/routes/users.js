const express = require('express');
const router = express.Router();
const { supabase } = require('../database/supabase');
const { applyPostPlatformAccountFilter } = require('../lib/postPlatformAccountFilter');
const { authenticateSupabase, optionalSupabaseAuth } = require('../middleware/auth');
const {
  attachResolvedProfile,
  requirePostsListEmbedOrJwt,
  requireDisconnectAllEmbedOrJwt,
  requireJwtProfileAccess,
} = require('../middleware/userResourceAuth');

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
 * GET /api/users - List profiles (authenticated only)
 */
router.get('/', authenticateSupabase, async (req, res) => {
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
 * GET /api/users/:userId/agent-status - Requires JWT + ownership or team match
 */
router.get('/:userId/agent-status', authenticateSupabase, attachResolvedProfile, requireJwtProfileAccess, async (req, res) => {
  try {
    const dashboardUserId = req.resolvedProfile.id;
    const { getUserAgentStatus } = require('../middleware/verifySubscription');

    const agentStatus = await getUserAgentStatus(dashboardUserId);

    if (agentStatus.error) {
      return res.status(404).json({ error: agentStatus.error });
    }

    res.json({
      success: true,
      ...agentStatus
    });
  } catch (error) {
    console.error('[AgentStatus] Error:', error);
    res.status(500).json({ error: 'Failed to get agent status' });
  }
});

/**
 * GET /api/users/:userId - Embed: connection status (lookup by external_user_id only per handler)
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
 * GET /api/users/:userId/posts
 * Embed: external_user_id param + no token. Dashboard: Bearer + profile UUID / team peer.
 */
router.get('/:userId/posts', optionalSupabaseAuth, attachResolvedProfile, requirePostsListEmbedOrJwt, async (req, res) => {
  const profile = req.resolvedProfile;
  const { status, limit = 50, client_id, platform, accountId } = req.query;

  console.log(`📊 GET /api/users/${req.params.userId}/posts — profile ${profile?.id ?? '?'}`);

  try {
    if (!profile) {
      return res.json({ posts: [] });
    }

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

    if (client_id) {
      console.log(`  → Filtering by client_id: ${client_id}`);
      query = query.eq('client_id', parseInt(client_id));
    }

    query = applyPostPlatformAccountFilter(query, platform, accountId);

    const { data: posts, error } = await query;

    if (error) throw error;

    console.log(`  ✅ Found ${posts?.length || 0} posts`);

    res.json({ posts: posts || [] });
  } catch (error) {
    console.error('❌ Get posts error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST .../disconnect/:platform/:accountId — dashboard multi-account disconnect
 */
router.post('/:userId/disconnect/:platform/:accountId', authenticateSupabase, attachResolvedProfile, requireJwtProfileAccess, async (req, res) => {
  const platform = req.params.platform;
  const accountId = parseInt(req.params.accountId, 10);
  const profile = req.resolvedProfile;

  const validPlatforms = ['facebook', 'instagram', 'tiktok', 'pinterest', 'youtube', 'google'];
  if (!validPlatforms.includes(platform)) {
    return res.status(400).json({ error: `Invalid platform. Must be one of: ${validPlatforms.join(', ')}` });
  }

  if (!Number.isFinite(accountId)) {
    return res.status(400).json({ error: 'Invalid account id' });
  }

  try {
    const tableMap = {
      facebook: 'facebook_accounts',
      instagram: 'instagram_accounts',
      tiktok: 'tiktok_accounts',
      pinterest: 'pinterest_accounts',
      youtube: 'youtube_accounts',
      google: 'google_business_accounts'
    };

    const tableName = tableMap[platform];

    const { error } = await supabase
      .from(tableName)
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', accountId)
      .eq('user_id', profile.id);

    if (error) throw error;

    res.json({
      success: true,
      message: `${platform} account disconnected successfully`,
    });
  } catch (error) {
    console.error('Disconnect account error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST .../disconnect/:platform — Embed (FB/IG disconnect all rows) + dashboard JWT
 */
router.post('/:userId/disconnect/:platform', optionalSupabaseAuth, attachResolvedProfile, requireDisconnectAllEmbedOrJwt, async (req, res) => {
  const platform = req.params.platform;
  const profile = req.resolvedProfile;

  if (!['facebook', 'instagram'].includes(platform)) {
    return res.status(400).json({ error: 'Invalid platform. Must be facebook or instagram' });
  }

  try {
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
 * PUT /api/users/:userId - Update profile (JWT required)
 */
router.put('/:userId', authenticateSupabase, attachResolvedProfile, requireJwtProfileAccess, async (req, res) => {
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
      .eq('id', req.resolvedProfile.id);

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
 * DELETE /api/users/:userId - Delete embed user by external_user_id (legacy contract)
 */
router.delete('/:userId', async (req, res) => {
  const externalUserId = req.params.userId;

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('external_user_id', externalUserId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    await supabase
      .from('posts')
      .delete()
      .eq('user_id', profile.id);

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
