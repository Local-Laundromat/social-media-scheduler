# TikTok API Setup Guide - MUCH EASIER than Facebook!

## Why TikTok is Better for Testing

✅ **No business verification required** - Works immediately
✅ **Simpler permissions** - Just request what you need
✅ **Sandbox mode** - Test without app review
✅ **Clear documentation** - Well-organized API docs
✅ **Fast approval** - Usually approved within 1-2 days (vs weeks for Facebook)

---

## Step 1: Create TikTok Developer App

### 1.1 Go to TikTok for Developers
Visit: **https://developers.tiktok.com/**

### 1.2 Sign Up / Log In
- Log in with your TikTok account
- If you don't have one, create a TikTok account first

### 1.3 Create New App
1. Go to "Manage apps" → "Create an app"
2. Fill in app details:
   - **App name**: Quu Scheduler
   - **App type**: Web App
   - **Description**: Social media scheduling tool for TikTok content
   - **App icon**: Upload any logo (optional for testing)

### 1.4 Configure App Settings
After creating the app, configure:

**Basic Information:**
- App name: Quu Scheduler
- Category: Productivity
- Platform: Web

**Login Kit:**
1. Enable "Login Kit"
2. Add Redirect URI: `http://localhost:3000/auth/tiktok/callback`

**Required Scopes (Permissions):**
Select these permissions:
- ✅ `user.info.basic` - Get user profile (username, avatar)
- ✅ `video.upload` - Upload videos
- ✅ `video.publish` - Publish videos to TikTok

**Optional but Recommended:**
- `video.list` - Get user's videos
- `user.info.stats` - Get user statistics

---

## Step 2: Get Your Credentials

After app creation, you'll see:
1. **Client Key** - Your app's public identifier
2. **Client Secret** - Your app's secret key (keep private!)

Copy these - you'll need them for the `.env` file.

---

## Step 3: Add TikTok Config to .env

Add these lines to your `.env` file:

```bash
# TikTok OAuth Configuration
TIKTOK_CLIENT_KEY=your_client_key_here
TIKTOK_CLIENT_SECRET=your_client_secret_here
TIKTOK_REDIRECT_URI=http://localhost:3000/auth/tiktok/callback
```

Replace `your_client_key_here` and `your_client_secret_here` with your actual credentials.

---

## Step 4: Test TikTok OAuth

Once I've added the OAuth routes (next step), you can test:

1. **Start your server:**
   ```bash
   npm start
   ```

2. **Go to test page:**
   http://localhost:3000/test-tiktok.html

3. **Click "Connect TikTok Account"**

4. **Authorize the app** - You'll see TikTok asking for permissions

5. **Success!** - Your TikTok account is connected

---

## TikTok vs Facebook Comparison

| Feature | TikTok | Facebook/Instagram |
|---------|--------|-------------------|
| Business Verification | ❌ Not required | ✅ Required (2024+) |
| Setup Time | 10-30 minutes | Days/weeks |
| Testing | Immediate sandbox | Blocked until verified |
| Permissions | Simple, straightforward | Complex, constantly changing |
| Approval Time | 1-2 days | 1-4 weeks |
| Content Type | Videos (primary) | Images + Videos |

---

## Important Notes

### Content Requirements
**TikTok is video-first:**
- Videos: ✅ Fully supported (.mp4, .mov)
- Images: ❌ Must convert to video
- Aspect Ratio: Vertical (9:16) preferred, but supports others
- Duration: 15 seconds to 10 minutes (depending on account)
- File Size: Up to 287.6 MB

### Posting Process
TikTok uses a 2-step process:
1. **Upload** - Send video file to TikTok
2. **Publish** - Video goes live (may take a few minutes)

You already have this code implemented in `src/services/tiktok.js`!

---

## What Happens Next

1. You create the TikTok app at developers.tiktok.com
2. I'll add the OAuth routes to your scheduler
3. You can test immediately (no waiting for verification!)
4. Once it works, you can schedule TikTok videos
5. Later submit for app review when ready to go public

---

## Ready to Start?

Go to: **https://developers.tiktok.com/**

Let me know when you have:
1. ✅ Created your TikTok developer app
2. ✅ Enabled Login Kit
3. ✅ Added redirect URI: `http://localhost:3000/auth/tiktok/callback`
4. ✅ Selected permissions: `user.info.basic`, `video.upload`, `video.publish`
5. ✅ Copied your Client Key and Client Secret

Then I'll add the OAuth code and create a test page!

---

## Resources

- TikTok for Developers: https://developers.tiktok.com/
- API Documentation: https://developers.tiktok.com/doc
- Login Kit Guide: https://developers.tiktok.com/doc/login-kit-web
- Content Posting API: https://developers.tiktok.com/doc/content-posting-api-get-started
