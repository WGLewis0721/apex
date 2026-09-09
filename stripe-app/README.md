# APEX Stripe App — Phase 5 customer Stripe connection

Read `../ROADMAP.md` and `../docs/PRODUCT_CONTRACT.md` first.

This directory contains the Stripe App manifest used by APEX to authorize a SaaS company's existing Stripe account through Stripe Apps OAuth.

This is **not APEX's own billing account**. It is the connected Stripe account where that SaaS company's end customers will later buy subscriptions, credits, tokens, add-ons, or other product value.

Phase 5 only establishes the trusted connection. It does **not** yet implement purchase-pack fulfillment, credit grants, usage metering, renewals, refunds, or ALLOW/DENY. Those begin in Phase 6 after Phase 5 acceptance passes.

## External test setup

1. Install/login to the Stripe CLI using the APEX Stripe developer account.
2. From this directory run:

   ```bash
   stripe apps upload
   ```

3. In Stripe Dashboard, open the uploaded **APEX** app → **External test** → **Get started**.
4. Use the **Test OAuth** link. Its `client_id` is the value APEX needs as `STRIPE_APP_CLIENT_ID`.

Callback URI — must match exactly:

`https://fnmxlmjrkgojowpzrcwa.supabase.co/functions/v1/apex-stripe-connect-callback`

The OAuth client ID is not a secret. The APEX developer Stripe secret key and OAuth refresh tokens are secrets and must never be committed or exposed in browser code.

## Phase 5 acceptance

Phase 5 is complete only when all of these are true:

1. `stripe apps upload` succeeds.
2. APEX is registered for Stripe Apps External test.
3. `STRIPE_APP_CLIENT_ID` is configured in the Supabase Edge Function secrets.
4. Live APEX onboarding starts the OAuth flow from a paid workspace.
5. Stripe returns through the callback successfully.
6. `stripe_connections.status` becomes `connected` for that workspace with the expected connected Stripe account ID.
7. The encrypted OAuth refresh token is persisted server-side and remains unreadable to normal browser clients.

Do not advance a real user into Install/APEX Cloud until this acceptance test passes.

## What happens after Phase 5

The connected account becomes the Stripe side of the production flow defined in the roadmap:

```text
SaaS end customer
  → buys configured credits/tokens/plan/add-on
  → connected Stripe account
  → verified APEX event processing
  → durable credit/entitlement state
  → usage + balance
  → ALLOW / DENY
```

That fulfillment pipeline is Phase 6, not part of this Stripe App manifest.
