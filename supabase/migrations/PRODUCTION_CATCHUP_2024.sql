-- ============================================
-- PRODUCTION CATCH-UP MIGRATION
-- Safe migration that checks what exists before creating
-- Run this once to bring production up to date with local
-- ============================================

-- ============================================
-- 1. YOUTUBE & GOOGLE BUSINESS SUPPORT
-- ============================================

-- Create YouTube accounts table
CREATE TABLE IF NOT EXISTS public.youtube_accounts (
  id serial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id bigint REFERENCES public.teams(id),
  channel_id text NOT NULL UNIQUE,
  channel_title text,
  refresh_token text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_youtube_accounts_user_id ON youtube_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_youtube_accounts_team_id ON youtube_accounts(team_id);

-- Create Google Business accounts table
CREATE TABLE IF NOT EXISTS public.google_business_accounts (
  id serial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id bigint REFERENCES public.teams(id),
  account_name text NOT NULL,
  account_display_name text,
  location_name text,
  location_title text,
  refresh_token text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_business_accounts_user_id ON google_business_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_google_business_accounts_team_id ON google_business_accounts(team_id);

-- Add YouTube and Google post ID columns to posts table
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS youtube_post_id text,
  ADD COLUMN IF NOT EXISTS google_post_id text;

-- ============================================
-- 2. GOOGLE REVIEWS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.google_reviews (
  id bigserial PRIMARY KEY,
  google_business_account_id integer NOT NULL REFERENCES public.google_business_accounts(id) ON DELETE CASCADE,
  review_id text NOT NULL UNIQUE,
  reviewer_name text,
  reviewer_photo_url text,
  star_rating integer,
  comment text,
  review_reply_comment text,
  review_reply_timestamp timestamp with time zone,
  create_time timestamp with time zone,
  update_time timestamp with time zone,
  ai_sentiment text,
  ai_category text,
  ai_priority text,
  ai_suggested_reply jsonb,
  auto_reply_enabled boolean DEFAULT false,
  needs_review boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_reviews_account ON google_reviews(google_business_account_id);
CREATE INDEX IF NOT EXISTS idx_google_reviews_rating ON google_reviews(star_rating);
CREATE INDEX IF NOT EXISTS idx_google_reviews_needs_review ON google_reviews(needs_review);

-- ============================================
-- 3. ACCOUNT IDENTIFIERS
-- ============================================

-- Add account identifier columns to existing tables
ALTER TABLE public.facebook_accounts
  ADD COLUMN IF NOT EXISTS team_id bigint REFERENCES public.teams(id);

ALTER TABLE public.instagram_accounts
  ADD COLUMN IF NOT EXISTS team_id bigint REFERENCES public.teams(id);

ALTER TABLE public.tiktok_accounts
  ADD COLUMN IF NOT EXISTS team_id bigint REFERENCES public.teams(id);

ALTER TABLE public.pinterest_accounts
  ADD COLUMN IF NOT EXISTS team_id bigint REFERENCES public.teams(id);

-- Add indexes for team queries
CREATE INDEX IF NOT EXISTS idx_facebook_accounts_team_id ON facebook_accounts(team_id);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_team_id ON instagram_accounts(team_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_accounts_team_id ON tiktok_accounts(team_id);
CREATE INDEX IF NOT EXISTS idx_pinterest_accounts_team_id ON pinterest_accounts(team_id);

-- Add account ID columns to posts table
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS pinterest_account_id integer REFERENCES public.pinterest_accounts(id),
  ADD COLUMN IF NOT EXISTS youtube_account_id integer REFERENCES public.youtube_accounts(id),
  ADD COLUMN IF NOT EXISTS google_account_id integer REFERENCES public.google_business_accounts(id);

CREATE INDEX IF NOT EXISTS idx_posts_pinterest_account_id ON posts(pinterest_account_id);
CREATE INDEX IF NOT EXISTS idx_posts_youtube_account_id ON posts(youtube_account_id);
CREATE INDEX IF NOT EXISTS idx_posts_google_account_id ON posts(google_account_id);

-- ============================================
-- 4. BRAND VOICE COLUMN
-- ============================================

-- Add brand_voice JSONB column to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS brand_voice JSONB DEFAULT '{
  "tone": "friendly",
  "emoji_usage": "moderate",
  "response_length": "medium"
}'::jsonb;

-- Add index for brand_voice queries (optional, for performance)
CREATE INDEX IF NOT EXISTS idx_profiles_brand_voice ON profiles USING GIN (brand_voice);

COMMENT ON COLUMN profiles.brand_voice IS 'Brand voice and personality settings for AI-generated content. Includes tone, emoji_usage, response_length, custom_description, contact_email, contact_phone';

-- ============================================
-- 5. FIX VIEWS (Drop and recreate to avoid conflicts)
-- ============================================

-- Drop existing views that might conflict
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

-- Recreate posts_with_accounts view
CREATE OR REPLACE VIEW posts_with_accounts
WITH (security_invoker = true)
AS
SELECT
    p.id,
    p.user_id,
    p.caption,
    p.media_url,
    p.platforms,
    p.status,
    p.scheduled_time,
    p.created_at,
    p.facebook_post_id,
    p.instagram_post_id,
    p.tiktok_post_id,
    pr.name as user_name,
    pr.email as user_email,
    pr.company
FROM posts p
JOIN profiles pr ON p.user_id = pr.id;

-- Grant SELECT permissions to authenticated users
GRANT SELECT ON user_social_accounts TO authenticated;
GRANT SELECT ON subscription_analytics TO authenticated;
GRANT SELECT ON monthly_usage_report TO authenticated;
GRANT SELECT ON posts_with_accounts TO authenticated;

-- ============================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on config table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'config') THEN
    ALTER TABLE config ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Service role can manage config" ON config;
    CREATE POLICY "Service role can manage config" ON config
        FOR ALL
        USING (auth.role() = 'service_role');
  END IF;
END $$;

-- Enable RLS on post_audit_log table if it exists
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
    CREATE POLICY "Service role can manage audit logs" ON post_audit_log
        FOR ALL
        USING (auth.role() = 'service_role');
  END IF;
END $$;

-- ============================================
-- 7. FUNCTION SECURITY (Search Path)
-- ============================================

-- Fix search_path for all SECURITY DEFINER functions
DO $$
BEGIN
  -- Fix handle_new_user if it exists
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_user'
  ) THEN
    ALTER FUNCTION public.handle_new_user() SET search_path = public;
  END IF;

  -- Fix update_updated_at_column if it exists
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) THEN
    ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
  END IF;

  -- Fix reset_monthly_usage if it exists
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'reset_monthly_usage'
  ) THEN
    ALTER FUNCTION public.reset_monthly_usage() SET search_path = public;
  END IF;

  -- Fix check_user_has_quota if it exists
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'check_user_has_quota'
  ) THEN
    ALTER FUNCTION public.check_user_has_quota(uuid) SET search_path = public;
  END IF;

  -- Fix increment_user_usage (single parameter) if it exists
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'increment_user_usage'
    AND pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid'
  ) THEN
    ALTER FUNCTION public.increment_user_usage(uuid) SET search_path = public;
  END IF;

  -- Fix increment_user_usage (overloaded version) if it exists
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
  RAISE NOTICE 'Added:';
  RAISE NOTICE '  ✓ YouTube accounts support';
  RAISE NOTICE '  ✓ Google Business accounts support';
  RAISE NOTICE '  ✓ Google reviews table';
  RAISE NOTICE '  ✓ Team ID columns for all account tables';
  RAISE NOTICE '  ✓ Brand voice settings in profiles';
  RAISE NOTICE '  ✓ Security fixes for views (SECURITY INVOKER)';
  RAISE NOTICE '  ✓ RLS policies on config and audit tables';
  RAISE NOTICE '  ✓ Function search_path security';
  RAISE NOTICE '';
  RAISE NOTICE 'Your production database is now in sync!';
  RAISE NOTICE '====================================';
END $$;
