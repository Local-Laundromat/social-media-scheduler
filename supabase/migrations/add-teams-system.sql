-- ============================================
-- TEAMS & TEAM COLLABORATION SYSTEM
-- Complete team management with invitations
-- ============================================

-- ============================================
-- 1. CREATE TEAMS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.teams (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  slug text UNIQUE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  description text,
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT NOW(),
  updated_at timestamp with time zone DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON teams(owner_id);
CREATE INDEX IF NOT EXISTS idx_teams_slug ON teams(slug);

COMMENT ON TABLE teams IS 'Teams for multi-user collaboration and shared subscription access';
COMMENT ON COLUMN teams.owner_id IS 'User who created the team and pays for subscription';
COMMENT ON COLUMN teams.slug IS 'URL-friendly team identifier';

-- ============================================
-- 2. CREATE TEAM MEMBERS TABLE
-- ============================================

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
COMMENT ON COLUMN team_members.role IS 'owner: full control, admin: manage members, member: basic access';

-- ============================================
-- 3. CREATE TEAM INVITATIONS TABLE
-- ============================================

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
COMMENT ON COLUMN team_invitations.invitation_token IS 'Unique token for invitation acceptance link';

-- ============================================
-- 4. ADD TEAM_ID TO PROFILES
-- ============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS team_id bigint REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_team_id ON profiles(team_id);

COMMENT ON COLUMN profiles.team_id IS 'Team this user belongs to (NULL for solo users)';

-- ============================================
-- 5. HELPER FUNCTIONS
-- ============================================

-- Function to generate unique team slug
CREATE OR REPLACE FUNCTION generate_team_slug(team_name text)
RETURNS text AS $$
DECLARE
  base_slug text;
  final_slug text;
  counter integer := 0;
BEGIN
  -- Convert to lowercase, replace spaces with hyphens, remove special chars
  base_slug := lower(regexp_replace(team_name, '[^a-zA-Z0-9\s-]', '', 'g'));
  base_slug := regexp_replace(base_slug, '\s+', '-', 'g');
  base_slug := regexp_replace(base_slug, '-+', '-', 'g');
  base_slug := trim(both '-' from base_slug);

  -- Ensure slug is not empty
  IF base_slug = '' THEN
    base_slug := 'team';
  END IF;

  -- Try base slug first
  final_slug := base_slug;

  -- If slug exists, append counter
  WHILE EXISTS (SELECT 1 FROM teams WHERE slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;

  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_team_slug(text) IS 'Generates URL-friendly unique slug from team name';

-- Function to check if user can manage team
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

COMMENT ON FUNCTION user_can_manage_team(uuid, bigint) IS 'Checks if user has admin/owner role in team';

-- Function to expire old invitations
CREATE OR REPLACE FUNCTION expire_old_invitations()
RETURNS void AS $$
BEGIN
  UPDATE team_invitations
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < NOW();

  RAISE NOTICE 'Expired % old invitation(s)', (SELECT count(*) FROM team_invitations WHERE status = 'expired' AND updated_at = NOW());
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION expire_old_invitations() IS 'Marks expired pending invitations - run daily via cron';

-- ============================================
-- 6. TRIGGER: Auto-create team owner membership
-- ============================================

CREATE OR REPLACE FUNCTION auto_add_team_owner()
RETURNS TRIGGER AS $$
BEGIN
  -- When a team is created, automatically add creator as owner member
  INSERT INTO team_members (team_id, user_id, role, invited_by)
  VALUES (NEW.id, NEW.owner_id, 'owner', NEW.owner_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_add_team_owner
  AFTER INSERT ON teams
  FOR EACH ROW
  EXECUTE FUNCTION auto_add_team_owner();

COMMENT ON TRIGGER trigger_auto_add_team_owner ON teams IS 'Automatically adds team creator as owner member';

-- ============================================
-- 7. TRIGGER: Update team_id on profile when accepting invitation
-- ============================================

CREATE OR REPLACE FUNCTION update_profile_team_on_accept()
RETURNS TRIGGER AS $$
BEGIN
  -- When invitation is accepted, update user's profile team_id
  IF NEW.status = 'accepted' AND OLD.status != 'accepted' THEN
    UPDATE profiles
    SET team_id = NEW.team_id
    WHERE id = NEW.accepted_by;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_profile_team_on_accept
  AFTER UPDATE ON team_invitations
  FOR EACH ROW
  WHEN (NEW.status = 'accepted')
  EXECUTE FUNCTION update_profile_team_on_accept();

COMMENT ON TRIGGER trigger_update_profile_team_on_accept ON team_invitations IS 'Updates profile.team_id when user accepts invitation';

-- ============================================
-- 8. VIEWS FOR TEAM ANALYTICS
-- ============================================

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

COMMENT ON VIEW team_member_details IS 'Complete team membership details with user info';

CREATE OR REPLACE VIEW team_stats AS
SELECT
  t.id as team_id,
  t.name as team_name,
  t.owner_id,
  COUNT(tm.id) as total_members,
  COUNT(tm.id) FILTER (WHERE tm.role = 'owner') as owners,
  COUNT(tm.id) FILTER (WHERE tm.role = 'admin') as admins,
  COUNT(tm.id) FILTER (WHERE tm.role = 'member') as members,
  COUNT(DISTINCT p.id) as active_posts,
  t.created_at
FROM teams t
LEFT JOIN team_members tm ON t.id = tm.team_id
LEFT JOIN posts p ON p.team_id = t.id AND p.status != 'deleted'
GROUP BY t.id, t.name, t.owner_id, t.created_at;

COMMENT ON VIEW team_stats IS 'Team statistics with member counts and post counts';

-- ============================================
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on teams table
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view teams they are members of
CREATE POLICY teams_select_policy ON teams
  FOR SELECT
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM team_members
      WHERE team_id = teams.id
        AND user_id = auth.uid()
    )
  );

-- Policy: Only authenticated users can create teams
CREATE POLICY teams_insert_policy ON teams
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND owner_id = auth.uid());

-- Policy: Only owners can update teams
CREATE POLICY teams_update_policy ON teams
  FOR UPDATE
  USING (owner_id = auth.uid());

-- Policy: Only owners can delete teams
CREATE POLICY teams_delete_policy ON teams
  FOR DELETE
  USING (owner_id = auth.uid());

-- Enable RLS on team_members table
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view members of teams they belong to
CREATE POLICY team_members_select_policy ON team_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = team_members.team_id
        AND tm.user_id = auth.uid()
    )
  );

-- Policy: Only team admins/owners can add members
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

-- Policy: Only team admins/owners can remove members
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

-- Enable RLS on team_invitations table
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view invitations for teams they manage or invitations sent to them
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

-- Policy: Only team admins/owners can create invitations
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

-- Policy: Invited users can update their own invitations (accept/decline)
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

-- ============================================
-- 10. SUCCESS MESSAGE
-- ============================================

DO $$
DECLARE
  teams_count integer;
  members_count integer;
  invitations_count integer;
BEGIN
  SELECT COUNT(*) INTO teams_count FROM teams;
  SELECT COUNT(*) INTO members_count FROM team_members;
  SELECT COUNT(*) INTO invitations_count FROM team_invitations;

  RAISE NOTICE '';
  RAISE NOTICE '╔════════════════════════════════════════════╗';
  RAISE NOTICE '║   Teams System Migration Complete! ✅     ║';
  RAISE NOTICE '╚════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  ✓ teams (% existing)', teams_count;
  RAISE NOTICE '  ✓ team_members (% existing)', members_count;
  RAISE NOTICE '  ✓ team_invitations (% existing)', invitations_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Features:';
  RAISE NOTICE '  ✓ Team creation with owner auto-assignment';
  RAISE NOTICE '  ✓ Email-based team invitations';
  RAISE NOTICE '  ✓ Role-based access (owner/admin/member)';
  RAISE NOTICE '  ✓ Auto profile.team_id update on accept';
  RAISE NOTICE '  ✓ Row Level Security policies enabled';
  RAISE NOTICE '  ✓ Team analytics views';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Create team management API routes';
  RAISE NOTICE '  2. Build team invitation email system';
  RAISE NOTICE '  3. Add team management UI to dashboard';
  RAISE NOTICE '  4. Set up cron for expire_old_invitations()';
  RAISE NOTICE '';
END $$;
