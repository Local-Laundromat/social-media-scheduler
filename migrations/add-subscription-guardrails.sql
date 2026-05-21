-- ============================================
-- SUBSCRIPTION & USAGE GUARDRAILS MIGRATION
-- Prevents API waste and enforces tier limits
-- ============================================

-- ============================================
-- 1. ADD SUBSCRIPTION COLUMNS TO PROFILES
-- ============================================

-- Stripe subscription status
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_status text DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS subscription_tier text DEFAULT 'none';

-- Usage tracking
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_monthly_usage integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_allowed_usage integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS usage_reset_date timestamp with time zone;

-- BYOK (Bring Your Own Key) flag
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS uses_own_api_key boolean DEFAULT false;

-- Subscription metadata
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_started_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS subscription_renews_at timestamp with time zone;

-- Add comments for documentation
COMMENT ON COLUMN profiles.stripe_customer_id IS 'Stripe customer ID for billing';
COMMENT ON COLUMN profiles.stripe_subscription_id IS 'Active Stripe subscription ID';
COMMENT ON COLUMN profiles.stripe_subscription_status IS 'active, inactive, canceled, past_due, trialing';
COMMENT ON COLUMN profiles.subscription_tier IS 'none, starter, growth, agency';
COMMENT ON COLUMN profiles.current_monthly_usage IS 'Number of AI agent executions this month';
COMMENT ON COLUMN profiles.max_allowed_usage IS 'Maximum AI executions allowed per tier';
COMMENT ON COLUMN profiles.uses_own_api_key IS 'True if user brings their own OpenAI key (BYOK)';
COMMENT ON COLUMN profiles.usage_reset_date IS 'When monthly usage counter resets';

-- ============================================
-- 2. CREATE USAGE LOGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.usage_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  feature_type text NOT NULL, -- 'content_planner', 'comment_responder', 'rag_caption'
  tokens_used integer DEFAULT 0,
  cost_usd numeric(10, 4) DEFAULT 0.00,
  success boolean DEFAULT true,
  error_message text,
  request_metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_logs_feature_type ON usage_logs(feature_type);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_month ON usage_logs(user_id, created_at);

COMMENT ON TABLE usage_logs IS 'Tracks all AI feature usage for billing and analytics';

-- ============================================
-- 3. CREATE SUBSCRIPTION TIERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.subscription_tiers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tier_name text UNIQUE NOT NULL, -- 'starter', 'growth', 'agency'
  monthly_price_usd numeric(10, 2) NOT NULL,
  max_social_accounts integer NOT NULL,
  max_ai_executions_per_month integer NOT NULL,
  requires_own_api_key boolean DEFAULT false,
  features jsonb DEFAULT '{}'::jsonb,
  stripe_price_id text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT NOW(),
  updated_at timestamp with time zone DEFAULT NOW()
);

COMMENT ON TABLE subscription_tiers IS 'Defines available subscription plans and limits';

-- ============================================
-- 4. INSERT DEFAULT SUBSCRIPTION TIERS
-- ============================================

INSERT INTO subscription_tiers (tier_name, monthly_price_usd, max_social_accounts, max_ai_executions_per_month, requires_own_api_key, features)
VALUES
  (
    'starter',
    19.00,
    3,
    2, -- 2 AI plans/month included OR BYOK for unlimited
    false,
    jsonb_build_object(
      'ai_auto_plan', true,
      'comment_responder', true,
      'rag_captions', true,
      'bulk_upload', true,
      'byok_optional', true,
      'support_level', 'email'
    )
  ),
  (
    'growth',
    59.00,
    6,
    10, -- 10 AI plans/month on system key
    false,
    jsonb_build_object(
      'ai_auto_plan', true,
      'comment_responder', true,
      'rag_captions', true,
      'auto_caption_generation', true,
      'smart_reply_suggestions', true,
      'bulk_upload', true,
      'support_level', 'faster'
    )
  ),
  (
    'pro',
    149.00,
    12,
    50, -- 50 AI plans/month
    false,
    jsonb_build_object(
      'ai_auto_plan', true,
      'comment_responder', true,
      'rag_captions', true,
      'auto_caption_generation', true,
      'smart_reply_suggestions', true,
      'advanced_analytics', true,
      'team_collaboration', true,
      'bulk_upload', true,
      'support_level', 'priority'
    )
  ),
  (
    'agency',
    499.00,
    999999,
    999999, -- Unlimited AI plans
    false,
    jsonb_build_object(
      'ai_auto_plan', true,
      'comment_responder', true,
      'rag_captions', true,
      'auto_caption_generation', true,
      'smart_reply_suggestions', true,
      'advanced_analytics', true,
      'team_collaboration', true,
      'white_label', true,
      'multi_user_teams', true,
      'api_access', true,
      'bulk_upload', true,
      'support_level', 'dedicated'
    )
  )
ON CONFLICT (tier_name) DO UPDATE SET
  monthly_price_usd = EXCLUDED.monthly_price_usd,
  max_social_accounts = EXCLUDED.max_social_accounts,
  max_ai_executions_per_month = EXCLUDED.max_ai_executions_per_month,
  requires_own_api_key = EXCLUDED.requires_own_api_key,
  features = EXCLUDED.features,
  updated_at = NOW();

-- ============================================
-- 5. CREATE FUNCTION TO RESET MONTHLY USAGE
-- ============================================

CREATE OR REPLACE FUNCTION reset_monthly_usage()
RETURNS void AS $$
BEGIN
  -- Reset usage counter for users whose reset date has passed
  UPDATE profiles
  SET
    current_monthly_usage = 0,
    usage_reset_date = usage_reset_date + INTERVAL '1 month'
  WHERE usage_reset_date IS NOT NULL
    AND usage_reset_date <= NOW();

  RAISE NOTICE 'Monthly usage counters reset for users past their reset date';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reset_monthly_usage IS 'Resets monthly usage counters - run daily via cron';

-- ============================================
-- 6. CREATE FUNCTION TO CHECK USER QUOTA
-- ============================================

CREATE OR REPLACE FUNCTION check_user_has_quota(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
  v_current_usage integer;
  v_max_usage integer;
  v_subscription_status text;
  v_uses_own_key boolean;
BEGIN
  -- Fetch user's current usage and limits
  SELECT
    current_monthly_usage,
    max_allowed_usage,
    stripe_subscription_status,
    uses_own_api_key
  INTO
    v_current_usage,
    v_max_usage,
    v_subscription_status,
    v_uses_own_key
  FROM profiles
  WHERE id = p_user_id;

  -- If user not found, deny access
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- If subscription is not active, deny access
  IF v_subscription_status != 'active' AND v_subscription_status != 'trialing' THEN
    RETURN false;
  END IF;

  -- If user brings their own key, always allow (infinite usage on their dime)
  IF v_uses_own_key THEN
    RETURN true;
  END IF;

  -- Check if user has remaining quota
  IF v_current_usage >= v_max_usage THEN
    RETURN false;
  END IF;

  -- All checks passed
  RETURN true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_user_has_quota IS 'Checks if user can execute AI features based on quota and subscription';

-- ============================================
-- 7. CREATE FUNCTION TO INCREMENT USAGE
-- ============================================

CREATE OR REPLACE FUNCTION increment_user_usage(
  p_user_id uuid,
  p_feature_type text,
  p_tokens_used integer DEFAULT 0,
  p_cost_usd numeric DEFAULT 0.00
)
RETURNS boolean AS $$
DECLARE
  v_uses_own_key boolean;
BEGIN
  -- Get BYOK status
  SELECT uses_own_api_key INTO v_uses_own_key
  FROM profiles
  WHERE id = p_user_id;

  -- Only increment usage if NOT using own key
  IF NOT v_uses_own_key THEN
    UPDATE profiles
    SET current_monthly_usage = current_monthly_usage + 1
    WHERE id = p_user_id;
  END IF;

  -- Always log usage for analytics
  INSERT INTO usage_logs (user_id, feature_type, tokens_used, cost_usd, success)
  VALUES (p_user_id, p_feature_type, p_tokens_used, p_cost_usd, true);

  RETURN true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_user_usage IS 'Increments usage counter and logs usage event';

-- ============================================
-- 8. CREATE INDEXES FOR SUBSCRIPTION QUERIES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status
  ON profiles(stripe_subscription_status);

CREATE INDEX IF NOT EXISTS idx_profiles_tier
  ON profiles(subscription_tier);

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer
  ON profiles(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_profiles_usage_tracking
  ON profiles(current_monthly_usage, max_allowed_usage)
  WHERE stripe_subscription_status = 'active';

-- ============================================
-- 9. CREATE VIEW FOR SUBSCRIPTION ANALYTICS
-- ============================================

CREATE OR REPLACE VIEW subscription_analytics AS
SELECT
  subscription_tier,
  COUNT(*) as total_users,
  COUNT(*) FILTER (WHERE stripe_subscription_status = 'active') as active_users,
  COUNT(*) FILTER (WHERE uses_own_api_key = true) as byok_users,
  SUM(current_monthly_usage) as total_monthly_usage,
  AVG(current_monthly_usage) as avg_usage_per_user,
  COUNT(*) FILTER (WHERE current_monthly_usage >= max_allowed_usage) as users_at_limit
FROM profiles
GROUP BY subscription_tier;

COMMENT ON VIEW subscription_analytics IS 'Real-time subscription and usage analytics';

-- ============================================
-- 10. CREATE VIEW FOR USAGE REPORTS
-- ============================================

CREATE OR REPLACE VIEW monthly_usage_report AS
SELECT
  p.id as user_id,
  p.name,
  p.email,
  p.subscription_tier,
  p.current_monthly_usage,
  p.max_allowed_usage,
  p.uses_own_api_key,
  COUNT(ul.id) as total_api_calls,
  SUM(ul.tokens_used) as total_tokens,
  SUM(ul.cost_usd) as total_cost_usd,
  COUNT(*) FILTER (WHERE ul.success = false) as failed_calls,
  DATE_TRUNC('month', NOW()) as report_month
FROM profiles p
LEFT JOIN usage_logs ul ON p.id = ul.user_id
  AND ul.created_at >= DATE_TRUNC('month', NOW())
GROUP BY p.id, p.name, p.email, p.subscription_tier, p.current_monthly_usage, p.max_allowed_usage, p.uses_own_api_key;

COMMENT ON VIEW monthly_usage_report IS 'Detailed monthly usage report for billing';

-- ============================================
-- 11. VERIFICATION & SUCCESS MESSAGE
-- ============================================

DO $$
DECLARE
  subscription_cols_count integer;
  usage_logs_exists boolean;
  tiers_count integer;
BEGIN
  -- Check subscription columns
  SELECT COUNT(*) INTO subscription_cols_count
  FROM information_schema.columns
  WHERE table_name = 'profiles'
    AND column_name IN ('stripe_customer_id', 'stripe_subscription_status', 'subscription_tier', 'current_monthly_usage', 'max_allowed_usage');

  -- Check usage_logs table
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'usage_logs'
  ) INTO usage_logs_exists;

  -- Check tiers inserted
  SELECT COUNT(*) INTO tiers_count
  FROM subscription_tiers;

  RAISE NOTICE '';
  RAISE NOTICE '╔════════════════════════════════════════════╗';
  RAISE NOTICE '║   Subscription Guardrails Complete! ✅    ║';
  RAISE NOTICE '╚════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'Profiles columns added: % / 5', subscription_cols_count;
  RAISE NOTICE 'Usage logs table: %', CASE WHEN usage_logs_exists THEN '✓ Created' ELSE '✗ Missing' END;
  RAISE NOTICE 'Subscription tiers: % configured', tiers_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Tiers configured:';
  RAISE NOTICE '  • Starter: $19/mo (2 AI runs/mo + BYOK option, 3 accounts)';
  RAISE NOTICE '  • Growth: $59/mo (10 AI runs/mo, 6 accounts)';
  RAISE NOTICE '  • Pro: $149/mo (50 AI runs/mo, 12 accounts)';
  RAISE NOTICE '  • Agency: $499/mo (unlimited AI runs, unlimited accounts)';
  RAISE NOTICE '';
  RAISE NOTICE 'Protection features:';
  RAISE NOTICE '  ✓ Subscription status checks';
  RAISE NOTICE '  ✓ Monthly usage quotas';
  RAISE NOTICE '  ✓ BYOK (Bring Your Own Key) support';
  RAISE NOTICE '  ✓ Usage logging and analytics';
  RAISE NOTICE '  ✓ Automated quota reset function';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Add verifyActivePaidUser middleware';
  RAISE NOTICE '  2. Configure Stripe webhooks';
  RAISE NOTICE '  3. Set up daily cron for reset_monthly_usage()';
  RAISE NOTICE '';
END $$;
