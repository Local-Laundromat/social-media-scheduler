# 🚀 Deployment Checklist for Quu

Follow this step-by-step checklist to deploy Quu to production.

---

## ✅ Pre-Deployment

### 1. Supabase Setup

- [ ] Login to [Supabase Dashboard](https://supabase.com/dashboard)
- [ ] Go to your project: `https://nnvxkooiwyrlqbxhqxac.supabase.co`
- [ ] Open **SQL Editor**
- [ ] Create new query
- [ ] Copy contents of `setup-supabase-db.sql`
- [ ] Run the SQL script
- [ ] Verify tables created (users, posts, comment_replies, etc.)

### 2. Get Supabase Credentials

- [ ] Go to **Settings** → **API**
- [ ] Copy **Project URL**: `https://nnvxkooiwyrlqbxhqxac.supabase.co`
- [ ] Copy **anon/public key**: `eyJhbGciOi...` (you already have this)
- [ ] Copy **service_role key** (⚠️ Keep this secret!)

### 3. Verify Supabase Storage

- [ ] Go to **Storage** in Supabase dashboard
- [ ] Verify bucket `quu-media` exists
- [ ] Check bucket is public
- [ ] Test upload (optional)

### 4. Prepare Your Code

- [ ] Commit all changes: `git add .`
- [ ] `git commit -m "Prepare for deployment"`
- [ ] Push to GitHub: `git push origin main`

---

## 🚀 Deploy to Railway (Recommended)

### Step 1: Create Railway Project

- [ ] Go to [railway.app](https://railway.app)
- [ ] Click **"Start a New Project"**
- [ ] Select **"Deploy from GitHub repo"**
- [ ] Choose your repository
- [ ] Railway will auto-detect Node.js

### Step 2: Add Environment Variables

Click **Variables** and add:

```bash
# Required - Supabase
SUPABASE_URL=https://nnvxkooiwyrlqbxhqxac.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5udnhrb29pd3lybHFieGhxeGFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3Njg3ODYsImV4cCI6MjA4OTM0NDc4Nn0.aRFw3ysejLtacYxT1b6ulQa_OFeD2cwnF752ig_6mzA
SUPABASE_SERVICE_KEY=<paste-your-service-role-key-here>

# Required - Auth
JWT_SECRET=<generate-a-random-secret-key>

# Required - Facebook OAuth
FACEBOOK_APP_ID=<your-facebook-app-id>
FACEBOOK_APP_SECRET=<your-facebook-app-secret>
FACEBOOK_REDIRECT_URI=https://your-app-name.up.railway.app/auth/facebook/callback
INSTAGRAM_REDIRECT_URI=https://your-app-name.up.railway.app/auth/instagram/callback

# Optional - AI Features
OPENAI_API_KEY=<your-openai-key-if-you-have-one>

# Optional
PORT=3000
NODE_ENV=production
```

- [ ] Add all variables
- [ ] Click **Save**

### Step 3: Deploy

- [ ] Railway will automatically deploy
- [ ] Wait for build to complete (2-3 minutes)
- [ ] Click **"Generate Domain"** to get your URL
- [ ] Copy your Railway URL (e.g., `your-app.up.railway.app`)

### Step 4: Update Facebook App

- [ ] Go to [Facebook Developers](https://developers.facebook.com)
- [ ] Select your app
- [ ] Go to **Settings** → **Basic**
- [ ] Update **App Domains**: Add `your-app.up.railway.app`
- [ ] Go to **Facebook Login** → **Settings**
- [ ] Add to **Valid OAuth Redirect URIs**:
  - `https://your-app.up.railway.app/auth/facebook/callback`
  - `https://your-app.up.railway.app/auth/instagram/callback`
- [ ] Click **Save Changes**

### Step 5: Update Railway Environment Variables

- [ ] Go back to Railway
- [ ] Update these variables with your actual Railway URL:
  - `FACEBOOK_REDIRECT_URI`
  - `INSTAGRAM_REDIRECT_URI`
- [ ] Railway will automatically redeploy

---

## 🧪 Test Your Deployment

### Test 1: Basic Health Check

- [ ] Visit `https://your-app.up.railway.app`
- [ ] You should see the Quu landing page
- [ ] No errors in browser console (F12)

### Test 2: Registration

- [ ] Click **"Get Started"**
- [ ] Register a new account
- [ ] Should redirect to dashboard

### Test 3: Login

- [ ] Logout
- [ ] Login with your test account
- [ ] Dashboard should load

### Test 4: Platform Connections

- [ ] Try connecting Facebook
- [ ] OAuth popup should appear
- [ ] After authorization, should show "Connected"

### Test 5: File Upload

- [ ] Try uploading an image
- [ ] File should upload to Supabase Storage
- [ ] Preview should appear

### Test 6: Create Post

- [ ] Upload image
- [ ] Write caption
- [ ] Select platform
- [ ] Click "Create Post"
- [ ] Post should appear in Posts tab

---

## 🐛 Troubleshooting

### Database Connection Error

**Issue**: "Failed to connect to database"

**Solution**:
- [ ] Check `SUPABASE_SERVICE_KEY` is set (not just anon key)
- [ ] Verify Supabase URL is correct
- [ ] Check RLS policies in Supabase allow service role access

### File Upload Error

**Issue**: "Failed to upload file"

**Solution**:
- [ ] Verify Supabase Storage bucket `quu-media` exists
- [ ] Check bucket is public
- [ ] Verify `SUPABASE_ANON_KEY` has storage permissions

### OAuth Redirect Error

**Issue**: "Invalid redirect URI"

**Solution**:
- [ ] Check Facebook App redirect URIs match exactly
- [ ] Ensure Railway URL doesn't have trailing slash
- [ ] Update `FACEBOOK_REDIRECT_URI` in Railway variables

### App Won't Start

**Issue**: "Application error" or crash

**Solution**:
- [ ] Check Railway logs: Click "View Logs"
- [ ] Look for error messages
- [ ] Verify all required environment variables are set
- [ ] Check `package.json` has correct start script

---

## 📊 Post-Deployment

### Monitor Your App

- [ ] **Railway Logs**: Click "View Logs" to see real-time logs
- [ ] **Supabase Logs**: Check database queries in Supabase dashboard
- [ ] **Storage Usage**: Monitor file uploads in Supabase Storage

### Set Up Monitoring (Optional)

- [ ] Add monitoring service (e.g., UptimeRobot)
- [ ] Set up error tracking (e.g., Sentry)
- [ ] Configure log aggregation

### Scale (If Needed)

- [ ] **Railway**: Automatically scales
- [ ] **Supabase**: Free tier supports up to 50MB database, 1GB storage
- [ ] Upgrade plans if needed

---

## 🎉 You're Live!

Congratulations! Your Quu social media scheduler is now live and ready to use.

**Next Steps**:
1. Share your deployment URL with team members
2. Connect your Facebook/Instagram business accounts
3. Start scheduling posts!

**Your live app**: `https://your-app.up.railway.app`

---

## 📝 Need Help?

- Railway docs: https://docs.railway.app
- Supabase docs: https://supabase.com/docs
- Facebook OAuth: https://developers.facebook.com/docs

**Having issues?** Check the main [DEPLOYMENT.md](./DEPLOYMENT.md) guide for detailed troubleshooting.
