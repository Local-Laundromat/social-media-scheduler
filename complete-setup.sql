-- Quu Social Media Scheduler - Complete Database Setup
-- Run this ONCE in your Supabase SQL Editor to set up everything
-- This combines: setup-supabase-db.sql + add-teams-support.sql + add-password-reset.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  external_user_id TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
  name TEXT,
  company TEXT,
  app_name TEXT,
  facebook_page_token TEXT,
  facebook_page_id TEXT,
  facebook_page_name TEXT,
  instagram_token TEXT,
  instagram_account_id TEXT,
  instagram_username TEXT,
  facebook_connected BOOLEAN DEFAULT FALSE,
  instagram_connected BOOLEAN DEFAULT FALSE,
  tiktok_connected BOOLEAN DEFAULT FALSE,
  tiktok_access_token TEXT,
  tiktok_username TEXT,
  api_key TEXT UNIQUE,
  webhook_url TEXT,
  auto_reply_enabled BOOLEAN DEFAULT FALSE,
  openai_api_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  facebook_page_token TEXT,
  facebook_page_id TEXT,
  instagram_token TEXT,
  instagram_account_id TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Posts table
CREATE TABLE IF NOT EXISTS posts (
  id BIGSERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  filetype TEXT NOT NULL,
  caption TEXT,
  platforms TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  scheduled_time TIMESTAMPTZ,
  posted_time TIMESTAMPTZ,
  facebook_post_id TEXT,
  instagram_post_id TEXT,
  tiktok_post_id TEXT,
  error_message TEXT,
  account_id BIGINT REFERENCES accounts(id),
  user_id BIGINT REFERENCES users(id),
  api_key TEXT,
  webhook_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Config table
CREATE TABLE IF NOT EXISTS config (
  id BIGSERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Analytics table
CREATE TABLE IF NOT EXISTS analytics (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT REFERENCES posts(id),
  platform TEXT,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  api_key TEXT UNIQUE NOT NULL,
  account_id BIGINT REFERENCES accounts(id),
  webhook_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

-- Webhook Logs table
CREATE TABLE IF NOT EXISTS webhook_logs (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT REFERENCES posts(id),
  webhook_url TEXT,
  payload TEXT,
  status_code INTEGER,
  response TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comment Replies table
CREATE TABLE IF NOT EXISTS comment_replies (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  platform TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  comment_text TEXT,
  reply_text TEXT NOT NULL,
  reply_id TEXT,
  was_auto_reply BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create teams table
CREATE TABLE IF NOT EXISTS teams (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  created_by BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add team_id and role to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS team_id BIGINT REFERENCES teams(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member';

-- Add team_id to posts table
ALTER TABLE posts ADD COLUMN IF NOT EXISTS team_id BIGINT REFERENCES teams(id);

-- Add password reset fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_time ON posts(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key);
CREATE INDEX IF NOT EXISTS idx_analytics_post_id ON analytics(post_id);
CREATE INDEX IF NOT EXISTS idx_comment_replies_user_id ON comment_replies(user_id);
CREATE INDEX IF NOT EXISTS idx_users_team_id ON users(team_id);
CREATE INDEX IF NOT EXISTS idx_posts_team_id ON posts(team_id);
CREATE INDEX IF NOT EXISTS idx_teams_invite_code ON teams(invite_code);
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add trigger to accounts table
DROP TRIGGER IF EXISTS update_accounts_updated_at ON accounts;
CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add trigger to teams table
DROP TRIGGER IF EXISTS update_teams_updated_at ON teams;
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable all access for service role" ON users;
DROP POLICY IF EXISTS "Enable all access for service role" ON posts;
DROP POLICY IF EXISTS "Enable all access for service role" ON accounts;
DROP POLICY IF EXISTS "Enable all access for service role" ON analytics;
DROP POLICY IF EXISTS "Enable all access for service role" ON api_keys;
DROP POLICY IF EXISTS "Enable all access for service role" ON webhook_logs;
DROP POLICY IF EXISTS "Enable all access for service role" ON comment_replies;
DROP POLICY IF EXISTS "Enable all access for service role" ON teams;

-- Create RLS policies (allow service role full access)
CREATE POLICY "Enable all access for service role" ON users
  FOR ALL USING (true);

CREATE POLICY "Enable all access for service role" ON posts
  FOR ALL USING (true);

CREATE POLICY "Enable all access for service role" ON accounts
  FOR ALL USING (true);

CREATE POLICY "Enable all access for service role" ON analytics
  FOR ALL USING (true);

CREATE POLICY "Enable all access for service role" ON api_keys
  FOR ALL USING (true);

CREATE POLICY "Enable all access for service role" ON webhook_logs
  FOR ALL USING (true);

CREATE POLICY "Enable all access for service role" ON comment_replies
  FOR ALL USING (true);

CREATE POLICY "Enable all access for service role" ON teams
  FOR ALL USING (true);
