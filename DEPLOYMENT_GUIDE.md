# Quu Deployment Guide - How to Publish Your App

## Best Deployment Options for Quu

Your app is a **Node.js/Express backend + SQLite database** application. Here are the best options:

---

## 🚀 **Recommended: Railway (Easiest & Best for Quu)**

**Why Railway?**
- ✅ Free tier with $5/month credit
- ✅ Built-in SQLite support (persistent storage)
- ✅ GitHub integration (auto-deploy on push)
- ✅ Environment variables support
- ✅ Custom domains
- ✅ Built-in SSL/HTTPS
- ✅ No credit card required for free tier

### Deploy to Railway:

#### Step 1: Create Railway Account
```bash
# Visit: https://railway.app
# Sign up with your GitHub account
```

#### Step 2: Install Railway CLI (Optional)
```bash
npm install -g @railway/cli
railway login
```

#### Step 3: Deploy from GitHub
1. Go to https://railway.app/new
2. Click "Deploy from GitHub repo"
3. Select `Local-Laundromat/social-media-scheduler`
4. Railway will auto-detect Node.js and deploy

#### Step 4: Add Environment Variables
In Railway dashboard:
- Click your project → Variables
- Add all variables from your `.env` file:
  - `FACEBOOK_APP_ID`
  - `FACEBOOK_APP_SECRET`
  - `INSTAGRAM_APP_ID`
  - `INSTAGRAM_APP_SECRET`
  - `TIKTOK_CLIENT_KEY`
  - `TIKTOK_CLIENT_SECRET`
  - `OPENAI_API_KEY`
  - `JWT_SECRET`
  - `MEDIA_FOLDER` (use `/app/uploads` on Railway)
  - `PORT` (Railway sets this automatically)

#### Step 5: Configure Domain
- Railway provides: `your-app.railway.app`
- Or add custom domain: `quu.yourdomain.com`

**Cost:** FREE for hobby projects (with $5/month credit)

---

## 🔷 **Option 2: Render (Great Alternative)**

**Why Render?**
- ✅ Free tier available
- ✅ SQLite support
- ✅ GitHub auto-deploy
- ✅ Custom domains
- ✅ SSL included

### Deploy to Render:

1. **Sign up**: https://render.com
2. **New Web Service** → Connect GitHub repo
3. **Build Command**: `npm install`
4. **Start Command**: `npm start`
5. **Add environment variables**
6. **Deploy**

**Free Tier Limits:**
- Spins down after 15 min of inactivity
- 750 hours/month free

---

## ☁️ **Option 3: Cloudflare Pages + Workers**

**Note:** Cloudflare Pages is mainly for **static sites**. For Quu (full-stack Node.js app), you'd need:

### Cloudflare Workers + D1 Database

**Pros:**
- ✅ Fast global CDN
- ✅ Free tier: 100k requests/day
- ✅ Custom domains

**Cons:**
- ❌ Requires rewriting app for serverless
- ❌ No direct SQLite support (need D1 migration)
- ❌ More complex setup

**Not recommended for Quu** unless you want to completely refactor.

---

## 🟦 **Option 4: DigitalOcean App Platform**

**Why DigitalOcean?**
- ✅ $5/month for basic app
- ✅ Full control
- ✅ SQLite support
- ✅ GitHub integration

### Deploy to DigitalOcean:

1. Sign up: https://www.digitalocean.com
2. Create → Apps → GitHub repo
3. Configure environment variables
4. Deploy

**Cost:** $5-12/month (no free tier)

---

## 🟩 **Option 5: Heroku (Classic Option)**

**Why Heroku?**
- ✅ Easy deployment
- ✅ Free tier (with limitations)
- ✅ Add-ons ecosystem

**Cons:**
- ⚠️ SQLite doesn't persist (need PostgreSQL)
- ⚠️ Free tier sleeps after 30 min

### Deploy to Heroku:

```bash
# Install Heroku CLI
npm install -g heroku

# Login and create app
heroku login
heroku create quu-social-scheduler

# Add buildpack
heroku buildpacks:add heroku/nodejs

# Set environment variables
heroku config:set FACEBOOK_APP_ID=your_id
heroku config:set FACEBOOK_APP_SECRET=your_secret
# ... (add all env vars)

# Deploy
git push heroku main
```

**Note:** You'll need to migrate from SQLite to PostgreSQL for Heroku.

---

## 🟨 **Option 6: Vercel (Limited Support)**

**Vercel is optimized for Next.js/static sites.**

For Node.js Express apps like Quu:
- ⚠️ Requires serverless functions refactor
- ⚠️ SQLite won't work (needs external DB)
- ⚠️ Not ideal for this use case

**Not recommended for Quu**

---

## 📊 **Comparison Table**

| Platform | Free Tier | SQLite Support | Ease of Use | Best For |
|----------|-----------|----------------|-------------|----------|
| **Railway** | ✅ Yes ($5 credit) | ✅ Yes | ⭐⭐⭐⭐⭐ | **Recommended** |
| **Render** | ✅ Yes (limited) | ✅ Yes | ⭐⭐⭐⭐ | Great alternative |
| **DigitalOcean** | ❌ $5/mo | ✅ Yes | ⭐⭐⭐⭐ | Production apps |
| **Heroku** | ✅ Yes (limited) | ❌ No | ⭐⭐⭐ | Needs PostgreSQL |
| **Cloudflare** | ✅ Yes | ❌ Complex | ⭐⭐ | Not ideal |
| **Vercel** | ✅ Yes | ❌ No | ⭐⭐ | Not ideal |

---

## 🎯 **My Recommendation: Railway**

### Why Railway for Quu:
1. **Zero configuration** - Works with your current setup
2. **SQLite persistent storage** - No database migration needed
3. **GitHub integration** - Push to deploy automatically
4. **Free to start** - $5/month credit is enough for development
5. **Easy scaling** - Upgrade when you need more

### Quick Start with Railway:

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Initialize in your project
cd ~/Downloads/social-media-scheduler
railway init

# 4. Link to GitHub repo
railway link

# 5. Add environment variables
railway variables set FACEBOOK_APP_ID=your_id
railway variables set FACEBOOK_APP_SECRET=your_secret
railway variables set OPENAI_API_KEY=your_key
# ... (continue for all variables)

# 6. Deploy!
railway up

# 7. Get your live URL
railway domain
```

Your app will be live at: `https://your-project.railway.app`

---

## 🔒 **Important: Before Deploying**

### 1. Secure Your Environment Variables
Never commit these to GitHub:
- ✅ `.env` is in `.gitignore` (already done)
- ✅ Add all secrets to hosting platform

### 2. Update Redirect URLs
After deployment, update OAuth redirect URLs in:
- **Facebook App Settings**: `https://your-app.railway.app/auth/facebook/callback`
- **Instagram App Settings**: `https://your-app.railway.app/auth/instagram/callback`
- **TikTok App Settings**: `https://your-app.railway.app/auth/tiktok/callback`

### 3. Set Production Environment Variables
```env
NODE_ENV=production
PORT=3000
DATABASE_PATH=/app/data/scheduler.db
MEDIA_FOLDER=/app/uploads
```

### 4. Update CORS Settings
In `src/server.js`, update CORS to allow your domain:
```javascript
app.use(cors({
  origin: ['https://your-app.railway.app', 'https://quu.yourdomain.com']
}));
```

---

## 🌐 **Custom Domain Setup**

### Option A: Use Railway Domain
- Free subdomain: `your-project.railway.app`

### Option B: Add Custom Domain
1. **Buy domain** (Namecheap, GoDaddy, Google Domains)
2. **In Railway**: Settings → Domains → Add Custom Domain
3. **Add DNS records**:
   ```
   Type: CNAME
   Name: quu (or @)
   Value: your-project.railway.app
   ```
4. **SSL certificate**: Railway handles automatically

---

## 💰 **Cost Estimates**

### Railway (Recommended)
- **Hobby**: FREE ($5/month credit, ~$5 usage for small apps)
- **Pro**: $20/month (when you scale)

### Render
- **Free**: $0 (sleeps after inactivity)
- **Starter**: $7/month (always on)

### DigitalOcean
- **Basic**: $5-12/month

### Domain Name
- **Domain registration**: $10-15/year (Namecheap, Cloudflare Registrar)

---

## 🚀 **Step-by-Step: Deploy to Railway Now**

### 1. Create Account
Visit: https://railway.app/new
Sign in with GitHub

### 2. Deploy from GitHub
- Click "Deploy from GitHub repo"
- Authorize Railway to access your repos
- Select `Local-Laundromat/social-media-scheduler`
- Click "Deploy Now"

### 3. Add Environment Variables
- Go to your project
- Click "Variables" tab
- Add one by one (or bulk import):
  ```
  FACEBOOK_APP_ID=your_value
  FACEBOOK_APP_SECRET=your_value
  INSTAGRAM_APP_ID=your_value
  INSTAGRAM_APP_SECRET=your_value
  TIKTOK_CLIENT_KEY=your_value
  TIKTOK_CLIENT_SECRET=your_value
  OPENAI_API_KEY=your_value
  JWT_SECRET=your_value
  SESSION_SECRET=your_value
  MEDIA_FOLDER=/app/uploads
  ```

### 4. Configure Build Settings (Auto-detected)
Railway will automatically:
- Detect Node.js
- Run `npm install`
- Start with `npm start`

### 5. Get Your URL
- Click "Settings" → "Domains"
- Copy your Railway URL: `https://social-media-scheduler-production.railway.app`

### 6. Update OAuth Callbacks
Update in Facebook, Instagram, TikTok developer consoles:
- Callback URL: `https://your-app.railway.app/auth/[platform]/callback`

### 7. Test Your Deployment
- Visit your Railway URL
- Create an account
- Connect social media platforms
- Create a test post

---

## 📱 **Mobile App (Future)**

If you want native mobile apps later:
- **React Native** - Reuse backend API
- **Expo** - Faster mobile development
- Use your Railway API as backend

---

## 🆘 **Troubleshooting**

### App Won't Start
- Check Railway logs: `railway logs`
- Verify all environment variables are set
- Ensure `PORT` is set correctly (Railway provides this)

### Database Not Persisting
- Railway: Ensure volume is mounted
- Check `DATABASE_PATH` variable

### OAuth Not Working
- Verify redirect URLs match exactly
- Check environment variables are set
- Ensure HTTPS is enabled (Railway does this automatically)

---

## 📞 **Next Steps**

1. ✅ Deploy to Railway (5 minutes)
2. ✅ Test the live app
3. ✅ Update OAuth redirect URLs
4. ✅ Share with users!
5. ✅ Monitor usage and scale as needed

---

**Ready to deploy? Let me know if you want me to help with any step!**

Railway Link: https://railway.app/new
Your GitHub Repo: https://github.com/Local-Laundromat/social-media-scheduler
