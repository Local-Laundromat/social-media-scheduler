# Deploy Quu to Supabase (Edge Functions + PostgreSQL)

## Your Supabase Project
**URL**: https://nnvxkooiwyrlqbxhqxac.supabase.co

---

## 🎯 Deployment Strategy

Supabase is excellent for Quu! Here's how we'll use it:

### Option A: Supabase as Database + Railway as Server (Recommended)
- ✅ **Supabase**: PostgreSQL database (replace SQLite)
- ✅ **Railway/Render**: Node.js server hosting
- ✅ **Supabase Storage**: Media file uploads

### Option B: Full Supabase (Edge Functions)
- ✅ **Supabase Edge Functions**: Serverless backend
- ✅ **Supabase Database**: PostgreSQL
- ✅ **Supabase Storage**: Media files
- ⚠️ Requires code refactoring (more complex)

**Recommendation: Use Option A** (Supabase DB + Railway Server)

---

## 🚀 Quick Setup: Supabase + Railway

### Step 1: Migrate SQLite to PostgreSQL

#### 1.1 Get Supabase Connection String
1. Go to https://supabase.com/dashboard/project/nnvxkooiwyrlqbxhqxac
2. Settings → Database → Connection String
3. Copy the URI (looks like):
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.nnvxkooiwyrlqbxhqxac.supabase.co:5432/postgres
   ```

#### 1.2 Install PostgreSQL Driver
```bash
cd ~/Downloads/social-media-scheduler
npm install pg
```

#### 1.3 Update Database Connection
I'll create a new database adapter that works with both SQLite and PostgreSQL.

---

## 📝 Database Migration Script

Let me create the PostgreSQL schema for your Supabase database:

### SQL Schema for Supabase
Run this in Supabase SQL Editor:

```sql
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  company VARCHAR(255),
  api_key VARCHAR(255) UNIQUE,
  webhook_url TEXT,
  facebook_connected BOOLEAN DEFAULT FALSE,
  facebook_page_id VARCHAR(255),
  facebook_page_name VARCHAR(255),
  facebook_access_token TEXT,
  instagram_connected BOOLEAN DEFAULT FALSE,
  instagram_account_id VARCHAR(255),
  instagram_username VARCHAR(255),
  instagram_access_token TEXT,
  tiktok_connected BOOLEAN DEFAULT FALSE,
  tiktok_open_id VARCHAR(255),
  tiktok_access_token TEXT,
  tiktok_refresh_token TEXT,
  tiktok_username VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Posts table
CREATE TABLE IF NOT EXISTS posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  filepath TEXT NOT NULL,
  filetype VARCHAR(50) NOT NULL,
  caption TEXT,
  platforms JSONB NOT NULL,
  scheduled_time TIMESTAMP,
  status VARCHAR(50) DEFAULT 'pending',
  facebook_post_id VARCHAR(255),
  instagram_post_id VARCHAR(255),
  tiktok_post_id VARCHAR(255),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  posted_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_time ON posts(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

## 🔧 Code Updates for PostgreSQL

### 1. Update Database Connection

Create: `src/database/supabase.js`
```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Test connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection error:', err);
  } else {
    console.log('✅ Connected to Supabase PostgreSQL');
  }
});

module.exports = pool;
```

### 2. Update .env with Supabase
Add to your `.env`:
```env
# Supabase Configuration
SUPABASE_URL=https://nnvxkooiwyrlqbxhqxac.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_DATABASE_URL=postgresql://postgres:[PASSWORD]@db.nnvxkooiwyrlqbxhqxac.supabase.co:5432/postgres

# Use PostgreSQL instead of SQLite
USE_POSTGRES=true
```

---

## 📦 Supabase Storage for Media Files

### Setup Storage Bucket
1. Go to Supabase Dashboard → Storage
2. Create new bucket: `quu-media`
3. Make it public (for Instagram compatibility)

### Install Supabase Client
```bash
npm install @supabase/supabase-js
```

### Update Upload Route
```javascript
// src/routes/upload.js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

router.post('/', authenticateToken, upload.single('file'), async (req, res) => {
  const file = req.file;
  const fileName = `${Date.now()}-${file.originalname}`;

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from('quu-media')
    .upload(fileName, file.buffer, {
      contentType: file.mimetype,
      cacheControl: '3600'
    });

  if (error) {
    return res.status(500).json({ error: 'Upload failed' });
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('quu-media')
    .getPublicUrl(fileName);

  res.json({
    success: true,
    filename: fileName,
    url: publicUrl,
    path: publicUrl,
    mimetype: file.mimetype
  });
});
```

---

## 🚂 Deploy to Railway with Supabase

### Step 1: Update Environment Variables
In Railway, add:
```env
SUPABASE_URL=https://nnvxkooiwyrlqbxhqxac.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_DATABASE_URL=your_postgres_connection_string
USE_POSTGRES=true
NODE_ENV=production
```

### Step 2: Deploy
```bash
# Commit changes
git add .
git commit -m "Add Supabase PostgreSQL support"
git push origin main

# Railway auto-deploys from GitHub
```

### Step 3: Run Database Migration
In Supabase SQL Editor, run the schema SQL from above.

---

## 🔑 Get Your Supabase Credentials

### 1. Anon Key
1. Supabase Dashboard → Settings → API
2. Copy `anon` `public` key
3. Add to `.env`: `SUPABASE_ANON_KEY=...`

### 2. Database URL
1. Supabase Dashboard → Settings → Database
2. Copy Connection String (URI format)
3. Replace `[YOUR-PASSWORD]` with your database password
4. Add to `.env`: `SUPABASE_DATABASE_URL=...`

### 3. Service Role Key (if needed)
1. Supabase Dashboard → Settings → API
2. Copy `service_role` `secret` key (for admin operations)

---

## 🎨 Architecture Overview

```
┌─────────────────────────────────────────────┐
│                  Users                       │
│         (Browser/Mobile App)                 │
└─────────────┬───────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│           Railway/Render Server              │
│         (Node.js/Express Backend)            │
│                                              │
│  - Authentication (JWT)                      │
│  - Post scheduling logic                     │
│  - OAuth (Facebook/Instagram/TikTok)         │
│  - AI caption generation (OpenAI)            │
└──┬─────────────────┬────────────────────┬───┘
   │                 │                    │
   ▼                 ▼                    ▼
┌──────────┐  ┌──────────────┐  ┌────────────────┐
│ Supabase │  │   Supabase   │  │    Social      │
│PostgreSQL│  │   Storage    │  │   Platforms    │
│          │  │              │  │                │
│  Users   │  │ quu-media/   │  │  Facebook      │
│  Posts   │  │  images/     │  │  Instagram     │
│          │  │  videos/     │  │  TikTok        │
└──────────┘  └──────────────┘  └────────────────┘
```

---

## ✅ Migration Checklist

- [ ] Create Supabase account (if not done)
- [ ] Get Supabase connection credentials
- [ ] Run SQL schema in Supabase SQL Editor
- [ ] Install `pg` and `@supabase/supabase-js` packages
- [ ] Update database connection to use PostgreSQL
- [ ] Create Supabase Storage bucket for media
- [ ] Update upload route to use Supabase Storage
- [ ] Add Supabase env vars to Railway
- [ ] Deploy to Railway
- [ ] Test OAuth flows with production URLs
- [ ] Migrate existing SQLite data (if any)

---

## 🔄 Migrate Existing Data (Optional)

If you have existing SQLite data to migrate:

```bash
# Export from SQLite
sqlite3 data/scheduler.db .dump > backup.sql

# Convert and import to PostgreSQL
# (Manual conversion needed for syntax differences)
```

---

## 💰 Cost Breakdown

### Free Tier (Perfect for Starting)
- **Supabase**: FREE
  - 500 MB database
  - 1 GB file storage
  - 50 MB file uploads
  - 2 GB bandwidth

- **Railway**: FREE
  - $5/month credit
  - Enough for ~100-500 users

**Total: $0-5/month**

### When You Scale
- **Supabase Pro**: $25/month (8 GB database, 100 GB storage)
- **Railway Pro**: $20/month (unlimited usage)

---

## 🚀 Quick Start Commands

```bash
# 1. Install dependencies
npm install pg @supabase/supabase-js

# 2. Create Supabase database adapter
# (I'll create this file for you)

# 3. Update .env with Supabase credentials
echo "SUPABASE_URL=https://nnvxkooiwyrlqbxhqxac.supabase.co" >> .env
echo "SUPABASE_ANON_KEY=your_key_here" >> .env
echo "SUPABASE_DATABASE_URL=your_postgres_url" >> .env

# 4. Test locally
npm start

# 5. Deploy to Railway
git add .
git commit -m "Add Supabase integration"
git push origin main
```

---

## 📞 Next Steps

**Want me to:**
1. ✅ Create the PostgreSQL database adapter?
2. ✅ Update the code to support Supabase?
3. ✅ Set up Supabase Storage integration?
4. ✅ Create migration script for SQLite → PostgreSQL?

Let me know and I'll implement it now!

---

## 🔗 Useful Links

- **Your Supabase Dashboard**: https://supabase.com/dashboard/project/nnvxkooiwyrlqbxhqxac
- **Supabase Docs**: https://supabase.com/docs
- **Railway**: https://railway.app
- **GitHub Repo**: https://github.com/Local-Laundromat/social-media-scheduler
