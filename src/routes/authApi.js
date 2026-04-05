const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { supabase: supabaseHelper, getProfileById, updateProfile } = require('../database/supabase');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * POST /api/auth/signup - Register with Supabase Auth
 */
router.post('/signup', async (req, res) => {
  const { email, password, name, teamName, inviteCode } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (!teamName && !inviteCode) {
    return res.status(400).json({ error: 'Either team name or invite code is required' });
  }

  try {
    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name || null
        }
      }
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    const userId = authData.user.id;

    // Handle team logic
    let teamId = null;
    let role = 'member';
    let team = null;

    if (inviteCode) {
      // Joining existing team
      const { data: foundTeam, error: teamError } = await supabaseHelper
        .from('teams')
        .select('*')
        .eq('invite_code', inviteCode)
        .single();

      if (teamError || !foundTeam) {
        return res.status(400).json({ error: 'Invalid invite code' });
      }

      team = foundTeam;
      teamId = team.id;
      role = 'member';
    } else if (teamName) {
      // Creating new team
      const crypto = require('crypto');
      const newInviteCode = crypto.randomBytes(6).toString('hex').toUpperCase();

      const { data: newTeam, error: teamError } = await supabaseHelper
        .from('teams')
        .insert({
          name: teamName,
          invite_code: newInviteCode,
          created_by: userId
        })
        .select()
        .single();

      if (teamError) throw teamError;

      team = newTeam;
      teamId = team.id;
      role = 'owner';
    }

    // Update profile with team info
    // Note: The trigger already created the profile, we just need to update it
    await updateProfile(userId, {
      name: name || null,
      team_id: teamId,
      role: role
    });

    // Get team info for response
    const { data: teamInfo } = await supabaseHelper
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .single();

    res.json({
      success: true,
      session: authData.session,
      user: {
        id: userId,
        email: authData.user.email,
        name: name || null,
        team_id: teamId,
        role: role
      },
      team: teamInfo ? {
        id: teamInfo.id,
        name: teamInfo.name,
        invite_code: teamInfo.invite_code
      } : null
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/auth/login - Sign in with Supabase Auth
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Sign in with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      return res.status(401).json({ error: authError.message });
    }

    const userId = authData.user.id;

    // Get profile data
    const profile = await getProfileById(userId);

    // Get Facebook accounts
    const { data: facebookAccounts } = await supabaseHelper
      .from('facebook_accounts')
      .select('*')
      .eq('user_id', userId);
    const facebookConnected = facebookAccounts?.length > 0;

    // Get Instagram accounts
    const { data: instagramAccounts } = await supabaseHelper
      .from('instagram_accounts')
      .select('*')
      .eq('user_id', userId);
    const instagramConnected = instagramAccounts?.length > 0;

    // Get team info if user has a team
    let team = null;
    if (profile && profile.team_id) {
      const { data: foundTeam } = await supabaseHelper
        .from('teams')
        .select('*')
        .eq('id', profile.team_id)
        .single();
      team = foundTeam;
    }

    res.json({
      success: true,
      session: authData.session,
      user: {
        id: userId,
        email: authData.user.email,
        name: profile?.name,
        facebook_connected: facebookConnected,
        instagram_connected: instagramConnected,
        api_key: profile?.api_key,
        team_id: profile?.team_id,
        role: profile?.role
      },
      team: team ? {
        id: team.id,
        name: team.name,
        invite_code: team.invite_code
      } : null
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/auth/logout - Sign out
 */
router.post('/logout', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (token) {
      // Create admin client to sign out user
      const supabaseAdmin = createClient(
        supabaseUrl,
        supabaseAnonKey,
        { auth: { autoRefreshToken: false } }
      );

      await supabaseAdmin.auth.signOut();
    }

    res.json({ success: true, message: 'Signed out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/auth/verify - Verify Supabase JWT token
 */
router.get('/verify', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.json({ valid: false });
  }

  try {
    // Get user from Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.json({ valid: false });
    }

    // Get profile data
    const profile = await getProfileById(user.id);

    // Get Facebook accounts
    const { data: facebookAccounts } = await supabaseHelper
      .from('facebook_accounts')
      .select('*')
      .eq('user_id', user.id);
    const facebookConnected = facebookAccounts?.length > 0;

    // Get Instagram accounts
    const { data: instagramAccounts } = await supabaseHelper
      .from('instagram_accounts')
      .select('*')
      .eq('user_id', user.id);
    const instagramConnected = instagramAccounts?.length > 0;

    // Get team info
    let team = null;
    if (profile && profile.team_id) {
      const { data: foundTeam } = await supabaseHelper
        .from('teams')
        .select('*')
        .eq('id', profile.team_id)
        .single();
      team = foundTeam;
    }

    res.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        name: profile?.name,
        facebook_connected: facebookConnected,
        instagram_connected: instagramConnected,
        team_id: profile?.team_id,
        role: profile?.role
      },
      team: team ? {
        id: team.id,
        name: team.name,
        invite_code: team.invite_code
      } : null
    });
  } catch (error) {
    console.error('Verify error:', error);
    res.json({ valid: false });
  }
});

/**
 * GET /api/auth/me - Get current user info
 */
router.get('/me', authenticateSupabaseToken, async (req, res) => {
  try {
    const profile = await getProfileById(req.userId);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Get Facebook accounts for user or their team
    let facebookQuery = supabaseHelper
      .from('facebook_accounts')
      .select('*')
      .eq('is_active', true);

    if (profile.team_id) {
      // Get all team accounts
      facebookQuery = facebookQuery.or(`user_id.eq.${req.userId},team_id.eq.${profile.team_id}`);
    } else {
      facebookQuery = facebookQuery.eq('user_id', req.userId);
    }

    const { data: facebookAccounts } = await facebookQuery;

    // Get Instagram accounts for user or their team
    let instagramQuery = supabaseHelper
      .from('instagram_accounts')
      .select('*')
      .eq('is_active', true);

    if (profile.team_id) {
      instagramQuery = instagramQuery.or(`user_id.eq.${req.userId},team_id.eq.${profile.team_id}`);
    } else {
      instagramQuery = instagramQuery.eq('user_id', req.userId);
    }

    const { data: instagramAccounts } = await instagramQuery;

    // Get TikTok accounts for user or their team
    let tiktokQuery = supabaseHelper
      .from('tiktok_accounts')
      .select('*')
      .eq('is_active', true);

    if (profile.team_id) {
      tiktokQuery = tiktokQuery.or(`user_id.eq.${req.userId},team_id.eq.${profile.team_id}`);
    } else {
      tiktokQuery = tiktokQuery.eq('user_id', req.userId);
    }

    const { data: tiktokAccounts } = await tiktokQuery;

    res.json({
      user: {
        id: req.userId,
        email: req.user.email,
        name: profile.name,
        company: profile.company,
        facebook_page_name: facebookAccounts?.[0]?.page_name, // Keep for backwards compatibility
        instagram_username: instagramAccounts?.[0]?.username, // Keep for backwards compatibility
        facebook_connected: facebookAccounts?.length > 0,
        instagram_connected: instagramAccounts?.length > 0,
        tiktok_connected: tiktokAccounts?.length > 0,
        api_key: profile.api_key,
        webhook_url: profile.webhook_url,
        created_at: profile.created_at,
        team_id: profile.team_id,
        role: profile.role
      },
      // All connected accounts (for multi-account management)
      social_accounts: {
        facebook: facebookAccounts?.map(acc => ({
          id: acc.id,
          page_id: acc.page_id,
          page_name: acc.page_name,
          user_id: acc.user_id
        })) || [],
        instagram: instagramAccounts?.map(acc => ({
          id: acc.id,
          account_id: acc.account_id,
          username: acc.username,
          user_id: acc.user_id
        })) || [],
        tiktok: tiktokAccounts?.map(acc => ({
          id: acc.id,
          display_name: acc.display_name,
          user_id: acc.user_id
        })) || []
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * POST /api/auth/forgot-password - Request password reset via Supabase
 */
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password`
    });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'If an account exists with that email, a password reset link has been sent.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/auth/reset-password - Reset password with Supabase
 */
router.post('/reset-password', async (req, res) => {
  const { newPassword } = req.body;
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!newPassword) {
    return res.status(400).json({ error: 'New password is required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  try {
    // Update password using Supabase
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({
      success: true,
      message: 'Password has been reset successfully.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /api/auth/update-openai-key - Update user's OpenAI API key
 */
router.put('/update-openai-key', authenticateSupabaseToken, async (req, res) => {
  const { openai_api_key } = req.body;

  if (!openai_api_key) {
    return res.status(400).json({ error: 'OpenAI API key is required' });
  }

  try {
    // Update the user's profile with their OpenAI key
    const { error } = await supabaseHelper
      .from('profiles')
      .update({ openai_api_key })
      .eq('id', req.userId);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'OpenAI API key updated successfully'
    });
  } catch (error) {
    console.error('Update OpenAI key error:', error);
    res.status(500).json({ error: 'Failed to update OpenAI API key' });
  }
});

/**
 * DELETE /api/auth/delete-openai-key - Remove user's OpenAI API key
 */
router.delete('/delete-openai-key', authenticateSupabaseToken, async (req, res) => {
  try {
    // Remove the user's OpenAI key
    const { error } = await supabaseHelper
      .from('profiles')
      .update({ openai_api_key: null })
      .eq('id', req.userId);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'OpenAI API key removed successfully'
    });
  } catch (error) {
    console.error('Delete OpenAI key error:', error);
    res.status(500).json({ error: 'Failed to remove OpenAI API key' });
  }
});

/**
 * Middleware to authenticate Supabase JWT token
 */
async function authenticateSupabaseToken(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.userId = user.id;
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = router;
module.exports.authenticateSupabaseToken = authenticateSupabaseToken;
