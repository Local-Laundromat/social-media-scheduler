-- ============================================
-- CLIENT-BASED ORGANIZATION SYSTEM
-- For marketing agencies managing multiple clients
-- ============================================

-- ============================================
-- 1. CREATE CLIENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.clients (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_id bigint REFERENCES public.teams(id) ON DELETE CASCADE,

  -- Client information
  name text NOT NULL,
  display_name text, -- Optional friendly name
  business_type text, -- restaurant, retail, service, etc.
  industry text,

  -- Contact information
  contact_email text,
  contact_phone text,
  website text,
  address text,

  -- Brand settings (inheritable by posts)
  logo_url text,
  brand_colors jsonb, -- {"primary": "#FF5733", "secondary": "#33FF57"}
  brand_voice jsonb DEFAULT '{
    "tone": "friendly",
    "emoji_usage": "moderate",
    "response_length": "medium"
  }'::jsonb,

  -- Status
  is_active boolean DEFAULT true,

  -- Metadata
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),

  -- Ensure unique client names per user/team
  CONSTRAINT unique_client_name_per_user UNIQUE (user_id, name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_team_id ON clients(team_id);
CREATE INDEX IF NOT EXISTS idx_clients_is_active ON clients(is_active);
CREATE INDEX IF NOT EXISTS idx_clients_brand_voice ON clients USING GIN (brand_voice);

-- RLS policies
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Users can view their own clients
DROP POLICY IF EXISTS "Users can view their own clients" ON clients;
CREATE POLICY "Users can view their own clients" ON clients
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can create clients
DROP POLICY IF EXISTS "Users can create clients" ON clients;
CREATE POLICY "Users can create clients" ON clients
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own clients
DROP POLICY IF EXISTS "Users can update their own clients" ON clients;
CREATE POLICY "Users can update their own clients" ON clients
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own clients
DROP POLICY IF EXISTS "Users can delete their own clients" ON clients;
CREATE POLICY "Users can delete their own clients" ON clients
  FOR DELETE
  USING (user_id = auth.uid());

-- Service role has full access
DROP POLICY IF EXISTS "Service role can manage clients" ON clients;
CREATE POLICY "Service role can manage clients" ON clients
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- 2. ADD CLIENT_ID TO SOCIAL ACCOUNT TABLES
-- ============================================

-- Facebook accounts
ALTER TABLE public.facebook_accounts
  ADD COLUMN IF NOT EXISTS client_id bigint REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_facebook_accounts_client_id ON facebook_accounts(client_id);

-- Instagram accounts
ALTER TABLE public.instagram_accounts
  ADD COLUMN IF NOT EXISTS client_id bigint REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_instagram_accounts_client_id ON instagram_accounts(client_id);

-- TikTok accounts
ALTER TABLE public.tiktok_accounts
  ADD COLUMN IF NOT EXISTS client_id bigint REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tiktok_accounts_client_id ON tiktok_accounts(client_id);

-- Pinterest accounts
ALTER TABLE public.pinterest_accounts
  ADD COLUMN IF NOT EXISTS client_id bigint REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pinterest_accounts_client_id ON pinterest_accounts(client_id);

-- YouTube accounts
ALTER TABLE public.youtube_accounts
  ADD COLUMN IF NOT EXISTS client_id bigint REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_youtube_accounts_client_id ON youtube_accounts(client_id);

-- Google Business accounts
ALTER TABLE public.google_business_accounts
  ADD COLUMN IF NOT EXISTS client_id bigint REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_google_business_accounts_client_id ON google_business_accounts(client_id);

-- ============================================
-- 3. ADD CLIENT_ID TO POSTS TABLE
-- ============================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS client_id bigint REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_posts_client_id ON posts(client_id);

-- ============================================
-- 4. ADD CLIENT_ID TO GOOGLE REVIEWS TABLE
-- ============================================

ALTER TABLE public.google_business_reviews
  ADD COLUMN IF NOT EXISTS client_id bigint REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_google_business_reviews_client_id ON google_business_reviews(client_id);

-- ============================================
-- 5. CREATE VIEW FOR CLIENT SUMMARY
-- ============================================

CREATE OR REPLACE VIEW client_summary
WITH (security_invoker = true)
AS
SELECT
  c.id,
  c.user_id,
  c.team_id,
  c.name,
  c.display_name,
  c.business_type,
  c.is_active,
  c.created_at,

  -- Count connected accounts
  COUNT(DISTINCT fa.id) as facebook_accounts,
  COUNT(DISTINCT ia.id) as instagram_accounts,
  COUNT(DISTINCT ta.id) as tiktok_accounts,
  COUNT(DISTINCT pa.id) as pinterest_accounts,
  COUNT(DISTINCT ya.id) as youtube_accounts,
  COUNT(DISTINCT ga.id) as google_accounts,

  -- Total accounts
  (
    COUNT(DISTINCT fa.id) +
    COUNT(DISTINCT ia.id) +
    COUNT(DISTINCT ta.id) +
    COUNT(DISTINCT pa.id) +
    COUNT(DISTINCT ya.id) +
    COUNT(DISTINCT ga.id)
  ) as total_accounts,

  -- Post counts
  COUNT(DISTINCT p.id) as total_posts,
  COUNT(DISTINCT CASE WHEN p.status = 'published' THEN p.id END) as published_posts,
  COUNT(DISTINCT CASE WHEN p.status = 'scheduled' THEN p.id END) as scheduled_posts

FROM clients c
LEFT JOIN facebook_accounts fa ON c.id = fa.client_id AND fa.is_active = true
LEFT JOIN instagram_accounts ia ON c.id = ia.client_id AND ia.is_active = true
LEFT JOIN tiktok_accounts ta ON c.id = ta.client_id AND ta.is_active = true
LEFT JOIN pinterest_accounts pa ON c.id = pa.client_id AND pa.is_active = true
LEFT JOIN youtube_accounts ya ON c.id = ya.client_id AND ya.is_active = true
LEFT JOIN google_business_accounts ga ON c.id = ga.client_id AND ga.is_active = true
LEFT JOIN posts p ON c.id = p.client_id
GROUP BY c.id, c.user_id, c.team_id, c.name, c.display_name, c.business_type, c.is_active, c.created_at;

COMMENT ON VIEW client_summary IS 'Summary of clients with account and post counts';

GRANT SELECT ON client_summary TO authenticated;

-- ============================================
-- 6. TRIGGER TO UPDATE TIMESTAMPS
-- ============================================

CREATE OR REPLACE FUNCTION update_client_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_client_updated_at ON clients;
CREATE TRIGGER trigger_update_client_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION update_client_updated_at();

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '====================================';
  RAISE NOTICE 'CLIENT ORGANIZATION SYSTEM CREATED!';
  RAISE NOTICE '====================================';
  RAISE NOTICE 'Created:';
  RAISE NOTICE '  ✓ clients table';
  RAISE NOTICE '  ✓ client_id columns in all account tables';
  RAISE NOTICE '  ✓ client_id in posts and reviews';
  RAISE NOTICE '  ✓ client_summary view';
  RAISE NOTICE '  ✓ RLS policies for multi-tenancy';
  RAISE NOTICE '';
  RAISE NOTICE 'Perfect for marketing agencies!';
  RAISE NOTICE '====================================';
END $$;
