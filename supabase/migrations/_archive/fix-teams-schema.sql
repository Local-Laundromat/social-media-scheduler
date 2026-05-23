-- ============================================
-- FIX TEAMS SCHEMA
-- Adds missing owner_id column and creates missing tables
-- ============================================

-- 1. Add owner_id to teams table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'teams'
    AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE public.teams
      ADD COLUMN owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;

    CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON teams(owner_id);

    RAISE NOTICE '✅ Added owner_id column to teams table';
  ELSE
    RAISE NOTICE 'ℹ️  owner_id column already exists';
  END IF;
END $$;

-- 2. Create team_members table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.team_members (
  id bigserial PRIMARY KEY,
  team_id bigint NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at timestamp with time zone DEFAULT NOW(),
  invited_by uuid REFERENCES auth.users(id),
  UNIQUE(team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);

COMMENT ON TABLE team_members IS 'Team membership and roles';

-- 3. Create team_invitations table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.team_invitations (
  id bigserial PRIMARY KEY,
  team_id bigint NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'canceled')),
  invitation_token uuid DEFAULT gen_random_uuid() UNIQUE,
  expires_at timestamp with time zone DEFAULT NOW() + INTERVAL '7 days',
  accepted_at timestamp with time zone,
  accepted_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT NOW(),
  updated_at timestamp with time zone DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_invitations_team_id ON team_invitations(team_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON team_invitations(email);
CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON team_invitations(invitation_token);
CREATE INDEX IF NOT EXISTS idx_team_invitations_status ON team_invitations(status);

COMMENT ON TABLE team_invitations IS 'Team member invitations via email';

-- 4. Create helper functions
CREATE OR REPLACE FUNCTION generate_team_slug(team_name text)
RETURNS text AS $$
DECLARE
  base_slug text;
  final_slug text;
  counter integer := 0;
BEGIN
  base_slug := lower(regexp_replace(team_name, '[^a-zA-Z0-9\s-]', '', 'g'));
  base_slug := regexp_replace(base_slug, '\s+', '-', 'g');
  base_slug := regexp_replace(base_slug, '-+', '-', 'g');
  base_slug := trim(both '-' from base_slug);

  IF base_slug = '' THEN
    base_slug := 'team';
  END IF;

  final_slug := base_slug;

  WHILE EXISTS (SELECT 1 FROM teams WHERE slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;

  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION user_can_manage_team(p_user_id uuid, p_team_id bigint)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = p_team_id
      AND user_id = p_user_id
      AND role IN ('owner', 'admin')
  );
END;
$$ LANGUAGE plpgsql;

-- 5. Create triggers
CREATE OR REPLACE FUNCTION auto_add_team_owner()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO team_members (team_id, user_id, role, invited_by)
  VALUES (NEW.id, NEW.owner_id, 'owner', NEW.owner_id)
  ON CONFLICT (team_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_add_team_owner ON teams;
CREATE TRIGGER trigger_auto_add_team_owner
  AFTER INSERT ON teams
  FOR EACH ROW
  EXECUTE FUNCTION auto_add_team_owner();

-- 6. Enable RLS
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies
DROP POLICY IF EXISTS teams_select_policy ON teams;
CREATE POLICY teams_select_policy ON teams
  FOR SELECT
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM team_members
      WHERE team_id = teams.id AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS teams_insert_policy ON teams;
CREATE POLICY teams_insert_policy ON teams
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND owner_id = auth.uid());

DROP POLICY IF EXISTS teams_update_policy ON teams;
CREATE POLICY teams_update_policy ON teams
  FOR UPDATE
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS teams_delete_policy ON teams;
CREATE POLICY teams_delete_policy ON teams
  FOR DELETE
  USING (owner_id = auth.uid());

-- Team members policies
DROP POLICY IF EXISTS team_members_select_policy ON team_members;
CREATE POLICY team_members_select_policy ON team_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = team_members.team_id AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS team_members_insert_policy ON team_members;
CREATE POLICY team_members_insert_policy ON team_members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = team_members.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS team_members_delete_policy ON team_members;
CREATE POLICY team_members_delete_policy ON team_members
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = team_members.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

-- Team invitations policies
DROP POLICY IF EXISTS team_invitations_select_policy ON team_invitations;
CREATE POLICY team_invitations_select_policy ON team_invitations
  FOR SELECT
  USING (
    inviter_id = auth.uid()
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = team_invitations.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS team_invitations_insert_policy ON team_invitations;
CREATE POLICY team_invitations_insert_policy ON team_invitations
  FOR INSERT
  WITH CHECK (
    inviter_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = team_invitations.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS team_invitations_update_policy ON team_invitations;
CREATE POLICY team_invitations_update_policy ON team_invitations
  FOR UPDATE
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = team_invitations.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

-- 8. Create views
CREATE OR REPLACE VIEW team_member_details AS
SELECT
  tm.id,
  tm.team_id,
  tm.user_id,
  tm.role,
  tm.joined_at,
  t.name as team_name,
  t.owner_id as team_owner_id,
  p.name as member_name,
  p.email as member_email,
  p.stripe_subscription_status,
  p.subscription_tier
FROM team_members tm
JOIN teams t ON tm.team_id = t.id
JOIN profiles p ON tm.user_id = p.id;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '╔════════════════════════════════════════════╗';
  RAISE NOTICE '║   Teams Schema Fixed! ✅                  ║';
  RAISE NOTICE '╚════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'You can now create teams!';
  RAISE NOTICE '';
END $$;
