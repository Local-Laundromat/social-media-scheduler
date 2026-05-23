const express = require('express');
const router = express.Router();
const { getStripe, isStripeConfigured } = require('../services/stripeClient');

/** Optional annual recurring prices → exact annual totals from Stripe */
const MONTHLY_PRICE_ENV = {
  starter: 'STRIPE_PRICE_STARTER',
  growth: 'STRIPE_PRICE_GROWTH',
  pro: 'STRIPE_PRICE_PRO',
  agency: 'STRIPE_PRICE_AGENCY',
};

const ANNUAL_PRICE_ENV = {
  starter: 'STRIPE_PRICE_STARTER_ANNUAL',
  growth: 'STRIPE_PRICE_GROWTH_ANNUAL',
  pro: 'STRIPE_PRICE_PRO_ANNUAL',
  agency: 'STRIPE_PRICE_AGENCY_ANNUAL',
};

const STATIC_FALLBACK_USD = {
  starter: { monthly: 19, annualMonthlyEquiv: 15 },
  growth: { monthly: 59, annualMonthlyEquiv: 47 },
  pro: { monthly: 149, annualMonthlyEquiv: 119 },
  agency: { monthly: 499, annualMonthlyEquiv: 399 },
};

/** In-memory cache to avoid Stripe rate limits on homepage refresh */
let pricingCache = { expiresAt: 0, payload: null };
const CACHE_MS = Number.parseInt(process.env.PUBLIC_PRICING_CACHE_SECONDS || '60', 10) * 1000;

function pctAnnualDiscountDefault() {
  const n = Number.parseInt(process.env.PUBLIC_PRICING_ANNUAL_DISCOUNT_PERCENT || '20', 10);
  if (!Number.isFinite(n) || n < 0 || n > 90) return 20;
  return n;
}

function buildFallbackPayload() {
  const tiers = {};
  for (const tier of Object.keys(STATIC_FALLBACK_USD)) {
    const f = STATIC_FALLBACK_USD[tier];
    tiers[tier] = {
      tier,
      currency: 'usd',
      monthlyAmountUsd: f.monthly,
      annualMonthlyEquivalentUsd: f.annualMonthlyEquiv,
      annualYearlyTotalUsd: f.annualMonthlyEquiv * 12,
      annualFromStripe: false,
      stripePriceIdMonthly: null,
      stripePriceIdAnnual: null,
      sourceDetail: 'static_fallback',
    };
  }
  return {
    configured: false,
    source: 'static',
    tiers,
    refreshedAt: new Date().toISOString(),
    note:
      'Set STRIPE_SECRET_KEY and STRIPE_PRICE_* env vars so this page mirrors live Stripe Prices (same IDs as Checkout).',
  };
}

async function resolveTier(stripe, tier) {
  const monthlyKey = MONTHLY_PRICE_ENV[tier];
  const monthlyId = (process.env[monthlyKey] || '').trim();
  if (!monthlyId) return null;

  const pm = await stripe.prices.retrieve(monthlyId);
  if (!pm.unit_amount || !pm.currency) return null;

  const monthlyUsd = pm.unit_amount / 100;

  let annualMonthlyEquivUsd;
  let annualYearlyUsd;
  let annualFromStripe = false;
  let stripeAnnualId = null;

  const annualKey = ANNUAL_PRICE_ENV[tier];
  const annualId = annualKey ? (process.env[annualKey] || '').trim() : '';
  if (annualId) {
    const pa = await stripe.prices.retrieve(annualId);
    if (pa.recurring?.interval === 'year' && pa.unit_amount) {
      stripeAnnualId = annualId;
      annualYearlyUsd = pa.unit_amount / 100;
      annualMonthlyEquivUsd = Math.round(pa.unit_amount / 12 / 100);
      annualFromStripe = true;
    }
  }

  if (annualMonthlyEquivUsd == null) {
    const pct = pctAnnualDiscountDefault();
    annualMonthlyEquivUsd = Math.round((monthlyUsd * (100 - pct)) / 100);
    annualYearlyUsd = annualMonthlyEquivUsd * 12;
    annualFromStripe = false;
  }

  return {
    tier,
    currency: pm.currency,
    monthlyAmountUsd: Math.round(monthlyUsd),
    monthlyDisplayUsd:
      monthlyUsd % 1 === 0 ? String(Math.round(monthlyUsd)) : monthlyUsd.toFixed(2),
    annualMonthlyEquivalentUsd: annualMonthlyEquivUsd,
    annualYearlyTotalUsd: annualYearlyUsd,
    annualFromStripe,
    stripePriceIdMonthly: monthlyId,
    stripePriceIdAnnual: stripeAnnualId,
    sourceDetail: 'stripe',
    recurringIntervalMonthly: pm.recurring?.interval || 'month',
  };
}

router.get('/public/pricing', async (req, res) => {
  try {
    const now = Date.now();
    if (pricingCache.payload && pricingCache.expiresAt > now) {
      res.set('Cache-Control', 'public, max-age=60');
      return res.json(pricingCache.payload);
    }

    const stripe = getStripe();
    if (!stripe || !isStripeConfigured()) {
      const body = buildFallbackPayload();
      pricingCache = { expiresAt: now + CACHE_MS, payload: body };
      res.set('Cache-Control', 'public, max-age=30');
      return res.json(body);
    }

    const tiers = {};
    for (const tier of Object.keys(MONTHLY_PRICE_ENV)) {
      try {
        const row = await resolveTier(stripe, tier);
        if (row) tiers[tier] = row;
      } catch (err) {
        console.warn('[public/pricing] Tier fetch failed:', tier, err.message);
      }
    }

    if (Object.keys(tiers).length === 0) {
      const body = buildFallbackPayload();
      body.note =
        'STRIPE_SECRET_KEY is set but no tiers could be loaded—check STRIPE_PRICE_* IDs (must be valid recurring Prices).';
      pricingCache = { expiresAt: now + CACHE_MS, payload: body };
      res.set('Cache-Control', 'public, max-age=30');
      return res.json(body);
    }

    const payload = {
      configured: true,
      source: 'stripe',
      tiers,
      annualDiscountPercentApprox: pctAnnualDiscountDefault(),
      refreshedAt: new Date().toISOString(),
      note: process.env.STRIPE_PRICE_STARTER_ANNUAL
        ? undefined
        : `Annual column uses ~${pctAnnualDiscountDefault()}% off monthly for display unless STRIPE_PRICE_*_ANNUAL IDs are set. Checkout still uses monthly prices until you add annual Checkout prices.`,
    };

    pricingCache = { expiresAt: now + CACHE_MS, payload };
    res.set('Cache-Control', 'public, max-age=60');
    return res.json(payload);
  } catch (err) {
    console.error('[public/pricing]', err);
    const body = buildFallbackPayload();
    body.error = err.message;
    return res.status(200).json(body);
  }
});

module.exports = router;
