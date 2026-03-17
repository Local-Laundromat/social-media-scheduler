# Supabase Setup Instructions for Quu

## Your Supabase Project
**URL**: https://nnvxkooiwyrlqbxhqxac.supabase.co
**Dashboard**: https://supabase.com/dashboard/project/nnvxkooiwyrlqbxhqxac

---

## ✅ Step-by-Step Setup

### Step 1: Create Database Tables

1. **Open Supabase SQL Editor**
   - Go to: https://supabase.com/dashboard/project/nnvxkooiwyrlqbxhqxac/editor
   - Click "New Query"

2. **Run the Migration SQL**
   - Copy the contents of: `supabase/migrations/001_initial_schema.sql`
   - Paste into SQL Editor
   - Click "Run" (▶️ button)
   - Wait for "Success" message

**What this creates:**
- ✅ `users` table - User accounts and social connections
- ✅ `posts` table - Scheduled posts
- ✅ Indexes for fast queries
- ✅ Row Level Security (RLS) policies
- ✅ Auto-updating timestamps
- ✅ Analytics view

---

### Step 2: Create Storage Bucket

1. **Go to Storage**
   - Navigate to: https://supabase.com/dashboard/project/nnvxkooiwyrlqbxhqxac/storage/buckets

2. **Create New Bucket**
   - Click "New bucket"
   - Name: `quu-media`
   - Make bucket **PUBLIC** ✅ (required for Instagram)
   - Click "Create bucket"

3. **Set Storage Policies**
   - Go back to SQL Editor
   - Copy contents of: `supabase/storage_setup.sql`
   - Run the SQL
   - This allows users to upload and read files

**What this creates:**
- ✅ Public storage bucket for images/videos
- ✅ Upload permissions for authenticated users
- ✅ Public read access (Instagram requirement)

---

### Step 3: Get Your Credentials

#### 3.1 Database Connection String
1. Go to: https://supabase.com/dashboard/project/nnvxkooiwyrlqbxhqxac/settings/database
2. Scroll to "Connection string"
3. Select "URI" mode
4. Copy the full string (looks like):
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.nnvxkooiwyrlqbxhqxac.supabase.co:5432/postgres
   ```
5. **Replace `[YOUR-PASSWORD]` with your actual database password**

#### 3.2 API Keys
1. Go to: https://supabase.com/dashboard/project/nnvxkooiwyrlqbxhqxac/settings/api
2. Copy these keys:
   - **URL**: `https://nnvxkooiwyrlqbxhqxac.supabase.co`
   - **anon/public key**: (long string starting with `eyJ...`)
   - **service_role key**: (for admin operations - keep secret!)

---

### Step 4: Update Your .env File

Add these to your `.env` file:

```env
# Supabase Configuration
SUPABASE_URL=https://nnvxkooiwyrlqbxhqxac.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_KEY=your_service_key_here
SUPABASE_DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.nnvxkooiwyrlqbxhqxac.supabase.co:5432/postgres

# Database Mode
USE_POSTGRES=true
```

---

### Step 5: Verify Setup

1. **Check Tables Created**
   - Go to Table Editor: https://supabase.com/dashboard/project/nnvxkooiwyrlqbxhqxac/editor
   - You should see:
     - ✅ `users` table
     - ✅ `posts` table

2. **Check Storage Bucket**
   - Go to Storage: https://supabase.com/dashboard/project/nnvxkooiwyrlqbxhqxac/storage/buckets
   - You should see:
     - ✅ `quu-media` bucket (public)

3. **Test Connection**
   ```bash
   # From your project directory
   npm install pg @supabase/supabase-js
   node -e "const {createClient} = require('@supabase/supabase-js'); const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY); console.log('Connected!');"
   ```

---

## 📊 What You'll See in Supabase

### Table Editor View
```
users
├── id (int4)
├── email (varchar)
├── password (varchar)
├── name (varchar)
├── company (varchar)
├── api_key (varchar)
├── facebook_connected (bool)
├── instagram_connected (bool)
├── tiktok_connected (bool)
└── ... (other fields)

posts
├── id (int4)
├── user_id (int4) → users.id
├── filename (varchar)
├── filepath (text)
├── caption (text)
├── platforms (jsonb)
├── status (varchar)
└── ... (other fields)
```

### Storage View
```
quu-media/ (public bucket)
├── [user uploads will appear here]
└── [images and videos]
```

---

## 🔐 Security Notes

### Row Level Security (RLS)
Your database has RLS enabled, which means:
- ✅ Users can only see their own data
- ✅ Users can only modify their own posts
- ✅ API keys authenticate requests
- ✅ No unauthorized access possible

### Storage Security
- ✅ Anyone can read files (required for Instagram)
- ✅ Only authenticated users can upload
- ✅ Users can delete their own files

---

## 🧪 Testing Your Setup

### Test Database Connection
```bash
# Install dependencies
npm install pg @supabase/supabase-js

# Test connection
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL });
pool.query('SELECT NOW()', (err, res) => {
  if (err) console.error('Error:', err);
  else console.log('Connected! Server time:', res.rows[0].now);
  pool.end();
});
"
```

### Test Storage Upload
```bash
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
console.log('Supabase client created successfully!');
"
```

---

## 📝 Quick Reference

### Supabase Dashboard Links
- **Home**: https://supabase.com/dashboard/project/nnvxkooiwyrlqbxhqxac
- **SQL Editor**: https://supabase.com/dashboard/project/nnvxkooiwyrlqbxhqxac/editor
- **Table Editor**: https://supabase.com/dashboard/project/nnvxkooiwyrlqbxhqxac/editor
- **Storage**: https://supabase.com/dashboard/project/nnvxkooiwyrlqbxhqxac/storage/buckets
- **Settings → API**: https://supabase.com/dashboard/project/nnvxkooiwyrlqbxhqxac/settings/api
- **Settings → Database**: https://supabase.com/dashboard/project/nnvxkooiwyrlqbxhqxac/settings/database

### Commands
```bash
# Install Supabase dependencies
npm install pg @supabase/supabase-js

# Test database connection
psql "your_supabase_database_url"

# View tables
psql "your_supabase_database_url" -c "\dt"
```

---

## ❓ Troubleshooting

### "Permission denied for table users"
- RLS is enabled - you need to authenticate with API key
- Use service_role key for admin operations

### "Bucket not found: quu-media"
- Create the bucket in Supabase Storage dashboard
- Make sure it's set to PUBLIC

### "Connection refused"
- Check your DATABASE_URL is correct
- Verify your database password
- Ensure IP is allowed (Supabase allows all by default)

---

## ✅ Completion Checklist

- [ ] Ran `001_initial_schema.sql` in SQL Editor
- [ ] Created `quu-media` storage bucket (public)
- [ ] Ran `storage_setup.sql` for storage policies
- [ ] Copied database connection string to `.env`
- [ ] Copied API keys to `.env`
- [ ] Installed `pg` and `@supabase/supabase-js` packages
- [ ] Tested database connection
- [ ] Verified tables exist in Table Editor
- [ ] Verified storage bucket exists

---

**Once complete, you're ready to update the code to use Supabase!**

Next: I'll create the database adapter to make your app work with PostgreSQL.
