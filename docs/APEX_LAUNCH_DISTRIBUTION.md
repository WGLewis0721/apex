# APEX launch, distribution, and first-customer story

Use this document with `../ROADMAP.md`, `PRODUCT_CONTRACT.md`, and `architecture/APEX_V1_LEDGER.md`. The visuals here explain how APEX is bought, shipped, and understood; they do not prove backend capabilities are live.

## Product story

**Stripe moves the money. APEX knows what the money unlocks.**

For a SaaS company's end customer:

```text
Need more credits / tokens / allowance
        ↓
SaaS product
        ↓
SaaS company's Stripe account
        ↓
Verified payment event
        ↓
APEX hosted product-state service
        ↓
source-attributed grant + balance
        ↓
authoritative consume / refund history
```

The product value is not “another cloud.” The value is removing the repeated engineering needed to keep monetized product state correct.

## 1. Customer purchase funnel

![APEX customer funnel](../public/assets/launch/apex-customer-funnel.svg)

**Story:** discover APEX → choose a plan → create account → pay APEX → get workspace → connect Stripe → install → verify/go live.

As of September 9, 2026:

- APEX's own test billing/provisioning is real
- customer Stripe Connect code is merged but still needs External-test OAuth acceptance
- the hosted credit ledger/balance/consume API is deployed
- the hosted parallel-consume wallet proof has passed
- connected Stripe payment/refund events are not yet wired into the ledger

Real paid onboarding still stops at Connect Stripe until Phase 5 acceptance passes.

## 2. How APEX ships

![How APEX ships](../public/assets/launch/apex-how-it-ships.svg)

The SaaS company will install a thin server-side `@apex/sdk` client. APEX itself remains hosted infrastructure.

Canonical direction:

```text
Customer SaaS server
   ↓
@apex/sdk / APEX API
   ↓
Hosted APEX service
   ├─ entitlements read
   ├─ authoritative credit consume
   └─ durable product-state ledger
   ↑
Verified connected Stripe events
```

The SDK is not published yet. The first SDK should expose the frozen v1 API—not resurrect older `/check` or reservation requirements.

## 3. Payment to product value

![Payment to access](../public/assets/launch/apex-payment-to-access.svg)

**Story:** Stripe answers whether money moved. APEX maps the verified purchase to the product value the buyer should receive and keeps that value correct as it is used or refunded.

Frozen v1 proves this through:

- verified/persisted Stripe events
- configured purchase → source-attributed grant
- authoritative balance/entitlements reads
- atomic `consume`
- source-aware refund clawback
- replay-safe idempotency
- durable ledger explanation

Broader features such as recurring allowances, signed/local feature evaluation, reservations, richer metering, and operator tooling remain later capabilities.

## 4. Why the v1 architecture supports the business model

The buyer is paying APEX to avoid rebuilding wallet/payment-state infrastructure.

That means v1 should optimize for:

1. **Deliver accurately** — one payment creates the correct product value once.
2. **Meter reliably** — concurrent usage cannot overspend.
3. **Explain the lifecycle** — grant, consume, refund, and unrecoverable spend are durable history.
4. **Reduce custom engineering** — the SaaS integrates a small API/SDK rather than building its own ledger.
5. **Monetize faster** — the connected payment-to-credit path becomes reusable across SaaS products.

Adding caches, queues, new clouds, signed snapshots, or reservation systems before a proven customer need does not automatically add buyer value.

## 5. First-five-customer revenue loop

![First five customers](../public/assets/launch/apex-first-five-customers.svg)

**Story:** initially sell a guided implementation, get real SaaS teams live, observe repeated integration work, and productize the repeated path into API/SDK/self-service onboarding.

Do not confuse the current APEX Founding Partner test/launch pricing with permanent product pricing. Pricing should remain centrally configurable and may change before broader launch.

## Message hierarchy

Customer-facing copy should normally explain APEX in this order:

1. **Outcome:** your customer pays and receives the right product value.
2. **Simple mechanism:** Stripe moves the money; APEX keeps what it unlocks correct.
3. **Proof:** no duplicate grants, no double-spend, source-aware refunds, explainable balance.
4. **Developer mechanism:** API/SDK, webhooks, Postgres ledger, idempotency.
5. **Later operations:** renewals, richer entitlement evaluation, support/reconciliation tooling as accepted.

Avoid positioning APEX as a Stripe replacement, payment processor, cryptocurrency system, or cloud platform for its own sake.

## Current visual-brand usage

The current implemented brand uses the canonical palette and typography in `docs/design/BRAND_SPEC.md`. Older launch graphics remain explanatory assets; do not infer current architecture or production status from labels embedded in older graphics.