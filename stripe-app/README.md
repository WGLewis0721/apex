# APEX Stripe App — Phase 5 customer Stripe connection

Read `../ROADMAP.md`, `../docs/PRODUCT_CONTRACT.md`, and `../docs/architecture/APEX_V1_LEDGER.md` first.

This directory contains the Stripe App manifest used by APEX to authorize a SaaS company's existing Stripe account through Stripe Apps OAuth.

This is **not APEX's own billing account**. It is the connected Stripe account where that SaaS company's end customers pay for subscriptions, credits, tokens, add-ons, or other product value.

Phase 5 establishes the trusted connection only. The hosted wallet/API already exists independently, but connected Stripe payment/refund events are not yet wired into that ledger.

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
3. `STRIPE_APP_CLIENT_ID` is configured in Supabase Edge Function secrets.
4. Live APEX onboarding starts the OAuth flow from a paid workspace.
5. Stripe returns through the callback successfully.
6. `stripe_connections.status` becomes `connected` for that workspace with the expected connected Stripe account ID.
7. The encrypted OAuth refresh token is persisted server-side and remains unreadable to normal browser clients.

Do not advance a real paid user into Install/Verify until this acceptance test passes.

## What happens after Phase 5

The connected account becomes the Stripe event source for the frozen v1 product-state flow:

```text
SaaS end customer
  → buys configured credits/product value
  → connected Stripe account
  → verified event persisted once
  → source-attributed grant_credits
  → balance / entitlements
  → authoritative consume
  → source-aware refund_unspent_credits
```

The hosted wallet already proved concurrency independently. The next Phase 6 work is wiring connected payment/refund events into that proven ledger and replay path.

Frozen v1 does not require public `/check`, reservations, signed snapshots, local evaluation, Redis, AWS, Kafka, ClickHouse, or a new queue product.