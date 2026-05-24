-- Migration: Add engagement tracking columns for Best Time to Post analytics
-- Created: 2026-05-24
-- Purpose: Add engagement metrics columns to posts table for analytics features

-- Check if posts table exists first
DO $$
BEGIN
  -- Add engagement tracking columns to posts table if they don't exist
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'posts') THEN
    ALTER TABLE posts
      ADD COLUMN IF NOT EXISTS engagement_rate DECIMAL(5,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS shares_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS reach INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS impressions INTEGER DEFAULT 0;

    RAISE NOTICE 'Added engagement columns to posts table';
  ELSE
    RAISE NOTICE 'Posts table does not exist, skipping column additions';
  END IF;
END $$;

-- Add indexes only if they don't exist
DO $$
BEGIN
  -- Index on scheduled_time and status for efficient best time queries
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_posts_scheduled_time_status') THEN
    CREATE INDEX idx_posts_scheduled_time_status
      ON posts(scheduled_time, status)
      WHERE status = 'posted';
    RAISE NOTICE 'Created index idx_posts_scheduled_time_status';
  END IF;

  -- Index on user_id, status, and scheduled_time for user-specific analytics
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_posts_user_analytics') THEN
    CREATE INDEX idx_posts_user_analytics
      ON posts(user_id, status, scheduled_time)
      WHERE status = 'posted';
    RAISE NOTICE 'Created index idx_posts_user_analytics';
  END IF;

  -- Index on platform for platform-specific analytics
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_posts_platform_analytics') THEN
    CREATE INDEX idx_posts_platform_analytics
      ON posts(platform, status, scheduled_time)
      WHERE status = 'posted';
    RAISE NOTICE 'Created index idx_posts_platform_analytics';
  END IF;
END $$;

-- Add comments for documentation (safe to re-run)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'engagement_rate') THEN
    COMMENT ON COLUMN posts.engagement_rate IS 'Calculated engagement rate percentage (likes + comments + shares) / reach * 100';
    COMMENT ON COLUMN posts.likes_count IS 'Total number of likes/reactions on the post';
    COMMENT ON COLUMN posts.comments_count IS 'Total number of comments on the post';
    COMMENT ON COLUMN posts.shares_count IS 'Total number of shares/retweets on the post';
    COMMENT ON COLUMN posts.views_count IS 'Total number of views (for video content)';
    COMMENT ON COLUMN posts.reach IS 'Number of unique users who saw the post';
    COMMENT ON COLUMN posts.impressions IS 'Total number of times the post was displayed';
    RAISE NOTICE 'Added column comments';
  END IF;
END $$;
