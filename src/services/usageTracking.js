/**
 * AI Usage Tracking & Quota Management
 * Prevents abuse and provides transparency
 */

const { supabase } = require('../database/supabase');

/**
 * Tier-based AI execution limits per month
 */
const TIER_LIMITS = {
  starter: 2,
  growth: 10,
  pro: 50,
  agency: 10000 // Fair use cap
};

/**
 * Check if user has available AI quota before operation
 * @param {string} userId - User ID
 * @returns {Object} { allowed: boolean, current: number, limit: number, error?: string }
 */
async function checkAIQuota(userId) {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('ai_executions_this_month, ai_executions_reset_date, tier')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      console.error('[Usage] Failed to fetch profile:', error);
      return { allowed: false, error: 'User not found' };
    }

    // Check if we need to reset monthly counter
    const resetDate = new Date(profile.ai_executions_reset_date || new Date());
    const now = new Date();
    const shouldReset = now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear();

    const currentCount = shouldReset ? 0 : (profile.ai_executions_this_month || 0);
    const limit = TIER_LIMITS[profile.tier] || TIER_LIMITS.starter;

    // If over limit, deny access
    if (currentCount >= limit) {
      const nextResetDate = new Date(resetDate.getFullYear(), resetDate.getMonth() + 1, 1);

      return {
        allowed: false,
        error: `Monthly AI limit reached (${currentCount}/${limit})`,
        current: currentCount,
        limit: limit,
        resetDate: nextResetDate.toISOString(),
        percentUsed: 100
      };
    }

    return {
      allowed: true,
      current: currentCount,
      limit: limit,
      percentUsed: Math.round((currentCount / limit) * 100)
    };

  } catch (error) {
    console.error('[Usage] Error checking quota:', error);
    // Fail open - don't block users if tracking system breaks
    return { allowed: true, error: 'Quota check failed, allowing request' };
  }
}

/**
 * Track AI usage after successful operation
 * @param {string} userId - User ID
 * @param {number} executionCount - Number of agent executions (e.g., retryCount)
 * @returns {Object} Updated usage stats
 */
async function trackAIUsage(userId, executionCount = 1) {
  try {
    // Get current usage
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('ai_executions_this_month, ai_executions_reset_date, tier')
      .eq('id', userId)
      .single();

    if (fetchError || !profile) {
      console.error('[Usage] Failed to fetch profile for tracking:', fetchError);
      return { success: false };
    }

    // Check if we need to reset monthly counter
    const resetDate = new Date(profile.ai_executions_reset_date || new Date());
    const now = new Date();
    const shouldReset = now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear();

    const newCount = shouldReset ? executionCount : (profile.ai_executions_this_month || 0) + executionCount;
    const limit = TIER_LIMITS[profile.tier] || TIER_LIMITS.starter;

    // Update database
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        ai_executions_this_month: newCount,
        ai_executions_reset_date: shouldReset ? now.toISOString() : profile.ai_executions_reset_date
      })
      .eq('id', userId);

    if (updateError) {
      console.error('[Usage] Failed to update usage:', updateError);
      return { success: false };
    }

    const percentUsed = Math.round((newCount / limit) * 100);

    // Log warnings for high usage
    if (percentUsed >= 80 && percentUsed < 100) {
      console.warn(`[Usage] ⚠️  User ${userId} at ${newCount}/${limit} AI executions (${percentUsed}%)`);
    } else if (percentUsed >= 100) {
      console.warn(`[Usage] 🚨 User ${userId} hit limit: ${newCount}/${limit} executions`);
    } else {
      console.log(`[Usage] ✓ User ${userId} tracked: ${newCount}/${limit} executions (${percentUsed}%)`);
    }

    return {
      success: true,
      current: newCount,
      limit: limit,
      percentUsed: percentUsed,
      remaining: Math.max(0, limit - newCount)
    };

  } catch (error) {
    console.error('[Usage] Error tracking usage:', error);
    // Fail silently - don't break the user experience if tracking fails
    return { success: false };
  }
}

/**
 * Get user's current AI usage stats
 * @param {string} userId - User ID
 * @returns {Object} Usage statistics
 */
async function getUsageStats(userId) {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('ai_executions_this_month, ai_executions_reset_date, tier')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      return {
        success: false,
        error: 'User not found'
      };
    }

    // Check if we need to reset
    const resetDate = new Date(profile.ai_executions_reset_date || new Date());
    const now = new Date();
    const shouldReset = now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear();

    const currentCount = shouldReset ? 0 : (profile.ai_executions_this_month || 0);
    const limit = TIER_LIMITS[profile.tier] || TIER_LIMITS.starter;
    const nextResetDate = new Date(resetDate.getFullYear(), resetDate.getMonth() + 1, 1);

    return {
      success: true,
      current: currentCount,
      limit: limit,
      remaining: Math.max(0, limit - currentCount),
      percentUsed: Math.round((currentCount / limit) * 100),
      tier: profile.tier,
      resetDate: nextResetDate.toISOString()
    };

  } catch (error) {
    console.error('[Usage] Error fetching stats:', error);
    return {
      success: false,
      error: 'Failed to fetch usage stats'
    };
  }
}

/**
 * Reset monthly usage for a user (admin function)
 * @param {string} userId - User ID
 */
async function resetMonthlyUsage(userId) {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        ai_executions_this_month: 0,
        ai_executions_reset_date: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      console.error('[Usage] Failed to reset usage:', error);
      return { success: false };
    }

    console.log(`[Usage] ✓ Reset usage for user ${userId}`);
    return { success: true };

  } catch (error) {
    console.error('[Usage] Error resetting usage:', error);
    return { success: false };
  }
}

module.exports = {
  checkAIQuota,
  trackAIUsage,
  getUsageStats,
  resetMonthlyUsage,
  TIER_LIMITS
};
