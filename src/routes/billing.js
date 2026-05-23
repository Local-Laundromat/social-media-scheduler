const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { supabase } = require('../database/supabase');
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

/**
 * GET /api/billing/status — current subscription fields for dashboard
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select(
        'stripe_customer_id, stripe_subscription_id, stripe_subscription_status, subscription_tier, subscription_renews_at, subscription_started_at, max_allowed_usage, current_monthly_usage, uses_own_api_key'
      )
      .eq('id', req.userId)
      .single();

    if (error || !profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json({
      configured: isStripeConfigured(),
      stripeApiVersion: getStripeApiVersion(),
      subscription: {
        status: profile.stripe_subscription_status || 'inactive',
        tier: profile.subscription_tier || 'none',
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
 * body: { tier: "starter" | "growth" | "pro" | "agency" }
 */
router.post('/create-checkout-session', authenticateToken, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({
      error: 'Stripe is not configured',
      hint: 'Set STRIPE_SECRET_KEY and price env vars (see .env.supabase.example)',
    });
  }

  const tier = String(req.body?.tier || '').toLowerCase();
  const allowed = ['starter', 'growth', 'pro', 'agency'];
  if (!allowed.includes(tier)) {
    return res.status(400).json({ error: 'Invalid tier', allowed });
  }

  const priceId = priceIdForTier(tier);
  if (!priceId) {
    return res.status(503).json({
      error: `Missing Stripe price for tier "${tier}"`,
      hint: `Set STRIPE_PRICE_${tier.toUpperCase()} in the environment`,
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
