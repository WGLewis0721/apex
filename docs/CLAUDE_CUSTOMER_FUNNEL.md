# APEX customer funnel — implementation brief

Read `../ROADMAP.md` and `PRODUCT_CONTRACT.md` first. This file defines the customer-facing onboarding experience; the roadmap owns production status.

## Mission

Make APEX feel as straightforward to adopt as buying and installing a polished software product: understand it, choose it, create an account, pay, connect Stripe, install, verify, and enter the dashboard.

The product definition is now:

> **Stripe moves the money. APEX knows what the money unlocks.**

APEX is the payment-and-access layer for SaaS products that sell subscriptions, credits, tokens, coins, usage allowance, paid features, or add-ons.

Do not position APEX as a Stripe replacement.

## Canonical funnel

```text
See APEX
  → Choose plan
  → Create account
  → Pay APEX
  → Get workspace
  → Connect the SaaS company's Stripe account
  → Install APEX
  → Verify / Go live
  → Dashboard
```

The current UI may combine these into seven visible screens, but backend acceptance gates remain separate.

## Current reality — September 9, 2026

- Marketing/demo experience: built.
- Supabase account creation/login: real.
- APEX's own Stripe test Checkout/webhook path: real.
- Paid workspace/environment/APEX credential provisioning: real.
- Step 5 Connect Stripe: real implementation is in PR #16; Stripe App External-test registration and one test OAuth acceptance run remain.
- Install, hosted APEX API, SDK, production usage/credits/access, verification, and live dashboard data remain future phases.

For real paid users, do not allow the onboarding flow to continue into a simulated Install step. Phase 5 must pass first.

## Homepage message

Lead with the customer outcome, not infrastructure vocabulary.

Recommended hierarchy:

**Headline idea:**
> Your customer pays. Your product knows what to give them.

**Supporting line:**
> Connect Stripe to credits, tokens, usage, plan rights, and customer access without rebuilding the whole system yourself.

Near the primary CTA:

> Choose APEX. Create your workspace. Connect Stripe. Install. Go live.

Developer terms such as idempotency, entitlements, metering, webhooks, and reconciliation belong later in the page/docs.

## Step 1 — Choose APEX

Keep the decision simple. The current Founding Partner Stripe catalog is a test/launch offer, not a permanent pricing commitment.

Show:

- what the customer gets
- setup/recurring price if currently active
- whether the offer is test/early access
- one primary Continue action

Pricing must stay centralized in configuration/server-side Stripe catalog rather than repeated as arbitrary UI constants.

## Step 2 — Create account

Real production account flow uses Supabase Auth.

Collect only what is necessary. Never show SSO controls unless they are implemented.

Expected result: authenticated APEX user with a recoverable session.

## Step 3 — Pay APEX

This is payment for APEX itself, not the SaaS company's end-customer purchases.

Real test-mode behavior:

1. authenticated user starts Checkout
2. server chooses the approved APEX Stripe prices
3. Stripe hosts payment collection
4. verified webhook confirms the payment
5. browser success redirect is never treated as payment proof

Never collect card details in APEX frontend code.

## Step 4 — Workspace

A successful verified APEX purchase provisions the real workspace, owner membership, Sandbox environment, and APEX API credentials.

Show:

- workspace name/ID
- environment
- credential reveal/copy behavior supported by the real backend
- next action: Connect Stripe

Do not use fake demo keys for a real paid workspace.

## Step 5 — Connect Stripe

This connects the SaaS company's own Stripe account—the account where its end customers pay.

Explain simply:

> Stripe moves the money. APEX uses verified Stripe activity to keep what customers can use in sync.

Phase 5 uses Stripe Apps OAuth. The implementation is not accepted until the live onboarding completes one External-test authorization and the paid workspace persists `stripe_connections.status = 'connected'` with the expected Stripe account.

Required callback:

`https://fnmxlmjrkgojowpzrcwa.supabase.co/functions/v1/apex-stripe-connect-callback`

Until that acceptance test passes, real users stop here.

## Step 6 — Install APEX

**Roadmap Phase 7 — not production yet.**

The intended first SDK is TypeScript/Node:

```bash
npm install @apex/sdk
```

The SDK must be a thin server-side client over the hosted APEX API. It must not pretend APEX Cloud installs into the customer's application.

Planned responsibilities:

- initialize with APEX environment credential
- identify a customer
- get balance/state
- record/reserve/finalize usage
- request ALLOW/DENY
- initiate configured purchase-pack checkout

Any UI showing these commands before publication must say **API/SDK design preview**.

## Step 7 — Verify / Go live

**Roadmap Phase 8 — not production yet.**

Verification is not a decorative connectivity check. It must exercise the real product promise.

Required proof:

```text
sample end customer
  → buy configured 1,000-credit pack through connected Stripe test account
  → verified payment creates +1,000 exactly once
  → balance = 1,000
  → record 250 usage
  → balance = 750
  → access = ALLOW
  → exhaust balance
  → next protected action = DENY
  → retry event = no duplicate grant
  → refund = compensating ledger adjustment + auditable access change
```

Also verify one recurring allowance renewal grants/resets exactly once.

Final success state:

**APEX is connected and verified.**

## Dashboard handoff

The production dashboard is Phase 9. Before that, the existing console is a product/operations preview.

The real dashboard must eventually show:

- connected Stripe health
- customers
- plans/features/subscriptions
- balances
- credit grants/consumptions/refund adjustments
- usage history
- purchase/renewal/refund events
- access decisions
- audit history
- a clear answer to “why is this customer blocked?”

## Customer-facing balance UI

A separate end-customer balance experience is part of Phase 7, not the operator dashboard.

Minimum display contract:

- unit name (`credits`, `tokens`, `gold`, etc.)
- spendable balance/allowance
- next renewal/reset if relevant
- low/empty state
- purchase-more action when packs are configured

Data must come from the APEX API. The SaaS company may use an APEX reference component or build its own UI.

## Interaction principles

1. One primary action per screen.
2. Plain English before technical vocabulary.
3. Show progress persistently.
4. Never claim success before the backend acceptance condition is true.
5. Never fake a production integration.
6. Preserve mobile/keyboard accessibility.
7. Real users cannot advance into simulated future phases.
8. Demo users may explore previews only when they are clearly labeled.
9. Distinguish APEX's own billing from the customer's connected Stripe account.
10. Keep the Stripe-complement positioning consistent throughout.

## Acceptance rule

Do not let UI completion redefine backend completion. `ROADMAP.md` is authoritative.

The experience is successful when a founder can say:

> “I connect my Stripe account to APEX, install its API/SDK, and APEX handles the payment-to-credits/usage/access system my SaaS would otherwise have to build.”

And a developer can immediately tell which parts are real today versus planned.
