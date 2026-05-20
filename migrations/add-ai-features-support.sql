-- ============================================
-- AI FEATURES SUPPORT MIGRATION
-- Adds required columns for LangGraph AI features
-- ============================================

-- ============================================
-- 1. ADD AI COLUMNS TO POSTS TABLE
-- ============================================

-- Add ai_generated flag to track AI-created posts
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS ai_generated boolean DEFAULT false;

-- Add metadata JSONB column for AI insights
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Add post_type column (if not exists)
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS post_type text DEFAULT 'post';

-- Add comments for documentation
COMMENT ON COLUMN posts.ai_generated IS 'True if post was created by AI agent (LangGraph)';
COMMENT ON COLUMN posts.metadata IS 'AI metadata: narrativeGroup, contentPillar, reasoning, sentiment, etc.';
COMMENT ON COLUMN posts.post_type IS 'Type: post, story, reel, carousel';

-- ============================================
-- 2. ADD OPENAI API KEY TO PROFILES
-- ============================================

-- Add per-user OpenAI API key
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS openai_api_key text;

-- Add company/niche field for better AI context
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company text;

-- Add comments
COMMENT ON COLUMN profiles.openai_api_key IS 'User-specific OpenAI API key for AI features. Falls back to system key if null.';
COMMENT ON COLUMN profiles.company IS 'User business name/niche for AI content planning context';

-- ============================================
-- 3. CREATE INDEXES FOR PERFORMANCE
-- ============================================

-- Index for AI-generated posts queries
CREATE INDEX IF NOT EXISTS idx_posts_ai_generated
  ON posts(ai_generated)
  WHERE ai_generated = true;

-- Index for metadata queries (GIN index for JSONB)
CREATE INDEX IF NOT EXISTS idx_posts_metadata
  ON posts USING GIN (metadata);

-- Index for post type
CREATE INDEX IF NOT EXISTS idx_posts_post_type
  ON posts(post_type);

-- Index for profiles with OpenAI keys
CREATE INDEX IF NOT EXISTS idx_profiles_openai_key
  ON profiles(id)
  WHERE openai_api_key IS NOT NULL;

-- ============================================
-- 4. UPDATE EXISTING POSTS (OPTIONAL)
-- ============================================

-- Set default values for existing posts
UPDATE public.posts
SET
  ai_generated = false,
  metadata = '{}'::jsonb,
  post_type = 'post'
WHERE ai_generated IS NULL;

-- ============================================
-- 5. VERIFICATION QUERIES
-- ============================================

-- Verify posts table columns
DO $$
DECLARE
  ai_gen_exists boolean;
  metadata_exists boolean;
  post_type_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'ai_generated'
  ) INTO ai_gen_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'metadata'
  ) INTO metadata_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'post_type'
  ) INTO post_type_exists;

  IF ai_gen_exists AND metadata_exists AND post_type_exists THEN
    RAISE NOTICE '✅ Posts table: All AI columns added successfully';
  ELSE
    RAISE WARNING '⚠️  Posts table: Some columns missing';
  END IF;
END $$;

-- Verify profiles table columns
DO $$
DECLARE
  openai_key_exists boolean;
  company_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'openai_api_key'
  ) INTO openai_key_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'company'
  ) INTO company_exists;

  IF openai_key_exists AND company_exists THEN
    RAISE NOTICE '✅ Profiles table: All AI columns added successfully';
  ELSE
    RAISE WARNING '⚠️  Profiles table: Some columns missing';
  END IF;
END $$;

-- ============================================
-- 6. SAMPLE DATA (for testing)
-- ============================================

-- Example: Update a test post with AI metadata
/*
UPDATE posts
SET
  ai_generated = true,
  metadata = jsonb_build_object(
    'narrativeGroup', 'Product Launch Week',
    'contentPillar', 'promotional',
    'reasoning', 'Opening post to establish premium positioning',
    'aiModel', 'gpt-4o-mini',
    'generatedAt', NOW()
  )
WHERE id = 'your-test-post-id';
*/

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '╔════════════════════════════════════════════╗';
  RAISE NOTICE '║   AI Features Migration Complete! ✅      ║';
  RAISE NOTICE '╚════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'Added columns:';
  RAISE NOTICE '  • posts.ai_generated (boolean)';
  RAISE NOTICE '  • posts.metadata (jsonb)';
  RAISE NOTICE '  • posts.post_type (text)';
  RAISE NOTICE '  • profiles.openai_api_key (text)';
  RAISE NOTICE '  • profiles.company (text)';
  RAISE NOTICE '';
  RAISE NOTICE 'Features now supported:';
  RAISE NOTICE '  ✓ Autonomous Content Planning Agent (LangGraph)';
  RAISE NOTICE '  ✓ AI Comment Responder (Multi-agent)';
  RAISE NOTICE '  ✓ RAG-powered Brand Voice Captions';
  RAISE NOTICE '  ✓ Per-user OpenAI API keys';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Users can add OpenAI API key in Settings tab';
  RAISE NOTICE '  2. Test AI Auto-Plan in Bulk Upload tab';
  RAISE NOTICE '  3. Test AI Comment Responder in Comments tab';
  RAISE NOTICE '';
END $$;
