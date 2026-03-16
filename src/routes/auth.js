const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../database/db');

/**
 * OAuth Configuration
 */
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const FACEBOOK_REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI || 'http://localhost:3000/auth/facebook/callback';
const INSTAGRAM_REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI || 'http://localhost:3000/auth/instagram/callback';

/**
 * GET /auth/facebook - Initiate Facebook OAuth
 */
router.get('/facebook', (req, res) => {
  const { user_id, app, name } = req.query;

  if (!user_id || !app) {
    return res.status(400).send('Missing user_id or app parameter');
  }

  // Store user info in session/state
  const state = Buffer.from(JSON.stringify({ user_id, app, name })).toString('base64');

  const fbAuthUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
    `client_id=${FACEBOOK_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(FACEBOOK_REDIRECT_URI)}` +
    `&state=${state}` +
    `&scope=pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish`;

  res.redirect(fbAuthUrl);
});

/**
 * GET /auth/facebook/callback - Handle Facebook OAuth callback
 */
router.get('/facebook/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.send('<html><body><h1>❌ Authorization failed</h1><p>Please close this window and try again.</p><script>setTimeout(() => window.close(), 3000);</script></body></html>');
  }

  try {
    // Decode state
    const { user_id, app, name } = JSON.parse(Buffer.from(state, 'base64').toString());

    // Exchange code for access token
    const tokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        client_id: FACEBOOK_APP_ID,
        client_secret: FACEBOOK_APP_SECRET,
        redirect_uri: FACEBOOK_REDIRECT_URI,
        code,
      },
    });

    const userAccessToken = tokenResponse.data.access_token;

    // Get user's pages
    const pagesResponse = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
      params: {
        access_token: userAccessToken,
      },
    });

    if (!pagesResponse.data.data || pagesResponse.data.data.length === 0) {
      return res.send('<html><body><h1>⚠️ No Facebook Pages Found</h1><p>Please create a Facebook Business Page first.</p><script>setTimeout(() => window.close(), 5000);</script></body></html>');
    }

    // Use first page (or let user select in production)
    const page = pagesResponse.data.data[0];
    const pageAccessToken = page.access_token;
    const pageId = page.id;
    const pageName = page.name;

    // Get Instagram Business Account connected to this page
    let instagramAccountId = null;
    let instagramUsername = null;

    try {
      const igResponse = await axios.get(`https://graph.facebook.com/v18.0/${pageId}`, {
        params: {
          fields: 'instagram_business_account',
          access_token: pageAccessToken,
        },
      });

      if (igResponse.data.instagram_business_account) {
        instagramAccountId = igResponse.data.instagram_business_account.id;

        // Get Instagram username
        const igUserResponse = await axios.get(`https://graph.facebook.com/v18.0/${instagramAccountId}`, {
          params: {
            fields: 'username',
            access_token: pageAccessToken,
          },
        });

        instagramUsername = igUserResponse.data.username;
      }
    } catch (error) {
      console.log('No Instagram account linked to this Facebook page');
    }

    // Save or update user in database
    // Check if this is a direct login (user_id is actual database ID) or external integration
    const isDirectUser = app === 'direct';
    const lookupField = isDirectUser ? 'id' : 'external_user_id';
    const lookupValue = isDirectUser ? user_id : `${app}_${user_id}`;

    db.get(
      `SELECT * FROM users WHERE ${lookupField} = ?`,
      [lookupValue],
      (err, existingUser) => {
        if (err) {
          console.error('Database error:', err);
          return res.send('<html><body><h1>❌ Database Error</h1><script>setTimeout(() => window.close(), 3000);</script></body></html>');
        }

        if (existingUser) {
          // Update existing user
          db.run(
            `UPDATE users SET
              facebook_page_token = ?,
              facebook_page_id = ?,
              facebook_page_name = ?,
              facebook_connected = 1,
              instagram_token = COALESCE(?, instagram_token),
              instagram_account_id = COALESCE(?, instagram_account_id),
              instagram_username = COALESCE(?, instagram_username),
              instagram_connected = CASE WHEN ? IS NOT NULL THEN 1 ELSE instagram_connected END,
              updated_at = CURRENT_TIMESTAMP
            WHERE external_user_id = ?`,
            [pageAccessToken, pageId, pageName, pageAccessToken, instagramAccountId, instagramUsername, instagramAccountId, externalUserId],
            (err) => {
              if (err) {
                console.error('Update error:', err);
                return res.send('<html><body><h1>❌ Update Failed</h1><script>setTimeout(() => window.close(), 3000);</script></body></html>');
              }

              res.send(`
                <html>
                <body style="font-family: system-ui; text-align: center; padding: 40px;">
                  <h1 style="color: #10b981;">✓ Facebook Connected!</h1>
                  <p>Page: <strong>${pageName}</strong></p>
                  ${instagramUsername ? `<p>Instagram: <strong>@${instagramUsername}</strong> (also connected!)</p>` : ''}
                  <p style="color: #6b7280; margin-top: 20px;">You can close this window now.</p>
                  <script>
                    if (window.opener) {
                      window.opener.postMessage({ type: 'facebook_connected', page: '${pageName}' }, '*');
                    }
                    setTimeout(() => window.close(), 3000);
                  </script>
                </body>
                </html>
              `);
            }
          );
        } else {
          // Create new user
          db.run(
            `INSERT INTO users (
              external_user_id, name, app_name,
              facebook_page_token, facebook_page_id, facebook_page_name, facebook_connected,
              instagram_token, instagram_account_id, instagram_username, instagram_connected
            ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
            [externalUserId, name, app, pageAccessToken, pageId, pageName, pageAccessToken, instagramAccountId, instagramUsername, instagramAccountId ? 1 : 0],
            (err) => {
              if (err) {
                console.error('Insert error:', err);
                return res.send('<html><body><h1>❌ Save Failed</h1><script>setTimeout(() => window.close(), 3000);</script></body></html>');
              }

              res.send(`
                <html>
                <body style="font-family: system-ui; text-align: center; padding: 40px;">
                  <h1 style="color: #10b981;">✓ Facebook Connected!</h1>
                  <p>Page: <strong>${pageName}</strong></p>
                  ${instagramUsername ? `<p>Instagram: <strong>@${instagramUsername}</strong> (also connected!)</p>` : ''}
                  <p style="color: #6b7280; margin-top: 20px;">You can close this window now.</p>
                  <script>
                    if (window.opener) {
                      window.opener.postMessage({ type: 'facebook_connected', page: '${pageName}' }, '*');
                    }
                    setTimeout(() => window.close(), 3000);
                  </script>
                </body>
                </html>
              `);
            }
          );
        }
      }
    );
  } catch (error) {
    console.error('Facebook OAuth error:', error.response?.data || error.message);
    res.send(`
      <html>
      <body style="font-family: system-ui; text-align: center; padding: 40px;">
        <h1 style="color: #ef4444;">❌ Connection Failed</h1>
        <p>${error.response?.data?.error?.message || error.message}</p>
        <p style="color: #6b7280; margin-top: 20px;">You can close this window now.</p>
        <script>setTimeout(() => window.close(), 5000);</script>
      </body>
      </html>
    `);
  }
});

/**
 * GET /auth/instagram - Initiate Instagram OAuth (same as Facebook for Business accounts)
 */
router.get('/instagram', (req, res) => {
  const { user_id, app, name } = req.query;

  if (!user_id || !app) {
    return res.status(400).send('Missing user_id or app parameter');
  }

  // For Instagram Business accounts, we use Facebook OAuth with Instagram permissions
  const state = Buffer.from(JSON.stringify({ user_id, app, name, instagram_flow: true })).toString('base64');

  const fbAuthUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
    `client_id=${FACEBOOK_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(INSTAGRAM_REDIRECT_URI)}` +
    `&state=${state}` +
    `&scope=pages_show_list,instagram_basic,instagram_content_publish,pages_read_engagement`;

  res.redirect(fbAuthUrl);
});

/**
 * GET /auth/instagram/callback - Handle Instagram OAuth callback
 */
router.get('/instagram/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.send('<html><body><h1>❌ Authorization failed</h1><p>Please close this window and try again.</p><script>setTimeout(() => window.close(), 3000);</script></body></html>');
  }

  try {
    const { user_id, app, name } = JSON.parse(Buffer.from(state, 'base64').toString());

    // Exchange code for access token
    const tokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        client_id: FACEBOOK_APP_ID,
        client_secret: FACEBOOK_APP_SECRET,
        redirect_uri: INSTAGRAM_REDIRECT_URI,
        code,
      },
    });

    const userAccessToken = tokenResponse.data.access_token;

    // Get user's pages
    const pagesResponse = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
      params: {
        access_token: userAccessToken,
      },
    });

    if (!pagesResponse.data.data || pagesResponse.data.data.length === 0) {
      return res.send('<html><body><h1>⚠️ No Facebook Pages Found</h1><p>Instagram Business accounts must be connected to a Facebook Page.</p><script>setTimeout(() => window.close(), 5000);</script></body></html>');
    }

    const page = pagesResponse.data.data[0];
    const pageAccessToken = page.access_token;
    const pageId = page.id;

    // Get Instagram Business Account
    const igResponse = await axios.get(`https://graph.facebook.com/v18.0/${pageId}`, {
      params: {
        fields: 'instagram_business_account',
        access_token: pageAccessToken,
      },
    });

    if (!igResponse.data.instagram_business_account) {
      return res.send('<html><body><h1>⚠️ No Instagram Business Account</h1><p>Please connect an Instagram Business account to your Facebook Page first.</p><script>setTimeout(() => window.close(), 5000);</script></body></html>');
    }

    const instagramAccountId = igResponse.data.instagram_business_account.id;

    // Get Instagram username
    const igUserResponse = await axios.get(`https://graph.facebook.com/v18.0/${instagramAccountId}`, {
      params: {
        fields: 'username',
        access_token: pageAccessToken,
      },
    });

    const instagramUsername = igUserResponse.data.username;

    // Save to database
    const externalUserId = `${app}_${user_id}`;

    db.get(
      'SELECT * FROM users WHERE external_user_id = ?',
      [externalUserId],
      (err, existingUser) => {
        if (err) {
          console.error('Database error:', err);
          return res.send('<html><body><h1>❌ Database Error</h1><script>setTimeout(() => window.close(), 3000);</script></body></html>');
        }

        if (existingUser) {
          // Update existing user
          db.run(
            `UPDATE users SET
              instagram_token = ?,
              instagram_account_id = ?,
              instagram_username = ?,
              instagram_connected = 1,
              updated_at = CURRENT_TIMESTAMP
            WHERE external_user_id = ?`,
            [pageAccessToken, instagramAccountId, instagramUsername, externalUserId],
            (err) => {
              if (err) {
                console.error('Update error:', err);
                return res.send('<html><body><h1>❌ Update Failed</h1><script>setTimeout(() => window.close(), 3000);</script></body></html>');
              }

              res.send(`
                <html>
                <body style="font-family: system-ui; text-align: center; padding: 40px;">
                  <h1 style="color: #10b981;">✓ Instagram Connected!</h1>
                  <p>Account: <strong>@${instagramUsername}</strong></p>
                  <p style="color: #6b7280; margin-top: 20px;">You can close this window now.</p>
                  <script>
                    if (window.opener) {
                      window.opener.postMessage({ type: 'instagram_connected', username: '${instagramUsername}' }, '*');
                    }
                    setTimeout(() => window.close(), 3000);
                  </script>
                </body>
                </html>
              `);
            }
          );
        } else {
          // Create new user (Instagram only)
          db.run(
            `INSERT INTO users (
              external_user_id, name, app_name,
              instagram_token, instagram_account_id, instagram_username, instagram_connected
            ) VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [externalUserId, name, app, pageAccessToken, instagramAccountId, instagramUsername],
            (err) => {
              if (err) {
                console.error('Insert error:', err);
                return res.send('<html><body><h1>❌ Save Failed</h1><script>setTimeout(() => window.close(), 3000);</script></body></html>');
              }

              res.send(`
                <html>
                <body style="font-family: system-ui; text-align: center; padding: 40px;">
                  <h1 style="color: #10b981;">✓ Instagram Connected!</h1>
                  <p>Account: <strong>@${instagramUsername}</strong></p>
                  <p style="color: #6b7280; margin-top: 20px;">You can close this window now.</p>
                  <script>
                    if (window.opener) {
                      window.opener.postMessage({ type: 'instagram_connected', username: '${instagramUsername}' }, '*');
                    }
                    setTimeout(() => window.close(), 3000);
                  </script>
                </body>
                </html>
              `);
            }
          );
        }
      }
    );
  } catch (error) {
    console.error('Instagram OAuth error:', error.response?.data || error.message);
    res.send(`
      <html>
      <body style="font-family: system-ui; text-align: center; padding: 40px;">
        <h1 style="color: #ef4444;">❌ Connection Failed</h1>
        <p>${error.response?.data?.error?.message || error.message}</p>
        <p style="color: #6b7280; margin-top: 20px;">You can close this window now.</p>
        <script>setTimeout(() => window.close(), 5000);</script>
      </body>
      </html>
    `);
  }
});

module.exports = router;
