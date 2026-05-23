-- Run this in Supabase SQL Editor if migration failed at COMMENT with:
--   ERROR: function name "increment_user_usage" is not unique
-- Reason: older migration defines increment_user_usage(uuid); subscription migration adds
--         increment_user_usage(uuid, text, integer, numeric). Comments must list argument types.

COMMENT ON FUNCTION public.increment_user_usage(uuid, text, integer, numeric)
  IS 'Increments usage counter and logs usage event';
