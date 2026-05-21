-- ============================================
-- ENTERPRISE-READY PRODUCTION SCHEMA
-- Optimized for scale with proper indexes
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES TABLE
-- ============================================
-- Already exists, just add indexes
CREATE INDEX IF NOT EXISTS idx_profiles_team_id ON profiles(team_id);
CREATE INDEX IF NOT EXISTS idx_profiles_api_key ON profiles(api_key);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON profiles(created_at);

-- ============================================
-- TEAMS TABLE
-- ============================================
-- Already exists, just add indexes
CREATE INDEX IF NOT EXISTS idx_teams_invite_code ON teams(invite_code);
CREATE INDEX IF NOT EXISTS idx_teams_created_by ON teams(created_by);

-- ============================================
-- POSTS TABLE
-- ============================================
-- Already exists, just add indexes for performance
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_time ON posts(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_posts_user_status ON posts(user_id, status); -- Composite index

-- ============================================
-- FACEBOOK ACCOUNTS TABLE
-- ============================================
-- Already exists, just add indexes
CREATE INDEX IF NOT EXISTS idx_facebook_accounts_user_id ON facebook_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_facebook_accounts_page_id ON facebook_accounts(page_id);
CREATE INDEX IF NOT EXISTS idx_facebook_accounts_is_active ON facebook_accounts(is_active);

-- Add unique constraint to prevent duplicate page connections
CREATE UNIQUE INDEX IF NOT EXISTS idx_facebook_accounts_user_page
ON facebook_accounts(user_id, page_id);

-- ============================================
-- INSTAGRAM ACCOUNTS TABLE
-- ============================================
-- Already exists, just add indexes
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_user_id ON instagram_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_account_id ON instagram_accounts(account_id);
CREATE INDEX IF NOT EXISTS idx_instagram_accounts_is_active ON instagram_accounts(is_active);

-- Add unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_instagram_accounts_user_account
ON instagram_accounts(user_id, account_id);

-- ============================================
-- TIKTOK ACCOUNTS TABLE
-- ============================================
-- Already exists, just add indexes
CREATE INDEX IF NOT EXISTS idx_tiktok_accounts_user_id ON tiktok_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_accounts_open_id ON tiktok_accounts(open_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_accounts_is_active ON tiktok_accounts(is_active);

-- Add unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_tiktok_accounts_user_open
ON tiktok_accounts(user_id, open_id);

-- ============================================
-- COMMENT REPLIES TABLE
-- ============================================
-- Already exists, just add indexes
CREATE INDEX IF NOT EXISTS idx_comment_replies_user_id ON comment_replies(user_id);
CREATE INDEX IF NOT EXISTS idx_comment_replies_platform ON comment_replies(platform);
CREATE INDEX IF NOT EXISTS idx_comment_replies_created_at ON comment_replies(created_at);

-- ============================================
-- ACCOUNTS TABLE (for API key management)
-- ============================================
-- Already exists, just add indexes
CREATE INDEX IF NOT EXISTS idx_accounts_is_default ON accounts(is_default);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);

-- ============================================
-- API KEYS TABLE
-- ============================================
-- Already exists, just add indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_api_key ON api_keys(api_key);
CREATE INDEX IF NOT EXISTS idx_api_keys_account_id ON api_keys(account_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);

-- ============================================
-- ANALYTICS TABLE
-- ============================================
-- Already exists, just add indexes
CREATE INDEX IF NOT EXISTS idx_analytics_post_id ON analytics(post_id);
CREATE INDEX IF NOT EXISTS idx_analytics_platform ON analytics(platform);
CREATE INDEX IF NOT EXISTS idx_analytics_fetched_at ON analytics(fetched_at);

-- ============================================
-- WEBHOOK LOGS TABLE
-- ============================================
-- Already exists, just add indexes
CREATE INDEX IF NOT EXISTS idx_webhook_logs_post_id ON webhook_logs(post_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at);

-- ============================================
-- CONFIG TABLE
-- ============================================
-- Already exists, key column already has unique index

-- ============================================
-- ADD UPDATED_AT TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for tables with updated_at
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_teams_updated_at ON teams;
CREATE TRIGGER update_teams_updated_at
    BEFORE UPDATE ON teams
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_posts_updated_at ON posts;
CREATE TRIGGER update_posts_updated_at
    BEFORE UPDATE ON posts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_facebook_accounts_updated_at ON facebook_accounts;
CREATE TRIGGER update_facebook_accounts_updated_at
    BEFORE UPDATE ON facebook_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_instagram_accounts_updated_at ON instagram_accounts;
CREATE TRIGGER update_instagram_accounts_updated_at
    BEFORE UPDATE ON instagram_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tiktok_accounts_updated_at ON tiktok_accounts;
CREATE TRIGGER update_tiktok_accounts_updated_at
    BEFORE UPDATE ON tiktok_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_accounts_updated_at ON accounts;
CREATE TRIGGER update_accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- PERFORMANCE VIEWS (optional but helpful)
-- ============================================

-- View for active posts summary
CREATE OR REPLACE VIEW active_posts_summary AS
SELECT
    p.user_id,
    pr.name as user_name,
    COUNT(*) as total_posts,
    COUNT(*) FILTER (WHERE p.status = 'scheduled') as scheduled,
    COUNT(*) FILTER (WHERE p.status = 'posted') as posted,
    COUNT(*) FILTER (WHERE p.status = 'failed') as failed
FROM posts p
LEFT JOIN profiles pr ON p.user_id = pr.id
GROUP BY p.user_id, pr.name;

-- View for user social accounts
CREATE OR REPLACE VIEW user_social_accounts AS
SELECT
    pr.id as user_id,
    pr.name,
    pr.email,
    COUNT(DISTINCT fa.id) as facebook_accounts,
    COUNT(DISTINCT ia.id) as instagram_accounts,
    COUNT(DISTINCT ta.id) as tiktok_accounts,
    (COUNT(DISTINCT fa.id) + COUNT(DISTINCT ia.id) + COUNT(DISTINCT ta.id)) as total_connected_accounts
FROM profiles pr
LEFT JOIN auth.users au ON pr.id = au.id
LEFT JOIN facebook_accounts fa ON pr.id = fa.user_id AND fa.is_active = true
LEFT JOIN instagram_accounts ia ON pr.id = ia.user_id AND ia.is_active = true
LEFT JOIN tiktok_accounts ta ON pr.id = ta.user_id AND ta.is_active = true
GROUP BY pr.id, pr.name, pr.email;

-- ============================================
-- VACUUM AND ANALYZE
-- ============================================
-- Run this periodically for optimal performance
-- VACUUM ANALYZE profiles;
-- VACUUM ANALYZE teams;
-- VACUUM ANALYZE posts;
-- VACUUM ANALYZE facebook_accounts;
-- VACUUM ANALYZE instagram_accounts;
-- VACUUM ANALYZE tiktok_accounts;

-- ============================================
-- VERIFY INDEXES
-- ============================================
-- Use this query to check all indexes
/*
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
*/

-- ============================================
-- NOTES
-- ============================================
-- 1. All tables use proper foreign keys to auth.users (UUID)
-- 2. Indexes added for common query patterns
-- 3. Unique constraints prevent duplicate social account connections
-- 4. Updated_at triggers auto-update timestamps
-- 5. Views provide quick analytics access
-- 6. RLS policies already configured (from previous setup)
-- 7. Ready for millions of users and posts
