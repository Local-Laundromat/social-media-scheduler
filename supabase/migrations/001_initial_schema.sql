-- Quu Social Media Scheduler - Supabase Database Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/nnvxkooiwyrlqbxhqxac/editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  company VARCHAR(255),
  api_key VARCHAR(255) UNIQUE DEFAULT uuid_generate_v4()::text,
  webhook_url TEXT,

  -- Facebook connection
  facebook_connected BOOLEAN DEFAULT FALSE,
  facebook_page_id VARCHAR(255),
  facebook_page_name VARCHAR(255),
  facebook_access_token TEXT,

  -- Instagram connection
  instagram_connected BOOLEAN DEFAULT FALSE,
  instagram_account_id VARCHAR(255),
  instagram_username VARCHAR(255),
  instagram_access_token TEXT,

  -- TikTok connection
  tiktok_connected BOOLEAN DEFAULT FALSE,
  tiktok_open_id VARCHAR(255),
  tiktok_access_token TEXT,
  tiktok_refresh_token TEXT,
  tiktok_username VARCHAR(255),
  tiktok_token_expires_at TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Posts table
CREATE TABLE IF NOT EXISTS posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- File information
  filename VARCHAR(255) NOT NULL,
  filepath TEXT NOT NULL,
  filetype VARCHAR(50) NOT NULL CHECK (filetype IN ('image', 'video')),

  -- Post content
  caption TEXT,
  platforms JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Scheduling
  scheduled_time TIMESTAMP,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'posted', 'failed')),

  -- Platform post IDs
  facebook_post_id VARCHAR(255),
  instagram_post_id VARCHAR(255),
  tiktok_post_id VARCHAR(255),

  -- Error tracking
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  posted_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_time ON posts(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at on users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies

-- Enable RLS on tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  USING (auth.uid()::text = api_key);

-- Users can update their own data
CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  USING (auth.uid()::text = api_key);

-- Users can read their own posts
CREATE POLICY "Users can read own posts"
  ON posts
  FOR SELECT
  USING (user_id IN (SELECT id FROM users WHERE api_key = auth.uid()::text));

-- Users can insert their own posts
CREATE POLICY "Users can insert own posts"
  ON posts
  FOR INSERT
  WITH CHECK (user_id IN (SELECT id FROM users WHERE api_key = auth.uid()::text));

-- Users can update their own posts
CREATE POLICY "Users can update own posts"
  ON posts
  FOR UPDATE
  USING (user_id IN (SELECT id FROM users WHERE api_key = auth.uid()::text));

-- Users can delete their own posts
CREATE POLICY "Users can delete own posts"
  ON posts
  FOR DELETE
  USING (user_id IN (SELECT id FROM users WHERE api_key = auth.uid()::text));

-- Create a view for analytics
CREATE OR REPLACE VIEW post_analytics AS
SELECT
  p.user_id,
  COUNT(*) as total_posts,
  COUNT(*) FILTER (WHERE status = 'posted') as posted_count,
  COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
  COUNT(*) FILTER (WHERE platforms::jsonb ? 'facebook') as facebook_posts,
  COUNT(*) FILTER (WHERE platforms::jsonb ? 'instagram') as instagram_posts,
  COUNT(*) FILTER (WHERE platforms::jsonb ? 'tiktok') as tiktok_posts,
  MIN(created_at) as first_post_date,
  MAX(created_at) as last_post_date
FROM posts p
GROUP BY p.user_id;

-- Grant access to the view
GRANT SELECT ON post_analytics TO authenticated;

COMMENT ON TABLE users IS 'User accounts and social media connections';
COMMENT ON TABLE posts IS 'Scheduled social media posts';
COMMENT ON VIEW post_analytics IS 'Analytics summary for user posts';
