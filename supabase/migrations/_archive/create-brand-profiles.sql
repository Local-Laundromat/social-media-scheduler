-- ============================================
-- BRAND PROFILES SYSTEM
-- Allows users/teams to manage multiple brands/clients
-- Each brand has its own voice, social accounts, and content
-- ============================================

-- Create brand_profiles table
CREATE TABLE IF NOT EXISTS public.brand_profiles (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  slug text UNIQUE,
  description text,

  -- Ownership (either individual user OR team)
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id bigint REFERENCES public.teams(id) ON DELETE CASCADE,

  -- Brand Voice Settings
  brand_voice jsonb DEFAULT '{}'::jsonb,
  -- Example: { "tone": "professional", "style": "casual", "keywords": ["innovative", "reliable"] }

  -- Brand Identity
  logo_url text,
  brand_colors jsonb DEFAULT '[]'::jsonb,
  -- Example: ["#FF0000", "#00FF00"]

  -- Metadata
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT NOW(),
  updated_at timestamp with time zone DEFAULT NOW(),

  -- Constraint: must belong to either user OR team, not both
  CONSTRAINT brand_owner_check CHECK (
    (user_id IS NOT NULL AND team_id IS NULL) OR
    (user_id IS NULL AND team_id IS NOT NULL)
  )
);

CREATE INDEX idx_brand_profiles_user_id ON brand_profiles(user_id);
CREATE INDEX idx_brand_profiles_team_id ON brand_profiles(team_id);
CREATE INDEX idx_brand_profiles_slug ON brand_profiles(slug);
CREATE INDEX idx_brand_profiles_active ON brand_profiles(is_active);

COMMENT ON TABLE brand_profiles IS 'Brand profiles - each brand has its own voice, social accounts, and content';
COMMENT ON COLUMN brand_profiles.user_id IS 'Individual owner (for solo users)';
COMMENT ON COLUMN brand_profiles.team_id IS 'Team owner (for agencies with shared brands)';
COMMENT ON COLUMN brand_profiles.brand_voice IS 'AI brand voice settings and preferences';

-- Add brand_profile_id to social_accounts table
ALTER TABLE public.social_accounts
  ADD COLUMN IF NOT EXISTS brand_profile_id bigint REFERENCES public.brand_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_social_accounts_brand_profile ON social_accounts(brand_profile_id);

COMMENT ON COLUMN social_accounts.brand_profile_id IS 'Brand this social account belongs to (optional, for multi-brand agencies)';

-- Add brand_profile_id to posts table
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS brand_profile_id bigint REFERENCES public.brand_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_posts_brand_profile ON posts(brand_profile_id);

COMMENT ON COLUMN posts.brand_profile_id IS 'Brand this post belongs to (optional, for multi-brand agencies)';

-- Helper function: Generate unique slug
CREATE OR REPLACE FUNCTION generate_brand_slug(brand_name text)
RETURNS text AS $$
DECLARE
  base_slug text;
  final_slug text;
  counter integer := 0;
BEGIN
  base_slug := lower(regexp_replace(brand_name, '[^a-zA-Z0-9\s-]', '', 'g'));
  base_slug := regexp_replace(base_slug, '\s+', '-', 'g');
  base_slug := regexp_replace(base_slug, '-+', '-', 'g');
  base_slug := trim(both '-' from base_slug);

  IF base_slug = '' THEN
    base_slug := 'brand';
  END IF;

  final_slug := base_slug;

  WHILE EXISTS (SELECT 1 FROM brand_profiles WHERE slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;

  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- Helper function: Check if user can manage brand
CREATE OR REPLACE FUNCTION user_can_manage_brand(p_user_id uuid, p_brand_id bigint)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM brand_profiles bp
    WHERE bp.id = p_brand_id
      AND (
        -- User owns the brand directly
        bp.user_id = p_user_id
        -- OR user is admin/owner of the team that owns the brand
        OR EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.team_id = bp.team_id
            AND tm.user_id = p_user_id
            AND tm.role IN ('owner', 'admin')
        )
      )
  );
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-generate slug on insert
CREATE OR REPLACE FUNCTION auto_generate_brand_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := generate_brand_slug(NEW.name);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_generate_brand_slug ON brand_profiles;
CREATE TRIGGER trigger_auto_generate_brand_slug
  BEFORE INSERT ON brand_profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_brand_slug();

-- Trigger: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_brand_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_brand_updated_at ON brand_profiles;
CREATE TRIGGER trigger_update_brand_updated_at
  BEFORE UPDATE ON brand_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_brand_updated_at();

-- Enable RLS
ALTER TABLE brand_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for brand_profiles
DROP POLICY IF EXISTS brand_profiles_select_policy ON brand_profiles;
CREATE POLICY brand_profiles_select_policy ON brand_profiles
  FOR SELECT
  USING (
    -- User owns the brand
    user_id = auth.uid()
    -- OR user is member of team that owns the brand
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = brand_profiles.team_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS brand_profiles_insert_policy ON brand_profiles;
CREATE POLICY brand_profiles_insert_policy ON brand_profiles
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      -- Creating personal brand
      user_id = auth.uid()
      -- OR creating team brand (must be admin/owner)
      OR EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.team_id = brand_profiles.team_id
          AND tm.user_id = auth.uid()
          AND tm.role IN ('owner', 'admin')
      )
    )
  );

DROP POLICY IF EXISTS brand_profiles_update_policy ON brand_profiles;
CREATE POLICY brand_profiles_update_policy ON brand_profiles
  FOR UPDATE
  USING (
    -- User owns the brand
    user_id = auth.uid()
    -- OR user is admin/owner of team that owns the brand
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = brand_profiles.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS brand_profiles_delete_policy ON brand_profiles;
CREATE POLICY brand_profiles_delete_policy ON brand_profiles
  FOR DELETE
  USING (
    -- User owns the brand
    user_id = auth.uid()
    -- OR user is owner of team that owns the brand
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = brand_profiles.team_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'owner'
    )
  );

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
  COUNT(DISTINCT sa.id) as social_accounts_count,
  COUNT(DISTINCT p.id) as posts_count,
  COUNT(DISTINCT CASE WHEN p.status = 'pending' THEN p.id END) as pending_posts_count
FROM brand_profiles bp
LEFT JOIN social_accounts sa ON sa.brand_profile_id = bp.id
LEFT JOIN posts p ON p.brand_profile_id = bp.id
GROUP BY bp.id;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '╔════════════════════════════════════════════╗';
  RAISE NOTICE '║   Brand Profiles System Created! ✅       ║';
  RAISE NOTICE '╚════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'Features:';
  RAISE NOTICE '  ✓ Users can create multiple brand profiles';
  RAISE NOTICE '  ✓ Teams can share brand profiles';
  RAISE NOTICE '  ✓ Each brand has its own voice settings';
  RAISE NOTICE '  ✓ Social accounts linked to brands';
  RAISE NOTICE '  ✓ Posts linked to brands';
  RAISE NOTICE '  ✓ RLS policies for security';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Create brand profiles via API';
  RAISE NOTICE '  2. Link social accounts to brands';
  RAISE NOTICE '  3. Create posts for specific brands';
  RAISE NOTICE '';
END $$;
