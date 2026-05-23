const { supabase } = require('../database/supabase');

const PAID_STATUSES = new Set(['active', 'trialing']);

function tierFromEnvPrice(priceId) {
  if (!priceId) return null;
  const map = {
    starter: process.env.STRIPE_PRICE_STARTER,
    growth: process.env.STRIPE_PRICE_GROWTH,
    pro: process.env.STRIPE_PRICE_PRO,
    agency: process.env.STRIPE_PRICE_AGENCY,
  };
  const pid = String(priceId).trim();
  for (const [tier, envPid] of Object.entries(map)) {
    if (envPid && String(envPid).trim() === pid) return tier;
  }
  return null;
}

/**
 * Resolve tier from Stripe recurring price ID (env vars first, then subscription_tiers.stripe_price_id).
 */
async function resolveTierFromPriceId(priceId) {
  const fromEnv = tierFromEnvPrice(priceId);
  if (fromEnv) return fromEnv;

  if (!priceId) return null;
  const { data, error } = await supabase
    .from('subscription_tiers')
    .select('tier_name')
    .eq('stripe_price_id', String(priceId).trim())
    .maybeSingle();

  if (!error && data?.tier_name) return data.tier_name;
  return null;
}

function firstRecurringPriceId(subscription) {
  const items = subscription?.items?.data;
  if (!items?.length) return null;
  return items[0]?.price?.id || null;
}

/**
 * Persist Stripe subscription snapshot onto profiles (existing guardrail columns).
 */
async function syncProfileFromStripeSubscription(profileId, subscription, customerId) {
  if (!profileId || !subscription) return;

  const priceId = firstRecurringPriceId(subscription);
  const metaTier = subscription.metadata?.tier;
  const tierFromPrice = await resolveTierFromPriceId(priceId);

  let tier = tierFromPrice || metaTier || 'none';

  const status = subscription.status || 'inactive';
  const isPaid = PAID_STATUSES.has(status);

  if (!isPaid) {
    tier = 'none';
  }

  const { data: tierRow } =
    tier && tier !== 'none'
      ? await supabase
          .from('subscription_tiers')
          .select('max_ai_executions_per_month')
          .eq('tier_name', tier)
          .maybeSingle()
      : { data: null };

  const maxAllowed =
    isPaid && tierRow?.max_ai_executions_per_month != null
      ? tierRow.max_ai_executions_per_month
      : 0;

  const currentPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  const startedAt = subscription.start_date
    ? new Date(subscription.start_date * 1000).toISOString()
    : null;

  const updates = {
    stripe_subscription_id: subscription.id,
    stripe_subscription_status: status,
    subscription_tier: tier,
    max_allowed_usage: maxAllowed,
    subscription_renews_at: currentPeriodEnd,
    subscription_started_at: startedAt,
    updated_at: new Date().toISOString(),
  };
  if (customerId) {
    updates.stripe_customer_id = customerId;
  }

  const { error } = await supabase.from('profiles').update(updates).eq('id', profileId);

  if (error) {
    console.error('[StripeSync] Failed to update profile', profileId, error);
    throw error;
  }

  console.log(`[StripeSync] profile=${profileId} status=${status} tier=${tier} price=${priceId || 'n/a'}`);
}

/**
 * Subscription removed or unpaid — revoke paid entitlements without deleting Stripe IDs (optional retention).
 */
async function markSubscriptionInactive(profileId, { clearSubscriptionId } = {}) {
  const patch = {
    stripe_subscription_status: 'canceled',
    subscription_tier: 'none',
    max_allowed_usage: 0,
    subscription_renews_at: null,
    updated_at: new Date().toISOString(),
  };
  if (clearSubscriptionId) {
    patch.stripe_subscription_id = null;
  }
  await supabase.from('profiles').update(patch).eq('id', profileId);
}

async function resolveProfileIdForStripeCustomer(customerId) {
  if (!customerId) return null;
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  return data?.id || null;
}

module.exports = {
  resolveTierFromPriceId,
  syncProfileFromStripeSubscription,
  markSubscriptionInactive,
  resolveProfileIdForStripeCustomer,
  PAID_STATUSES,
};
