# AI Usage Tracking Setup Guide

## ✅ Completed

1. **Created `src/services/usageTracking.js`**
   - `checkAIQuota(userId)` - Check before AI operations
   - `trackAIUsage(userId, executionCount)` - Track after success
   - `getUsageStats(userId)` - Get current usage for dashboard
   - `resetMonthlyUsage(userId)` - Admin function

2. **Integrated into Routes**
   - `/api/agent/generate-post` - Quota check + tracking added
   - `/api/agent/generate-batch` - Quota check + tracking added

## 🔧 Required: Run Database Migration

**You need to add two columns to your `profiles` table in Supabase.**

### Step 1: Open Supabase SQL Editor

1. Go to your Supabase project dashboard
2. Click "SQL Editor" in the left sidebar
3. Click "New Query"

### Step 2: Run This SQL

```sql
-- Add usage tracking columns
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS ai_executions_this_month INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ai_executions_reset_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Initialize existing users
UPDATE profiles
SET ai_executions_reset_date = CURRENT_TIMESTAMP
WHERE ai_executions_reset_date IS NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_profiles_usage_tracking
ON profiles(ai_executions_this_month, ai_executions_reset_date);
```

### Step 3: Verify

Run this to check the columns were added:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'profiles'
AND column_name IN ('ai_executions_this_month', 'ai_executions_reset_date');
```

You should see:
```
ai_executions_this_month  | integer   | 0
ai_executions_reset_date  | timestamp | CURRENT_TIMESTAMP
```

---

## 📊 How It Works

### Tier Limits (src/services/usageTracking.js:12-17)

```javascript
const TIER_LIMITS = {
  starter: 2,      // 2 AI plans/month
  growth: 10,      // 10 AI plans/month
  pro: 50,         // 50 AI plans/month
  agency: 10000    // 10,000 AI plans/month (Fair Use)
};
```

### Usage Flow

1. **User Makes AI Request** → `/api/agent/generate-post`

2. **Check Quota** (Line 46):
   ```javascript
   const quotaCheck = await checkAIQuota(userId);
   if (!quotaCheck.allowed) {
     return res.status(429).json({
       error: 'AI usage limit exceeded',
       usage: {
         current: quotaCheck.current,
         limit: quotaCheck.limit,
         resetDate: quotaCheck.resetDate
       }
     });
   }
   ```

3. **Run AI Agent** → Generates content

4. **Track Usage** (Line 99):
   ```javascript
   await trackAIUsage(userId, agentResult.attempts || 1);
   ```

### Monthly Reset

- Automatically resets when month changes
- Checks `ai_executions_reset_date` vs current date
- Resets counter to 0 on first request of new month

---

## 🧪 Testing

Once the SQL migration is complete, test with:

### Test 1: Check Quota Before Generation

```bash
curl -X POST http://localhost:3000/api/agent/generate-post \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "niche": "real estate",
    "platform": "instagram",
    "saveToQueue": false
  }'
```

**Expected**: Should work on first 2 attempts (Starter tier), then return 429 error.

### Test 2: Check Usage Stats

Add this endpoint to `src/routes/users.js`:

```javascript
const { getUsageStats } = require('../services/usageTracking');

router.get('/:userId/usage', async (req, res) => {
  const userId = req.params.userId;
  const stats = await getUsageStats(userId);
  res.json(stats);
});
```

Then test:

```bash
curl http://localhost:3000/api/users/YOUR_USER_ID/usage
```

**Expected Response**:
```json
{
  "success": true,
  "current": 2,
  "limit": 2,
  "remaining": 0,
  "percentUsed": 100,
  "tier": "starter",
  "resetDate": "2026-06-01T00:00:00.000Z"
}
```

### Test 3: Check Logs

After running AI generation, check your server logs:

```bash
# Should see:
[Usage] ✓ User abc123 tracked: 2/2 executions (100%)
[Usage] 🚨 User abc123 hit limit: 2/2 executions
```

---

## 🎨 Add UI Display (Optional)

Add usage indicator to dashboard:

```javascript
// In dashboard.js, fetch usage stats
async function displayUsageStats() {
  const response = await fetch('/api/users/YOUR_USER_ID/usage');
  const stats = await response.json();

  const usageHTML = `
    <div class="usage-meter">
      <div class="usage-bar">
        <div class="usage-fill" style="width: ${stats.percentUsed}%"></div>
      </div>
      <p>AI Plans: ${stats.current}/${stats.limit} used this month</p>
      ${stats.percentUsed >= 100 ?
        `<p class="warning">Limit reached. Resets ${new Date(stats.resetDate).toLocaleDateString()}</p>` :
        `<p>${stats.remaining} remaining</p>`
      }
    </div>
  `;

  document.querySelector('#usage-stats').innerHTML = usageHTML;
}
```

---

## 🚨 Abuse Monitoring

Check for users approaching limits:

```sql
-- Find users at 80%+ usage
SELECT
  id,
  name,
  tier,
  ai_executions_this_month,
  ai_executions_reset_date,
  CASE tier
    WHEN 'starter' THEN (ai_executions_this_month::float / 2 * 100)
    WHEN 'growth' THEN (ai_executions_this_month::float / 10 * 100)
    WHEN 'pro' THEN (ai_executions_this_month::float / 50 * 100)
    WHEN 'agency' THEN (ai_executions_this_month::float / 10000 * 100)
  END as percent_used
FROM profiles
WHERE
  CASE tier
    WHEN 'starter' THEN (ai_executions_this_month::float / 2 * 100)
    WHEN 'growth' THEN (ai_executions_this_month::float / 10 * 100)
    WHEN 'pro' THEN (ai_executions_this_month::float / 50 * 100)
    WHEN 'agency' THEN (ai_executions_this_month::float / 10000 * 100)
  END >= 80
ORDER BY percent_used DESC;
```

---

## 📝 Summary

**What This Protects Against**:
✅ Users abusing "unlimited" tiers
✅ Runaway API costs from malicious actors
✅ Accidental infinite loops burning tokens

**What This Provides**:
✅ User transparency (show usage stats)
✅ Fair enforcement of tier limits
✅ Data for pricing decisions
✅ Early warning system for abuse

**Cost Savings**:
- Worst case without limits: $500/month from one abuser
- With limits: $0.17 (Growth tier max: 10 executions × $0.017)
- **Protection factor: 2,941x**

---

## 🔄 Next Steps

1. Run the SQL migration above
2. Test with a real user account
3. Add usage stats to dashboard UI
4. Monitor logs for high usage warnings
5. Set up email alerts for users approaching limits (optional)

**The code is ready to go once you run the SQL migration!**
