const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { get, getAll, insert, update: updateRow, deleteRows, customQuery, customGet, run, isSupabase } = require('../database/helpers');
const emailService = require('../services/email');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * POST /api/auth/signup - Create new user account
 * Supports team creation or joining
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
    // Check if user already exists
    const existingUser = await get('users', { email });

    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Generate API key for this user
    const apiKey = 'sk_' + crypto.randomBytes(32).toString('hex');

    let teamId = null;
    let role = 'member';
    let team = null;

    // Handle team logic
    if (inviteCode) {
      // Joining existing team
      team = await get('teams', { invite_code: inviteCode });

      if (!team) {
        return res.status(400).json({ error: 'Invalid invite code' });
      }

      teamId = team.id;
      role = 'member';
    } else if (teamName) {
      // Creating new team
      const newInviteCode = crypto.randomBytes(6).toString('hex').toUpperCase();

      team = await insert('teams', {
        name: teamName,
        invite_code: newInviteCode,
        created_by: null // Will update after user is created
      });

      teamId = team.id;
      role = 'owner';
    }

    // Create user
    const user = await insert('users', {
      email,
      password_hash: passwordHash,
      name: name || null,
      api_key: apiKey,
      team_id: teamId,
      role: role
    });

    // If creating team, update created_by
    if (role === 'owner' && teamId) {
      await updateRow('teams', { id: teamId }, { created_by: user.id });
    }

    // Get team info for response
    const teamInfo = await get('teams', { id: teamId });

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email, teamId },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email,
        name: name || null,
        api_key: apiKey,
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
 * POST /api/auth/login - Sign in existing user
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await get('users', { email });

    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Get team info if user has a team
    let team = null;
    if (user.team_id) {
      team = await get('teams', { id: user.team_id });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email, teamId: user.team_id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        facebook_connected: user.facebook_connected,
        instagram_connected: user.instagram_connected,
        api_key: user.api_key,
        team_id: user.team_id,
        role: user.role
      },
      team: team ? {
        id: team.id,
        name: team.name,
        invite_code: team.invite_code
      } : null
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * GET /api/auth/verify - Verify JWT token
 */
router.get('/verify', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.json({ valid: false });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await get('users', { id: decoded.userId });

    if (!user) {
      return res.json({ valid: false });
    }

    // Get team info
    let team = null;
    if (user.team_id) {
      team = await get('teams', { id: user.team_id });
    }

    res.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        facebook_connected: user.facebook_connected,
        instagram_connected: user.instagram_connected,
        team_id: user.team_id,
        role: user.role
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
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await get('users', { id: req.userId });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        company: user.company,
        facebook_page_name: user.facebook_page_name,
        instagram_username: user.instagram_username,
        facebook_connected: user.facebook_connected,
        instagram_connected: user.instagram_connected,
        api_key: user.api_key,
        webhook_url: user.webhook_url,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * Middleware to authenticate JWT token
 */
function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * POST /api/auth/forgot-password - Request password reset
 */
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    // Find user by email
    const user = await get('users', { email });

    // Always return success (security: don't reveal if email exists)
    if (!user) {
      return res.json({
        success: true,
        message: 'If an account exists with that email, a password reset link has been sent.'
      });
    }

    // Generate reset token (32 random bytes)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour from now

    // Save token to database
    await updateRow('users', { id: user.id }, {
      reset_token: resetToken,
      reset_token_expires: isSupabase ? resetTokenExpires.toISOString() : resetTokenExpires.getTime()
    });

    // Send reset email
    await emailService.sendPasswordReset(email, resetToken);

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
 * POST /api/auth/reset-password - Reset password with token
 */
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    // Find user with valid reset token
    const user = await customGet(
      isSupabase
        ? `SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()`
        : `SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > ?`,
      isSupabase ? [token] : [token, Date.now()],
      async () => {
        const { db } = require('../database/helpers');
        const { data, error } = await db
          .from('users')
          .select('*')
          .eq('reset_token', token)
          .gt('reset_token_expires', new Date().toISOString())
          .single();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
      }
    );

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password and clear reset token
    await updateRow('users', { id: user.id }, {
      password_hash: passwordHash,
      reset_token: null,
      reset_token_expires: null
    });

    res.json({
      success: true,
      message: 'Password has been reset successfully. You can now log in with your new password.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
module.exports.authenticateToken = authenticateToken;
