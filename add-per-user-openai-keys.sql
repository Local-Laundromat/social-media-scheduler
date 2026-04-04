-- ============================================
-- PER-USER OPENAI API KEYS MIGRATION
-- Allows each user to use their own OpenAI key
-- ============================================

-- Add openai_api_key column to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS openai_api_key text;

-- Add comment explaining the column
COMMENT ON COLUMN profiles.openai_api_key IS 'User-specific OpenAI API key for AI features (caption generation, comment responses). If null, falls back to system default.';

-- Create index for faster lookups (optional, but recommended)
CREATE INDEX IF NOT EXISTS idx_profiles_openai_key ON profiles(id) WHERE openai_api_key IS NOT NULL;

-- ============================================
-- VERIFICATION QUERY
-- ============================================
-- Run this to verify the column was added:
/*
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND table_schema = 'public'
  AND column_name = 'openai_api_key';
*/

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '✅ Per-user OpenAI API key support added!';
  RAISE NOTICE 'Users can now add their own OpenAI API keys in Settings.';
  RAISE NOTICE 'System will use user key first, then fall back to .env key.';
END $$;
