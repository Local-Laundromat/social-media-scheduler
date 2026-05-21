-- Add support for external API (OmniBroker/Sun Production)
-- These columns allow external apps to integrate with Quu

-- Add email column (needed for all users)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS email TEXT;

-- Add external_user_id column (for external app integration)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS external_user_id TEXT UNIQUE;

-- Add app_name column (to track which app the user came from)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS app_name TEXT;

-- Add company and webhook_url columns (for external API compatibility)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS company TEXT;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS webhook_url TEXT;

-- Add index for faster external_user_id lookups
CREATE INDEX IF NOT EXISTS idx_profiles_external_user_id ON profiles(external_user_id);

-- Add index for app_name filtering
CREATE INDEX IF NOT EXISTS idx_profiles_app_name ON profiles(app_name);

-- Add index for email lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

COMMENT ON COLUMN profiles.email IS 'User email address (from Supabase Auth or external API)';
COMMENT ON COLUMN profiles.external_user_id IS 'External user ID from parent apps like OmniBroker or Sun Production (format: app_name_user_id)';
COMMENT ON COLUMN profiles.app_name IS 'Name of the parent app (e.g., OmniBroker, SunProduction)';
COMMENT ON COLUMN profiles.company IS 'Company name for external API users';
COMMENT ON COLUMN profiles.webhook_url IS 'Webhook URL for post notifications';
