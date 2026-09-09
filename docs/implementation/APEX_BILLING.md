# APEX billing, workspace activation, and Stripe boundary

Read `../../ROADMAP.md` and `../PRODUCT_CONTRACT.md` first.

This document covers **APEX's own billing**: a SaaS company pays APEX, then APEX provisions that company's APEX workspace.

It does **not** describe the later end-customer flow where the SaaS company's users buy credits/tokens/add-ons through the SaaS company's connected Stripe account. That path begins with Phase 5 Connect Stripe and becomes functional product infrastructure in Phase 6.

## Current deployment state — September 9, 2026

The following APEX-own-billing path is real in Stripe **test mode**:

- Supabase migration `20260908212241_apex_billing_provisioning.sql` applied.
- `apex-checkout`, `apex-workspace`, and `apex-stripe-webhook` deployed.
- Stripe sandbox account: `acct_1UDVhTCsDEFORFLN`.
- Webhook endpoint is deployed and used for verified test-mode fulfillment.
- Account creation/login works through Supabase Auth.
- Stripe test Checkout works.
- Verified payment provisions the APEX workspace/environment/credentials.

Phase 5 customer Stripe connection is separate. PR #16 contains its Stripe Apps OAuth implementation and is waiting on Stripe App External-test registration plus one real test OAuth acceptance run.

## Existing APEX Stripe catalog — do not duplicate

Current test/launch catalog:

- Product: `prod_VDxrCjWDnperBL`
- Setup: `apex_founding_setup` → `price_1UDVvQCsDEFORFLNZRqlVSYU` ($2,000)
- Monthly: `apex_founding_monthly` → `price_1UDVvWCsDEFORFLNbwjiwxmI` ($299/month)

This is the current Founding Partner test/launch configuration, **not a permanent product-pricing commitment**. Product pricing may be revisited before launch.

The server resolves/validates the approved Stripe catalog. Browser/client input is never authoritative for amount, price, user identity, or payment success.

## APEX-own-billing flow

```text
Authenticated APEX buyer
        ↓
apex-checkout
        ↓
APEX Stripe test Checkout
        ↓
Stripe-hosted payment
        ↓
verified apex-stripe-webhook
        ↓
transactional activation/provisioning
        ↓
APEX subscription + workspace + Sandbox + APEX credentials
```

The browser redirect is only navigation. It never proves payment.

## Webhook

Webhook URL:

`https://fnmxlmjrkgojowpzrcwa.supabase.co/functions/v1/apex-stripe-webhook`

The APEX-own-billing endpoint handles the current APEX subscription/payment lifecycle. It is **not** the connected-customer Stripe event/fulfillment pipeline that Phase 6 will use for SaaS end-customer credit purchases.

## Activation and idempotency

Only a verified Stripe webhook can invoke service-role activation.

The handler validates the paid Checkout session and expected Stripe catalog, then commits the event ledger, APEX subscription state, workspace, owner membership, Sandbox environment, and credentials transactionally.

Important properties:

- failure rolls back the activation transaction
- Stripe receives non-2xx on retryable processing failure
- event/session uniqueness prevents double activation
- server retrieves current Stripe subscription state rather than trusting stale client state
- client-provided amounts/price IDs are not fulfillment authority

These patterns are the reliability baseline for Phase 6 connected-Stripe purchase/renewal/refund fulfillment.

## Credential handling

APEX credentials are server-generated. Secret material must never be placed in `VITE_` variables, browser bundles, logs, or committed files.

The existing implementation stores protected credential material server-side and reveals it only through the authenticated owner path. Browser state must not become the durable source of credential truth.

## Required Edge Function configuration

Existing billing functions require server-side secrets such as:

| Name | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY` | APEX Stripe test-mode server API access |
| `STRIPE_WEBHOOK_SECRET` | signature verification for APEX-own-billing webhook |
| `APEX_CREDENTIAL_ENCRYPTION_KEY` | encryption of recoverable APEX credential material |
| `APEX_APP_URL` | trusted browser origin/return URL when configured |

Never commit secret values.

Frontend uses the publishable Supabase configuration only:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

## Phase 5: customer Stripe connection is different

The SaaS customer connects the Stripe account where **their own end customers pay**.

Phase 5 implementation lives in:

- `stripe-app/stripe-app.yaml`
- `supabase/functions/apex-stripe-connect/`
- `supabase/functions/apex-stripe-connect-callback/`
- Phase 5 migrations on `implementation/phase5-stripe-connect`

Callback URI:

`https://fnmxlmjrkgojowpzrcwa.supabase.co/functions/v1/apex-stripe-connect-callback`

The connected Stripe OAuth refresh token is encrypted server-side and never readable by normal browser clients.

Phase 5 is accepted only after the APEX Stripe App is uploaded/registered for External test, `STRIPE_APP_CLIENT_ID` is configured, live onboarding completes the test OAuth authorization, and the paid workspace persists a connected Stripe account.

## Phase 6: what connected Stripe must eventually power

After Phase 5, the connected Stripe account becomes the money source for the actual APEX product promise:

```text
SaaS end customer buys a configured pack/subscription
        ↓
connected Stripe account confirms payment
        ↓
APEX verifies + deduplicates event
        ↓
APEX maps Stripe Price/product to configured product value
        ↓
credit grant / entitlement / recurring allowance
        ↓
usage consumption + balance
        ↓
ALLOW / DENY
```

Phase 6 must support:

- purchase packs/top-ups
- subscription/plan state
- recurring allowance renewals
- payment failures/recovery
- refund/reversal adjustments
- idempotent fulfillment
- reconciliation
- audit history

A refund must create a compensating ledger adjustment/reversal and preserve the original history; it must not delete the original grant to make the balance look correct.

## Verification baseline

For APEX's own billing, continue to verify:

- authenticated Checkout only
- test-mode Stripe only until live launch is explicitly approved
- verified webhook signature
- expected product/price/currency/mode
- duplicate event/session safety
- transactional provisioning
- workspace isolation/RLS
- credential secrecy
- subscription update ordering/recovery

For the production APEX product, the stronger end-to-end acceptance test is Phase 8 in `../../ROADMAP.md`: connected Stripe purchase → +1,000 credits → usage → balance → ALLOW/DENY → refund adjustment → audit history, plus one recurring renewal case.

## Tax / live-money boundary

Test-mode acceptance does not imply production tax/compliance readiness. Before live-money launch, explicitly review tax collection, registrations, Stripe account/app production settings, support/refund policy, and production observability. Do not infer those are complete from test-mode billing success.
