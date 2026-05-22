-- ============================================
-- FIX SUPABASE SECURITY WARNINGS
-- Migration: Address WARN-level security issues
-- ============================================

-- ============================================
-- 1. FIX: Function Search Path Mutable
-- ============================================
-- Functions should have a fixed search_path to prevent schema injection attacks
-- We'll recreate each function with SET search_path = public

-- Fix handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));
  RETURN new;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS 'Trigger function to create profile on user signup with fixed search_path';

-- Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_updated_at_column() IS 'Trigger function to update updated_at timestamp with fixed search_path';

-- Fix reset_monthly_usage function
CREATE OR REPLACE FUNCTION public.reset_monthly_usage()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET posts_this_month = 0,
      usage_reset_at = CURRENT_TIMESTAMP
  WHERE posts_this_month > 0;
END;
$$;

COMMENT ON FUNCTION public.reset_monthly_usage() IS 'Reset monthly usage counters with fixed search_path';

-- Fix check_user_has_quota function
CREATE OR REPLACE FUNCTION public.check_user_has_quota(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_posts_this_month integer;
  v_monthly_post_limit integer;
BEGIN
  SELECT posts_this_month, monthly_post_limit
  INTO v_posts_this_month, v_monthly_post_limit
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_monthly_post_limit IS NULL THEN
    RETURN true; -- No limit set
  END IF;

  RETURN v_posts_this_month < v_monthly_post_limit;
END;
$$;

COMMENT ON FUNCTION public.check_user_has_quota(uuid) IS 'Check if user has available quota with fixed search_path';

-- Fix increment_user_usage function
CREATE OR REPLACE FUNCTION public.increment_user_usage(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET posts_this_month = posts_this_month + 1
  WHERE id = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.increment_user_usage(uuid) IS 'Increment user usage counter with fixed search_path';

-- ============================================
-- 2. FIX: SECURITY DEFINER Function Exposure
-- ============================================
-- These functions should not be callable by anon/authenticated users via RPC

-- Revoke EXECUTE permissions from anon and authenticated roles on trigger functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public;

-- Grant EXECUTE only to postgres (for trigger execution)
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;

COMMENT ON FUNCTION public.handle_new_user() IS 'Trigger-only function - not callable via RPC';

-- Revoke public access from usage tracking functions
-- These should only be called by the service role, not by clients
REVOKE EXECUTE ON FUNCTION public.check_user_has_quota(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_user_has_quota(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.check_user_has_quota(uuid) FROM public;

REVOKE EXECUTE ON FUNCTION public.increment_user_usage(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_user_usage(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_user_usage(uuid) FROM public;

REVOKE EXECUTE ON FUNCTION public.reset_monthly_usage() FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_monthly_usage() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_monthly_usage() FROM public;

-- Grant EXECUTE only to service role (server-side only)
GRANT EXECUTE ON FUNCTION public.check_user_has_quota(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_user_usage(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_monthly_usage() TO service_role;

COMMENT ON FUNCTION public.check_user_has_quota(uuid) IS 'Service role only - check user quota';
COMMENT ON FUNCTION public.increment_user_usage(uuid) IS 'Service role only - increment usage counter';
COMMENT ON FUNCTION public.reset_monthly_usage() IS 'Service role only - reset monthly counters';

-- ============================================
-- 3. FIX: Overly Permissive RLS Policies
-- ============================================
-- Replace USING (true) policies with proper role-based checks
-- These policies should check for service_role specifically

-- Note: The existing policies use USING (true) which is detected by the linter.
-- However, these are intentionally permissive for service role access.
-- The proper fix is to use auth.role() checks instead of USING (true)

-- Fix accounts table policy
DROP POLICY IF EXISTS "Enable all access for service role" ON accounts;
CREATE POLICY "Service role full access" ON accounts
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Fix analytics table policy
DROP POLICY IF EXISTS "Enable all access for service role" ON analytics;
CREATE POLICY "Service role full access" ON analytics
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Fix api_keys table policy
DROP POLICY IF EXISTS "Enable all access for service role" ON api_keys;
CREATE POLICY "Service role full access" ON api_keys
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Fix comment_replies table policy
DROP POLICY IF EXISTS "Enable all access for service role" ON comment_replies;
CREATE POLICY "Service role full access" ON comment_replies
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Fix teams table policy
DROP POLICY IF EXISTS "Enable all access for service role" ON teams;
CREATE POLICY "Service role full access" ON teams
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Fix webhook_logs table policy
DROP POLICY IF EXISTS "Enable all access for service role" ON webhook_logs;
CREATE POLICY "Service role full access" ON webhook_logs
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- 4. FIX: Storage Bucket Policies
-- ============================================
-- The quu-media bucket has overly broad SELECT policies
-- We'll recreate them to be more specific

-- Note: Storage policies are managed separately via Supabase dashboard
-- This is documented here for reference but must be applied manually:

-- MANUAL ACTION REQUIRED:
-- Go to Storage > quu-media > Policies in Supabase dashboard
--
-- Replace the broad SELECT policies with:
--
-- Policy: "Public can read media files"
-- Operation: SELECT
-- Policy definition:
--   (bucket_id = 'quu-media'::text)
--
-- This still allows public access but doesn't expose the listing functionality
-- Users can access files directly via URL but can't enumerate all files

-- ============================================
-- 5. NOTES: Manual Configuration Required
-- ============================================

-- AUTH LEAKED PASSWORD PROTECTION:
-- This must be enabled in Supabase dashboard under:
-- Authentication > Settings > Password Protection
-- Enable "Leaked Password Protection"

-- STORAGE BUCKET POLICIES:
-- Must be updated manually in Supabase dashboard under:
-- Storage > quu-media > Policies
-- Remove or restrict the broad SELECT policies

-- ============================================
-- 6. VERIFICATION
-- ============================================

-- Verify function search paths
SELECT
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as arguments,
    p.prosecdef as is_security_definer,
    p.proconfig as search_path_config
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname IN ('handle_new_user', 'update_updated_at_column', 'reset_monthly_usage',
                  'check_user_has_quota', 'increment_user_usage');

-- Verify RLS policies no longer use USING (true)
SELECT
    schemaname,
    tablename,
    policyname,
    qual as using_clause,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('accounts', 'analytics', 'api_keys', 'comment_replies', 'teams', 'webhook_logs')
ORDER BY tablename, policyname;
