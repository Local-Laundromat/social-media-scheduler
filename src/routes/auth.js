const express = require('express');
const router = express.Router();
const axios = require('axios');
const {
  saveFacebookAccount,
  saveInstagramAccount,
  saveTikTokAccount
} = require('../database/supabase');

/**
 * OAuth Configuration
 */
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const FACEBOOK_REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI || 'http://localhost:3000/auth/facebook/callback';
const INSTAGRAM_REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI || 'http://localhost:3000/auth/instagram/callback';

const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || 'http://localhost:3000/auth/tiktok/callback';

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

  // Request all permissions shown in the use case
  const fbAuthUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
    `client_id=${FACEBOOK_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(FACEBOOK_REDIRECT_URI)}` +
    `&state=${state}` +
    `&scope=public_profile,email,pages_show_list,pages_manage_posts,pages_read_engagement,pages_manage_engagement,pages_manage_metadata,pages_read_user_content,business_management`;

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

    console.log('🔍 Facebook Pages Response:', JSON.stringify(pagesResponse.data, null, 2));
    console.log('📊 Number of pages found:', pagesResponse.data.data?.length || 0);

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

    // Save to Supabase using proper tables
    try {
      // For testing, use user_id as the UUID (you'll need proper auth later)
      const userId = user_id;

      // Save Facebook account
      await saveFacebookAccount(userId, {
        page_id: pageId,
        page_name: pageName,
        access_token: pageAccessToken
      });

      // Save Instagram account if available
      if (instagramAccountId && instagramUsername) {
        await saveInstagramAccount(userId, {
          account_id: instagramAccountId,
          username: instagramUsername,
          access_token: pageAccessToken
        });
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
    } catch (err) {
      console.error('Database error:', err);
      return res.send(`<html><body><h1>❌ Database Error</h1><p>${err.message}</p><script>setTimeout(() => window.close(), 3000);</script></body></html>`);
    }
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

  // Instagram uses same permissions as Facebook Pages (no separate Instagram permissions needed)
  // Instagram Business Accounts are accessed through the connected Facebook Page
  const fbAuthUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
    `client_id=${FACEBOOK_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(INSTAGRAM_REDIRECT_URI)}` +
    `&state=${state}` +
    `&scope=public_profile,email,pages_show_list,pages_manage_posts,pages_read_engagement,pages_manage_engagement,pages_manage_metadata,pages_read_user_content,business_management`;

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

    try {
      const existingUser = await getUserByField('external_user_id', externalUserId);

      if (existingUser) {
        // Update existing user
        await updateUser('external_user_id', externalUserId, {
          instagram_token: pageAccessToken,
          instagram_account_id: instagramAccountId,
          instagram_username: instagramUsername,
          instagram_connected: isSupabase ? true : 1,
        });

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
      } else {
        // Create new user (Instagram only)
        await createUser({
          external_user_id: externalUserId,
          name,
          app_name: app,
          instagram_token: pageAccessToken,
          instagram_account_id: instagramAccountId,
          instagram_username: instagramUsername,
          instagram_connected: isSupabase ? true : 1,
        });

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
    } catch (err) {
      console.error('Database error:', err);
      return res.send('<html><body><h1>❌ Database Error</h1><script>setTimeout(() => window.close(), 3000);</script></body></html>');
    }
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

/**
 * GET /auth/tiktok - Initiate TikTok OAuth
 */
router.get('/tiktok', (req, res) => {
  const { user_id, app, name } = req.query;

  if (!user_id || !app) {
    return res.status(400).send('Missing user_id or app parameter');
  }

  // Store user info in state
  const state = Buffer.from(JSON.stringify({ user_id, app, name })).toString('base64');

  // TikTok OAuth URL
  const csrfState = Math.random().toString(36).substring(2);
  const tiktokAuthUrl = `https://www.tiktok.com/v2/auth/authorize/` +
    `?client_key=${TIKTOK_CLIENT_KEY}` +
    `&response_type=code` +
    `&scope=user.info.basic,video.upload,video.publish` +
    `&redirect_uri=${encodeURIComponent(TIKTOK_REDIRECT_URI)}` +
    `&state=${state}`;

  res.redirect(tiktokAuthUrl);
});

/**
 * GET /auth/tiktok/callback - Handle TikTok OAuth callback
 */
router.get('/tiktok/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.send('<html><body><h1>❌ Authorization failed</h1><p>Please close this window and try again.</p><script>setTimeout(() => window.close(), 3000);</script></body></html>');
  }

  try {
    // Decode state
    const { user_id, app, name } = JSON.parse(Buffer.from(state, 'base64').toString());

    // Exchange code for access token
    const tokenResponse = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', {
      client_key: TIKTOK_CLIENT_KEY,
      client_secret: TIKTOK_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: TIKTOK_REDIRECT_URI,
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const accessToken = tokenResponse.data.access_token;
    const openId = tokenResponse.data.open_id;

    // Get user info
    const userInfoResponse = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
      params: {
        fields: 'open_id,union_id,avatar_url,display_name',
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const tiktokUser = userInfoResponse.data.data.user;
    const displayName = tiktokUser.display_name;

    // Save to database
    const isDirectUser = app === 'direct';
    const lookupField = isDirectUser ? 'id' : 'external_user_id';
    const lookupValue = isDirectUser ? user_id : `${app}_${user_id}`;

    try {
      const existingUser = await getUserByField(lookupField, lookupValue);

      if (existingUser) {
        // Update existing user
        await updateUser(lookupField, lookupValue, {
          tiktok_access_token: accessToken,
          tiktok_open_id: openId,
          tiktok_username: displayName,
          tiktok_connected: isSupabase ? true : 1,
        });

        res.send(`
          <html>
          <body style="font-family: system-ui; text-align: center; padding: 40px;">
            <h1 style="color: #10b981;">✓ TikTok Connected!</h1>
            <p>Account: <strong>${displayName}</strong></p>
            <p style="color: #6b7280; margin-top: 20px;">You can close this window now.</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'tiktok_connected', username: '${displayName}' }, '*');
              }
              setTimeout(() => window.close(), 3000);
            </script>
          </body>
          </html>
        `);
      } else {
        // Create new user
        await createUser({
          external_user_id: lookupValue,
          name,
          app_name: app,
          tiktok_access_token: accessToken,
          tiktok_open_id: openId,
          tiktok_username: displayName,
          tiktok_connected: isSupabase ? true : 1,
        });

        res.send(`
          <html>
          <body style="font-family: system-ui; text-align: center; padding: 40px;">
            <h1 style="color: #10b981;">✓ TikTok Connected!</h1>
            <p>Account: <strong>${displayName}</strong></p>
            <p style="color: #6b7280; margin-top: 20px;">You can close this window now.</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'tiktok_connected', username: '${displayName}' }, '*');
              }
              setTimeout(() => window.close(), 3000);
            </script>
          </body>
          </html>
        `);
      }
    } catch (err) {
      console.error('Database error:', err);
      return res.send('<html><body><h1>❌ Database Error</h1><script>setTimeout(() => window.close(), 3000);</script></body></html>');
    }
  } catch (error) {
    console.error('TikTok OAuth error:', error.response?.data || error.message);
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
 * POST /auth/unlink/:platform - Unlink a social media account
 */
router.post('/unlink/:platform', async (req, res) => {
  const { platform } = req.params;
  const { user_id, account_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  try {
    const { supabase } = require('../database/supabase');

    if (platform === 'facebook') {
      // Delete specific Facebook account or all if no account_id
      let query = supabase.from('facebook_accounts').delete();

      if (account_id) {
        query = query.eq('id', account_id);
      } else {
        query = query.eq('user_id', user_id);
      }

      await query;

      res.json({ success: true, message: 'Facebook account(s) unlinked' });
    } else if (platform === 'instagram') {
      let query = supabase.from('instagram_accounts').delete();

      if (account_id) {
        query = query.eq('id', account_id);
      } else {
        query = query.eq('user_id', user_id);
      }

      await query;

      res.json({ success: true, message: 'Instagram account(s) unlinked' });
    } else if (platform === 'tiktok') {
      let query = supabase.from('tiktok_accounts').delete();

      if (account_id) {
        query = query.eq('id', account_id);
      } else {
        query = query.eq('user_id', user_id);
      }

      await query;

      res.json({ success: true, message: 'TikTok account(s) unlinked' });
    } else {
      res.status(400).json({ error: 'Invalid platform' });
    }
  } catch (error) {
    console.error('Unlink error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
