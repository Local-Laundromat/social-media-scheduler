# Setup Checklist

Use this checklist to get your Social Media Scheduler up and running with OAuth embedding.

## ✅ Prerequisites

- [ ] Node.js installed (v14 or higher)
- [ ] Facebook Business Page created
- [ ] Instagram Business Account created and linked to Facebook Page

---

## 📋 Initial Setup

### 1. Install Dependencies

```bash
cd /Users/aminatamansaray/Downloads/social-media-scheduler
npm install
```

### 2. Create Environment File

```bash
cp .env.example .env
```

---

## 🔑 Facebook App Setup (Required for OAuth)

### 1. Create Facebook App

- [ ] Go to https://developers.facebook.com
- [ ] Click "My Apps" → "Create App"
- [ ] Choose "Business" type
- [ ] Name: "Social Media Scheduler" (or your choice)
- [ ] Click "Create App"

### 2. Configure Facebook Login

- [ ] In left sidebar, click "Add Product"
- [ ] Find "Facebook Login" and click "Set Up"
- [ ] Click "Settings" under Facebook Login
- [ ] Add OAuth Redirect URIs:
  ```
  http://localhost:3000/auth/facebook/callback
  http://localhost:3000/auth/instagram/callback
  ```
- [ ] Click "Save Changes"

### 3. Get App Credentials

- [ ] Go to Settings → Basic (left sidebar)
- [ ] Copy **App ID**
- [ ] Click "Show" next to App Secret and copy it
- [ ] Add to your `.env` file:
  ```env
  FACEBOOK_APP_ID=paste_app_id_here
  FACEBOOK_APP_SECRET=paste_app_secret_here
  FACEBOOK_REDIRECT_URI=http://localhost:3000/auth/facebook/callback
  INSTAGRAM_REDIRECT_URI=http://localhost:3000/auth/instagram/callback
  ```

### 4. Set Up Test Users (Development Mode)

While your app is in development mode:

- [ ] Go to Roles → Test Users
- [ ] Click "Add" to create test users
- [ ] Use these test accounts to test OAuth flow

**Note**: In development mode, only test users, admins, and developers can use your app.

### 5. Request Permissions (For Production)

When ready for production:

- [ ] Go to App Review → Permissions and Features
- [ ] Click "Request Advanced Access" for:
  - `pages_manage_posts`
  - `instagram_content_publish`
  - `pages_read_engagement`
  - `instagram_basic`
- [ ] Fill out the permission request form
- [ ] Submit for review (usually takes 3-7 days)

---

## 🚀 Start the Server

### 1. Start Development Server

```bash
npm start
```

You should see:
```
╔════════════════════════════════════════════╗
║   Social Media Scheduler API Server       ║
║                                            ║
║   Server running on: http://localhost:3000 ║
║   Dashboard: http://localhost:3000         ║
║                                            ║
║   Status: ✓ Ready                          ║
╚════════════════════════════════════════════╝
```

### 2. Test the Embed Page

- [ ] Open: http://localhost:3000/embed?user_id=test_123&app=test&name=Test%20User
- [ ] You should see the embed UI with:
  - User info at top
  - Facebook connection card
  - Instagram connection card
  - Import folder section
  - Posts list

---

## 🧪 Test OAuth Flow

### 1. Test Facebook Connection

- [ ] Click "Connect Facebook" button in embed page
- [ ] OAuth popup should open
- [ ] Log in with your Facebook account (or test user)
- [ ] Grant permissions
- [ ] Popup should close with success message
- [ ] Embed page should show "✓ Connected" for Facebook

### 2. Test Instagram Connection

- [ ] Click "Connect Instagram" button
- [ ] Complete OAuth flow
- [ ] Verify "✓ Connected" appears

### 3. Verify Database

```bash
sqlite3 data/posts.db "SELECT * FROM users;"
```

You should see your test user with connected accounts.

---

## 🔗 Test API Integration

### 1. Create a Test Post

```bash
curl -X POST http://localhost:3000/api/posts \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test_123",
    "filename": "test.jpg",
    "filepath": "/path/to/test.jpg",
    "caption": "Test post from API",
    "platforms": ["facebook"]
  }'
```

### 2. Check User's Posts

```bash
curl http://localhost:3000/api/users/test_123/posts
```

---

## 🌐 Deploy to Production

### Option 1: Railway (Recommended)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize
railway init

# Add environment variables
railway variables set FACEBOOK_APP_ID=your_app_id
railway variables set FACEBOOK_APP_SECRET=your_app_secret
# ... add all other variables

# Deploy
railway up
```

### Option 2: Render

- [ ] Push code to GitHub
- [ ] Go to render.com
- [ ] Click "New Web Service"
- [ ] Connect GitHub repo
- [ ] Add environment variables in dashboard
- [ ] Click "Create Web Service"

### After Deployment

- [ ] Update OAuth redirect URIs in Facebook App settings to use production URL
- [ ] Update `.env` or hosting environment variables with production URLs
- [ ] Test OAuth flow on production

---

## 🔄 Integrate with OmniBroker

See [NEXT-STEPS.md](NEXT-STEPS.md) for detailed integration instructions.

Quick steps:
1. Add iframe to OmniBroker settings page
2. Pass user_id and app name in iframe URL
3. Auto-post listings via API using user_id

---

## 🔄 Integrate with Sun Production

Same as OmniBroker:
1. Add iframe to settings page
2. Auto-post campaigns via API

---

## ✅ Production Checklist

Before going live:

- [ ] Facebook App approved for production permissions
- [ ] OAuth redirect URIs updated with production URLs
- [ ] All environment variables set in production hosting
- [ ] Test OAuth flow on production URL
- [ ] Test post creation from OmniBroker/Sun Production
- [ ] Set up database backups
- [ ] Configure monitoring/logging (optional: Sentry, LogRocket)
- [ ] Update iframe URLs in OmniBroker/Sun Production to production

---

## 🆘 Troubleshooting

### "redirect_uri_mismatch" error
✅ Check that redirect URI in Facebook App settings matches exactly (http vs https, trailing slash, etc.)

### "User not found" when creating post
✅ User must connect their accounts via OAuth first before posts can be created for them

### OAuth popup doesn't close
✅ Check that `window.opener.postMessage` is working (may be blocked by browser if URLs don't match)

### Instagram posts failing
✅ Verify Instagram account is a Business account connected to Facebook Page
✅ Check that image URLs are publicly accessible
✅ Try with ngrok for local testing

### Scheduler not posting
✅ Verify user has valid tokens stored in database
✅ Check logs for error messages
✅ Verify PUBLIC_FILE_URL is accessible

---

## 📚 Additional Resources

- [NEXT-STEPS.md](NEXT-STEPS.md) - Detailed roadmap for all three systems
- [IFRAME-GUIDE.md](IFRAME-GUIDE.md) - Complete guide for iframe embedding
- [API-DOCUMENTATION.md](API-DOCUMENTATION.md) - Full API reference with examples
- [README.md](README.md) - Main documentation

---

## ✨ You're All Set!

Your Social Media Scheduler is now configured for multi-tenant OAuth embedding! 🎉

Users can now:
- Connect their own Facebook/Instagram accounts
- Import posts from folders
- Schedule automated posting
- All isolated and secure per-user

Need help? Check the troubleshooting section or review the documentation files.
