const express = require('express');
const router = express.Router();
const { supabase } = require('../database/supabase');
const { authenticateSupabase } = require('../middleware/auth');

/**
 * Simple admin authentication
 * TODO: Replace with proper admin role check
 */
function requireAdmin(req, res, next) {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';

  if (!req.userEmail || req.userEmail !== adminEmail) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

/**
 * GET /api/admin/stats - Dashboard overview stats
 */
router.get('/stats', authenticateSupabase, requireAdmin, async (req, res) => {
  try {
    // Total users
    const { count: totalUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    // Active subscriptions
    const { count: activeSubscriptions } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .in('stripe_subscription_status', ['active', 'trialing']);

    // Users by tier
    const { data: tierBreakdown } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .in('stripe_subscription_status', ['active', 'trialing']);

    const tierCounts = {
      starter: 0,
      growth: 0,
      pro: 0,
      agency: 0,
      none: 0
    };

    (tierBreakdown || []).forEach(row => {
      const tier = row.subscription_tier || 'none';
      tierCounts[tier] = (tierCounts[tier] || 0) + 1;
    });

    // Monthly recurring revenue (MRR)
    const tierPrices = {
      starter: 19,
      growth: 59,
      pro: 149,
      agency: 499
    };

    const mrr = Object.keys(tierCounts).reduce((sum, tier) => {
      return sum + (tierCounts[tier] * (tierPrices[tier] || 0));
    }, 0);

    // Total AI usage this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count: aiCallsThisMonth } = await supabase
      .from('usage_logs')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfMonth.toISOString());

    // Total teams
    const { count: totalTeams } = await supabase
      .from('teams')
      .select('*', { count: 'exact', head: true });

    // Total posts created
    const { count: totalPosts } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true });

    // Posts published this month
    const { count: postsThisMonth } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfMonth.toISOString())
      .eq('status', 'published');

    res.json({
      totalUsers,
      activeSubscriptions,
      tierBreakdown: tierCounts,
      mrr,
      aiCallsThisMonth,
      totalTeams,
      totalPosts,
      postsThisMonth
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/users - List all users with subscription details
 */
router.get('/users', authenticateSupabase, requireAdmin, async (req, res) => {
  const { limit = 100, offset = 0, status, tier, search } = req.query;

  try {
    let query = supabase
      .from('profiles')
      .select(`
        id,
        name,
        email,
        team_id,
        stripe_customer_id,
        stripe_subscription_id,
        stripe_subscription_status,
        subscription_tier,
        current_monthly_usage,
        max_allowed_usage,
        uses_own_api_key,
        subscription_started_at,
        subscription_renews_at,
        created_at
      `)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status) {
      query = query.eq('stripe_subscription_status', status);
    }

    if (tier) {
      query = query.eq('subscription_tier', tier);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: users, error, count } = await query;

    if (error) throw error;

    // Enrich with team info
    const enrichedUsers = await Promise.all((users || []).map(async (user) => {
      let teamInfo = null;

      if (user.team_id) {
        const { data: team } = await supabase
          .from('teams')
          .select('id, name, owner_id')
          .eq('id', user.team_id)
          .single();

        if (team) {
          teamInfo = {
            id: team.id,
            name: team.name,
            isOwner: team.owner_id === user.id
          };
        }
      }

      return {
        ...user,
        team: teamInfo
      };
    }));

    res.json({
      users: enrichedUsers,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Admin users list error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/usage - Usage analytics
 */
router.get('/usage', authenticateSupabase, requireAdmin, async (req, res) => {
  const { days = 30 } = req.query;

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Usage by day
    const { data: usageByDay } = await supabase
      .from('usage_logs')
      .select('created_at, feature_type')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    // Group by day
    const dailyUsage = {};
    (usageByDay || []).forEach(log => {
      const day = log.created_at.split('T')[0];
      if (!dailyUsage[day]) {
        dailyUsage[day] = { total: 0, by_feature: {} };
      }
      dailyUsage[day].total++;
      dailyUsage[day].by_feature[log.feature_type] =
        (dailyUsage[day].by_feature[log.feature_type] || 0) + 1;
    });

    // Usage by feature
    const { data: featureUsage } = await supabase
      .from('usage_logs')
      .select('feature_type')
      .gte('created_at', startDate.toISOString());

    const featureCounts = {};
    (featureUsage || []).forEach(log => {
      featureCounts[log.feature_type] = (featureCounts[log.feature_type] || 0) + 1;
    });

    // Top users by usage
    const { data: userUsage } = await supabase
      .from('usage_logs')
      .select('user_id')
      .gte('created_at', startDate.toISOString());

    const userCounts = {};
    (userUsage || []).forEach(log => {
      userCounts[log.user_id] = (userCounts[log.user_id] || 0) + 1;
    });

    const topUserIds = Object.entries(userCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([userId]) => userId);

    const { data: topUsersData } = await supabase
      .from('profiles')
      .select('id, name, email, subscription_tier')
      .in('id', topUserIds);

    const topUsers = topUsersData?.map(user => ({
      ...user,
      usageCount: userCounts[user.id]
    })).sort((a, b) => b.usageCount - a.usageCount);

    res.json({
      dailyUsage,
      featureUsage: featureCounts,
      topUsers: topUsers || []
    });
  } catch (error) {
    console.error('Admin usage analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/revenue - Revenue analytics
 */
router.get('/revenue', authenticateSupabase, requireAdmin, async (req, res) => {
  try {
    // Current MRR by tier
    const { data: activeSubs } = await supabase
      .from('profiles')
      .select('subscription_tier, subscription_started_at')
      .in('stripe_subscription_status', ['active', 'trialing']);

    const tierPrices = {
      starter: 19,
      growth: 59,
      pro: 149,
      agency: 499
    };

    let currentMRR = 0;
    const mrrByTier = {};
    const newMRRThisMonth = {};

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    (activeSubs || []).forEach(sub => {
      const tier = sub.subscription_tier || 'none';
      const price = tierPrices[tier] || 0;

      currentMRR += price;
      mrrByTier[tier] = (mrrByTier[tier] || 0) + price;

      // Check if subscription started this month
      if (sub.subscription_started_at &&
          new Date(sub.subscription_started_at) >= startOfMonth) {
        newMRRThisMonth[tier] = (newMRRThisMonth[tier] || 0) + price;
      }
    });

    // Churn (canceled subscriptions this month)
    const { data: canceledSubs } = await supabase
      .from('profiles')
      .select('subscription_tier, updated_at')
      .eq('stripe_subscription_status', 'canceled')
      .gte('updated_at', startOfMonth.toISOString());

    let churnedMRR = 0;
    (canceledSubs || []).forEach(sub => {
      const tier = sub.subscription_tier || 'none';
      churnedMRR += tierPrices[tier] || 0;
    });

    // MRR growth
    const totalNewMRR = Object.values(newMRRThisMonth).reduce((sum, val) => sum + val, 0);
    const mrrGrowth = totalNewMRR - churnedMRR;
    const mrrGrowthPercent = currentMRR > 0 ? (mrrGrowth / currentMRR) * 100 : 0;

    res.json({
      currentMRR,
      mrrByTier,
      newMRRThisMonth: totalNewMRR,
      churnedMRR,
      mrrGrowth,
      mrrGrowthPercent: mrrGrowthPercent.toFixed(2),
      arr: currentMRR * 12 // Annual Recurring Revenue
    });
  } catch (error) {
    console.error('Admin revenue analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/teams - List all teams
 */
router.get('/teams', authenticateSupabase, requireAdmin, async (req, res) => {
  try {
    const { data: teams } = await supabase
      .from('team_stats')
      .select('*')
      .order('total_members', { ascending: false });

    res.json({ teams: teams || [] });
  } catch (error) {
    console.error('Admin teams list error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/users/:userId/subscription - Manually update user subscription (emergency use)
 */
router.post('/users/:userId/subscription', authenticateSupabase, requireAdmin, async (req, res) => {
  const { userId } = req.params;
  const { subscription_tier, stripe_subscription_status, max_allowed_usage } = req.body;

  try {
    const updates = {};

    if (subscription_tier) updates.subscription_tier = subscription_tier;
    if (stripe_subscription_status) updates.stripe_subscription_status = stripe_subscription_status;
    if (max_allowed_usage !== undefined) updates.max_allowed_usage = parseInt(max_allowed_usage);

    updates.updated_at = new Date().toISOString();

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Subscription updated successfully',
      updates
    });
  } catch (error) {
    console.error('Admin update subscription error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
