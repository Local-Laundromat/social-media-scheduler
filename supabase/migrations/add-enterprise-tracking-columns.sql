-- ============================================
-- ENTERPRISE TRACKING COLUMNS MIGRATION
-- Adds proper ID tracking and data accountability
-- ============================================

-- Add missing columns to posts table for enterprise tracking
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS team_id bigint REFERENCES public.teams(id),
  ADD COLUMN IF NOT EXISTS webhook_url text,
  ADD COLUMN IF NOT EXISTS filename text,
  ADD COLUMN IF NOT EXISTS filepath text,
  ADD COLUMN IF NOT EXISTS filetype text,
  ADD COLUMN IF NOT EXISTS caption text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS facebook_account_id integer REFERENCES public.facebook_accounts(id),
  ADD COLUMN IF NOT EXISTS instagram_account_id integer REFERENCES public.instagram_accounts(id),
  ADD COLUMN IF NOT EXISTS tiktok_account_id integer REFERENCES public.tiktok_accounts(id);

-- Add indexes for performance on new foreign keys
CREATE INDEX IF NOT EXISTS idx_posts_team_id ON posts(team_id);
CREATE INDEX IF NOT EXISTS idx_posts_facebook_account_id ON posts(facebook_account_id);
CREATE INDEX IF NOT EXISTS idx_posts_instagram_account_id ON posts(instagram_account_id);
CREATE INDEX IF NOT EXISTS idx_posts_tiktok_account_id ON posts(tiktok_account_id);

-- Update existing posts to populate new fields from old fields
UPDATE public.posts
SET
  caption = content,
  filepath = media_url,
  filetype = media_type
WHERE caption IS NULL;

-- Add comment explaining the dual field system
COMMENT ON COLUMN posts.content IS 'Legacy field - use caption instead';
COMMENT ON COLUMN posts.media_url IS 'Legacy field - use filepath instead';
COMMENT ON COLUMN posts.media_type IS 'Legacy field - use filetype instead';
COMMENT ON COLUMN posts.caption IS 'Post caption/message text';
COMMENT ON COLUMN posts.filepath IS 'Path to media file in storage';
COMMENT ON COLUMN posts.filetype IS 'Type of media: image or video';
COMMENT ON COLUMN posts.filename IS 'Original filename of uploaded media';
COMMENT ON COLUMN posts.team_id IS 'Team that owns this post (for collaboration)';
COMMENT ON COLUMN posts.webhook_url IS 'Post-specific webhook URL (overrides user webhook)';
COMMENT ON COLUMN posts.facebook_account_id IS 'Specific Facebook account used for posting';
COMMENT ON COLUMN posts.instagram_account_id IS 'Specific Instagram account used for posting';
COMMENT ON COLUMN posts.tiktok_account_id IS 'Specific TikTok account used for posting';
COMMENT ON COLUMN posts.error_message IS 'Error message if posting failed';

-- ============================================
-- ENTERPRISE ANALYTICS & AUDIT TRAIL
-- ============================================

-- Create audit log table for tracking all post changes
CREATE TABLE IF NOT EXISTS public.post_audit_log (
  id bigserial PRIMARY KEY,
  post_id integer NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL, -- 'created', 'updated', 'deleted', 'posted', 'failed'
  old_data jsonb,
  new_data jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_audit_log_post_id ON post_audit_log(post_id);
CREATE INDEX IF NOT EXISTS idx_post_audit_log_user_id ON post_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_post_audit_log_created_at ON post_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_post_audit_log_action ON post_audit_log(action);

COMMENT ON TABLE post_audit_log IS 'Enterprise audit trail for all post modifications';

-- ============================================
-- ENTERPRISE VIEW: Complete Post Details
-- ============================================

CREATE OR REPLACE VIEW posts_with_accounts AS
SELECT
  p.*,
  pr.name as user_name,
  pr.email as user_email,
  pr.company as user_company,
  t.name as team_name,
  fa.page_name as facebook_page_name,
  ia.username as instagram_username,
  ta.username as tiktok_username
FROM posts p
LEFT JOIN profiles pr ON p.user_id = pr.id
LEFT JOIN teams t ON p.team_id = t.id
LEFT JOIN facebook_accounts fa ON p.facebook_account_id = fa.id
LEFT JOIN instagram_accounts ia ON p.instagram_account_id = ia.id
LEFT JOIN tiktok_accounts ta ON p.tiktok_account_id = ta.id;

COMMENT ON VIEW posts_with_accounts IS 'Enterprise view showing posts with full account details for reporting';

-- ============================================
-- VERIFICATION QUERY
-- ============================================
-- Run this to verify all columns exist:
/*
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'posts'
  AND table_schema = 'public'
ORDER BY ordinal_position;
*/

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'Enterprise tracking columns added successfully!';
  RAISE NOTICE 'Posts table now has:';
  RAISE NOTICE '  - team_id (for team collaboration)';
  RAISE NOTICE '  - webhook_url (post-level webhooks)';
  RAISE NOTICE '  - filename, filepath, filetype, caption (proper media tracking)';
  RAISE NOTICE '  - facebook_account_id, instagram_account_id, tiktok_account_id (account tracking)';
  RAISE NOTICE '  - error_message (failure tracking)';
  RAISE NOTICE 'Audit log table created for enterprise compliance!';
END $$;
