const { createClient } = require('@supabase/supabase-js');
const { get, getAll, update: updateRow, isSupabase } = require('../database/helpers');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Supabase Auth Middleware
 * Verifies JWT tokens issued by Supabase Auth
 */
const authenticateSupabase = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        error: 'Missing authentication token',
        message: 'Please provide a valid Supabase auth token in the Authorization header'
      });
    }

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(403).json({
        error: 'Invalid authentication token',
        message: 'The provided token is invalid or expired'
      });
    }

    // Attach user info to request
    req.userId = user.id;
    req.user = user;

    // Get profile info
    const profile = await get('profiles', { id: user.id });
    if (profile) {
      req.profile = profile;
      req.teamId = profile.team_id;
      req.userRole = profile.role;
    }

    next();
  } catch (err) {
    console.error('Authentication error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

/**
 * Optional Supabase Auth
 * Allows access without token but attaches user info if provided
 */
const optionalSupabaseAuth = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    // No token, continue without user info
    next();
    return;
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (!error && user) {
      req.userId = user.id;
      req.user = user;

      // Get profile info
      const profile = await get('profiles', { id: user.id });
      if (profile) {
        req.profile = profile;
        req.teamId = profile.team_id;
        req.userRole = profile.role;
      }
    }

    next();
  } catch (err) {
    console.error('Optional auth error:', err);
    next(); // Continue without user on error
  }
};

/**
 * Check if user has specific role
 */
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.userRole) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
};

/**
 * Check if user is in same team
 */
const requireSameTeam = async (req, res, next) => {
  const resourceUserId = req.params.userId || req.body.userId || req.query.userId;

  if (!resourceUserId) {
    return next(); // Skip if no userId in request
  }

  try {
    const resourceProfile = await get('profiles', { id: resourceUserId });

    if (!resourceProfile) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if same user or same team
    if (req.userId === resourceUserId || req.teamId === resourceProfile.team_id) {
      next();
    } else {
      res.status(403).json({ error: 'Access denied: Different team' });
    }
  } catch (err) {
    console.error('Team check error:', err);
    res.status(500).json({ error: 'Authorization failed' });
  }
};

module.exports = {
  authenticateSupabase,
  optionalSupabaseAuth,
  requireRole,
  requireSameTeam,
  // Backwards compatibility aliases
  authenticateApiKey: authenticateSupabase,
  optionalApiKey: optionalSupabaseAuth
};
