# Social Media Scheduler

Automated posting for Facebook & Instagram with a beautiful dashboard UI, bulk upload support, and smart scheduling patterns.

## Features

- **User Authentication** - Secure JWT-based login system
- **Auto-posting** to Facebook Pages and Instagram Business accounts
- **Bulk Upload** - Upload up to 50 files at once with drag-and-drop
- **Smart Scheduling Patterns:**
  - Manual review - Schedule each post individually
  - Auto-Daily - Post once per day at specific time
  - Auto-Weekly - Post on specific days of the week (e.g., Mon/Wed/Fri)
  - Auto-Spacing - Evenly space posts by hours or days
- **AI Caption Generation** - OpenAI-powered caption generation with image analysis
- **Beautiful web dashboard** with modern Inter font and gold gradient design
- **Multi-tenant** - Support multiple users with their own social media accounts
- **OAuth authentication** - Users connect their own Facebook/Instagram accounts
- **Post tracking** with status monitoring
- **API-first design** - Programmatically create posts from any application
- **Image & video upload** - Support for images (JPG, PNG, GIF) and videos (MP4, MOV, AVI)
- **Integration-ready** - Built for OmniBroker, Sun Production, and other platforms

## Two Ways to Use

### 1. Standalone Dashboard (Simple)
Run the scheduler as a standalone tool with your own Facebook/Instagram accounts.

### 2. Embedded in Your App (Advanced - Multi-tenant)
Embed the scheduler in OmniBroker, Sun Production, or any web application. Each user connects their own social media accounts via OAuth.

See [IFRAME-GUIDE.md](IFRAME-GUIDE.md) for embedding instructions and [API-DOCUMENTATION.md](API-DOCUMENTATION.md) for API integration.

## Quick Start

### 1. Install Dependencies

```bash
cd /Users/aminatamansaray/Downloads/social-media-scheduler
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
PORT=3000
MEDIA_FOLDER=/Users/aminatamansaray/Downloads/PK Property/Combined Social Media Posts

# Get these from https://developers.facebook.com
FACEBOOK_PAGE_ACCESS_TOKEN=your_token_here
FACEBOOK_PAGE_ID=your_page_id_here

INSTAGRAM_ACCESS_TOKEN=your_token_here
INSTAGRAM_ACCOUNT_ID=your_account_id_here

PUBLIC_FILE_URL=http://localhost:3000/files
```

### 3. Run the Server

```bash
npm start
```

Open your browser to: **http://localhost:3000**

## Getting Facebook/Instagram API Credentials

### For Multi-Tenant (Iframe Embedding)

If you're embedding the scheduler in your app, you need to set up Facebook OAuth:

#### Step 1: Create Facebook App

1. Go to https://developers.facebook.com
2. Click "My Apps" → "Create App"
3. Choose "Business" type
4. Name your app (e.g., "Social Media Scheduler")

#### Step 2: Add Products

1. Add "Facebook Login" product
2. In Facebook Login settings, add OAuth Redirect URIs:
   ```
   http://localhost:3000/auth/facebook/callback
   http://localhost:3000/auth/instagram/callback
   ```
   (Add your production URLs too once deployed)

#### Step 3: Get App Credentials

1. Go to Settings → Basic
2. Copy **App ID** → this is your `FACEBOOK_APP_ID`
3. Copy **App Secret** → this is your `FACEBOOK_APP_SECRET`
4. Add these to your `.env`:
   ```env
   FACEBOOK_APP_ID=your_app_id
   FACEBOOK_APP_SECRET=your_app_secret
   FACEBOOK_REDIRECT_URI=http://localhost:3000/auth/facebook/callback
   INSTAGRAM_REDIRECT_URI=http://localhost:3000/auth/instagram/callback
   ```

#### Step 4: Request Permissions

Go to App Review → Permissions and Features, and request:
- `pages_manage_posts` - To post to Facebook Pages
- `instagram_content_publish` - To post to Instagram
- `pages_read_engagement` - To read page data
- `instagram_basic` - Basic Instagram access

**Note**: Your app will work in development mode with test users without approval. For production, you need Facebook's approval (3-7 days).

### For Standalone (Direct Credentials)

If you're using the scheduler standalone (not embedding), you can use direct tokens:

#### Step 1: Get Page Access Token

1. Go to Tools → Graph API Explorer
2. Select your app
3. Click "Generate Access Token"
4. Grant permissions:
   - `pages_manage_posts`
   - `pages_read_engagement`
   - `instagram_basic`
   - `instagram_content_publish`
5. Copy the token → this is your `FACEBOOK_PAGE_ACCESS_TOKEN`

#### Step 2: Get Page ID

1. Go to your Facebook Page
2. Click "About"
3. Scroll to "Page ID" → copy this number

#### Step 3: Get Instagram Business Account ID

1. In Graph API Explorer, make this request:
   ```
   GET /me/accounts?fields=instagram_business_account
   ```
2. Find your page, copy the `instagram_business_account.id`

## How to Use

### Import Your Posts

1. Open the dashboard at http://localhost:3000
2. Scroll to "Import Posts from Folder"
3. Enter your folder path (already filled with your Combined folder)
4. Add an optional caption
5. Select platforms (Facebook, Instagram, or both)
6. Click "Import Folder"

### Start Auto-Posting

1. Click "Start Scheduler" in the dashboard
2. Posts will auto-post every hour (configurable in `.env`)
3. Watch the status update in real-time

### Manual Posting

- Click "Post Now" on any pending post to post immediately

### Scheduling

By default, posts are scheduled to go out every hour. To change this:

Edit `.env`:
```env
# Post every 2 hours
CRON_SCHEDULE=0 */2 * * *

# Post every day at 9am
CRON_SCHEDULE=0 9 * * *

# Post every Monday at 10am
CRON_SCHEDULE=0 10 * * 1
```

[Cron format guide](https://crontab.guru/)

## Instagram URL Requirements

Instagram requires publicly accessible URLs for media. For local testing:

### Option 1: Use ngrok (Recommended for Testing)

```bash
# Install ngrok
brew install ngrok

# Run ngrok
ngrok http 3000

# Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
# Update .env:
PUBLIC_FILE_URL=https://abc123.ngrok.io/files
```

### Option 2: Deploy to Production

Deploy to Railway, Render, or DigitalOcean and use your production URL.

## Deployment

### Deploy to Railway (Recommended - Free)

1. Install Railway CLI:
   ```bash
   npm install -g @railway/cli
   ```

2. Login and deploy:
   ```bash
   railway login
   railway init
   railway up
   ```

3. Add environment variables in Railway dashboard

4. Your app is live! Get the URL and update `PUBLIC_FILE_URL`

### Deploy to Render

1. Push code to GitHub
2. Connect GitHub repo to Render
3. Add environment variables
4. Deploy

## Project Structure

```
social-media-scheduler/
├── src/
│   ├── database/
│   │   └── db.js              # SQLite database setup
│   ├── services/
│   │   ├── facebook.js        # Facebook posting logic
│   │   ├── instagram.js       # Instagram posting logic
│   │   └── scheduler.js       # Cron scheduler
│   ├── routes/
│   │   └── api.js             # API endpoints
│   └── server.js              # Express server
├── public/
│   └── index.html             # Dashboard UI
├── data/
│   └── posts.db               # SQLite database (auto-created)
├── .env                       # Your configuration
└── package.json
```

## API Endpoints

### Posts
- `GET /api/posts` - Get all posts
- `GET /api/posts/:id` - Get single post
- `POST /api/posts` - Create post (supports `user_id` parameter for multi-tenant)
- `PUT /api/posts/:id` - Update post
- `DELETE /api/posts/:id` - Delete post
- `POST /api/posts/:id/post-now` - Post immediately
- `POST /api/import-folder` - Import folder (supports `user_id` parameter)

### Users (Multi-tenant)
- `GET /api/users/:userId` - Get user connection status
- `GET /api/users/:userId/posts` - Get posts for specific user
- `POST /api/users` - Create/update user
- `POST /api/users/:userId/disconnect/:platform` - Disconnect Facebook or Instagram
- `DELETE /api/users/:userId` - Delete user and all their posts

### OAuth
- `GET /auth/facebook` - Initiate Facebook OAuth
- `GET /auth/facebook/callback` - Facebook OAuth callback
- `GET /auth/instagram` - Initiate Instagram OAuth
- `GET /auth/instagram/callback` - Instagram OAuth callback

### Upload
- `POST /api/upload` - Upload single file
- `POST /api/upload/multiple` - Upload multiple files
- `GET /api/upload/list` - List uploaded files
- `DELETE /api/upload/:filename` - Delete uploaded file

### Admin
- `GET /api/stats` - Get statistics
- `GET /api/scheduler/status` - Get scheduler status
- `POST /api/scheduler/start` - Start scheduler
- `POST /api/scheduler/stop` - Stop scheduler

**For detailed API documentation with examples, see [API-DOCUMENTATION.md](API-DOCUMENTATION.md)**

## Future AI Enhancements

This codebase is designed to easily integrate AI features:

- **AI-generated captions** - Use GPT to create engaging captions
- **Image analysis** - Auto-tag images with AI
- **Optimal posting times** - ML-based scheduling
- **A/B testing** - AI-powered caption variations
- **Analytics insights** - AI-powered engagement predictions

## Troubleshooting

### "Access token expired"
- Regenerate your access tokens in Facebook Developers
- Update `.env` with new tokens

### "Instagram posting failed"
- Make sure your Instagram account is a Business account
- Make sure it's connected to your Facebook Page
- Verify `PUBLIC_FILE_URL` is accessible publicly

### "Posts not auto-posting"
- Check scheduler is running (green dot in dashboard)
- Check `.env` has correct credentials
- Check server logs for errors

### "Can't import folder"
- Verify folder path is correct
- Make sure folder contains .jpg, .png, or .mp4 files

## Support

For issues or questions, check:
- Server logs (terminal where you ran `npm start`)
- Browser console (F12 in Chrome)
- Database: `data/posts.db`

## License

MIT - Use freely for any project!

---

**Built for PK Property Inc** 🏠

AI-friendly codebase - easily maintained and extended with Claude, GPT, or any AI assistant.
