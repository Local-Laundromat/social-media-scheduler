-- ============================================
-- FIX: active_posts_summary view security
-- Change from SECURITY DEFINER to SECURITY INVOKER
-- ============================================

-- Drop and recreate the view with SECURITY INVOKER
DROP VIEW IF EXISTS active_posts_summary CASCADE;

CREATE OR REPLACE VIEW active_posts_summary
WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.user_id,
  p.status,
  p.scheduled_time,
  p.created_at,
  pr.name as user_name,
  pr.email as user_email
FROM posts p
JOIN profiles pr ON p.user_id = pr.id
WHERE p.status IN ('scheduled', 'pending', 'processing');

COMMENT ON VIEW active_posts_summary IS 'Active posts summary with SECURITY INVOKER';

-- Grant SELECT permission
GRANT SELECT ON active_posts_summary TO authenticated;
