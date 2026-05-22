-- Migration: Add AI Usage Tracking Columns
-- Purpose: Track monthly AI executions to enforce tier limits and prevent abuse
-- Date: 2026-05-22

-- Add usage tracking columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS ai_executions_this_month INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ai_executions_reset_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create index for faster usage queries
CREATE INDEX IF NOT EXISTS idx_profiles_usage_tracking
ON profiles(ai_executions_this_month, ai_executions_reset_date);

-- Update existing users to have reset date set
UPDATE profiles
SET ai_executions_reset_date = CURRENT_TIMESTAMP
WHERE ai_executions_reset_date IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN profiles.ai_executions_this_month IS 'Number of AI executions (content plans, captions, etc.) used this month';
COMMENT ON COLUMN profiles.ai_executions_reset_date IS 'Date when monthly usage counter was last reset';
