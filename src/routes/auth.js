const express = require('express');
const router = express.Router();
const axios = require('axios');
const {
  saveFacebookAccount,
  saveInstagramAccount,
  saveTikTokAccount,
  savePinterestAccount,
  saveYouTubeAccount,
  saveGoogleBusinessAccount
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

const PINTEREST_APP_ID = process.env.PINTEREST_APP_ID;
const PINTEREST_APP_SECRET = process.env.PINTEREST_APP_SECRET;
const PINTEREST_REDIRECT_URI = process.env.PINTEREST_REDIRECT_URI || 'http://localhost:3000/auth/pinterest/callback';

const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const YOUTUBE_REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:3000/auth/youtube/callback';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';

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
 * GET /auth/pinterest - Initiate Pinterest OAuth
 */
router.get('/pinterest', (req, res) => {
  const { user_id, app, name } = req.query;

  if (!user_id || !app) {
    return res.status(400).send('Missing user_id or app parameter');
  }

  // Store user info in state
  const state = Buffer.from(JSON.stringify({ user_id, app, name })).toString('base64');

  // Pinterest OAuth URL - requesting necessary scopes for board and pin management
  const pinterestAuthUrl = `https://www.pinterest.com/oauth/?` +
    `client_id=${PINTEREST_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(PINTEREST_REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=boards:read,boards:write,pins:read,pins:write,user_accounts:read` +
    `&state=${state}`;

  res.redirect(pinterestAuthUrl);
});

/**
 * GET /auth/pinterest/callback - Handle Pinterest OAuth callback
 */
router.get('/pinterest/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.send('<html><body><h1>❌ Authorization failed</h1><p>Please close this window and try again.</p><script>setTimeout(() => window.close(), 3000);</script></body></html>');
  }

  try {
    // Decode state
    const { user_id, app, name } = JSON.parse(Buffer.from(state, 'base64').toString());

    // Exchange code for access token
    const tokenResponse = await axios.post('https://api.pinterest.com/v5/oauth/token', {
      grant_type: 'authorization_code',
      code,
      redirect_uri: PINTEREST_REDIRECT_URI,
    }, {
      auth: {
        username: PINTEREST_APP_ID,
        password: PINTEREST_APP_SECRET,
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const accessToken = tokenResponse.data.access_token;

    // Get user info
    const userInfoResponse = await axios.get('https://api.pinterest.com/v5/user_account', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const pinterestUser = userInfoResponse.data;
    const username = pinterestUser.username;
    const accountId = pinterestUser.id;

    // Get user's boards
    const boardsResponse = await axios.get('https://api.pinterest.com/v5/boards', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const boards = boardsResponse.data.items || [];
    const defaultBoard = boards[0]; // Use first board as default

    // Save to Supabase
    try {
      await savePinterestAccount(user_id, {
        account_id: accountId,
        username: username,
        access_token: accessToken,
        default_board_id: defaultBoard?.id,
        default_board_name: defaultBoard?.name,
      });

      res.send(`
        <html>
        <body style="font-family: system-ui; text-align: center; padding: 40px;">
          <h1 style="color: #10b981;">✓ Pinterest Connected!</h1>
          <p>Account: <strong>@${username}</strong></p>
          ${defaultBoard ? `<p>Default Board: <strong>${defaultBoard.name}</strong></p>` : ''}
          <p style="color: #6b7280; margin-top: 20px;">You can close this window now.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'pinterest_connected', username: '${username}' }, '*');
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
    console.error('Pinterest OAuth error:', error.response?.data || error.message);
    res.send(`
      <html>
      <body style="font-family: system-ui; text-align: center; padding: 40px;">
        <h1 style="color: #ef4444;">❌ Connection Failed</h1>
        <p>${error.response?.data?.message || error.message}</p>
        <p style="color: #6b7280; margin-top: 20px;">You can close this window now.</p>
        <script>setTimeout(() => window.close(), 5000);</script>
      </body>
      </html>
    `);
  }
});

/**
 * GET /auth/youtube - Initiate YouTube OAuth
 */
router.get('/youtube', (req, res) => {
  const { user_id, app, name } = req.query;

  if (!user_id || !app) {
    return res.status(400).send('Missing user_id or app parameter');
  }

  // Store user info in state
  const state = Buffer.from(JSON.stringify({ user_id, app, name })).toString('base64');

  // YouTube OAuth URL with necessary scopes
  const youtubeAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${YOUTUBE_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(YOUTUBE_REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent('https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/userinfo.profile')}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&state=${state}`;

  res.redirect(youtubeAuthUrl);
});

/**
 * GET /auth/youtube/callback - Handle YouTube OAuth callback
 */
router.get('/youtube/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.send('<html><body><h1>❌ Authorization failed</h1><p>Please close this window and try again.</p><script>setTimeout(() => window.close(), 3000);</script></body></html>');
  }

  try {
    // Decode state
    const { user_id, app, name } = JSON.parse(Buffer.from(state, 'base64').toString());

    // Exchange code for access token
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: YOUTUBE_CLIENT_ID,
      client_secret: YOUTUBE_CLIENT_SECRET,
      redirect_uri: YOUTUBE_REDIRECT_URI,
      grant_type: 'authorization_code',
    });

    const accessToken = tokenResponse.data.access_token;
    const refreshToken = tokenResponse.data.refresh_token;

    // Get YouTube channel info
    const channelResponse = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
      params: {
        part: 'snippet,contentDetails',
        mine: true,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
      return res.send('<html><body><h1>⚠️ No YouTube Channel Found</h1><p>Please create a YouTube channel first.</p><script>setTimeout(() => window.close(), 5000);</script></body></html>');
    }

    const channel = channelResponse.data.items[0];
    const channelId = channel.id;
    const channelTitle = channel.snippet.title;

    // Save to Supabase
    try {
      await saveYouTubeAccount(user_id, {
        channel_id: channelId,
        channel_title: channelTitle,
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      res.send(`
        <html>
        <body style="font-family: system-ui; text-align: center; padding: 40px;">
          <h1 style="color: #10b981;">✓ YouTube Connected!</h1>
          <p>Channel: <strong>${channelTitle}</strong></p>
          <p style="color: #6b7280; margin-top: 20px;">You can close this window now.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'youtube_connected', channel: '${channelTitle}' }, '*');
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
    console.error('YouTube OAuth error:', error.response?.data || error.message);
    res.send(`
      <html>
      <body style="font-family: system-ui; text-align: center; padding: 40px;">
        <h1 style="color: #ef4444;">❌ Connection Failed</h1>
        <p>${error.response?.data?.error_description || error.message}</p>
        <p style="color: #6b7280; margin-top: 20px;">You can close this window now.</p>
        <script>setTimeout(() => window.close(), 5000);</script>
      </body>
      </html>
    `);
  }
});

/**
 * GET /auth/google - Initiate Google Business Profile OAuth
 */
router.get('/google', (req, res) => {
  const { user_id, app, name } = req.query;

  if (!user_id || !app) {
    return res.status(400).send('Missing user_id or app parameter');
  }

  // Store user info in state
  const state = Buffer.from(JSON.stringify({ user_id, app, name })).toString('base64');

  // Google Business Profile OAuth URL
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${GOOGLE_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent('https://www.googleapis.com/auth/business.manage https://www.googleapis.com/auth/userinfo.profile')}` +
    `&access_type=offline` +
    `&prompt=consent` +
    `&state=${state}`;

  res.redirect(googleAuthUrl);
});

/**
 * GET /auth/google/callback - Handle Google Business Profile OAuth callback
 */
router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.send('<html><body><h1>❌ Authorization failed</h1><p>Please close this window and try again.</p><script>setTimeout(() => window.close(), 3000);</script></body></html>');
  }

  try {
    // Decode state
    const { user_id, app, name } = JSON.parse(Buffer.from(state, 'base64').toString());

    // Exchange code for access token
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    });

    const accessToken = tokenResponse.data.access_token;
    const refreshToken = tokenResponse.data.refresh_token;

    // Get Google My Business accounts
    const accountsResponse = await axios.get('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!accountsResponse.data.accounts || accountsResponse.data.accounts.length === 0) {
      return res.send('<html><body><h1>⚠️ No Google Business Profile Found</h1><p>Please create a Google Business Profile first.</p><script>setTimeout(() => window.close(), 5000);</script></body></html>');
    }

    const account = accountsResponse.data.accounts[0];
    const accountName = account.name;
    const accountDisplayName = account.accountName || 'Google Business Profile';

    // Get locations for this account
    let locationName = null;
    let locationTitle = null;
    try {
      const locationsResponse = await axios.get(`https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (locationsResponse.data.locations && locationsResponse.data.locations.length > 0) {
        const location = locationsResponse.data.locations[0];
        locationName = location.name;
        locationTitle = location.title;
      }
    } catch (err) {
      console.log('No locations found for account');
    }

    // Save to Supabase
    try {
      await saveGoogleBusinessAccount(user_id, {
        account_name: accountName,
        account_display_name: accountDisplayName,
        location_name: locationName,
        location_title: locationTitle,
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      res.send(`
        <html>
        <body style="font-family: system-ui; text-align: center; padding: 40px;">
          <h1 style="color: #10b981;">✓ Google Business Profile Connected!</h1>
          <p>Account: <strong>${accountDisplayName}</strong></p>
          ${locationTitle ? `<p>Location: <strong>${locationTitle}</strong></p>` : ''}
          <p style="color: #6b7280; margin-top: 20px;">You can close this window now.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'google_connected', account: '${accountDisplayName}' }, '*');
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
    console.error('Google Business Profile OAuth error:', error.response?.data || error.message);
    res.send(`
      <html>
      <body style="font-family: system-ui; text-align: center; padding: 40px;">
        <h1 style="color: #ef4444;">❌ Connection Failed</h1>
        <p>${error.response?.data?.error_description || error.message}</p>
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
    } else if (platform === 'pinterest') {
      let query = supabase.from('pinterest_accounts').delete();

      if (account_id) {
        query = query.eq('id', account_id);
      } else {
        query = query.eq('user_id', user_id);
      }

      await query;

      res.json({ success: true, message: 'Pinterest account(s) unlinked' });
    } else if (platform === 'youtube') {
      let query = supabase.from('youtube_accounts').delete();

      if (account_id) {
        query = query.eq('id', account_id);
      } else {
        query = query.eq('user_id', user_id);
      }

      await query;

      res.json({ success: true, message: 'YouTube account(s) unlinked' });
    } else if (platform === 'google') {
      let query = supabase.from('google_business_accounts').delete();

      if (account_id) {
        query = query.eq('id', account_id);
      } else {
        query = query.eq('user_id', user_id);
      }

      await query;

      res.json({ success: true, message: 'Google Business Profile account(s) unlinked' });
    } else {
      res.status(400).json({ error: 'Invalid platform' });
    }
  } catch (error) {
    console.error('Unlink error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
