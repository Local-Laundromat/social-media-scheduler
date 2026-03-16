# Next Steps Guide

## Overview

You now have three systems that need to work together:

1. **Social Media Scheduler** (this app) - The core posting engine
2. **OmniBroker** - Your real estate SaaS platform
3. **Sun Production** - Your other business platform

Here's your step-by-step implementation roadmap.

---

## Phase 1: Complete the Scheduler (2-3 hours)

### Step 1.1: Create Facebook App (30 min)

Before building the OAuth flow, you need a Facebook App:

1. **Go to**: https://developers.facebook.com/apps
2. **Click**: "Create App"
3. **Select**: "Business" type
4. **Add Products**:
   - Facebook Login
   - Instagram Basic Display (or Instagram Graph API)
5. **Configure OAuth Redirect URIs**:
   ```
   http://localhost:3000/auth/facebook/callback
   http://localhost:3000/auth/instagram/callback
   ```
6. **Get Credentials**:
   - Copy App ID
   - Copy App Secret
7. **Add to .env**:
   ```env
   FACEBOOK_APP_ID=your_app_id_here
   FACEBOOK_APP_SECRET=your_app_secret_here
   FACEBOOK_REDIRECT_URI=http://localhost:3000/auth/facebook/callback
   INSTAGRAM_REDIRECT_URI=http://localhost:3000/auth/instagram/callback
   ```

### Step 1.2: Build the Embed Page (I'll do this for you)

I need to create:
- `/public/embed.html` - The UI users see in the iframe
- OAuth routes in `/src/routes/auth.js`
- User management routes in `/src/routes/users.js`

**What it will have**:
- "Connect Facebook" button
- "Connect Instagram" button
- Status indicators (✓ Connected / ⚠️ Not Connected)
- List of user's scheduled posts
- Folder import form
- Yellow/gray design matching your dashboard

### Step 1.3: Test Locally (30 min)

Once I build it, you'll test:
1. Start scheduler: `npm start`
2. Open: `http://localhost:3000/embed?user_id=test_123&app=omnibroker&name=Test%20User`
3. Click "Connect Facebook"
4. Go through OAuth
5. Verify you see ✓ Connected

### Step 1.4: Deploy to Production (1 hour)

**Option A: Railway (Recommended - Free tier)**
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Add environment variables
railway variables set FACEBOOK_APP_ID=your_id
railway variables set FACEBOOK_APP_SECRET=your_secret
# ... add all other .env variables

# Deploy
railway up
```

Your app will get a URL like: `https://social-scheduler-production.up.railway.app`

**Option B: Render**
1. Push code to GitHub
2. Go to render.com
3. "New Web Service"
4. Connect your GitHub repo
5. Add environment variables
6. Deploy

**Update OAuth redirects** to use your production URL:
```
https://social-scheduler-production.up.railway.app/auth/facebook/callback
https://social-scheduler-production.up.railway.app/auth/instagram/callback
```

---

## Phase 2: Integrate with OmniBroker (1 hour)

### Step 2.1: Add Settings Page

In OmniBroker, create a new settings section:

**File**: `omnibroker/src/pages/Settings/SocialMediaSettings.jsx` (or similar)

```jsx
import React from 'react';

export default function SocialMediaSettings({ currentUser }) {
  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Social Media Posting</h2>
      <p className="text-gray-600 mb-6">
        Connect your Facebook and Instagram accounts to auto-post new listings
      </p>

      <iframe
        src={`https://social-scheduler-production.up.railway.app/embed?user_id=${currentUser.id}&app=omnibroker&name=${encodeURIComponent(currentUser.name)}`}
        width="100%"
        height="800px"
        frameBorder="0"
        style={{ border: '1px solid #e5e7eb', borderRadius: '8px' }}
      />
    </div>
  );
}
```

**Add to settings navigation**:
```jsx
// In your settings menu
<Link to="/settings/social-media">Social Media</Link>
```

### Step 2.2: Auto-Post New Listings

When a listing is created, automatically post to social media:

**File**: `omnibroker/src/services/listing.service.js` (or wherever you handle listings)

```javascript
const SCHEDULER_API = process.env.REACT_APP_SCHEDULER_API || 'https://social-scheduler-production.up.railway.app';

export async function createListing(listingData, userId) {
  // 1. Save listing to your database
  const listing = await db.listings.create(listingData);

  // 2. Auto-post to social media
  try {
    await fetch(`${SCHEDULER_API}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId, // IMPORTANT: The user who created this listing
        filename: `listing-${listing.id}.jpg`,
        filepath: listing.photos[0].url, // Must be publicly accessible URL
        caption: `🏡 NEW LISTING!\n\n${listing.address}\n💰 $${listing.price.toLocaleString()}\n🛏️ ${listing.bedrooms} bed | 🛁 ${listing.bathrooms} bath\n📐 ${listing.sqft} sqft\n\nCall us today! 📞`,
        platforms: ['facebook', 'instagram'],
        scheduled_time: null, // Post immediately (or set a future time)
      }),
    });
  } catch (error) {
    console.error('Social media post failed:', error);
    // Don't fail the listing creation if social media fails
  }

  return listing;
}
```

### Step 2.3: Handle Image URLs

**IMPORTANT**: Instagram requires publicly accessible image URLs.

**Option 1: Use your existing CDN**
If OmniBroker already hosts images on S3/Cloudinary, use those URLs directly.

**Option 2: Upload to scheduler**
Create an upload endpoint:
```javascript
// In OmniBroker, upload image first
const formData = new FormData();
formData.append('file', listingImage);
formData.append('user_id', userId);

const uploadResponse = await fetch(`${SCHEDULER_API}/api/upload`, {
  method: 'POST',
  body: formData,
});

const { url } = await uploadResponse.json();

// Then use this URL in the post
```

### Step 2.4: Test Integration

1. **Create test user in OmniBroker**
2. **Go to Settings → Social Media**
3. **Connect Facebook/Instagram** via the iframe
4. **Create a new listing**
5. **Check that post appears** in the scheduler dashboard
6. **Verify post goes to Facebook/Instagram**

---

## Phase 3: Integrate with Sun Production (1 hour)

Same process as OmniBroker:

### Step 3.1: Add Iframe

**File**: `sun-production/src/components/Settings/SocialMedia.jsx`

```jsx
<iframe
  src={`https://social-scheduler-production.up.railway.app/embed?user_id=${user.id}&app=sun-production&name=${encodeURIComponent(user.name)}`}
  width="100%"
  height="800px"
  frameBorder="0"
/>
```

### Step 3.2: Auto-Post Content

Whenever Sun Production creates content (campaigns, promotions, etc.):

```javascript
const SCHEDULER_API = 'https://social-scheduler-production.up.railway.app';

async function publishCampaign(campaign, userId) {
  // Post each campaign image
  for (const image of campaign.images) {
    await fetch(`${SCHEDULER_API}/api/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        filename: image.filename,
        filepath: image.url,
        caption: campaign.caption,
        platforms: ['facebook', 'instagram'],
        scheduled_time: image.scheduledTime, // Can schedule for later
      }),
    });
  }
}
```

---

## Phase 4: Test End-to-End (30 min)

### Test Scenario 1: OmniBroker User
1. **Login to OmniBroker** as test user
2. **Go to Settings → Social Media**
3. **Connect Facebook** (OAuth popup)
4. **Connect Instagram** (OAuth popup)
5. **Create new listing** with photo
6. **Wait 1 minute** (for scheduler to process)
7. **Check Facebook/Instagram** - post should appear

### Test Scenario 2: Sun Production User
1. **Login to Sun Production** as different user
2. **Connect social accounts** via iframe
3. **Create campaign** with 3 images scheduled for different times
4. **Verify posts** appear in scheduler dashboard
5. **Wait for scheduled time**
6. **Confirm posts go live**

### Test Scenario 3: Multi-Tenant Isolation
1. **Create posts** from OmniBroker User A
2. **Create posts** from OmniBroker User B
3. **Verify** User A only sees their own posts in iframe
4. **Verify** User B only sees their own posts in iframe
5. **Confirm** User A's posts go to User A's Facebook/Instagram
6. **Confirm** User B's posts go to User B's Facebook/Instagram

---

## Phase 5: Production Checklist

### Before Launch:

- [ ] **Facebook App Review**: Submit app for review to get permissions approved
  - Required permissions: `pages_manage_posts`, `instagram_content_publish`
  - Usually takes 3-7 days

- [ ] **Environment Variables**: Set all production values
  ```env
  FACEBOOK_APP_ID=your_production_id
  FACEBOOK_APP_SECRET=your_production_secret
  FACEBOOK_REDIRECT_URI=https://your-domain.com/auth/facebook/callback
  INSTAGRAM_REDIRECT_URI=https://your-domain.com/auth/instagram/callback
  ```

- [ ] **Update Iframe URLs**: Replace localhost with production URL in OmniBroker and Sun Production

- [ ] **Database Backup**: Set up automated SQLite backups
  ```bash
  # Add to cron
  0 2 * * * sqlite3 /path/to/posts.db ".backup /path/to/backups/posts-$(date +\%Y\%m\%d).db"
  ```

- [ ] **Monitoring**: Add error tracking (Sentry, LogRocket, etc.)

- [ ] **Rate Limits**: Be aware of Facebook/Instagram API limits:
  - Facebook: 200 calls per hour per user
  - Instagram: 200 calls per hour per user

---

## Quick Reference

### Scheduler URLs

**Local Development**:
- Dashboard: `http://localhost:3000`
- Embed: `http://localhost:3000/embed?user_id=USER_ID&app=APP_NAME`
- API: `http://localhost:3000/api/*`

**Production** (example):
- Dashboard: `https://social-scheduler-production.up.railway.app`
- Embed: `https://social-scheduler-production.up.railway.app/embed?user_id=USER_ID&app=APP_NAME`
- API: `https://social-scheduler-production.up.railway.app/api/*`

### Common Commands

```bash
# Start scheduler locally
npm start

# View logs
tail -f logs/scheduler.log

# Check database
sqlite3 data/posts.db "SELECT * FROM users;"
sqlite3 data/posts.db "SELECT * FROM posts WHERE user_id = 1;"

# Manual post
curl -X POST http://localhost:3000/api/posts/123/post-now
```

---

## Troubleshooting

### "User not found when posting"
**Fix**: User must connect Facebook/Instagram via iframe first before auto-posting will work.

### "Invalid image URL"
**Fix**: Image must be publicly accessible. Use ngrok for local testing or upload to CDN.

### "OAuth redirect error"
**Fix**: Check that redirect URI in Facebook App settings matches exactly (including http vs https).

### "Post stuck in pending"
**Fix**: Check scheduler is running: `GET /api/scheduler/status`

### "Posts going to wrong account"
**Fix**: Verify `user_id` being passed matches the user who connected their account.

---

## Support

**Documentation**:
- API: `API-DOCUMENTATION.md`
- Iframe: `IFRAME-GUIDE.md`
- Setup: `README.md`

**Dashboard**: http://localhost:3000 (shows all posts, users, stats)

**Database Queries**:
```bash
# View all users
sqlite3 data/posts.db "SELECT id, external_user_id, app_name, facebook_connected, instagram_connected FROM users;"

# View pending posts
sqlite3 data/posts.db "SELECT id, filename, user_id, status, scheduled_time FROM posts WHERE status='pending';"
```

---

## Timeline Summary

- **Phase 1** (Scheduler): 2-3 hours
- **Phase 2** (OmniBroker): 1 hour
- **Phase 3** (Sun Production): 1 hour
- **Phase 4** (Testing): 30 min
- **Phase 5** (Production prep): Variable (waiting on Facebook approval)

**Total Development Time**: ~5 hours
**Total Time to Live**: 3-10 days (including Facebook app review)

---

## What I'll Build Next

If you're ready, I can immediately build:

1. ✅ **Embed page** (`/public/embed.html`) - The UI users interact with
2. ✅ **OAuth routes** (`/src/routes/auth.js`) - Facebook/Instagram authentication
3. ✅ **User routes** (`/src/routes/users.js`) - User management API
4. ✅ **Updated scheduler** - Use user-specific tokens
5. ✅ **Upload endpoint** - For image hosting

Just say "build it" and I'll create all the missing pieces!
