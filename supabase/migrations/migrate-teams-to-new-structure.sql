-- ============================================
-- MIGRATE TEAMS TO NEW STRUCTURE
-- Safely migrates old teams table to new structure
-- ============================================

-- Step 1: Check if old teams table has data we need to preserve
DO $$
DECLARE
  old_teams_count integer;
BEGIN
  SELECT COUNT(*) INTO old_teams_count FROM teams;

  IF old_teams_count > 0 THEN
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  WARNING: Found % existing team(s) in old teams table', old_teams_count;
    RAISE NOTICE '⚠️  This migration will preserve your data but restructure the table';
    RAISE NOTICE '';
  ELSE
    RAISE NOTICE 'ℹ️  Old teams table is empty, safe to migrate';
  END IF;
END $$;

-- Step 2: Backup old teams table (just in case)
CREATE TABLE IF NOT EXISTS teams_backup_old AS
SELECT * FROM teams;

-- Step 3: Drop old teams table and all its constraints
DROP TABLE IF EXISTS teams CASCADE;

-- Step 4: Create new teams table with correct structure
CREATE TABLE public.teams (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  slug text UNIQUE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description text,
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT NOW(),
  updated_at timestamp with time zone DEFAULT NOW()
);

CREATE INDEX idx_teams_owner_id ON teams(owner_id);
CREATE INDEX idx_teams_slug ON teams(slug);

COMMENT ON TABLE teams IS 'Teams for multi-user collaboration and shared subscription access';
COMMENT ON COLUMN teams.owner_id IS 'User who created the team and pays for subscription';
COMMENT ON COLUMN teams.slug IS 'URL-friendly team identifier';

-- Step 5: Migrate old data if it exists
DO $$
DECLARE
  old_team RECORD;
  new_slug text;
BEGIN
  -- Check if backup table exists and has data
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'teams_backup_old') THEN
    FOR old_team IN SELECT * FROM teams_backup_old LOOP
      -- Generate slug from name
      new_slug := lower(regexp_replace(old_team.name, '[^a-zA-Z0-9\s-]', '', 'g'));
      new_slug := regexp_replace(new_slug, '\s+', '-', 'g');
      new_slug := trim(both '-' from new_slug);

      IF new_slug = '' THEN
        new_slug := 'team-' || old_team.id;
      END IF;

      -- Insert with old data mapped to new structure
      INSERT INTO teams (id, name, slug, owner_id, created_at, updated_at)
      VALUES (
        old_team.id,
        old_team.name,
        new_slug,
        old_team.created_by,  -- Map created_by to owner_id
        old_team.created_at,
        old_team.updated_at
      );

      RAISE NOTICE '✓ Migrated team: % (id: %)', old_team.name, old_team.id;
    END LOOP;

    -- Reset sequence to continue from max id
    PERFORM setval('teams_id_seq', (SELECT COALESCE(MAX(id), 0) + 1 FROM teams), false);
  END IF;
END $$;

-- Step 6: Create team_members table
CREATE TABLE IF NOT EXISTS public.team_members (
  id bigserial PRIMARY KEY,
  team_id bigint NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at timestamp with time zone DEFAULT NOW(),
  invited_by uuid REFERENCES auth.users(id),
  UNIQUE(team_id, user_id)
);

CREATE INDEX idx_team_members_team_id ON team_members(team_id);
CREATE INDEX idx_team_members_user_id ON team_members(user_id);

COMMENT ON TABLE team_members IS 'Team membership and roles';

-- Step 7: Create team_invitations table
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

CREATE INDEX idx_team_invitations_team_id ON team_invitations(team_id);
CREATE INDEX idx_team_invitations_email ON team_invitations(email);
CREATE INDEX idx_team_invitations_token ON team_invitations(invitation_token);
CREATE INDEX idx_team_invitations_status ON team_invitations(status);

-- Step 8: Migrate existing team members from old data
DO $$
DECLARE
  old_team RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'teams_backup_old') THEN
    FOR old_team IN SELECT * FROM teams_backup_old LOOP
      -- Add owner as team member
      INSERT INTO team_members (team_id, user_id, role, invited_by)
      VALUES (old_team.id, old_team.created_by, 'owner', old_team.created_by)
      ON CONFLICT (team_id, user_id) DO NOTHING;
    END LOOP;
  END IF;
END $$;

-- Step 9: Helper functions
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

-- Step 10: Triggers
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

CREATE OR REPLACE FUNCTION update_profile_team_on_accept()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status != 'accepted' THEN
    UPDATE profiles
    SET team_id = NEW.team_id
    WHERE id = NEW.accepted_by;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_profile_team_on_accept ON team_invitations;
CREATE TRIGGER trigger_update_profile_team_on_accept
  AFTER UPDATE ON team_invitations
  FOR EACH ROW
  WHEN (NEW.status = 'accepted')
  EXECUTE FUNCTION update_profile_team_on_accept();

-- Step 11: Enable RLS
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

-- Step 12: RLS Policies
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

-- Step 13: Create views
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
DECLARE
  teams_count integer;
  members_count integer;
BEGIN
  SELECT COUNT(*) INTO teams_count FROM teams;
  SELECT COUNT(*) INTO members_count FROM team_members;

  RAISE NOTICE '';
  RAISE NOTICE '╔════════════════════════════════════════════╗';
  RAISE NOTICE '║   Teams Migration Complete! ✅            ║';
  RAISE NOTICE '╚════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'Migration summary:';
  RAISE NOTICE '  ✓ Teams migrated: %', teams_count;
  RAISE NOTICE '  ✓ Team members created: %', members_count;
  RAISE NOTICE '  ✓ Tables: teams, team_members, team_invitations';
  RAISE NOTICE '  ✓ RLS policies enabled';
  RAISE NOTICE '';
  RAISE NOTICE 'Old data backed up in: teams_backup_old';
  RAISE NOTICE '';
  RAISE NOTICE '🎉 You can now create teams!';
  RAISE NOTICE '';
END $$;
