const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { supabase } = require('../database/supabase');
const { getBillingContext } = require('../services/teamBillingContext');
const { getStripe, isStripeConfigured, getStripeApiVersion } = require('../services/stripeClient');

function publicBaseUrl() {
  return (
    process.env.APP_PUBLIC_URL ||
    process.env.FRONTEND_URL ||
    process.env.PUBLIC_APP_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

function priceIdForTier(tier) {
  const map = {
    starter: process.env.STRIPE_PRICE_STARTER,
    growth: process.env.STRIPE_PRICE_GROWTH,
    pro: process.env.STRIPE_PRICE_PRO,
    agency: process.env.STRIPE_PRICE_AGENCY,
  };
  const id = map[tier];
  return id && String(id).trim() ? String(id).trim() : null;
}

async function resolvePriceIdForTier(tierName) {
  const fromEnv = priceIdForTier(tierName);
  if (fromEnv) return fromEnv;

  const { data } = await supabase
    .from('subscription_tiers')
    .select('stripe_price_id')
    .eq('tier_name', String(tierName || '').toLowerCase())
    .eq('is_active', true)
    .maybeSingle();

  const pid = data?.stripe_price_id;
  return pid && String(pid).trim() ? String(pid).trim() : null;
}

async function loadTierCatalogRows() {
  const { data, error } = await supabase
    .from('subscription_tiers')
    .select(
      'tier_name, monthly_price_usd, max_social_accounts, max_ai_executions_per_month, requires_own_api_key, features, stripe_price_id'
    )
    .eq('is_active', true)
    .order('monthly_price_usd', { ascending: true });

  if (error) {
    console.error('[billing] subscription_tiers:', error.message);
    return [];
  }
  return data || [];
}

function serializeTierRow(row, checkoutAvailable) {
  return {
    tierName: row.tier_name,
    monthlyPriceUsd: row.monthly_price_usd != null ? Number(row.monthly_price_usd) : null,
    maxSocialAccounts: row.max_social_accounts,
    maxAiExecutionsPerMonth: row.max_ai_executions_per_month,
    requiresOwnApiKey: !!row.requires_own_api_key,
    features: row.features && typeof row.features === 'object' ? row.features : {},
    stripePriceIdConfigured: !!(row.stripe_price_id && String(row.stripe_price_id).trim()),
    checkoutAvailable: !!checkoutAvailable,
  };
}

async function buildTierCatalogSerialization() {
  const rows = await loadTierCatalogRows();
  const out = [];
  for (const row of rows) {
    const pid = await resolvePriceIdForTier(row.tier_name);
    out.push(serializeTierRow(row, !!pid));
  }
  return out;
}

/**
 * GET /api/billing/status — current subscription + tiers from DB (+ optional Stripe invoice line)
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const ctx = await getBillingContext(req.userId);
    const billedId = ctx.billingProfileId;

    const { data: profile, error } = await supabase
      .from('profiles')
      .select(
        'email, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, subscription_tier, subscription_renews_at, subscription_started_at, max_allowed_usage, current_monthly_usage, uses_own_api_key'
      )
      .eq('id', billedId)
      .single();

    if (error || !profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const tierCatalog = await buildTierCatalogSerialization();
    const currentTierSlug = profile.subscription_tier || 'none';
    const currentTierPlan =
      currentTierSlug && currentTierSlug !== 'none'
        ? tierCatalog.find((t) => t.tierName === currentTierSlug) || null
        : null;

    let stripeBilling = null;
    const stripe = getStripe();
    if (stripe && profile.stripe_subscription_id) {
      try {
        const sub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id, {
          expand: ['items.data.price.product'],
        });
        const item = sub.items?.data?.[0];
        const priceObj = item?.price;
        const productRef = priceObj?.product;
        const productObj =
          productRef && typeof productRef !== 'string' ? productRef : null;

        const interval = priceObj?.recurring?.interval || null;
        const intervalCount = priceObj?.recurring?.interval_count || 1;
        stripeBilling = {
          priceId: priceObj?.id || null,
          currency: priceObj?.currency || 'usd',
          unitAmount:
            typeof priceObj?.unit_amount === 'number' ? priceObj.unit_amount : null,
          interval,
          intervalCount,
          productName: productObj?.name || priceObj?.nickname || null,
          cancelAtPeriodEnd: !!sub.cancel_at_period_end,
          currentPeriodEnd: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
        };
      } catch (e) {
        console.warn('[billing/status] Stripe retrieve failed:', e.message);
      }
    }

    const nextRenewalAt =
      stripeBilling?.currentPeriodEnd || profile.subscription_renews_at || null;

    res.json({
      configured: isStripeConfigured(),
      stripeApiVersion: getStripeApiVersion(),
      billing: {
        billedProfileId: billedId,
        canManageStripe: ctx.canManageStripe,
        viewerIsTeamMemberBilling: billedId !== String(req.userId),
        teamId: ctx.teamId,
        ownerContactEmail:
          billedId !== String(req.userId) && profile.email ? profile.email : null,
      },
      tierCatalog,
      currentTierPlan,
      stripeBilling,
      nextRenewalAt,
      subscription: {
        status: profile.stripe_subscription_status || 'inactive',
        tier: currentTierSlug,
        customerId: profile.stripe_customer_id || null,
        subscriptionId: profile.stripe_subscription_id || null,
        renewsAt: profile.subscription_renews_at || null,
        startedAt: profile.subscription_started_at || null,
        maxAllowedUsage: profile.max_allowed_usage ?? 0,
        currentMonthlyUsage: profile.current_monthly_usage ?? 0,
        usesOwnApiKey: !!profile.uses_own_api_key,
      },
    });
  } catch (e) {
    console.error('[billing/status]', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/billing/create-checkout-session
 * body: { tier: string } — tier must exist in subscription_tiers (is_active=true) with a Stripe price (env STRIPE_PRICE_* or stripe_price_id)
 */
router.post('/create-checkout-session', authenticateToken, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({
      error: 'Stripe is not configured',
      hint: 'Set STRIPE_SECRET_KEY and price env vars (see .env.supabase.example)',
    });
  }

  const billingCtx = await getBillingContext(req.userId);
  if (!billingCtx.canManageStripe) {
    return res.status(403).json({
      error: 'Only the team workspace owner can start checkout',
      hint: 'Ask whoever created your team (invite sender) to choose a paid plan.',
    });
  }

  const tier = String(req.body?.tier || '').toLowerCase();
  const { data: activeTierRow } = await supabase
    .from('subscription_tiers')
    .select('tier_name')
    .eq('tier_name', tier)
    .eq('is_active', true)
    .maybeSingle();

  if (!activeTierRow) {
    return res.status(400).json({
      error: 'Unknown or inactive plan',
      hint: 'Choose a tier from subscription_tiers marked active.',
    });
  }

  const priceId = await resolvePriceIdForTier(tier);
  if (!priceId) {
    return res.status(503).json({
      error: `No Stripe price mapped for tier "${tier}"`,
      hint: `Set STRIPE_PRICE_${tier.toUpperCase()} or subscription_tiers.stripe_price_id for this tier.`,
    });
  }

  try {
    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('id, email, name, stripe_customer_id')
      .eq('id', req.userId)
      .single();

    if (pErr || !profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    let customerId = profile.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email || req.user?.email,
        name: profile.name || undefined,
        metadata: { supabase_user_id: profile.id },
      });
      customerId = customer.id;
      await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', profile.id);
    }

    const base = publicBaseUrl();
    const successUrl = process.env.STRIPE_CHECKOUT_SUCCESS_URL || `${base}/dashboard?billing=success`;
    const cancelUrl = process.env.STRIPE_CHECKOUT_CANCEL_URL || `${base}/dashboard?billing=cancel`;

    const successWithSession =
      successUrl.includes('{CHECKOUT_SESSION_ID}') ? successUrl : `${successUrl}${successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: profile.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successWithSession,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      metadata: {
        supabase_user_id: profile.id,
        tier,
      },
      subscription_data: {
        metadata: {
          supabase_user_id: profile.id,
          tier,
        },
      },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (e) {
    console.error('[billing/create-checkout-session]', e);
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/billing/create-portal-session — Stripe Customer Portal
 */
router.post('/create-portal-session', authenticateToken, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe is not configured' });
  }

  const billingCtxPortal = await getBillingContext(req.userId);
  if (!billingCtxPortal.canManageStripe) {
    return res.status(403).json({
      error: 'Only the team workspace owner can open the Stripe customer portal',
    });
  }

  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', req.userId)
      .single();

    if (error || !profile?.stripe_customer_id) {
      return res.status(400).json({
        error: 'No Stripe customer on file',
        hint: 'Start a subscription via Checkout first',
      });
    }

    const base = publicBaseUrl();
    const returnUrl = process.env.STRIPE_PORTAL_RETURN_URL || `${base}/dashboard?billing=portal`;

    const portal = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: returnUrl,
    });

    res.json({ url: portal.url });
  } catch (e) {
    console.error('[billing/create-portal-session]', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
