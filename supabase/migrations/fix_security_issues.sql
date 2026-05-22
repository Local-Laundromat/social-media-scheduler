-- ============================================
-- FIX SUPABASE SECURITY LINTER ISSUES
-- Migration: Address security warnings from database linter
-- ============================================

-- ============================================
-- 1. FIX: Remove auth.users exposure from user_social_accounts view
-- ============================================
-- The original view joins auth.users which exposes sensitive auth data.
-- We'll recreate it without the auth.users join since we only use profiles data.

DROP VIEW IF EXISTS user_social_accounts;

CREATE OR REPLACE VIEW user_social_accounts
WITH (security_invoker = true)  -- Use SECURITY INVOKER instead of SECURITY DEFINER
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
-- Removed: LEFT JOIN auth.users au ON pr.id = au.id (this was exposing auth.users)
LEFT JOIN facebook_accounts fa ON pr.id = fa.user_id AND fa.is_active = true
LEFT JOIN instagram_accounts ia ON pr.id = ia.user_id AND ia.is_active = true
LEFT JOIN tiktok_accounts ta ON pr.id = ta.user_id AND ta.is_active = true
GROUP BY pr.id, pr.name, pr.email;

COMMENT ON VIEW user_social_accounts IS 'User social account summary without exposing auth.users table';

-- ============================================
-- 2. FIX: Convert SECURITY DEFINER views to SECURITY INVOKER
-- ============================================
-- SECURITY DEFINER runs with the permissions of the view creator (dangerous)
-- SECURITY INVOKER runs with the permissions of the querying user (safer)

-- Fix subscription_analytics view
DROP VIEW IF EXISTS subscription_analytics CASCADE;

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

-- Fix monthly_usage_report view
DROP VIEW IF EXISTS monthly_usage_report CASCADE;

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

-- Fix posts_with_accounts view
DROP VIEW IF EXISTS posts_with_accounts CASCADE;

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
    p.published_at,
    p.created_at,
    p.facebook_post_id,
    p.instagram_post_id,
    p.tiktok_post_id,
    pr.name as user_name,
    pr.email as user_email,
    pr.company
FROM posts p
JOIN profiles pr ON p.user_id = pr.id;

COMMENT ON VIEW posts_with_accounts IS 'Posts with associated user details using SECURITY INVOKER';

-- ============================================
-- 3. FIX: Enable RLS on public tables
-- ============================================

-- Enable RLS on config table
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for config table (service role only)
-- Config table should only be accessible by service role, not by users
DROP POLICY IF EXISTS "Service role can manage config" ON config;
CREATE POLICY "Service role can manage config" ON config
    FOR ALL
    USING (auth.role() = 'service_role');

COMMENT ON TABLE config IS 'Application configuration - service role access only';

-- Enable RLS on post_audit_log table
ALTER TABLE post_audit_log ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for post_audit_log
-- Users can view audit logs for their own posts
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

-- Service role can do everything
DROP POLICY IF EXISTS "Service role can manage audit logs" ON post_audit_log;
CREATE POLICY "Service role can manage audit logs" ON post_audit_log
    FOR ALL
    USING (auth.role() = 'service_role');

COMMENT ON TABLE post_audit_log IS 'Post publishing audit trail with RLS enabled';

-- ============================================
-- 4. GRANT APPROPRIATE PERMISSIONS
-- ============================================

-- Grant SELECT on views to authenticated users
GRANT SELECT ON user_social_accounts TO authenticated;
GRANT SELECT ON subscription_analytics TO authenticated;
GRANT SELECT ON monthly_usage_report TO authenticated;
GRANT SELECT ON posts_with_accounts TO authenticated;

-- Revoke public access to sensitive tables
REVOKE ALL ON config FROM anon;
REVOKE ALL ON config FROM authenticated;
REVOKE ALL ON post_audit_log FROM anon;

-- Grant appropriate access to authenticated users for audit logs
GRANT SELECT ON post_audit_log TO authenticated;

-- ============================================
-- 5. VERIFICATION
-- ============================================

-- You can verify the fixes by running:
-- SELECT * FROM pg_views WHERE schemaname = 'public' AND viewname IN ('user_social_accounts', 'subscription_analytics', 'monthly_usage_report', 'posts_with_accounts');
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('config', 'post_audit_log');
