const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../database/db');

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
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, existingUser) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (existingUser) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Generate API key for this user
      const apiKey = 'sk_' + crypto.randomBytes(32).toString('hex');

      // Create user
      db.run(
        `INSERT INTO users (email, password_hash, name, company, api_key)
         VALUES (?, ?, ?, ?, ?)`,
        [email, passwordHash, name || null, company || null, apiKey],
        function (err) {
          if (err) {
            return res.status(500).json({ error: 'Failed to create account' });
          }

          // Generate JWT token
          const token = jwt.sign(
            { userId: this.lastID, email },
            JWT_SECRET,
            { expiresIn: '30d' }
          );

          res.json({
            success: true,
            token,
            user: {
              id: this.lastID,
              email,
              name: name || null,
              company: company || null,
              api_key: apiKey
            }
          });
        }
      );
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/auth/login - Sign in existing user
 */
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

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
  });
});

/**
 * GET /api/auth/verify - Verify JWT token
 */
router.get('/verify', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.json({ valid: false });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    db.get('SELECT * FROM users WHERE id = ?', [decoded.userId], (err, user) => {
      if (err || !user) {
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
    });
  } catch (error) {
    res.json({ valid: false });
  }
});

/**
 * GET /api/auth/me - Get current user info
 */
router.get('/me', authenticateToken, (req, res) => {
  db.get('SELECT * FROM users WHERE id = ?', [req.userId], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

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
  });
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
