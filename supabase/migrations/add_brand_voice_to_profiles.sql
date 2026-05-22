-- ============================================
-- ADD BRAND VOICE COLUMN TO PROFILES
-- Migration: Add brand voice preferences
-- ============================================

-- Add brand_voice JSONB column to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS brand_voice JSONB DEFAULT '{
  "tone": "friendly",
  "emoji_usage": "moderate",
  "response_length": "medium"
}'::jsonb;

-- Add index for brand_voice queries (optional, for performance)
CREATE INDEX IF NOT EXISTS idx_profiles_brand_voice ON profiles USING GIN (brand_voice);

-- Add comment for documentation
COMMENT ON COLUMN profiles.brand_voice IS 'Brand voice and personality settings for AI-generated content. Includes tone, emoji_usage, response_length, custom_description, contact_email, contact_phone';

-- Example brand_voice structure:
-- {
--   "tone": "friendly" | "professional" | "playful" | "expert" | "custom",
--   "custom_description": "Describe your unique brand voice...",
--   "emoji_usage": "heavy" | "moderate" | "light" | "none",
--   "response_length": "brief" | "medium" | "detailed",
--   "contact_email": "support@company.com",
--   "contact_phone": "(555) 123-4567"
-- }
