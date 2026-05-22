-- ============================================
-- ADD ACCOUNT IDENTIFIERS FOR MULTI-ACCOUNT FILTERING
-- Allows filtering posts, comments, analytics by specific social media account
-- ============================================

-- ============================================
-- POSTS TABLE - Add account identifiers
-- ============================================
ALTER TABLE posts
ADD COLUMN IF NOT EXISTS facebook_page_id TEXT,
ADD COLUMN IF NOT EXISTS instagram_account_id TEXT,
ADD COLUMN IF NOT EXISTS tiktok_open_id TEXT,
ADD COLUMN IF NOT EXISTS pinterest_user_id TEXT,
ADD COLUMN IF NOT EXISTS youtube_channel_id TEXT,
ADD COLUMN IF NOT EXISTS google_business_location_id TEXT;

-- Add indexes for filtering by account
CREATE INDEX IF NOT EXISTS idx_posts_facebook_page_id ON posts(facebook_page_id);
CREATE INDEX IF NOT EXISTS idx_posts_instagram_account_id ON posts(instagram_account_id);
CREATE INDEX IF NOT EXISTS idx_posts_tiktok_open_id ON posts(tiktok_open_id);
CREATE INDEX IF NOT EXISTS idx_posts_pinterest_user_id ON posts(pinterest_user_id);
CREATE INDEX IF NOT EXISTS idx_posts_youtube_channel_id ON posts(youtube_channel_id);
CREATE INDEX IF NOT EXISTS idx_posts_google_business_location_id ON posts(google_business_location_id);

-- Composite indexes for common queries (user_id + account_id)
CREATE INDEX IF NOT EXISTS idx_posts_user_facebook ON posts(user_id, facebook_page_id) WHERE facebook_page_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_user_instagram ON posts(user_id, instagram_account_id) WHERE instagram_account_id IS NOT NULL;

-- ============================================
-- COMMENT_REPLIES TABLE - Add account identifiers
-- ============================================
ALTER TABLE comment_replies
ADD COLUMN IF NOT EXISTS facebook_page_id TEXT,
ADD COLUMN IF NOT EXISTS instagram_account_id TEXT;

-- Add indexes for filtering comments by account
CREATE INDEX IF NOT EXISTS idx_comment_replies_facebook_page ON comment_replies(facebook_page_id);
CREATE INDEX IF NOT EXISTS idx_comment_replies_instagram_account ON comment_replies(instagram_account_id);

-- Composite indexes
CREATE INDEX IF NOT EXISTS idx_comment_replies_user_facebook ON comment_replies(user_id, facebook_page_id) WHERE facebook_page_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comment_replies_user_instagram ON comment_replies(user_id, instagram_account_id) WHERE instagram_account_id IS NOT NULL;

-- ============================================
-- NOTES
-- ============================================
-- These columns allow filtering data by specific social media accounts
-- When a post is created, it will store the account IDs it was posted to
-- This enables:
-- 1. Global account switcher to filter posts/comments by specific account
-- 2. Analytics per account
-- 3. Multi-account management without data confusion
-- 4. Accurate attribution of posts to specific pages/accounts
