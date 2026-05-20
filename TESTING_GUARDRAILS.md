# Testing Financial Guardrails

## Quick Test Guide

Follow these steps to verify your subscription guardrails are working correctly.

---

## Step 1: Run Both Migrations

### Migration 1: AI Features (if not already run)
```sql
-- Copy migrations/add-ai-features-support.sql into Supabase SQL Editor
-- This adds: ai_generated, metadata, openai_api_key columns
```

### Migration 2: Subscription Guardrails
```sql
-- Copy migrations/add-subscription-guardrails.sql into Supabase SQL Editor
-- This adds: subscription columns, usage tracking, quota functions
```

**Verify both succeeded:**
```sql
-- Check profiles table has all columns
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name IN (
    'ai_generated', 'metadata', 'openai_api_key', 'company',
    'stripe_subscription_status', 'subscription_tier',
    'current_monthly_usage', 'max_allowed_usage', 'uses_own_api_key'
  );
```

Should return **9 rows**.

---

## Step 2: Set Up Test User

### Test Scenario A: Inactive Subscription (Blocked)

```sql
UPDATE profiles
SET
  stripe_subscription_status = 'inactive',
  subscription_tier = 'none',
  current_monthly_usage = 0,
  max_allowed_usage = 0,
  uses_own_api_key = false
WHERE email = 'your-test-email@example.com';
```

**Expected behavior:**
- User clicks "✨ Generate Smart Plan"
- Gets **403 Forbidden** with upgrade message
- Modal shows tier options

---

### Test Scenario B: Growth Tier (5 AI Runs)

```sql
UPDATE profiles
SET
  stripe_subscription_status = 'active',
  subscription_tier = 'growth',
  current_monthly_usage = 0,
  max_allowed_usage = 5,
  uses_own_api_key = false,
  usage_reset_date = NOW() + INTERVAL '30 days'
WHERE email = 'your-test-email@example.com';
```

**Expected behavior:**
- First 5 AI runs work normally
- 6th run gets **429 Quota Exceeded**
- `current_monthly_usage` increments after each run

---

### Test Scenario C: Starter Tier with BYOK

```sql
UPDATE profiles
SET
  stripe_subscription_status = 'active',
  subscription_tier = 'starter',
  current_monthly_usage = 0,
  max_allowed_usage = 0,
  uses_own_api_key = true,
  openai_api_key = 'sk-your-actual-openai-key-here'
WHERE email = 'your-test-email@example.com';
```

**Expected behavior:**
- Unlimited AI runs (on their OpenAI bill)
- `current_monthly_usage` stays at 0 (not tracked for BYOK users)
- Uses their API key instead of system key

---

### Test Scenario D: Agency Tier (100 Runs)

```sql
UPDATE profiles
SET
  stripe_subscription_status = 'active',
  subscription_tier = 'agency',
  current_monthly_usage = 0,
  max_allowed_usage = 100,
  uses_own_api_key = false,
  usage_reset_date = NOW() + INTERVAL '30 days'
WHERE email = 'your-test-email@example.com';
```

**Expected behavior:**
- First 100 AI runs work normally
- 101st run gets **429 Quota Exceeded**
- Perfect for agencies managing multiple clients

---

## Step 3: Test Each Scenario

### A. Test Inactive User (Should Block)

1. Set user to `inactive` (Scenario A above)
2. Login to dashboard
3. Go to Bulk Upload tab
4. Upload 5 files
5. Click "Continue to Configuration"
6. Select platforms
7. Click **"✨ Generate Smart Plan"**

**Expected Response:**
```json
{
  "success": false,
  "error": "Subscription required to use AI features",
  "code": "SUBSCRIPTION_INACTIVE",
  "message": "🔒 Upgrade to Pro to activate your Autonomous Agent Team...",
  "cta": {
    "text": "Upgrade Now",
    "tiers": [...]
  }
}
```

**UI should show:** Upgrade modal with pricing tiers

---

### B. Test Growth Tier Quota (Should Allow 5, Block 6th)

1. Set user to Growth tier (Scenario B)
2. Run AI Auto-Plan 5 times successfully
3. Try 6th time

**Expected Response on 6th attempt:**
```json
{
  "success": false,
  "error": "Monthly AI execution limit reached",
  "code": "QUOTA_EXCEEDED",
  "details": {
    "currentUsage": 5,
    "maxUsage": 5,
    "tier": "growth"
  }
}
```

**Verify usage was tracked:**
```sql
SELECT current_monthly_usage, max_allowed_usage
FROM profiles
WHERE email = 'your-test-email@example.com';
-- Should show: 5, 5
```

**Verify logs were created:**
```sql
SELECT COUNT(*), SUM(cost_usd)
FROM usage_logs
WHERE user_id = (SELECT id FROM profiles WHERE email = 'your-test-email@example.com')
  AND feature_type = 'content_planner';
-- Should show: 5 executions with estimated costs
```

---

### C. Test BYOK Unlimited (Should Never Block)

1. Set user to Starter + BYOK (Scenario C)
2. Run AI Auto-Plan 10 times (more than any paid tier)

**Expected behavior:**
- All 10 runs succeed
- Uses user's OpenAI key
- `current_monthly_usage` stays at 0
- `usage_logs` still tracks for analytics

**Verify usage NOT incremented:**
```sql
SELECT current_monthly_usage
FROM profiles
WHERE email = 'your-test-email@example.com';
-- Should show: 0 (BYOK users not tracked)
```

**But logs still created:**
```sql
SELECT COUNT(*)
FROM usage_logs
WHERE user_id = (SELECT id FROM profiles WHERE email = 'your-test-email@example.com')
  AND feature_type = 'content_planner';
-- Should show: 10 (logging happens regardless)
```

---

## Step 4: Test Monthly Reset

### Simulate Month-End Reset

```sql
-- Manually trigger reset for testing
UPDATE profiles
SET
  current_monthly_usage = 0,
  usage_reset_date = NOW() + INTERVAL '30 days'
WHERE stripe_subscription_status = 'active';
```

**Expected behavior:**
- Users who hit quota can now use AI features again
- Usage counters reset to 0

**In production**, run this daily via cron:
```sql
SELECT reset_monthly_usage();
```

---

## Step 5: Verify API Cost Protection

### Check Current Month's API Costs

```sql
SELECT
  SUM(cost_usd) as total_cost,
  COUNT(*) as total_runs,
  AVG(cost_usd) as avg_cost_per_run
FROM usage_logs
WHERE created_at >= DATE_TRUNC('month', NOW())
  AND success = true;
```

### Check Per-User Costs

```sql
SELECT
  p.email,
  p.subscription_tier,
  p.uses_own_api_key,
  COUNT(ul.id) as runs_this_month,
  SUM(ul.cost_usd) as cost_this_month
FROM profiles p
LEFT JOIN usage_logs ul ON p.id = ul.user_id
  AND ul.created_at >= DATE_TRUNC('month', NOW())
WHERE p.stripe_subscription_status = 'active'
GROUP BY p.email, p.subscription_tier, p.uses_own_api_key;
```

**Growth tier users should cap at ~$0.25-0.50/month**
**BYOK users should show $0.00 cost to you**

---

## Step 6: Test Error Messages

### Missing OpenAI Key (BYOK User)

```sql
UPDATE profiles
SET
  stripe_subscription_status = 'active',
  subscription_tier = 'starter',
  uses_own_api_key = true,
  openai_api_key = NULL  -- No key configured
WHERE email = 'your-test-email@example.com';
```

**Expected Response:**
```json
{
  "success": false,
  "error": "OpenAI API key required",
  "code": "BYOK_KEY_MISSING",
  "message": "Your plan requires you to configure your own OpenAI API key..."
}
```

---

## Step 7: Verify Server Logs

When testing, check your server console for these log messages:

### Successful Execution (Growth tier, 2/5 used)
```
[SubscriptionCheck] User abc123 approved - 2/5 used
[UsageLog] Logged content_planner usage for user abc123 (BYOK: false)
```

### Blocked - Quota Exceeded
```
[SubscriptionCheck] User abc123 blocked - quota exceeded (5/5)
```

### Blocked - Inactive Subscription
```
[SubscriptionCheck] User abc123 blocked - subscription status: inactive
```

### BYOK User (Unlimited)
```
[SubscriptionCheck] BYOK user abc123 approved - using own API key
[UsageLog] Logged content_planner usage for user abc123 (BYOK: true)
```

---

## Checklist: Guardrails Working Correctly

- [ ] Inactive users get 403 Forbidden
- [ ] Growth tier users limited to 5 runs/month
- [ ] 6th run gets 429 Quota Exceeded with upgrade message
- [ ] BYOK users get unlimited runs
- [ ] Usage counter increments for non-BYOK users
- [ ] Usage counter stays 0 for BYOK users
- [ ] All executions logged to `usage_logs` table
- [ ] API costs tracked accurately
- [ ] Monthly reset function works
- [ ] Missing BYOK key shows helpful error
- [ ] Server logs show subscription checks

---

## Common Issues & Fixes

### Issue: Middleware not blocking inactive users

**Fix:** Check route registration order
```javascript
// CORRECT ORDER:
router.post('/auto-plan', authenticateToken, verifyActivePaidUser, async (req, res) => {

// WRONG ORDER (won't work):
router.post('/auto-plan', verifyActivePaidUser, authenticateToken, async (req, res) => {
```

### Issue: Usage not incrementing

**Fix:** Check `logUsage` is called after success
```javascript
if (!result.success) {
  await logFailure(userId, 'content_planner', result.error);
  return res.status(500).json(result);
}

// THIS LINE MUST BE PRESENT:
await logUsage(userId, 'content_planner', estimatedTokens, estimatedCost);
```

### Issue: BYOK users getting blocked

**Fix:** Ensure they have `openai_api_key` set
```sql
UPDATE profiles
SET openai_api_key = 'sk-actual-key-here'
WHERE uses_own_api_key = true AND openai_api_key IS NULL;
```

---

## Production Readiness

✅ **Ready for production when:**

1. Both migrations run successfully
2. Test user scenarios A, B, C all work as expected
3. Usage tracking verified in database
4. Server logs show correct subscription checks
5. API cost estimates look reasonable
6. Monthly reset function tested

---

## Next: Integrate Stripe

Once guardrails are tested and working:

1. Create Stripe products for each tier
2. Add Stripe webhook endpoint
3. Update `stripe_subscription_status` via webhooks
4. Add upgrade flow to frontend
5. Launch! 🚀

---

**Status:** 🔒 **Financial Protection Active**

Your platform now enforces strict subscription and quota limits, protecting you from API cost overruns while maximizing profit margins!
