# Supabase Migration Guide - AI Features

## Quick Setup (3 minutes)

### Step 1: Open Supabase SQL Editor

1. Go to **https://supabase.com/dashboard**
2. Select your project: `nnvxkooiwyrlqbxhqxac`
3. Click **SQL Editor** in the left sidebar
4. Click **New Query**

### Step 2: Run the Migration

Copy and paste the entire contents of this file into the SQL editor:

```
migrations/add-ai-features-support.sql
```

**Or run this command:**

1. Open the file: `migrations/add-ai-features-support.sql`
2. Copy all the SQL (Cmd+A, Cmd+C)
3. Paste into Supabase SQL Editor
4. Click **Run** button (or press Cmd+Enter)

### Step 3: Verify Success

You should see these success messages:

```
✅ Posts table: All AI columns added successfully
✅ Profiles table: All AI columns added successfully

╔════════════════════════════════════════════╗
║   AI Features Migration Complete! ✅      ║
╚════════════════════════════════════════════╝
```

### Step 4: Verify Columns Were Added

Run this verification query in SQL Editor:

```sql
-- Check posts table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'posts'
  AND column_name IN ('ai_generated', 'metadata', 'post_type')
ORDER BY column_name;

-- Check profiles table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name IN ('openai_api_key', 'company')
ORDER BY column_name;
```

**Expected Output:**

```
posts table:
  ai_generated  | boolean | YES
  metadata      | jsonb   | YES
  post_type     | text    | YES

profiles table:
  company         | text | YES
  openai_api_key  | text | YES
```

## What This Migration Adds

### Posts Table Columns:

1. **`ai_generated`** (boolean)
   - Tracks if post was created by AI agent
   - Default: `false`
   - Used by: Content Planning Agent, AI Comment Responder

2. **`metadata`** (jsonb)
   - Stores AI insights and context
   - Fields: `narrativeGroup`, `contentPillar`, `reasoning`, `sentiment`, etc.
   - Default: `{}`
   - Indexed with GIN for fast queries

3. **`post_type`** (text)
   - Post format: `post`, `story`, `reel`, `carousel`
   - Default: `post`

### Profiles Table Columns:

1. **`openai_api_key`** (text)
   - Per-user OpenAI API key
   - Falls back to system `.env` key if not set
   - Configurable in Settings tab

2. **`company`** (text)
   - Business name/niche for AI context
   - Used by Content Planning Agent for better targeting
   - Example: "real estate", "fitness coaching", "e-commerce"

### Indexes Created:

- `idx_posts_ai_generated` - Fast queries for AI posts
- `idx_posts_metadata` - JSONB queries (narrativeGroup, contentPillar)
- `idx_posts_post_type` - Filter by post type
- `idx_profiles_openai_key` - Users with custom API keys

## Features Enabled by This Migration

### ✅ 1. Autonomous Content Planning Agent
- 4-agent LangGraph system
- Analyzes bulk uploads
- Creates narrative story arcs
- Optimizes posting times
- Generates strategic content calendar

### ✅ 2. AI Comment Responder
- Multi-agent comment analysis
- Sentiment detection
- Auto-reply suggestions
- Priority classification

### ✅ 3. RAG-Powered Brand Voice
- ChromaDB vector storage
- Brand voice learning
- Context-aware captions

### ✅ 4. Per-User API Keys
- Each user can use their own OpenAI key
- No shared rate limits
- Better cost control

## Troubleshooting

### Error: "column already exists"
✅ **This is fine!** The migration uses `IF NOT EXISTS` - it's idempotent.

### Error: "permission denied"
⚠️ You need admin access. Contact your Supabase project owner.

### No success messages shown
Try running the verification queries manually (Step 4 above).

### Migration runs but columns not visible
1. Refresh your Supabase Table Editor
2. Check you're looking at the `public` schema
3. Run verification queries to confirm

## Rollback (if needed)

To remove the AI columns:

```sql
-- Remove posts columns
ALTER TABLE public.posts DROP COLUMN IF EXISTS ai_generated;
ALTER TABLE public.posts DROP COLUMN IF EXISTS metadata;
ALTER TABLE public.posts DROP COLUMN IF EXISTS post_type;

-- Remove profiles columns
ALTER TABLE public.profiles DROP COLUMN IF EXISTS openai_api_key;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS company;

-- Remove indexes
DROP INDEX IF EXISTS idx_posts_ai_generated;
DROP INDEX IF EXISTS idx_posts_metadata;
DROP INDEX IF EXISTS idx_posts_post_type;
DROP INDEX IF EXISTS idx_profiles_openai_key;
```

## After Migration

### 1. Configure OpenAI API Key

**Option A: System-wide (in .env)**
```bash
OPENAI_API_KEY=sk-proj-your-key-here
```

**Option B: Per-user (in UI)**
1. Go to http://localhost:3000/dashboard
2. Click **Settings** tab
3. Enter your OpenAI API key
4. Click **Save**

### 2. Test AI Features

**Test Content Planning Agent:**
1. Go to **Bulk Upload** tab
2. Upload 5-10 images
3. Click **Continue to Configuration**
4. Select platforms
5. Click **"✨ Generate Smart Plan"**
6. Review AI-generated calendar

**Test AI Comment Responder:**
1. Go to **Comments** tab
2. View monitored comments
3. See AI sentiment analysis
4. Review suggested replies

### 3. Monitor Usage

**Check AI-generated posts:**
```sql
SELECT COUNT(*) as ai_posts
FROM posts
WHERE ai_generated = true;
```

**View AI metadata:**
```sql
SELECT
  id,
  caption,
  metadata->>'narrativeGroup' as narrative_group,
  metadata->>'contentPillar' as content_pillar,
  metadata->>'reasoning' as ai_reasoning
FROM posts
WHERE ai_generated = true
LIMIT 10;
```

**Users with custom API keys:**
```sql
SELECT
  name,
  email,
  company,
  CASE
    WHEN openai_api_key IS NOT NULL THEN '✓ Configured'
    ELSE '✗ Using system key'
  END as api_key_status
FROM profiles;
```

## Support

If you encounter issues:

1. **Check migration was successful**: Run verification queries
2. **Check Supabase logs**: Go to Logs → Database in Supabase dashboard
3. **Check server logs**: Look for errors in terminal where `npm start` is running
4. **Re-run migration**: It's safe to run multiple times

## Summary

**What to run:**
```bash
# Copy this file to Supabase SQL Editor and run:
migrations/add-ai-features-support.sql
```

**Time required:** ~30 seconds

**Downtime:** None (columns added with IF NOT EXISTS)

**Safe to run multiple times:** Yes (idempotent)

**Ready to use after:** Immediately ✅
