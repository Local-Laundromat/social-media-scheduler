-- Add YouTube and Google Business Profile support

-- YouTube Accounts Table
CREATE TABLE IF NOT EXISTS youtube_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id BIGINT REFERENCES teams(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  channel_title TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, channel_id)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_youtube_accounts_user_id ON youtube_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_youtube_accounts_team_id ON youtube_accounts(team_id);
CREATE INDEX IF NOT EXISTS idx_youtube_accounts_is_active ON youtube_accounts(is_active);

-- Row Level Security for YouTube Accounts
ALTER TABLE youtube_accounts ENABLE ROW LEVEL SECURITY;

-- Users can only see their own accounts
CREATE POLICY "Users can view their own YouTube accounts"
  ON youtube_accounts FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own accounts
CREATE POLICY "Users can insert their own YouTube accounts"
  ON youtube_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own accounts
CREATE POLICY "Users can update their own YouTube accounts"
  ON youtube_accounts FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own accounts
CREATE POLICY "Users can delete their own YouTube accounts"
  ON youtube_accounts FOR DELETE
  USING (auth.uid() = user_id);

-- Google Business Profile Accounts Table
CREATE TABLE IF NOT EXISTS google_business_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  team_id BIGINT REFERENCES teams(id) ON DELETE CASCADE,
  account_name TEXT NOT NULL,
  account_display_name TEXT NOT NULL,
  location_name TEXT,
  location_title TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, account_name)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_google_business_accounts_user_id ON google_business_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_google_business_accounts_team_id ON google_business_accounts(team_id);
CREATE INDEX IF NOT EXISTS idx_google_business_accounts_is_active ON google_business_accounts(is_active);

-- Row Level Security for Google Business Accounts
ALTER TABLE google_business_accounts ENABLE ROW LEVEL SECURITY;

-- Users can only see their own accounts
CREATE POLICY "Users can view their own Google Business accounts"
  ON google_business_accounts FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own accounts
CREATE POLICY "Users can insert their own Google Business accounts"
  ON google_business_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own accounts
CREATE POLICY "Users can update their own Google Business accounts"
  ON google_business_accounts FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own accounts
CREATE POLICY "Users can delete their own Google Business accounts"
  ON google_business_accounts FOR DELETE
  USING (auth.uid() = user_id);
