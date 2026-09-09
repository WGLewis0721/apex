# APEX customer funnel — implementation brief

Read `../ROADMAP.md`, `PRODUCT_CONTRACT.md`, and `architecture/APEX_V1_LEDGER.md` first. This file defines the customer-facing onboarding experience; the roadmap owns production status.

## Mission

Make APEX feel as straightforward to adopt as buying and installing a polished software product: understand it, choose it, create an account, pay, connect Stripe, install, verify, and enter the dashboard.

> **Stripe moves the money. APEX knows what the money unlocks.**

APEX is the hosted payment-to-product-state layer for SaaS products that sell subscriptions, credits, tokens, coins, usage allowance, paid features, or add-ons.

Do not position APEX as a Stripe replacement or as a cloud platform for its own sake.

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

The current UI may combine these into fewer visible screens, but backend acceptance gates remain separate.

## Current reality — September 9, 2026

- Marketing/demo experience: built.
- Supabase account creation/login: real.
- APEX's own Stripe test Checkout/webhook path: real.
- Paid workspace/environment/APEX credential provisioning: real.
- Step 5 Connect Stripe: implementation merged; Stripe App External-test registration + one real OAuth acceptance run remain.
- Hosted balance/entitlements/consume API: deployed.
- Per-grant ledger + non-negative wallet projection: deployed.
- Hosted 1000-credit concurrency proof: passed.
- Connected Stripe payment/refund → ledger ingress: not wired yet.
- Public SDK, customer balance component, verify/go-live flow, and live operator dashboard: later phases.

Real paid users still stop at Connect Stripe until Phase 5 acceptance passes. The independent backend wallet proof does not change that onboarding gate.

## Homepage message

Lead with the customer outcome, not infrastructure vocabulary.

Recommended hierarchy:

**Headline idea:**
> Your customer pays. Your product knows what to give them.

**Supporting line:**
> Connect Stripe to credits, balances, usage, plan rights, and product access without rebuilding the payment-to-product-state system yourself.

Near the primary CTA:

> Choose APEX. Create your workspace. Connect Stripe. Install. Go live.

Developer terms such as idempotency, ledger projection, RLS, webhooks, and reconciliation belong later in the page/docs.

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

Phase 5 uses Stripe Apps OAuth. The implementation is not accepted until live onboarding completes one External-test authorization and the paid workspace persists `stripe_connections.status = 'connected'` with the expected Stripe account.

Required callback:

`https://fnmxlmjrkgojowpzrcwa.supabase.co/functions/v1/apex-stripe-connect-callback`

Until that acceptance test passes, real users stop here.

## Step 6 — Install APEX

**Roadmap Phase 7 — not production yet.**

The intended first SDK is TypeScript/Node:

```bash
npm install @apex/sdk
```

The SDK is a thin **server-side** client over the hosted APEX API. It does not install APEX itself inside the customer's application.

Frozen first SDK responsibilities:

- initialize with an APEX environment credential
- get customer balance
- get customer entitlements
- consume credits with an idempotency key

Do not include these as first-SDK requirements:

- public `/check`
- reservation/finalize/cancel
- signed/local entitlement evaluation

Those are later capabilities only if a real customer use case requires them.

Any UI showing installation commands before package publication must say **API/SDK design preview**.

## Step 7 — Verify / Go live

**Roadmap Phase 8 — not production yet.**

Verification is not a decorative connectivity check. It must exercise the connected product promise.

Required frozen-v1 proof:

```text
sample end customer
  → buy configured 1,000-credit pack through connected Stripe test account
  → verified event persists once
  → source-attributed +1,000 grant exactly once
  → balance / entitlements = 1,000
  → consume 250 → remaining 750
  → consume 750 → remaining 0
  → next consume 1 → DENY / INSUFFICIENT_CREDITS
  → retry payment event → no duplicate grant
  → refund original purchase → source-aware clawback + unrecoverable_spent
  → retry refund event → no duplicate adjustment
```

The existing hosted wallet proof already demonstrated the parallel 750/750 double-spend protection independently. This Step 7 proof must add the real connected Stripe ingress around it.

Final success state:

**APEX is connected and verified.**

## Dashboard handoff

The production dashboard is Phase 9. Before that, the existing console is a product/operations preview.

The first real dashboard should eventually show:

- connected Stripe health
- customers
- plan/entitlement state
- balances
- credit grants/consumptions/refund adjustments
- unrecoverable refunded spend
- Stripe event/replay state
- audit history
- a clear answer to “why was this consume denied?”

Broader renewal, access-decision, usage-counter, or reservation views should appear only after those capabilities are production accepted.

## Customer-facing balance UI

A separate end-customer balance experience is part of Phase 7, not the operator dashboard.

Minimum first display contract:

- unit name (`credits`, `tokens`, `gold`, etc.)
- spendable balance/allowance
- low/empty state
- purchase-more action when packs are configured

Renewal/reset dates appear only when recurring allowance support is real.

Data must come from the APEX API. The SaaS company may use a future APEX reference component or build its own UI.

## Interaction principles

1. One primary action per screen.
2. Plain English before technical vocabulary.
3. Show progress persistently.
4. Never claim success before the backend acceptance condition is true.
5. Never fake a production integration.
6. Preserve mobile/keyboard accessibility.
7. Real users cannot advance into simulated future phases.
8. Demo users may explore previews only when clearly labeled.
9. Distinguish APEX's own billing from the customer's connected Stripe account.
10. Explain APEX by the value it adds, not by opposition to another product.
11. A read-only entitlement/balance display must never be presented as authoritative permission to spend scarce credits.

## Acceptance rule

Do not let UI completion redefine backend completion. `ROADMAP.md` is authoritative.

The experience is successful when a founder can say:

> “I connect my Stripe account to APEX, install its server SDK, and APEX handles the reliable payment-to-product-value layer my SaaS would otherwise have to build.”

And a developer can immediately tell which parts are production-accepted, deployed but incomplete, or still planned.