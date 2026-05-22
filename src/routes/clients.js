const express = require('express');
const router = express.Router();
const { supabase } = require('../database/supabase');
const { authenticateSupabaseToken } = require('./authApi');

/**
 * GET /api/clients - Get all clients for the current user
 */
router.get('/', authenticateSupabaseToken, async (req, res) => {
  try {
    const { data: clients, error } = await supabase
      .from('client_summary')
      .select('*')
      .eq('user_id', req.userId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      clients: clients || []
    });
  } catch (error) {
    console.error('Get clients error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch clients'
    });
  }
});

/**
 * GET /api/clients/:id - Get a single client with all connected accounts
 */
router.get('/:id', authenticateSupabaseToken, async (req, res) => {
  try {
    const clientId = parseInt(req.params.id);

    // Get client details
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .eq('user_id', req.userId)
      .single();

    if (clientError) throw clientError;
    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    // Get all connected accounts for this client
    const [
      { data: facebookAccounts },
      { data: instagramAccounts },
      { data: tiktokAccounts },
      { data: pinterestAccounts },
      { data: youtubeAccounts },
      { data: googleAccounts }
    ] = await Promise.all([
      supabase.from('facebook_accounts').select('*').eq('client_id', clientId).eq('is_active', true),
      supabase.from('instagram_accounts').select('*').eq('client_id', clientId).eq('is_active', true),
      supabase.from('tiktok_accounts').select('*').eq('client_id', clientId).eq('is_active', true),
      supabase.from('pinterest_accounts').select('*').eq('client_id', clientId).eq('is_active', true),
      supabase.from('youtube_accounts').select('*').eq('client_id', clientId).eq('is_active', true),
      supabase.from('google_business_accounts').select('*').eq('client_id', clientId).eq('is_active', true)
    ]);

    res.json({
      success: true,
      client: {
        ...client,
        accounts: {
          facebook: facebookAccounts || [],
          instagram: instagramAccounts || [],
          tiktok: tiktokAccounts || [],
          pinterest: pinterestAccounts || [],
          youtube: youtubeAccounts || [],
          google: googleAccounts || []
        }
      }
    });
  } catch (error) {
    console.error('Get client error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch client'
    });
  }
});

/**
 * POST /api/clients - Create a new client
 */
router.post('/', authenticateSupabaseToken, async (req, res) => {
  try {
    const {
      name,
      display_name,
      business_type,
      industry,
      contact_email,
      contact_phone,
      website,
      address,
      logo_url,
      brand_colors,
      brand_voice,
      notes
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Client name is required'
      });
    }

    // Get user's team_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('team_id')
      .eq('id', req.userId)
      .single();

    const { data: client, error } = await supabase
      .from('clients')
      .insert({
        user_id: req.userId,
        team_id: profile?.team_id || null,
        name,
        display_name,
        business_type,
        industry,
        contact_email,
        contact_phone,
        website,
        address,
        logo_url,
        brand_colors,
        brand_voice,
        notes
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Client created successfully',
      client
    });
  } catch (error) {
    console.error('Create client error:', error);

    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({
        success: false,
        error: 'A client with this name already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create client'
    });
  }
});

/**
 * PUT /api/clients/:id - Update a client
 */
router.put('/:id', authenticateSupabaseToken, async (req, res) => {
  try {
    const clientId = parseInt(req.params.id);
    const updates = req.body;

    // Don't allow updating user_id or team_id
    delete updates.user_id;
    delete updates.team_id;
    delete updates.id;
    delete updates.created_at;

    const { data: client, error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', clientId)
      .eq('user_id', req.userId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Client updated successfully',
      client
    });
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update client'
    });
  }
});

/**
 * DELETE /api/clients/:id - Delete (deactivate) a client
 */
router.delete('/:id', authenticateSupabaseToken, async (req, res) => {
  try {
    const clientId = parseInt(req.params.id);

    // Soft delete by setting is_active = false
    const { error } = await supabase
      .from('clients')
      .update({ is_active: false })
      .eq('id', clientId)
      .eq('user_id', req.userId);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Client deactivated successfully'
    });
  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete client'
    });
  }
});

/**
 * PUT /api/clients/:id/accounts/:platform/:accountId - Link an account to a client
 */
router.put('/:id/accounts/:platform/:accountId', authenticateSupabaseToken, async (req, res) => {
  try {
    const clientId = parseInt(req.params.id);
    const platform = req.params.platform;
    const accountId = req.params.accountId;

    // Validate platform
    const validPlatforms = ['facebook', 'instagram', 'tiktok', 'pinterest', 'youtube', 'google'];
    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid platform'
      });
    }

    // Verify client belongs to user
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('user_id', req.userId)
      .single();

    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    // Update the account's client_id
    const tableName = `${platform}_accounts`;
    if (platform === 'google') {
      tableName = 'google_business_accounts';
    }

    const { error } = await supabase
      .from(tableName)
      .update({ client_id: clientId })
      .eq('id', accountId)
      .eq('user_id', req.userId);

    if (error) throw error;

    res.json({
      success: true,
      message: `${platform} account linked to client successfully`
    });
  } catch (error) {
    console.error('Link account error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to link account to client'
    });
  }
});

module.exports = router;
