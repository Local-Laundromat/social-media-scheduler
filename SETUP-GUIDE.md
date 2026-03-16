# Setup Guide - Social Media Scheduler

## Complete Setup in 5 Steps

### Step 1: Install Node.js (if not installed)

Check if you have Node.js:
```bash
node --version
```

If not installed, download from: https://nodejs.org

### Step 2: Install Dependencies

```bash
cd /Users/aminatamansaray/Downloads/social-media-scheduler
npm install
```

### Step 3: Get Facebook/Instagram API Credentials

#### A. Create Facebook App

1. Go to https://developers.facebook.com
2. Click "My Apps" → "Create App"
3. Choose "Business" type
4. Enter app name: "Social Media Scheduler"
5. Click "Create App"

#### B. Add Products

1. Find "Facebook Login" → Click "Set Up"
2. Find "Instagram" → Click "Set Up"

#### C. Generate Access Token

1. Go to Tools → Graph API Explorer (https://developers.facebook.com/tools/explorer/)
2. At the top, select your app from dropdown
3. Click "Generate Access Token"
4. Check these permissions:
   - pages_manage_posts
   - pages_read_engagement
   - instagram_basic
   - instagram_content_publish
5. Click "Generate Access Token"
6. Copy the token (this is your `FACEBOOK_PAGE_ACCESS_TOKEN`)

**IMPORTANT:** For production, convert this to a long-lived token:
- Go to Access Token Debugger: https://developers.facebook.com/tools/debug/accesstoken/
- Paste your token → Click "Debug"
- Click "Extend Access Token"
- Copy the new long-lived token

#### D. Get Your Facebook Page ID

Method 1 (Easy):
1. Go to your Facebook Page
2. Click "About"
3. Scroll down to "Page ID"
4. Copy the number

Method 2 (Graph API):
1. In Graph API Explorer, paste: `/me/accounts`
2. Click "Submit"
3. Find your page in the results
4. Copy the `id` field

#### E. Get Instagram Business Account ID

**First, make sure:**
- Your Instagram account is a Business or Creator account
- It's connected to your Facebook Page

**Then:**
1. In Graph API Explorer, paste: `/me/accounts?fields=instagram_business_account`
2. Click "Submit"
3. Find your page
4. Copy the `instagram_business_account.id` value

### Step 4: Configure Environment

1. Copy the example env file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` file (use any text editor):
   ```bash
   nano .env
   # or
   code .env
   # or open in TextEdit
   ```

3. Fill in your credentials:
   ```env
   PORT=3000
   AUTO_START_SCHEDULER=false
   CRON_SCHEDULE=0 * * * *

   MEDIA_FOLDER=/Users/aminatamansaray/Downloads/PK Property/Combined Social Media Posts

   FACEBOOK_PAGE_ACCESS_TOKEN=paste_your_token_here
   FACEBOOK_PAGE_ID=paste_your_page_id_here

   INSTAGRAM_ACCESS_TOKEN=paste_your_token_here
   INSTAGRAM_ACCOUNT_ID=paste_your_account_id_here

   PUBLIC_FILE_URL=http://localhost:3000/files
   ```

### Step 5: Run the Server

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

Open your browser to: **http://localhost:3000**

## Testing Your Setup

### 1. Import Posts

1. In the dashboard, scroll to "Import Posts from Folder"
2. The folder path should already be filled in
3. Add a test caption: "Test post from PK Property"
4. Check both Facebook and Instagram
5. Click "Import Folder"

You should see: "Imported X files!"

### 2. Test Manual Post (Facebook Only First)

1. Find a post in the "Pending" tab
2. Click "Post Now"
3. Go to your Facebook Page and verify the post appears

### 3. Test Instagram (Requires Public URL)

For local testing, Instagram needs a public URL. Use ngrok:

```bash
# Install ngrok
brew install ngrok

# Run ngrok in a new terminal
ngrok http 3000

# Copy the HTTPS URL (looks like: https://abc123.ngrok.io)
```

Update `.env`:
```env
PUBLIC_FILE_URL=https://abc123.ngrok.io/files
```

Restart server:
```bash
npm start
```

Now try posting to Instagram!

### 4. Enable Auto-Posting

1. Click "Start Scheduler" in dashboard
2. Posts will automatically post every hour
3. Watch the stats update

## Common Issues & Solutions

### Issue: "Invalid OAuth access token"

**Solution:** Your token expired. Regenerate it:
1. Go to Graph API Explorer
2. Generate new token with same permissions
3. Update `.env`
4. Restart server

### Issue: "Instagram posting failed - Invalid media URL"

**Solutions:**
1. Make sure `PUBLIC_FILE_URL` is publicly accessible
2. For local testing, use ngrok
3. For production, deploy to Railway/Render first

### Issue: "No posts found after import"

**Solutions:**
1. Check folder path is correct
2. Make sure folder contains .jpg, .png, or .mp4 files
3. Check server logs for errors

### Issue: "Posts not auto-posting"

**Solutions:**
1. Make sure scheduler is running (green dot)
2. Check posts are in "pending" status
3. Verify credentials in `.env`
4. Check server logs for errors

### Issue: "Permission denied" errors

**Solution:** Regenerate access token with all required permissions:
- pages_manage_posts
- pages_read_engagement
- instagram_basic
- instagram_content_publish

## Next Steps

### Make Tokens Last Longer

Facebook tokens expire. To get 60-day tokens:
1. Go to https://developers.facebook.com/tools/debug/accesstoken/
2. Paste your token
3. Click "Extend Access Token"
4. Update `.env` with new token

### Deploy to Production (Free)

**Option 1: Railway (Recommended)**
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

**Option 2: Render**
1. Push code to GitHub
2. Go to https://render.com
3. Connect GitHub repo
4. Add environment variables
5. Deploy

### Customize Posting Schedule

Edit `.env`:
```env
# Every 2 hours
CRON_SCHEDULE=0 */2 * * *

# Every day at 9am
CRON_SCHEDULE=0 9 * * *

# Every Monday, Wednesday, Friday at 10am
CRON_SCHEDULE=0 10 * * 1,3,5

# Every hour from 9am to 5pm
CRON_SCHEDULE=0 9-17 * * *
```

Use https://crontab.guru to create custom schedules.

### Add AI Features Later

The codebase is ready for AI enhancements:
- AI-generated captions (integrate OpenAI API)
- Smart scheduling based on engagement
- Image analysis and auto-tagging
- A/B testing different captions

## Need Help?

Check the logs:
```bash
# In the terminal where the server is running
# Scroll up to see error messages
```

Check the database:
```bash
sqlite3 data/posts.db
sqlite> SELECT * FROM posts LIMIT 5;
sqlite> .quit
```

## You're All Set!

Your social media scheduler is ready to use. Start with manual posting to test, then enable auto-posting when ready.

Happy posting! 🚀
