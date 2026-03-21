# Quu Social Media Scheduler - Deployment Guide

## 🚀 Deploy to Production with Supabase

This guide will help you deploy Quu to production using Supabase for both database and file storage.

---

## Step 1: Set Up Supabase Database

### 1.1 Go to Supabase Dashboard
1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project: `https://nnvxkooiwyrlqbxhqxac.supabase.co`

### 1.2 Run Database Setup Script
1. Click **SQL Editor** in the left sidebar
2. Click **New Query**
3. Copy the entire contents of `setup-supabase-db.sql`
4. Paste into the SQL editor
5. Click **Run** to execute

This will create all necessary tables (users, posts, analytics, etc.)

### 1.3 Get Your Database Credentials
You already have these:
- **Supabase URL**: `https://nnvxkooiwyrlqbxhqxac.supabase.co`
- **Anon Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

**Get Service Role Key** (needed for backend):
1. Go to **Settings** → **API** in Supabase dashboard
2. Copy the `service_role` key (⚠️ Keep this secret!)

---

## Step 2: Configure Environment Variables

### For Production (.env.production or Platform Settings):

```bash
# Server
NODE_ENV=production
PORT=3000

# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Supabase Database & Storage
SUPABASE_URL=https://nnvxkooiwyrlqbxhqxac.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5udnhrb29pd3lybHFieGhxeGFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3Njg3ODYsImV4cCI6MjA4OTM0NDc4Nn0.aRFw3ysejLtacYxT1b6ulQa_OFeD2cwnF752ig_6mzA
SUPABASE_SERVICE_KEY=your-service-role-key-here

# Facebook/Instagram OAuth
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret
FACEBOOK_REDIRECT_URI=https://your-deployed-url.com/auth/facebook/callback
INSTAGRAM_REDIRECT_URI=https://your-deployed-url.com/auth/instagram/callback

# AI Features (Optional)
OPENAI_API_KEY=your_openai_api_key

# Media Folder (not needed in production - using Supabase Storage)
# MEDIA_FOLDER=/path/to/media
```

---

## Step 3: Choose Deployment Platform

### Option A: Railway (Recommended - Easiest)

1. **Install Railway CLI** (optional):
   ```bash
   npm install -g @railway/cli
   ```

2. **Deploy via GitHub**:
   - Go to [railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository
   - Add environment variables from Step 2
   - Click "Deploy"

3. **Configure Domain**:
   - Railway will give you a URL like `your-app.up.railway.app`
   - Update `FACEBOOK_REDIRECT_URI` and `INSTAGRAM_REDIRECT_URI` with this URL

### Option B: Render

1. **Create New Web Service**:
   - Go to [render.com](https://render.com)
   - Click "New" → "Web Service"
   - Connect your GitHub repository

2. **Configure Build Settings**:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node

3. **Add Environment Variables**: Add all variables from Step 2

4. **Deploy**: Click "Create Web Service"

### Option C: Vercel (For Next.js or Static + API)

⚠️ **Note**: Vercel is serverless, which may require restructuring. Railway or Render are recommended for Node.js Express apps.

---

## Step 4: Migrate Existing Data (Optional)

If you have existing data in SQLite that you want to migrate:

1. **Export from SQLite**:
   ```bash
   node migrate-to-supabase.js
   ```

2. This will:
   - Read all users and posts from SQLite
   - Insert them into Supabase PostgreSQL
   - Preserve all IDs and timestamps

---

## Step 5: Test Deployment

### 5.1 Create Test User
```bash
curl -X POST https://your-app.railway.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User"}'
```

### 5.2 Test Login
- Go to `https://your-app.railway.app/login`
- Login with your test account
- Verify all features work:
  - ✅ Dashboard loads
  - ✅ Can create posts
  - ✅ File uploads work (Supabase Storage)
  - ✅ OAuth connections work

---

## Step 6: Update Facebook App Settings

Since you're deploying to production, update your Facebook App:

1. Go to [Facebook Developers Console](https://developers.facebook.com)
2. Select your app
3. Go to **Settings** → **Basic**
4. Update **App Domains**: Add your deployed domain (e.g., `your-app.railway.app`)
5. Go to **Facebook Login** → **Settings**
6. Add **Valid OAuth Redirect URIs**:
   - `https://your-app.railway.app/auth/facebook/callback`
   - `https://your-app.railway.app/auth/instagram/callback`

---

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Your Supabase project URL | ✅ Yes |
| `SUPABASE_ANON_KEY` | Supabase anon/public key | ✅ Yes |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (backend) | ✅ Yes |
| `JWT_SECRET` | Secret for JWT tokens | ✅ Yes |
| `FACEBOOK_APP_ID` | Facebook App ID | For OAuth |
| `FACEBOOK_APP_SECRET` | Facebook App Secret | For OAuth |
| `OPENAI_API_KEY` | OpenAI API key | For AI features |
| `PORT` | Server port (default: 3000) | No |

---

## Troubleshooting

### Database Connection Issues
- ✅ Check that `SUPABASE_SERVICE_KEY` is set (not just `SUPABASE_ANON_KEY`)
- ✅ Verify database tables were created (check Supabase SQL editor)
- ✅ Check RLS policies allow service role access

### File Upload Issues
- ✅ Verify Supabase Storage bucket `quu-media` exists and is public
- ✅ Check bucket policies allow uploads

### OAuth Issues
- ✅ Update Facebook App redirect URIs to match deployed URL
- ✅ Ensure `FACEBOOK_REDIRECT_URI` matches exactly in both .env and Facebook App settings

---

## 🎉 You're Live!

Once deployed:
1. Your app will automatically use Supabase PostgreSQL (not SQLite)
2. Files will be stored in Supabase Storage (not local filesystem)
3. You can scale horizontally (multiple server instances)
4. Database backups are automatic with Supabase

**Share your deployed URL and start scheduling posts! 🚀**
