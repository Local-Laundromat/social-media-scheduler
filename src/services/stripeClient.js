const Stripe = require('stripe');

/**
 * Pin Stripe API version explicitly (recommended for stable webhooks and responses).
 * Defaults to the API version bundled with this release of `stripe` on npm.
 * Override via STRIPE_API_VERSION in `.env` when upgrading the Stripe SDK intentionally.
 */
const BUNDLED_STRIPE_API_VERSION = '2026-04-22.dahlia';

function getStripeApiVersion() {
  return process.env.STRIPE_API_VERSION || BUNDLED_STRIPE_API_VERSION;
}

let stripeSingleton = null;

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !String(key).trim()) {
    return null;
  }
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key, {
      apiVersion: getStripeApiVersion(),
    });
  }
  return stripeSingleton;
}

function isStripeConfigured() {
  return !!(process.env.STRIPE_SECRET_KEY && String(process.env.STRIPE_SECRET_KEY).trim());
}

module.exports = {
  getStripe,
  getStripeApiVersion,
  isStripeConfigured,
};
