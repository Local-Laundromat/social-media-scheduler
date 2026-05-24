-- ============================================
-- Ensure brand_profile_stats exists (repair / idempotent)
-- ============================================
-- If `20260523_link_brands_to_accounts.sql` was never applied remotely,
-- GET /api/brands fails while inserts to brand_profiles can still succeed.
-- This mirrors that migration's view so `supabase db push` heals the gap.

CREATE OR REPLACE VIEW brand_profile_stats AS
SELECT
  bp.id,
  bp.name,
  bp.slug,
  bp.description,
  bp.user_id,
  bp.team_id,
  bp.brand_voice,
  bp.logo_url,
  bp.brand_colors,
  bp.is_active,
  bp.created_at,
  bp.updated_at,
  COUNT(DISTINCT fa.id) AS facebook_accounts_count,
  COUNT(DISTINCT ia.id) AS instagram_accounts_count,
  COUNT(DISTINCT ta.id) AS tiktok_accounts_count,
  (COUNT(DISTINCT fa.id) + COUNT(DISTINCT ia.id) + COUNT(DISTINCT ta.id)) AS total_social_accounts,
  COUNT(DISTINCT p.id) AS posts_count,
  COUNT(DISTINCT CASE WHEN p.status = 'scheduled' THEN p.id END) AS scheduled_posts_count,
  COUNT(DISTINCT CASE WHEN p.status = 'posted' THEN p.id END) AS posted_posts_count,
  COUNT(DISTINCT CASE WHEN p.status = 'failed' THEN p.id END) AS failed_posts_count
FROM brand_profiles bp
LEFT JOIN facebook_accounts fa ON fa.brand_profile_id = bp.id
LEFT JOIN instagram_accounts ia ON ia.brand_profile_id = bp.id
LEFT JOIN tiktok_accounts ta ON ta.brand_profile_id = bp.id
LEFT JOIN posts p ON p.brand_profile_id = bp.id
GROUP BY bp.id;

COMMENT ON VIEW brand_profile_stats IS 'Brand profiles with aggregated stats (run after brand_profiles + link migrations)';

