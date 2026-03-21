const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { get, getAll, insert, update: updateRow, deleteRows, customQuery, customGet, run, isSupabase } = require('../database/helpers');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * POST /api/auth/signup - Create new user account
 */
router.post('/signup', async (req, res) => {
  const { email, password, name, company } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
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

    // Create user
    const result = await insert('users', {
      email,
      password_hash: passwordHash,
      name: name || null,
      company: company || null,
      api_key: apiKey
    });

    // Generate JWT token
    const token = jwt.sign(
      { userId: result.id, email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: result.id,
        email,
        name: name || null,
        company: company || null,
        api_key: apiKey
      }
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

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
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
        company: user.company,
        facebook_connected: user.facebook_connected,
        instagram_connected: user.instagram_connected,
        api_key: user.api_key
      }
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

    res.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        company: user.company,
        facebook_connected: user.facebook_connected,
        instagram_connected: user.instagram_connected
      }
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

module.exports = router;
module.exports.authenticateToken = authenticateToken;
