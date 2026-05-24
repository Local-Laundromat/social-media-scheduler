-- Migration: Add engagement tracking columns for Best Time to Post analytics
-- Created: 2026-05-24
-- Purpose: Add engagement metrics columns to posts table for analytics features

-- Add engagement tracking columns to posts table if they don't exist
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS engagement_rate DECIMAL(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shares_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impressions INTEGER DEFAULT 0;

-- Add index on scheduled_time and status for efficient best time queries
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_time_status
  ON posts(scheduled_time, status)
  WHERE status = 'posted';

-- Add index on user_id, status, and scheduled_time for user-specific analytics
CREATE INDEX IF NOT EXISTS idx_posts_user_analytics
  ON posts(user_id, status, scheduled_time)
  WHERE status = 'posted';

-- Add index on platform for platform-specific analytics
CREATE INDEX IF NOT EXISTS idx_posts_platform_analytics
  ON posts(platform, status, scheduled_time)
  WHERE status = 'posted';

-- Add comments for documentation
COMMENT ON COLUMN posts.engagement_rate IS 'Calculated engagement rate percentage (likes + comments + shares) / reach * 100';
COMMENT ON COLUMN posts.likes_count IS 'Total number of likes/reactions on the post';
COMMENT ON COLUMN posts.comments_count IS 'Total number of comments on the post';
COMMENT ON COLUMN posts.shares_count IS 'Total number of shares/retweets on the post';
COMMENT ON COLUMN posts.views_count IS 'Total number of views (for video content)';
COMMENT ON COLUMN posts.reach IS 'Number of unique users who saw the post';
COMMENT ON COLUMN posts.impressions IS 'Total number of times the post was displayed';
