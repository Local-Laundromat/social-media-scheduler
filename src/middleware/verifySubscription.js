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
 * TIER-BASED AGENT ACCESS CONTROL
 * Protects revenue by limiting which AI agents are available at each tier
 *
 * Strategy: Basic features at lower tiers, advanced multi-agent workflows at higher tiers
 */
const TIER_AGENT_ACCESS = {
  starter: {
    // Basic content generation only (single agent)
    contentPlanning: ['LILY'], // Can draft posts, but no quality checking
    commentManagement: ['NOVA', 'ECHO'], // Can analyze sentiment and intent, but no auto-replies
    maxAgentsPerWorkflow: 2,
    description: 'Basic AI assistance - Caption drafting and comment analysis'
  },
  growth: {
    // Quality-checked content + basic auto-replies
    contentPlanning: ['LILY', 'MARCUS'], // Drafting + quality review
    commentManagement: ['NOVA', 'ECHO', 'ATLAS', 'SAGE'], // Full analysis + reply generation (no auto-posting)
    maxAgentsPerWorkflow: 4,
    description: 'Quality-checked content and smart reply suggestions'
  },
  pro: {
    // Full agent teams with optimization and auto-replies
    contentPlanning: ['LILY', 'MARCUS', 'KAI'], // Full team: Draft → Critique → Optimize
    commentManagement: ['NOVA', 'ECHO', 'ATLAS', 'SAGE', 'QUINN'], // Full team including auto-reply routing
    maxAgentsPerWorkflow: 5,
    description: 'Complete AI team with autonomous workflows'
  },
  agency: {
    // Everything + custom tuning options
    contentPlanning: ['LILY', 'MARCUS', 'KAI'],
    commentManagement: ['NOVA', 'ECHO', 'ATLAS', 'SAGE', 'QUINN'],
    maxAgentsPerWorkflow: 999, // Unlimited
    customPrompts: true, // Can customize agent behavior
    priorityProcessing: true, // Faster execution
    description: 'Full AI power with custom tuning and priority processing'
  }
};

/**
 * Map agent names to their features for access control
 */
const AGENT_FEATURES = {
  // Content Planning Team
  LILY: { name: 'Lily', role: 'Creative Writer', feature: 'content_drafting' },
  MARCUS: { name: 'Marcus', role: 'Quality Critic', feature: 'content_quality_check' },
  KAI: { name: 'Kai', role: 'Strategy Optimizer', feature: 'content_optimization' },

  // Comment Management Team
  NOVA: { name: 'Nova', role: 'Sentiment Analyzer', feature: 'comment_sentiment_analysis' },
  ECHO: { name: 'Echo', role: 'Intent Detective', feature: 'comment_intent_detection' },
  ATLAS: { name: 'Atlas', role: 'Priority Scorer', feature: 'comment_priority_scoring' },
  SAGE: { name: 'Sage', role: 'Response Writer', feature: 'comment_reply_generation' },
  QUINN: { name: 'Quinn', role: 'Auto-Reply Router', feature: 'comment_auto_reply' }
};

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

/**
 * Check if user can connect another social account based on their tier limits
 * Call this BEFORE allowing new account connections
 */
async function checkAccountLimit(userId) {
  try {
    // Get user's subscription tier and current account count
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return {
        allowed: false,
        error: 'User profile not found',
        code: 'PROFILE_NOT_FOUND'
      };
    }

    // Get tier limits from subscription_tiers table
    const { data: tier, error: tierError } = await supabase
      .from('subscription_tiers')
      .select('max_social_accounts, tier_name')
      .eq('tier_name', profile.subscription_tier)
      .single();

    if (tierError || !tier) {
      // If no tier found, default to free tier with 0 accounts
      return {
        allowed: false,
        error: 'No active subscription. Please upgrade to connect social accounts.',
        code: 'NO_SUBSCRIPTION',
        currentCount: 0,
        limit: 0,
        tier: 'none'
      };
    }

    // Count total active accounts across all platforms
    const accountTables = [
      'facebook_accounts',
      'instagram_accounts',
      'tiktok_accounts',
      'pinterest_accounts',
      'youtube_accounts',
      'google_business_accounts'
    ];

    let totalAccounts = 0;
    for (const table of accountTables) {
      const { count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_active', true);

      totalAccounts += count || 0;
    }

    // Check if user has reached their limit
    const maxAccounts = tier.max_social_accounts;
    const allowed = totalAccounts < maxAccounts;

    return {
      allowed,
      currentCount: totalAccounts,
      limit: maxAccounts,
      tier: tier.tier_name,
      error: allowed ? null : `Account limit reached. Your ${tier.tier_name} plan allows ${maxAccounts} social accounts.`,
      code: allowed ? null : 'ACCOUNT_LIMIT_REACHED'
    };

  } catch (err) {
    console.error('[AccountLimitCheck] Internal error:', err);
    return {
      allowed: false,
      error: 'Failed to check account limits',
      code: 'INTERNAL_ERROR'
    };
  }
}

/**
 * Check if user's tier has access to specific agents
 * Returns which agents are allowed for the user's current tier
 */
async function checkAgentAccess(userId, workflowType) {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      return {
        allowed: false,
        error: 'User profile not found',
        code: 'PROFILE_NOT_FOUND',
        availableAgents: []
      };
    }

    const tier = profile.subscription_tier || 'starter';
    const tierAccess = TIER_AGENT_ACCESS[tier];

    if (!tierAccess) {
      return {
        allowed: false,
        error: 'Invalid subscription tier',
        code: 'INVALID_TIER',
        availableAgents: []
      };
    }

    const availableAgents = workflowType === 'content'
      ? tierAccess.contentPlanning
      : tierAccess.commentManagement;

    return {
      allowed: true,
      tier,
      availableAgents,
      maxAgentsPerWorkflow: tierAccess.maxAgentsPerWorkflow,
      description: tierAccess.description,
      customPrompts: tierAccess.customPrompts || false,
      priorityProcessing: tierAccess.priorityProcessing || false
    };

  } catch (err) {
    console.error('[AgentAccessCheck] Internal error:', err);
    return {
      allowed: false,
      error: 'Failed to check agent access',
      code: 'INTERNAL_ERROR',
      availableAgents: []
    };
  }
}

/**
 * Verify user can use specific agent(s)
 * Blocks requests if agent is not in user's tier
 */
async function verifyAgentAccess(userId, requiredAgents, workflowType) {
  const accessCheck = await checkAgentAccess(userId, workflowType);

  if (!accessCheck.allowed) {
    return {
      success: false,
      error: accessCheck.error,
      code: accessCheck.code
    };
  }

  // Check if all required agents are available in user's tier
  const unavailableAgents = requiredAgents.filter(
    agent => !accessCheck.availableAgents.includes(agent)
  );

  if (unavailableAgents.length > 0) {
    // Find which tier they need for these agents
    const suggestedTier = getSuggestedTierForAgents(requiredAgents, workflowType);

    return {
      success: false,
      error: `Your ${accessCheck.tier} plan doesn't include ${unavailableAgents.map(a => AGENT_FEATURES[a]?.name || a).join(', ')}`,
      code: 'AGENT_NOT_AVAILABLE',
      details: {
        currentTier: accessCheck.tier,
        availableAgents: accessCheck.availableAgents.map(a => AGENT_FEATURES[a]?.name || a),
        unavailableAgents: unavailableAgents.map(a => AGENT_FEATURES[a]?.name || a),
        suggestedTier,
        upgradeUrl: '/settings#billing'
      },
      message: `🔒 ${unavailableAgents.map(a => AGENT_FEATURES[a]?.name || a).join(' & ')} ${unavailableAgents.length === 1 ? 'is' : 'are'} available in the ${suggestedTier} plan and above.`,
      cta: {
        text: `Upgrade to ${suggestedTier.charAt(0).toUpperCase() + suggestedTier.slice(1)}`,
        action: 'upgrade_tier',
        targetTier: suggestedTier
      }
    };
  }

  return {
    success: true,
    tier: accessCheck.tier,
    availableAgents: accessCheck.availableAgents,
    customPrompts: accessCheck.customPrompts,
    priorityProcessing: accessCheck.priorityProcessing
  };
}

/**
 * Helper: Find minimum tier needed for requested agents
 */
function getSuggestedTierForAgents(requiredAgents, workflowType) {
  const tiers = ['starter', 'growth', 'pro', 'agency'];

  for (const tier of tiers) {
    const tierAccess = TIER_AGENT_ACCESS[tier];
    const availableAgents = workflowType === 'content'
      ? tierAccess.contentPlanning
      : tierAccess.commentManagement;

    const hasAllAgents = requiredAgents.every(agent => availableAgents.includes(agent));

    if (hasAllAgents) {
      return tier;
    }
  }

  return 'agency'; // Fallback to highest tier
}

/**
 * Get user's available agents for UI display
 * Shows which agents are locked/unlocked based on tier
 */
async function getUserAgentStatus(userId) {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      return { error: 'User profile not found' };
    }

    const tier = profile.subscription_tier || 'starter';
    const tierAccess = TIER_AGENT_ACCESS[tier];

    // Build agent status for UI
    const contentAgents = Object.keys(AGENT_FEATURES)
      .filter(agent => ['LILY', 'MARCUS', 'KAI'].includes(agent))
      .map(agent => ({
        ...AGENT_FEATURES[agent],
        agentId: agent,
        unlocked: tierAccess.contentPlanning.includes(agent),
        availableInTier: getMinimumTierForAgent(agent, 'content')
      }));

    const commentAgents = Object.keys(AGENT_FEATURES)
      .filter(agent => ['NOVA', 'ECHO', 'ATLAS', 'SAGE', 'QUINN'].includes(agent))
      .map(agent => ({
        ...AGENT_FEATURES[agent],
        agentId: agent,
        unlocked: tierAccess.commentManagement.includes(agent),
        availableInTier: getMinimumTierForAgent(agent, 'comment')
      }));

    return {
      tier,
      tierDescription: tierAccess.description,
      contentPlanning: {
        agents: contentAgents,
        maxAgentsPerWorkflow: tierAccess.maxAgentsPerWorkflow
      },
      commentManagement: {
        agents: commentAgents,
        maxAgentsPerWorkflow: tierAccess.maxAgentsPerWorkflow
      },
      premiumFeatures: {
        customPrompts: tierAccess.customPrompts || false,
        priorityProcessing: tierAccess.priorityProcessing || false
      }
    };

  } catch (err) {
    console.error('[AgentStatus] Error:', err);
    return { error: 'Failed to get agent status' };
  }
}

/**
 * Helper: Get minimum tier required for specific agent
 */
function getMinimumTierForAgent(agentId, workflowType) {
  const tiers = ['starter', 'growth', 'pro', 'agency'];
  const agentsKey = workflowType === 'content' ? 'contentPlanning' : 'commentManagement';

  for (const tier of tiers) {
    const tierAccess = TIER_AGENT_ACCESS[tier];
    if (tierAccess[agentsKey].includes(agentId)) {
      return tier;
    }
  }

  return 'agency';
}

module.exports = {
  verifyActivePaidUser,
  logUsage,
  logFailure,
  requireFeature,
  checkAccountLimit,
  checkAgentAccess,
  verifyAgentAccess,
  getUserAgentStatus,
  TIER_AGENT_ACCESS,
  AGENT_FEATURES
};
