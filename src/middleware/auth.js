const db = require('../database/db');

/**
 * API Key Authentication Middleware
 */
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey) {
    return res.status(401).json({
      error: 'Missing API key',
      message: 'Please provide an API key in X-API-Key header or api_key query parameter',
    });
  }

  // Verify API key
  db.get(
    'SELECT * FROM api_keys WHERE api_key = ? AND is_active = 1',
    [apiKey],
    (err, key) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }

      if (!key) {
        return res.status(403).json({
          error: 'Invalid API key',
          message: 'The provided API key is invalid or inactive',
        });
      }

      // Update last used time
      db.run(
        'UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?',
        [key.id]
      );

      // Attach key info to request
      req.apiKey = key;

      // Get associated account if exists
      if (key.account_id) {
        db.get(
          'SELECT * FROM accounts WHERE id = ?',
          [key.account_id],
          (err, account) => {
            if (!err && account) {
              req.account = account;
            }
            next();
          }
        );
      } else {
        // Get default account
        db.get(
          'SELECT * FROM accounts WHERE is_default = 1',
          (err, account) => {
            if (!err && account) {
              req.account = account;
            }
            next();
          }
        );
      }
    }
  );
};

/**
 * Optional API Key Authentication
 * Allows access without API key but attaches account info if provided
 */
const optionalApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey) {
    // No API key, use default account
    db.get(
      'SELECT * FROM accounts WHERE is_default = 1',
      (err, account) => {
        if (!err && account) {
          req.account = account;
        }
        next();
      }
    );
    return;
  }

  // Has API key, authenticate
  authenticateApiKey(req, res, next);
};

module.exports = {
  authenticateApiKey,
  optionalApiKey,
};
