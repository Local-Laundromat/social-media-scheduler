const { getProfileByIdOrExternal } = require('../database/supabase');

/**
 * Resolve :userId (Supabase profile id OR external_user_id) onto req.resolvedProfile
 */
async function attachResolvedProfile(req, res, next) {
  try {
    const param = req.params.userId;
    req.resolvedProfile = await getProfileByIdOrExternal(param);
    next();
  } catch (err) {
    console.error('[userResourceAuth] attachResolvedProfile:', err);
    res.status(500).json({ error: 'Failed to resolve user' });
  }
}

function canAccessResolvedProfile(req, profile) {
  if (!profile || !req.userId) return false;
  if (req.userId === profile.id) return true;
  if (req.teamId != null && profile.team_id != null && req.teamId === profile.team_id) return true;
  return false;
}

/**
 * After optionalSupabaseAuth + attachResolvedProfile.
 * - Valid JWT: must be same user or same team as resolved profile.
 * - No JWT: only allow legacy embed when URL param matches profile.external_user_id.
 */
function requirePostsListEmbedOrJwt(req, res, next) {
  const profile = req.resolvedProfile;
  const param = req.params.userId;

  if (!profile) {
    return res.json({ posts: [] });
  }

  if (req.userId) {
    if (!canAccessResolvedProfile(req, profile)) {
      return res.status(403).json({ error: 'Access denied', posts: [] });
    }
    return next();
  }

  if (profile.external_user_id && param === profile.external_user_id) {
    return next();
  }

  return res.status(401).json({
    error: 'Authentication required',
    message: 'Provide a Bearer token or use your embed external user id.',
    posts: [],
  });
}

/**
 * Embed or JWT disconnect-all for a platform (no account row id).
 */
function requireDisconnectAllEmbedOrJwt(req, res, next) {
  const profile = req.resolvedProfile;
  const param = req.params.userId;

  if (!profile) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (req.userId) {
    if (!canAccessResolvedProfile(req, profile)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    return next();
  }

  if (profile.external_user_id && param === profile.external_user_id) {
    return next();
  }

  return res.status(401).json({
    error: 'Authentication required',
    message: 'Provide a Bearer token or use your embed external user id.',
  });
}

/**
 * After authenticateSupabase + attachResolvedProfile — dashboard-only routes.
 */
function requireJwtProfileAccess(req, res, next) {
  const profile = req.resolvedProfile;

  if (!req.userId) {
    return res.status(401).json({ error: 'Missing authentication token' });
  }
  if (!profile) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (!canAccessResolvedProfile(req, profile)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  next();
}

module.exports = {
  attachResolvedProfile,
  canAccessResolvedProfile,
  requirePostsListEmbedOrJwt,
  requireDisconnectAllEmbedOrJwt,
  requireJwtProfileAccess,
};
