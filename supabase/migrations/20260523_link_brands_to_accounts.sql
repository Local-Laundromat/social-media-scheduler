-- ============================================
-- LINK BRAND PROFILES TO SOCIAL ACCOUNTS AND POSTS
-- Adds brand_profile_id to all platform tables
-- ============================================

-- Add brand_profile_id to facebook_accounts
ALTER TABLE public.facebook_accounts
  ADD COLUMN IF NOT EXISTS brand_profile_id bigint REFERENCES public.brand_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_facebook_accounts_brand_profile ON facebook_accounts(brand_profile_id);

COMMENT ON COLUMN facebook_accounts.brand_profile_id IS 'Brand this Facebook account belongs to (optional, for multi-brand agencies)';

-- Add brand_profile_id to instagram_accounts
ALTER TABLE public.instagram_accounts
  ADD COLUMN IF NOT EXISTS brand_profile_id bigint REFERENCES public.brand_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_instagram_accounts_brand_profile ON instagram_accounts(brand_profile_id);

COMMENT ON COLUMN instagram_accounts.brand_profile_id IS 'Brand this Instagram account belongs to (optional, for multi-brand agencies)';

-- Add brand_profile_id to tiktok_accounts
ALTER TABLE public.tiktok_accounts
  ADD COLUMN IF NOT EXISTS brand_profile_id bigint REFERENCES public.brand_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tiktok_accounts_brand_profile ON tiktok_accounts(brand_profile_id);

COMMENT ON COLUMN tiktok_accounts.brand_profile_id IS 'Brand this TikTok account belongs to (optional, for multi-brand agencies)';

-- Add brand_profile_id to posts
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS brand_profile_id bigint REFERENCES public.brand_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_posts_brand_profile ON posts(brand_profile_id);

COMMENT ON COLUMN posts.brand_profile_id IS 'Brand this post belongs to (optional, for multi-brand agencies)';

-- Create view for brand profiles with stats
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
  COUNT(DISTINCT fa.id) as facebook_accounts_count,
  COUNT(DISTINCT ia.id) as instagram_accounts_count,
  COUNT(DISTINCT ta.id) as tiktok_accounts_count,
  (COUNT(DISTINCT fa.id) + COUNT(DISTINCT ia.id) + COUNT(DISTINCT ta.id)) as total_social_accounts,
  COUNT(DISTINCT p.id) as posts_count,
  COUNT(DISTINCT CASE WHEN p.status = 'scheduled' THEN p.id END) as scheduled_posts_count,
  COUNT(DISTINCT CASE WHEN p.status = 'posted' THEN p.id END) as posted_posts_count,
  COUNT(DISTINCT CASE WHEN p.status = 'failed' THEN p.id END) as failed_posts_count
FROM brand_profiles bp
LEFT JOIN facebook_accounts fa ON fa.brand_profile_id = bp.id
LEFT JOIN instagram_accounts ia ON ia.brand_profile_id = bp.id
LEFT JOIN tiktok_accounts ta ON ta.brand_profile_id = bp.id
LEFT JOIN posts p ON p.brand_profile_id = bp.id
GROUP BY bp.id;

COMMENT ON VIEW brand_profile_stats IS 'Brand profiles with aggregated stats from all connected social accounts and posts';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '╔════════════════════════════════════════════╗';
  RAISE NOTICE '║   Brand Links Created! ✅                 ║';
  RAISE NOTICE '╚════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'Added brand_profile_id to:';
  RAISE NOTICE '  ✓ facebook_accounts';
  RAISE NOTICE '  ✓ instagram_accounts';
  RAISE NOTICE '  ✓ tiktok_accounts';
  RAISE NOTICE '  ✓ posts';
  RAISE NOTICE '';
  RAISE NOTICE 'Created views:';
  RAISE NOTICE '  ✓ brand_profile_stats (with counts)';
  RAISE NOTICE '';
  RAISE NOTICE 'How it works:';
  RAISE NOTICE '  1. Each social account can be linked to a brand';
  RAISE NOTICE '  2. Each post can be linked to a brand';
  RAISE NOTICE '  3. Query brand_profile_stats to see aggregated data';
  RAISE NOTICE '';
END $$;
