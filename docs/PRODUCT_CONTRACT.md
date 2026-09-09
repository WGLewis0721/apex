# APEX Product Contract

This document defines what APEX promises to a SaaS builder and the invariants the implementation must preserve. `docs/BUSINESS_MODEL.md` defines why the business exists and how it earns money. `ROADMAP.md` defines build order and acceptance status.

## Business North Star

**APEX makes money when SaaS companies make digital value easier to sell, deliver, meter, replenish, and explain.**

That business model is the product compass. APEX should become more valuable as a SaaS company monetizes more digital value through its own product—not by changing who owns the customer relationship, but by making the commercial-to-product-state layer dependable and easy to operate.

Canonical commercial relationship:

```text
End customer pays the SaaS company through Stripe
                     ↓
          APEX interprets what it unlocks
                     ↓
 SaaS company pays APEX a recurring platform subscription
```

Early or complex deployments may also include a one-time guided implementation fee. Longer-term packaging may scale with meaningful platform capacity such as active customers, usage events, environments, or advanced operational capabilities.

## One-line product definition

**APEX is the payment-and-access layer between a SaaS product and Stripe: Stripe moves the money; APEX knows what the money unlocks.**

APEX is for software products that sell subscriptions, credits, tokens, coins, usage allowance, paid features, add-ons, or other digital product rights.

## Core customer story

```text
End customer wants more product value
        ↓
SaaS app asks APEX for a configured purchase
        ↓
APEX coordinates with the SaaS company's connected Stripe account
        ↓
Stripe confirms money moved
        ↓
APEX maps that payment to credits / tokens / plan rights / features
        ↓
APEX records usage and current balance
        ↓
SaaS app asks APEX whether the next action is allowed
```

The SaaS company should not need to independently rebuild the payment-to-product-state subsystem for each app.

## Value contract

Every major production capability should strengthen at least one of these business outcomes:

1. **Monetize faster** — launch a new plan, paid unit, or add-on with less custom infrastructure.
2. **Deliver accurately** — make sure customers receive exactly what they bought.
3. **Meter reliably** — keep usage and balances correct under retries and concurrency.
4. **Replenish cleanly** — make top-ups and recurring allowances predictable.
5. **Protect access** — turn commercial state into deterministic product decisions.
6. **Explain the lifecycle** — show why payment, balance, and access changed.
7. **Reduce custom engineering** — remove repeated billing/entitlement work from the SaaS team's backlog.

A feature that does not materially improve one of those outcomes needs a strong reason to exist.

## v1 capability contract

### Stripe integration

The SaaS company connects its existing Stripe account. APEX must verify Stripe events server-side, reconcile current Stripe state, and never treat a browser redirect as proof of payment.

### Credit ledger

APEX keeps durable grants, consumptions, and adjustments. A balance is calculated from authoritative server-side state. Retried events cannot duplicate value.

Credits are product units, not currency and not cryptocurrency.

### Usage metering

APEX records idempotent usage events and supports counters plus reservation/finalization for actions whose exact usage is only known after execution.

### Entitlements

APEX maps plans and features to customer rights and produces a deterministic `ALLOW` or `DENY` decision with a reason.

### Purchase packs

A workspace can map a Stripe product/price to a fixed product grant such as 1,000 credits, 5,000 tokens, 10,000 gold, or 100 generations. The configured server-side mapping—not a client-supplied amount—controls fulfillment.

### Renewals

For subscriptions that include recurring allowance, a verified renewal creates the next-period allowance/reset exactly once. Roll-over behavior must be explicit workspace/product policy.

### Refunds

A refund never deletes history. APEX links it to the original Stripe-funded grant and records a compensating adjustment/reversal plus audit history. If already-consumed credits make the reversal non-trivial, the configured refund policy must be applied explicitly and surfaced to operators.

### Audit logs

Material changes must be explainable: payment, purchase, grant, usage, renewal, refund, access decision, Stripe sync, and later manual corrections.

### API

The hosted API is the authoritative integration surface for customer identification, balance/state lookup, usage, access decisions, and purchase-pack coordination.

### SDK

`@apex/sdk` is the first supported TypeScript/Node client over that API. It must remain thin; product state belongs in APEX Cloud.

### Customer balance UI

An end customer should be able to see the current unit label, remaining balance/allowance, next reset where relevant, and a purchase-more action when packs are configured. The authoritative data comes from APEX; merchants may use an APEX reference component or build their own UI against the API.

## Two separate Stripe paths

### APEX billing

A SaaS company pays APEX. This provisions the SaaS company's APEX workspace and credentials.

### Connected customer Stripe

That SaaS company connects its own Stripe account. Its end customers pay that account for the SaaS product. This is the Stripe relationship used by APEX to fulfill product credits, plans, add-ons, and access.

Never mix the two in code, docs, environment variables, webhooks, or product copy.

## Communication identity

APEX should communicate as a useful, intelligent layer in an existing SaaS stack.

Prefer concise cause-and-effect language:

- Customer paid → credits granted.
- Customer used 250 → 750 remain.
- Renewal succeeded → allowance replenished.
- Refund posted → balance adjusted.
- Limit reached → access denied with a reason.

Lead with the customer or operator value; reveal technical detail when the reader needs it.

Do not define APEX primarily by opposing another company, category, or product. Explain what APEX adds to the stack.

## Non-goals

APEX v1 is not:

- a card processor
- a bank account or stored-value wallet
- cryptocurrency infrastructure
- a general ERP/CRM
- a promise that every Stripe billing feature is reimplemented inside APEX

## Required production invariants

1. Money truth comes from verified/reconciled Stripe state.
2. Product-access truth comes from authoritative APEX state.
3. Writes that can retry are idempotent.
4. Concurrent usage cannot double-spend the final credits.
5. Refunds and corrections preserve history.
6. Every customer-owned row is workspace-isolated.
7. Secrets stay server-side.
8. Every access decision has a reason.
9. Every material state change is auditable.
10. Simulated/demo behavior is never described as production behavior.

## Minimum end-to-end proof

APEX is not proven until a real hosted test can do all of the following without localStorage/reducer state:

1. End customer buys a configured 1,000-credit pack through a connected Stripe test account.
2. Verified Stripe event creates exactly one +1,000 grant.
3. Balance API/SDK returns 1,000.
4. 250 usage is recorded.
5. Balance returns 750.
6. Access check returns `ALLOW`.
7. Remaining credits are consumed.
8. Next protected action returns `DENY` for insufficient credits.
9. Retried payment event is a no-op.
10. Refund creates a compensating adjustment and updates access according to policy.
11. Audit history explains the whole chain.
12. A recurring-plan test grants/resets its allowance exactly once on renewal.

That acceptance flow is Phase 8 in `ROADMAP.md`.

## Documentation rule

When implementation or commercial positioning changes, update together:

- `docs/BUSINESS_MODEL.md`
- `ROADMAP.md`
- root `README.md`
- this file
- relevant files under `docs/`
- relevant live documentation under `src/docs/`
- customer-facing website copy when the change affects product identity

A capability may be described as **planned**, **implemented but not accepted**, or **production-accepted**. Do not collapse those states.