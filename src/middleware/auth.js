const { customGet, get, updateRow, isSupabase } = require('../database/helpers');

/**
 * API Key Authentication Middleware
 */
const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;

    if (!apiKey) {
      return res.status(401).json({
        error: 'Missing API key',
        message: 'Please provide an API key in X-API-Key header or api_key query parameter',
      });
    }

    // Verify API key
    const key = await customGet(
      'SELECT * FROM api_keys WHERE api_key = ? AND is_active = 1',
      [apiKey],
      async () => {
        const { db } = require('../database/helpers');
        const { data, error } = await db
          .from('api_keys')
          .select('*')
          .eq('api_key', apiKey)
          .eq('is_active', true)
          .single();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
      }
    );

    if (!key) {
      return res.status(403).json({
        error: 'Invalid API key',
        message: 'The provided API key is invalid or inactive',
      });
    }

    // Update last used time (non-blocking)
    updateRow('api_keys', { id: key.id }, {
      last_used_at: isSupabase ? new Date().toISOString() : null // SQLite uses CURRENT_TIMESTAMP as default
    }).catch(err => console.error('Failed to update last_used_at:', err));

    // Attach key info to request
    req.apiKey = key;

    // Get associated account if exists
    if (key.account_id) {
      const account = await get('accounts', { id: key.account_id });
      if (account) {
        req.account = account;
      }
    } else {
      // Get default account
      const account = await customGet(
        'SELECT * FROM accounts WHERE is_default = 1',
        [],
        async () => {
          const { db } = require('../database/helpers');
          const { data, error } = await db
            .from('accounts')
            .select('*')
            .eq('is_default', isSupabase ? true : 1)
            .single();
          if (error && error.code !== 'PGRST116') throw error;
          return data;
        }
      );
      if (account) {
        req.account = account;
      }
    }

    next();
  } catch (err) {
    console.error('Authentication error:', err);
    res.status(500).json({ error: 'Database error' });
  }
};

/**
 * Optional API Key Authentication
 * Allows access without API key but attaches account info if provided
 */
const optionalApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey) {
    // No API key, use default account
    try {
      const account = await customGet(
        'SELECT * FROM accounts WHERE is_default = 1',
        [],
        async () => {
          const { db } = require('../database/helpers');
          const { data, error } = await db
            .from('accounts')
            .select('*')
            .eq('is_default', isSupabase ? true : 1)
            .single();
          if (error && error.code !== 'PGRST116') throw error;
          return data;
        }
      );
      if (account) {
        req.account = account;
      }
      next();
    } catch (err) {
      console.error('Error fetching default account:', err);
      next(); // Continue without account on error
    }
    return;
  }

  // Has API key, authenticate
  await authenticateApiKey(req, res, next);
};

module.exports = {
  authenticateApiKey,
  optionalApiKey,
};
