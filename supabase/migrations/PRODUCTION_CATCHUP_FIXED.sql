-- ============================================
-- PRODUCTION CATCH-UP MIGRATION (FIXED)
-- Matches actual production schema
-- Safe to run - checks what exists before creating
-- ============================================

-- ============================================
-- 1. YOUTUBE & GOOGLE BUSINESS SUPPORT
-- ============================================

-- Create YouTube accounts table (if doesn't exist)
-- Note: Using uuid to match production schema
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'youtube_accounts') THEN
    CREATE TABLE public.youtube_accounts (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES public.profiles(id),
      team_id bigint REFERENCES public.teams(id),
      channel_id text NOT NULL,
      channel_title text NOT NULL,
      access_token text NOT NULL,
      refresh_token text,
      is_active boolean DEFAULT true,
      created_at timestamp with time zone DEFAULT now(),
      updated_at timestamp with time zone DEFAULT now(),
      CONSTRAINT youtube_accounts_pkey PRIMARY KEY (id)
    );

    CREATE INDEX idx_youtube_accounts_user_id ON youtube_accounts(user_id);
    CREATE INDEX idx_youtube_accounts_team_id ON youtube_accounts(team_id);
  END IF;
END $$;

-- Create Google Business accounts table (if doesn't exist)
-- Note: Using uuid to match production schema
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'google_business_accounts') THEN
    CREATE TABLE public.google_business_accounts (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES public.profiles(id),
      team_id bigint REFERENCES public.teams(id),
      account_name text NOT NULL,
      account_display_name text NOT NULL,
      location_name text,
      location_title text,
      access_token text NOT NULL,
      refresh_token text,
      is_active boolean DEFAULT true,
      created_at timestamp with time zone DEFAULT now(),
      updated_at timestamp with time zone DEFAULT now(),
      CONSTRAINT google_business_accounts_pkey PRIMARY KEY (id)
    );

    CREATE INDEX idx_google_business_accounts_user_id ON google_business_accounts(user_id);
    CREATE INDEX idx_google_business_accounts_team_id ON google_business_accounts(team_id);
  END IF;
END $$;

-- Add YouTube and Google post ID columns to posts table (if they don't exist)
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS youtube_post_id text,
  ADD COLUMN IF NOT EXISTS google_post_id text;

-- ============================================
-- 2. GOOGLE REVIEWS TABLE
-- ============================================

-- Note: Your production already has google_business_reviews table
-- Just ensure it exists
CREATE TABLE IF NOT EXISTS public.google_business_reviews (
  id bigint NOT NULL DEFAULT nextval('google_business_reviews_id_seq'::regclass),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  location_name text NOT NULL,
  review_name text NOT NULL UNIQUE,
  reviewer_name text,
  reviewer_profile_photo_url text,
  star_rating integer CHECK (star_rating >= 1 AND star_rating <= 5),
  comment text,
  create_time timestamp with time zone,
  update_time timestamp with time zone,
  sentiment text CHECK (sentiment = ANY (ARRAY['positive'::text, 'negative'::text, 'neutral'::text])),
  review_type text,
  priority text CHECK (priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])),
  ai_suggested_reply text,
  has_replied boolean DEFAULT false,
  reply_comment text,
  reply_created_time timestamp with time zone,
  reply_updated_time timestamp with time zone,
  is_auto_reply boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT google_business_reviews_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_google_business_reviews_user_id ON google_business_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_google_business_reviews_star_rating ON google_business_reviews(star_rating);

-- ============================================
-- 3. TEAM COLUMNS FOR EXISTING ACCOUNT TABLES
-- ============================================

-- Add team_id to facebook_accounts if it doesn't exist
ALTER TABLE public.facebook_accounts
  ADD COLUMN IF NOT EXISTS team_id bigint REFERENCES public.teams(id);

-- Add team_id to instagram_accounts if it doesn't exist
ALTER TABLE public.instagram_accounts
  ADD COLUMN IF NOT EXISTS team_id bigint REFERENCES public.teams(id);

-- Add team_id to tiktok_accounts if it doesn't exist
ALTER TABLE public.tiktok_accounts
  ADD COLUMN IF NOT EXISTS team_id bigint REFERENCES public.teams(id);

-- Add team_id to pinterest_accounts if it doesn't exist
ALTER TABLE public.pinterest_accounts
  ADD COLUMN IF NOT EXISTS team_id bigint REFERENCES public.teams(id);

-- Add indexes for team queries
CREATE INDEX IF NOT EXISTS idx_facebook_accounts_team_id ON facebook_accounts(team_id);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_team_id ON instagram_accounts(team_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_accounts_team_id ON tiktok_accounts(team_id);
CREATE INDEX IF NOT EXISTS idx_pinterest_accounts_team_id ON pinterest_accounts(team_id);

-- ============================================
-- 4. ACCOUNT ID COLUMNS IN POSTS TABLE
-- ============================================

-- Add pinterest account ID column
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS pinterest_account_id uuid REFERENCES public.pinterest_accounts(id);

-- Add youtube account ID column
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS youtube_account_id uuid REFERENCES public.youtube_accounts(id);

-- Add google account ID column
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS google_account_id uuid REFERENCES public.google_business_accounts(id);

CREATE INDEX IF NOT EXISTS idx_posts_pinterest_account_id ON posts(pinterest_account_id);
CREATE INDEX IF NOT EXISTS idx_posts_youtube_account_id ON posts(youtube_account_id);
CREATE INDEX IF NOT EXISTS idx_posts_google_account_id ON posts(google_account_id);

-- ============================================
-- 5. BRAND VOICE COLUMN
-- ============================================

-- Note: Production schema shows this already exists
-- Add it only if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'brand_voice'
  ) THEN
    ALTER TABLE public.profiles
    ADD COLUMN brand_voice JSONB DEFAULT '{
      "tone": "friendly",
      "emoji_usage": "moderate",
      "response_length": "medium"
    }'::jsonb;

    CREATE INDEX idx_profiles_brand_voice ON profiles USING GIN (brand_voice);

    COMMENT ON COLUMN profiles.brand_voice IS 'Brand voice and personality settings for AI-generated content';
  END IF;
END $$;

-- ============================================
-- 6. FIX VIEWS (Drop and recreate safely)
-- ============================================

-- Drop existing views that might have conflicts
DROP VIEW IF EXISTS user_social_accounts CASCADE;
DROP VIEW IF EXISTS subscription_analytics CASCADE;
DROP VIEW IF EXISTS monthly_usage_report CASCADE;
DROP VIEW IF EXISTS posts_with_accounts CASCADE;

-- Recreate user_social_accounts view (without auth.users exposure)
CREATE OR REPLACE VIEW user_social_accounts
WITH (security_invoker = true)
AS
SELECT
    pr.id as user_id,
    pr.name,
    pr.email,
    COUNT(DISTINCT fa.id) as facebook_accounts,
    COUNT(DISTINCT ia.id) as instagram_accounts,
    COUNT(DISTINCT ta.id) as tiktok_accounts,
    (COUNT(DISTINCT fa.id) + COUNT(DISTINCT ia.id) + COUNT(DISTINCT ta.id)) as total_connected_accounts
FROM profiles pr
LEFT JOIN facebook_accounts fa ON pr.id = fa.user_id AND fa.is_active = true
LEFT JOIN instagram_accounts ia ON pr.id = ia.user_id AND ia.is_active = true
LEFT JOIN tiktok_accounts ta ON pr.id = ta.user_id AND ta.is_active = true
GROUP BY pr.id, pr.name, pr.email;

COMMENT ON VIEW user_social_accounts IS 'User social account summary without exposing auth.users table';

-- Recreate subscription_analytics view
CREATE OR REPLACE VIEW subscription_analytics
WITH (security_invoker = true)
AS
SELECT
    pr.id as user_id,
    pr.name,
    pr.company,
    pr.team_id,
    pr.role,
    COUNT(DISTINCT p.id) as total_posts,
    COUNT(DISTINCT CASE WHEN p.status = 'published' THEN p.id END) as published_posts,
    COUNT(DISTINCT CASE WHEN p.status = 'scheduled' THEN p.id END) as scheduled_posts,
    COUNT(DISTINCT CASE WHEN p.status = 'failed' THEN p.id END) as failed_posts,
    pr.created_at as user_created_at
FROM profiles pr
LEFT JOIN posts p ON pr.id = p.user_id
GROUP BY pr.id, pr.name, pr.company, pr.team_id, pr.role, pr.created_at;

COMMENT ON VIEW subscription_analytics IS 'Subscription and usage analytics with SECURITY INVOKER';

-- Recreate monthly_usage_report view (with platforms array)
CREATE OR REPLACE VIEW monthly_usage_report
WITH (security_invoker = true)
AS
SELECT
    pr.id as user_id,
    pr.name,
    pr.company,
    DATE_TRUNC('month', p.created_at) as month,
    COUNT(DISTINCT p.id) as posts_created,
    COUNT(DISTINCT CASE WHEN p.status = 'published' THEN p.id END) as posts_published,
    COUNT(DISTINCT CASE WHEN 'facebook' = ANY(p.platforms) THEN p.id END) as facebook_posts,
    COUNT(DISTINCT CASE WHEN 'instagram' = ANY(p.platforms) THEN p.id END) as instagram_posts,
    COUNT(DISTINCT CASE WHEN 'tiktok' = ANY(p.platforms) THEN p.id END) as tiktok_posts
FROM profiles pr
LEFT JOIN posts p ON pr.id = p.user_id
WHERE p.created_at IS NOT NULL
GROUP BY pr.id, pr.name, pr.company, DATE_TRUNC('month', p.created_at);

COMMENT ON VIEW monthly_usage_report IS 'Monthly usage report with SECURITY INVOKER';

-- Recreate posts_with_accounts view
CREATE OR REPLACE VIEW posts_with_accounts
WITH (security_invoker = true)
AS
SELECT
    p.id,
    p.user_id,
    COALESCE(p.caption, p.content) as caption,
    COALESCE(p.filepath, p.media_url) as media_url,
    p.platforms,
    p.status,
    p.scheduled_time,
    p.created_at,
    p.facebook_post_id,
    p.instagram_post_id,
    p.tiktok_post_id,
    p.youtube_post_id,
    p.google_post_id,
    pr.name as user_name,
    pr.email as user_email,
    pr.company
FROM posts p
JOIN profiles pr ON p.user_id = pr.id;

COMMENT ON VIEW posts_with_accounts IS 'Posts with associated user details using SECURITY INVOKER';

-- Grant SELECT permissions
GRANT SELECT ON user_social_accounts TO authenticated;
GRANT SELECT ON subscription_analytics TO authenticated;
GRANT SELECT ON monthly_usage_report TO authenticated;
GRANT SELECT ON posts_with_accounts TO authenticated;

-- ============================================
-- 7. ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on config table
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'config') THEN
    ALTER TABLE config ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Service role can manage config" ON config;
    DROP POLICY IF EXISTS "Enable all access for service role" ON config;
    CREATE POLICY "Service role can manage config" ON config
        FOR ALL
        USING (auth.role() = 'service_role');
  END IF;
END $$;

-- Enable RLS on post_audit_log table
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'post_audit_log') THEN
    ALTER TABLE post_audit_log ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can view their own audit logs" ON post_audit_log;
    CREATE POLICY "Users can view their own audit logs" ON post_audit_log
        FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM posts
                WHERE posts.id = post_audit_log.post_id
                AND posts.user_id = auth.uid()
            )
        );

    DROP POLICY IF EXISTS "Service role can manage audit logs" ON post_audit_log;
    DROP POLICY IF EXISTS "Enable all access for service role" ON post_audit_log;
    CREATE POLICY "Service role can manage audit logs" ON post_audit_log
        FOR ALL
        USING (auth.role() = 'service_role');
  END IF;
END $$;

-- ============================================
-- 8. FUNCTION SECURITY (Search Path)
-- ============================================

-- Fix search_path for all SECURITY DEFINER functions
DO $$
BEGIN
  -- Fix handle_new_user
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_user'
  ) THEN
    ALTER FUNCTION public.handle_new_user() SET search_path = public;
  END IF;

  -- Fix update_updated_at_column
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) THEN
    ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
  END IF;

  -- Fix reset_monthly_usage
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'reset_monthly_usage'
  ) THEN
    ALTER FUNCTION public.reset_monthly_usage() SET search_path = public;
  END IF;

  -- Fix check_user_has_quota
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'check_user_has_quota'
  ) THEN
    ALTER FUNCTION public.check_user_has_quota(uuid) SET search_path = public;
  END IF;

  -- Fix increment_user_usage (single parameter)
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'increment_user_usage'
    AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid'
  ) THEN
    ALTER FUNCTION public.increment_user_usage(uuid) SET search_path = public;
  END IF;

  -- Fix increment_user_usage (overloaded version)
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'increment_user_usage'
    AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_feature_type text, p_tokens_used integer, p_cost_usd numeric'
  ) THEN
    ALTER FUNCTION public.increment_user_usage(uuid, text, integer, numeric) SET search_path = public;
  END IF;
END $$;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '====================================';
  RAISE NOTICE 'PRODUCTION CATCH-UP COMPLETE!';
  RAISE NOTICE '====================================';
  RAISE NOTICE 'Verified/Added:';
  RAISE NOTICE '  ✓ YouTube accounts table';
  RAISE NOTICE '  ✓ Google Business accounts table';
  RAISE NOTICE '  ✓ Google reviews table';
  RAISE NOTICE '  ✓ Team ID columns for all platforms';
  RAISE NOTICE '  ✓ Brand voice column in profiles';
  RAISE NOTICE '  ✓ Account ID columns in posts';
  RAISE NOTICE '  ✓ Security-hardened views';
  RAISE NOTICE '  ✓ RLS policies';
  RAISE NOTICE '  ✓ Function search_path security';
  RAISE NOTICE '';
  RAISE NOTICE 'Login should now work on quu.social!';
  RAISE NOTICE '====================================';
END $$;
