/**
 * Subscription & Usage Verification Middleware
 *
 * Prevents API waste by enforcing:
 * - Active paid subscription required
 * - Monthly usage quotas per tier
 * - BYOK (Bring Your Own Key) support
 */

const { supabase } = require('../database/supabase');

/**
 * Verify user has active paid subscription and available quota
 *
 * Checks:
 * 1. User has active subscription (not 'inactive')
 * 2. User hasn't exceeded monthly usage limits
 * 3. BYOK users get unlimited usage on their own dime
 *
 * Returns 403 Forbidden if:
 * - Subscription is inactive/canceled
 * - Monthly quota exceeded
 * - No valid payment method
 */
async function verifyActivePaidUser(req, res, next) {
  try {
    const userId = req.user?.id; // Extracted from JWT by authenticateToken middleware

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // Query user's subscription and usage data
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('stripe_subscription_status, subscription_tier, current_monthly_usage, max_allowed_usage, uses_own_api_key, openai_api_key')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      console.error('[SubscriptionCheck] Profile lookup failed:', error);
      return res.status(401).json({
        success: false,
        error: 'User profile not found',
        code: 'PROFILE_NOT_FOUND'
      });
    }

    // ============================================
    // GUARDRAIL 1: Active Subscription Required
    // ============================================
    const validStatuses = ['active', 'trialing'];
    if (!validStatuses.includes(profile.stripe_subscription_status)) {
      console.log(`[SubscriptionCheck] User ${userId} blocked - subscription status: ${profile.stripe_subscription_status}`);

      return res.status(403).json({
        success: false,
        error: 'Subscription required to use AI features',
        code: 'SUBSCRIPTION_INACTIVE',
        details: {
          currentStatus: profile.stripe_subscription_status,
          requiredStatus: 'active',
          upgradeUrl: '/settings#billing'
        },
        message: '🔒 Upgrade to unlock AI features. Start planning content with AI in seconds!',
        cta: {
          text: 'Upgrade Now',
          action: 'upgrade',
          tiers: [
            { name: 'Starter', price: '$19/mo', features: ['2 AI Runs/mo + BYOK', '3 Social Accounts', 'Unlimited Scheduling'] },
            { name: 'Growth', price: '$59/mo', features: ['10 AI Runs/mo', '6 Social Accounts', 'Auto-Caption Generation'] },
            { name: 'Pro', price: '$149/mo', features: ['50 AI Runs/mo', '12 Social Accounts', 'Team Collaboration'] },
            { name: 'Agency', price: '$499/mo', features: ['Unlimited AI Runs', 'Unlimited Accounts', 'White Label'] }
          ]
        }
      });
    }

    // ============================================
    // GUARDRAIL 2: BYOK Users = Unlimited Access
    // ============================================
    if (profile.uses_own_api_key) {
      // User brings their own OpenAI key - they pay for their own tokens
      // Verify they actually have a key configured
      if (!profile.openai_api_key || profile.openai_api_key === 'not-configured') {
        return res.status(403).json({
          success: false,
          error: 'OpenAI API key required',
          code: 'BYOK_KEY_MISSING',
          message: 'Your plan requires you to configure your own OpenAI API key. Add it in Settings to continue.',
          details: {
            tier: profile.subscription_tier,
            requiresBYOK: true,
            settingsUrl: '/settings#api-keys'
          }
        });
      }

      // BYOK user with key configured - allow unlimited usage (on their dime)
      console.log(`[SubscriptionCheck] BYOK user ${userId} approved - using own API key`);
      req.userSubscription = {
        tier: profile.subscription_tier,
        byok: true,
        unlimited: true
      };
      return next();
    }

    // ============================================
    // GUARDRAIL 3: Enforce Monthly Quota Limits
    // ============================================
    const currentUsage = profile.current_monthly_usage || 0;
    const maxUsage = profile.max_allowed_usage || 0;

    if (currentUsage >= maxUsage) {
      console.log(`[SubscriptionCheck] User ${userId} blocked - quota exceeded (${currentUsage}/${maxUsage})`);

      return res.status(429).json({
        success: false,
        error: 'Monthly AI execution limit reached',
        code: 'QUOTA_EXCEEDED',
        details: {
          currentUsage,
          maxUsage,
          tier: profile.subscription_tier,
          resetDate: calculateNextResetDate()
        },
        message: `You've used all ${maxUsage} AI bulk runs this month. Upgrade your plan or wait until ${formatResetDate(calculateNextResetDate())} for quota reset.`,
        cta: {
          text: 'Upgrade Plan',
          action: 'upgrade_tier',
          suggestion: profile.subscription_tier === 'starter' ? 'growth' :
                     profile.subscription_tier === 'growth' ? 'pro' : 'agency'
        }
      });
    }

    // ============================================
    // ALL CHECKS PASSED - Allow Request
    // ============================================
    console.log(`[SubscriptionCheck] User ${userId} approved - ${currentUsage}/${maxUsage} used`);

    req.userSubscription = {
      tier: profile.subscription_tier,
      byok: false,
      currentUsage,
      maxUsage,
      remainingQuota: maxUsage - currentUsage
    };

    next();

  } catch (err) {
    console.error('[SubscriptionCheck] Internal error:', err);
    return res.status(500).json({
      success: false,
      error: 'Subscription verification failed',
      code: 'INTERNAL_ERROR',
      details: err.message
    });
  }
}

/**
 * Log AI feature usage and increment counter
 * Call this AFTER successful AI execution
 */
async function logUsage(userId, featureType, tokensUsed = 0, costUsd = 0.00) {
  try {
    // Get user's BYOK status
    const { data: profile } = await supabase
      .from('profiles')
      .select('uses_own_api_key')
      .eq('id', userId)
      .single();

    const byok = profile?.uses_own_api_key || false;

    // Increment usage counter (only if not BYOK)
    if (!byok) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ current_monthly_usage: supabase.raw('current_monthly_usage + 1') })
        .eq('id', userId);

      if (updateError) {
        console.error('[UsageLog] Failed to increment usage:', updateError);
      }
    }

    // Always log for analytics (even BYOK users)
    const { error: logError } = await supabase
      .from('usage_logs')
      .insert({
        user_id: userId,
        feature_type: featureType,
        tokens_used: tokensUsed,
        cost_usd: costUsd,
        success: true,
        request_metadata: {
          byok,
          timestamp: new Date().toISOString()
        }
      });

    if (logError) {
      console.error('[UsageLog] Failed to log usage:', logError);
    }

    console.log(`[UsageLog] Logged ${featureType} usage for user ${userId} (BYOK: ${byok})`);

  } catch (err) {
    console.error('[UsageLog] Error logging usage:', err);
  }
}

/**
 * Log failed AI execution (for debugging and analytics)
 */
async function logFailure(userId, featureType, errorMessage) {
  try {
    await supabase
      .from('usage_logs')
      .insert({
        user_id: userId,
        feature_type: featureType,
        success: false,
        error_message: errorMessage,
        request_metadata: {
          timestamp: new Date().toISOString()
        }
      });
  } catch (err) {
    console.error('[UsageLog] Error logging failure:', err);
  }
}

/**
 * Calculate next monthly quota reset date
 */
function calculateNextResetDate() {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth.toISOString();
}

/**
 * Format reset date for user display
 */
function formatResetDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * Middleware to check if user can access a specific feature
 * (For future: different features might have different tier requirements)
 */
function requireFeature(featureName) {
  return async (req, res, next) => {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { data: tier } = await supabase
      .from('subscription_tiers')
      .select('features')
      .eq('tier_name', req.userSubscription?.tier || 'none')
      .single();

    const hasFeature = tier?.features?.[featureName] === true;

    if (!hasFeature) {
      return res.status(403).json({
        success: false,
        error: `Feature '${featureName}' not available in your tier`,
        code: 'FEATURE_NOT_AVAILABLE',
        upgrade: true
      });
    }

    next();
  };
}

module.exports = {
  verifyActivePaidUser,
  logUsage,
  logFailure,
  requireFeature
};
