# APEX Stripe App — Phase 5 customer Stripe connection

Read `../ROADMAP.md`, `../docs/PRODUCT_CONTRACT.md`, and `../docs/architecture/APEX_V1_LEDGER.md` first.

This directory contains the Stripe App manifest used by APEX to authorize a SaaS company's existing Stripe account through Stripe Apps OAuth.

This is **not APEX's own billing account**. It is the connected Stripe account where that SaaS company's end customers pay for subscriptions, credits, tokens, add-ons, or other product value.

Phase 5 establishes the trusted connection. The repository also contains the
Phase 6 connected-account ingress implementation, but it is not accepted until
it is deployed and exercised through a real connected-account test transaction.

## External test setup

Stripe Apps External testing is available only for **public** apps. Upload the public APEX app from an eligible Stripe developer account, then configure External test from that account. Stripe generates separate OAuth links for Test Mode and general Sandboxes.

1. Install/login to the Stripe CLI using the non-Connect APEX Stripe App developer account that owns `com.graymatter.apex-dev`.
2. From this directory run:

   ```bash
   stripe apps upload
   ```

3. In Stripe Dashboard, open the uploaded **APEX** app → **External test** → **Get started**.
4. Copy the OAuth link for the environment being tested.
5. Configure Supabase Edge Function secrets for that environment:

   ```text
   STRIPE_APP_OAUTH_MODE=test | sandbox
   STRIPE_APP_TEST_CLIENT_ID=ca_...            # Test Mode link
   STRIPE_APP_TEST_SECRET_KEY=sk_test_...      # app developer test key
   STRIPE_APP_SANDBOX_CLIENT_ID=ca_...         # general Sandbox link
   STRIPE_APP_SANDBOX_SECRET_KEY=sk_test_...   # managed-sandbox key
   ```

Callback URI — must match exactly:

`https://fnmxlmjrkgojowpzrcwa.supabase.co/functions/v1/apex-stripe-connect-callback`

The OAuth client IDs are not secrets. Stripe secret keys and OAuth refresh tokens are secrets and must never be committed or exposed in browser code.

APEX binds the selected OAuth mode into the one-time CSRF `state`. The callback then uses the matching Stripe key for the authorization-code exchange. Stripe requires the developer test key for a Test Mode link and the app's managed-sandbox key for a general Sandbox link.

## Connected-account event destination

After External test is enabled, create a separate Stripe Workbench webhook
destination that listens to **events on connected accounts**. It must point to:

```text
https://fnmxlmjrkgojowpzrcwa.supabase.co/functions/v1/apex-connected-stripe-webhook
```

Select only these v1 events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `charge.refunded`

Store the destination signing secret as the Supabase Edge Function secret
`APEX_CONNECTED_STRIPE_WEBHOOK_SECRET`. This must be a distinct secret from
APEX's own billing endpoint. The Stripe App manifest requests the event and
read permissions required by this flow.

Before accepting payments, configure each end customer's
`customers.stripe_customer_id` and an active `stripe_credit_price_mappings`
row for every Stripe Price that grants credits. The webhook only grants
configured Checkout line items. A full `charge.refunded` event claws back
credits sourced from its original payment; partial refunds are intentionally
unsupported in frozen v1.

## Phase 5 acceptance

Phase 5 is complete only when all of these are true:

1. A public APEX app version uploads successfully from the Stripe App developer account.
2. APEX is registered for Stripe Apps External test.
3. The correct mode-specific OAuth client ID and exchange key are configured in Supabase.
4. Live APEX onboarding starts the OAuth flow from a paid workspace.
5. Stripe returns through the callback successfully.
6. `stripe_connections.status` becomes `connected` for that workspace with the expected connected Stripe account ID.
7. `stripe_oauth_tokens.install_mode` records `test` or `sandbox` and the encrypted OAuth refresh token remains unreadable to normal browser clients.

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
