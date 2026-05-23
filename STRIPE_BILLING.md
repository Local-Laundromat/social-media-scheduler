# Stripe subscription billing (API workflow)

Server-side Stripe integration uses the **pinned API version** in `src/services/stripeClient.js` (default matches the bundled `stripe` npm release). Override with **`STRIPE_API_VERSION`** in `.env` if you deliberately upgrade/downgrade the SDK.

## Prerequisites

1. Run the subscription migration (`migrations/add-subscription-guardrails.sql`) so `profiles` includes `stripe_*` and quota columns.
2. In [Stripe Dashboard](https://dashboard.stripe.com/), create **Products** and **monthly recurring Prices** for: Starter, Growth, Pro, Agency (or whichever tiers you sell).
3. Enable **Customer portal** (Settings → Billing → Customer portal).

## Environment variables

Copy from [.env.supabase.example](.env.supabase.example) `Stripe` section into your `.env`:

| Variable | Purpose |
|---------|---------|
| `STRIPE_SECRET_KEY` | Secret API key (`sk_live_…` / `sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret from Dashboard or `stripe listen` (`whsec_…`) |
| `STRIPE_PRICE_STARTER` … `STRIPE_PRICE_AGENCY` | Price IDs (`price_…`) for each tier |
| `APP_PUBLIC_URL` | Site origin, e.g. `https://quu.social` (used for success/cancel / portal return URLs) |
| `STRIPE_API_VERSION` | Optional override of pinned Stripe API version |

Optional URL overrides:

- `STRIPE_CHECKOUT_SUCCESS_URL` / `STRIPE_CHECKOUT_CANCEL_URL`
- `STRIPE_PORTAL_RETURN_URL`

## HTTP API (no Stripe.js in the browser)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/billing/status` | Bearer (Supabase JWT) | Current subscription snapshot + server Stripe API version |
| `POST` | `/api/billing/create-checkout-session` | Bearer | Body `{ "tier": "starter" \| "growth" \| "pro" \| "agency" }` → `{ url }` (redirect user) |
| `POST` | `/api/billing/create-portal-session` | Bearer | `{ url }` for Stripe Customer Portal |
| `POST` | `/api/billing/webhook` | Stripe signature | Raw JSON body — **do not** send through `express.json` |

## Webhook configuration

**Endpoint URL:** `https://YOUR_DOMAIN/api/billing/webhook`

Subscribe to at least:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Paste the **signing secret** into `STRIPE_WEBHOOK_SECRET`.

### Local testing

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

Use the printed `whsec_…` as `STRIPE_WEBHOOK_SECRET` while developing.

## End-to-end flow

1. User opens **Dashboard → Settings → Billing** and picks a tier (calls `POST /api/billing/create-checkout-session`).
2. User completes **Stripe Checkout** (hosted page).
3. Stripe sends **`checkout.session.completed`** → server loads the Subscription and writes `profiles.stripe_*`, `subscription_tier`, `max_allowed_usage`, etc.
4. Ongoing updates use **`customer.subscription.*`** events.
5. **Customer Portal** (`POST /api/billing/create-portal-session`) lets users update card or cancel in Stripe’s UI; webhooks keep `profiles` in sync.

## Tier resolution

The webhook maps the subscription’s **first recurring price id** to a tier by:

1. Env vars `STRIPE_PRICE_*`, then  
2. `subscription_tiers.stripe_price_id` in Supabase (if you store price ids there).

If no match is found, metadata `tier` on the Checkout session / subscription is used when status is `active` or `trialing`.

## Guardrails

`verifyActivePaidUser` (in `src/middleware/verifySubscription.js`) allows AI routes when `stripe_subscription_status` is **`active`** or **`trialing`**. Other statuses keep premium features blocked until webhooks update the profile.
