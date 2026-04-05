# 👋 Quu Deployment Guide

## Quick Overview
Deploy your social media scheduler to **hiquu.co** using Railway + Cloudflare.

**Total Cost:** ~$5/month (Railway) + ~$30/year (domain) = **~$90/year**

---

## Step 1: Sign up for Railway (Hosting)

1. Go to **https://railway.app**
2. Click "Login" → "Sign in with GitHub"
3. Authorize Railway to access your GitHub account

---

## Step 2: Deploy from GitHub

1. In Railway dashboard, click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Choose **`Local-Laundromat/social-media-scheduler`**
4. Railway will auto-detect it's a Node.js app and start deploying
5. Wait for the initial build to complete

---

## Step 3: Configure Environment Variables

In Railway dashboard:
1. Click on your deployed project
2. Go to **"Variables"** tab
3. Add these environment variables:

### Required Variables:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_KEY=your-service-role-key-here
PORT=3000
NODE_ENV=production
```

### Facebook Integration:
```
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
```

### Instagram Integration:
```
INSTAGRAM_APP_ID=your-instagram-app-id
INSTAGRAM_APP_SECRET=your-instagram-app-secret
```

### TikTok Integration:
```
TIKTOK_CLIENT_KEY=your-tiktok-client-key
TIKTOK_CLIENT_SECRET=your-tiktok-client-secret
```

### Optional (AI Features):
```
OPENAI_API_KEY=sk-your-openai-key (optional - users can add their own)
FRONTEND_URL=https://hiquu.co
```

**Note:** After adding variables, Railway will automatically redeploy.

---

## Step 4: Register Domain on Cloudflare

1. Go to **https://www.cloudflare.com**
2. Click **"Sign Up"** (or log in if you have an account)
3. After signup, click **"Register a Domain"**
4. Search for **`hiquu.co`**
5. Add to cart and complete purchase (~$30/year)
6. Wait for domain verification (can take a few minutes to 24 hours)

---

## Step 5: Connect Domain to Railway

### In Railway:
1. Go to your project settings
2. Click **"Settings"** → **"Domains"**
3. Click **"Add Custom Domain"**
4. Enter: `hiquu.co`
5. Railway will show you a **CNAME record** like:
   ```
   CNAME: hiquu.co → your-project.up.railway.app
   ```
6. **Copy this CNAME value**

### In Cloudflare:
1. Go to your Cloudflare dashboard
2. Click on **`hiquu.co`** domain
3. Go to **"DNS"** → **"Records"**
4. Click **"Add record"**
5. Select type: **CNAME**
6. Name: **`@`** (for root domain)
7. Target: **Paste the Railway URL** (e.g., `your-project.up.railway.app`)
8. Proxy status: **Proxied** (orange cloud)
9. Click **"Save"**

### Optional - Add www subdomain:
1. Add another CNAME record
2. Name: **`www`**
3. Target: **Same Railway URL**
4. Proxy status: **Proxied**

**Note:** DNS changes can take 5-60 minutes to propagate.

---

## Step 6: Set up Email Forwarding (Free)

In Cloudflare:
1. Go to **"Email"** → **"Email Routing"**
2. Click **"Get started"**
3. Add destination address (your personal email)
4. Verify your email
5. Create forwarding rules:
   - `hello@hiquu.co` → your-email@gmail.com
   - `support@hiquu.co` → your-email@gmail.com
   - `noreply@hiquu.co` → your-email@gmail.com

---

## Step 7: Update OAuth Redirect URLs

Once your domain is live, update these settings:

### Facebook App:
1. Go to https://developers.facebook.com
2. Select your app
3. Settings → Basic → Add Platform → Website
4. Site URL: `https://hiquu.co`
5. App Domains: `hiquu.co`
6. Products → Facebook Login → Settings
7. Valid OAuth Redirect URIs: `https://hiquu.co/auth/facebook/callback`

### Instagram (uses same Facebook App):
Already covered by Facebook settings above.

### TikTok:
1. Go to https://developers.tiktok.com
2. Select your app
3. Add redirect URI: `https://hiquu.co/auth/tiktok/callback`

### Supabase:
1. Go to your Supabase project
2. Authentication → URL Configuration
3. Site URL: `https://hiquu.co`
4. Redirect URLs: Add `https://hiquu.co/**`

---

## Step 8: Test Your Deployment

1. Visit **https://hiquu.co**
2. Create an account
3. Test login/logout
4. Connect Facebook page
5. Connect Instagram account
6. Connect TikTok account
7. Create a test post
8. Click "Post Now" to verify immediate posting works

---

## Troubleshooting

### Site not loading?
- Check DNS propagation: https://dnschecker.org (search for `hiquu.co`)
- Verify CNAME is pointing to Railway correctly
- Check Railway deployment logs for errors

### OAuth not working?
- Verify redirect URLs match exactly (https://hiquu.co/auth/...)
- Check environment variables are set in Railway
- Make sure FRONTEND_URL is set to `https://hiquu.co`

### Posts not publishing?
- Check Railway logs for errors
- Verify social media tokens are valid
- Test with "Post Now" first before scheduling

---

## Monitoring & Maintenance

### View Logs:
- Railway dashboard → Your project → "Deployments" → Click latest deployment → View logs

### Update Code:
1. Make changes locally
2. Commit: `git add . && git commit -m "your message"`
3. Push: `git push origin main`
4. Railway auto-deploys on every push to main branch

### Check Costs:
- Railway dashboard → Billing (Free $5 credit/month, then pay as you go)
- Usually stays around $5/month for small apps

---

## Environment Variables Quick Reference

Here's where to find each variable:

| Variable | Where to find it |
|----------|------------------|
| `SUPABASE_URL` | Supabase Dashboard → Settings → API |
| `SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_KEY` | Supabase Dashboard → Settings → API |
| `FACEBOOK_APP_ID` | Facebook Developers → Your App → Settings → Basic |
| `FACEBOOK_APP_SECRET` | Facebook Developers → Your App → Settings → Basic |
| `INSTAGRAM_APP_ID` | Same as Facebook (Instagram uses FB app) |
| `INSTAGRAM_APP_SECRET` | Same as Facebook |
| `TIKTOK_CLIENT_KEY` | TikTok Developers → Your App → Basic Information |
| `TIKTOK_CLIENT_SECRET` | TikTok Developers → Your App → Basic Information |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys (optional) |

---

## 🚀 You're Live!

Once deployed, your social media scheduler will be available at:
- **https://hiquu.co** - Main site
- **https://www.hiquu.co** - WWW redirect (if configured)

**Support:**
- GitHub Issues: https://github.com/Local-Laundromat/social-media-scheduler/issues
- Railway Support: https://railway.app/help

---

**Generated:** 2026-04-05
**Last Updated:** 2026-04-05
**Version:** 1.0
