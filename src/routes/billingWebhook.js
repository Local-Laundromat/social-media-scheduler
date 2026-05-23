const { getStripe, getStripeApiVersion } = require('../services/stripeClient');
const {
  syncProfileFromStripeSubscription,
  markSubscriptionInactive,
  resolveProfileIdForStripeCustomer,
} = require('../services/stripeBillingSync');

/**
 * Stripe sends application/json; body must be raw bytes for signature verification.
 */
async function stripeWebhookHandler(req, res) {
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    console.error('[Stripe webhook] STRIPE_WEBHOOK_SECRET is not configured');
    return res.status(503).json({ error: 'Stripe webhooks not configured' });
  }

  const stripe = getStripe();
  if (!stripe) {
    console.error('[Stripe webhook] STRIPE_SECRET_KEY missing');
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.warn('[Stripe webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (process.env.STRIPE_LOG_EVENTS === 'true') {
    console.log('[Stripe webhook]', event.type, event.id);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode !== 'subscription') {
          break;
        }
        const userId = session.metadata?.supabase_user_id;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
        const subscriptionId =
          typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

        if (!userId || !customerId || !subscriptionId) {
          console.warn('[Stripe webhook] checkout.session.completed missing metadata', {
            hasUserId: !!userId,
            hasCustomer: !!customerId,
            hasSub: !!subscriptionId,
          });
          break;
        }

        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        await syncProfileFromStripeSubscription(userId, sub, customerId);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId =
          typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
        let profileId = subscription.metadata?.supabase_user_id;
        if (!profileId && customerId) {
          profileId = await resolveProfileIdForStripeCustomer(customerId);
        }
        if (!profileId) {
          console.warn('[Stripe webhook]', event.type, 'could not resolve profile id', subscription.id);
          break;
        }
        await syncProfileFromStripeSubscription(profileId, subscription, customerId);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId =
          typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
        let profileId = subscription.metadata?.supabase_user_id;
        if (!profileId && customerId) {
          profileId = await resolveProfileIdForStripeCustomer(customerId);
        }
        if (!profileId) break;
        await markSubscriptionInactive(profileId, { clearSubscriptionId: true });
        break;
      }

      default:
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[Stripe webhook] handler error:', event?.type, err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  stripeWebhookHandler,
  getStripeWebhookApiVersion: () => getStripeApiVersion(),
};
