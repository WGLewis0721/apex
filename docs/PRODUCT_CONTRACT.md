# APEX Product Contract

This document defines what APEX promises to a SaaS builder and the invariants the implementation must preserve. `docs/BUSINESS_MODEL.md` defines why the business exists and how it earns money. `ROADMAP.md` defines build order and acceptance status. `docs/architecture/APEX_V1_LEDGER.md` freezes the current ledger/evaluation architecture.

## Business North Star

**APEX makes money when SaaS companies make digital value easier to sell, deliver, meter, replenish, and explain.**

APEX should become more valuable as a SaaS company monetizes more digital value through its own product—not by changing who owns the customer relationship, but by making the commercial-to-product-state layer dependable and easy to operate.

Canonical commercial relationship:

```text
End customer pays the SaaS company through Stripe
                     ↓
          APEX interprets what it unlocks
                     ↓
 SaaS company pays APEX a recurring platform subscription
```

## One-line product definition

**APEX is the hosted payment-to-product-state layer for SaaS products that use Stripe: Stripe moves the money; APEX knows what the money unlocks.**

APEX is for software products that sell subscriptions, credits, tokens, coins, usage allowance, paid features, add-ons, or other digital product rights.

## Core customer story

```text
End customer buys product value
        ↓
SaaS company's Stripe account receives the payment
        ↓
APEX verifies the commercial event
        ↓
APEX maps it to product state
        ↓
credits / plan rights / balance become usable
        ↓
customer uses value
        ↓
APEX keeps the authoritative state correct
```

The SaaS company should not need to independently rebuild this subsystem for every app.

## Value contract

Every major production capability should strengthen at least one of these business outcomes:

1. **Monetize faster** — launch a new plan, paid unit, or add-on with less custom infrastructure.
2. **Deliver accurately** — make sure customers receive exactly what they bought.
3. **Meter reliably** — keep usage and balances correct under retries and concurrency.
4. **Replenish cleanly** — make top-ups and recurring allowances predictable.
5. **Protect access** — turn commercial state into dependable product behavior without unsafe spend decisions.
6. **Explain the lifecycle** — show why payment, balance, refund, and access changed.
7. **Reduce custom engineering** — remove repeated billing/entitlement work from the SaaS team's backlog.

A feature that does not materially improve one of those outcomes needs a strong reason to exist.

---

# Frozen v1 contract

The current v1 is deliberately ledger-first. Do not enlarge it by importing older roadmap concepts.

## Runtime/evaluation model

**APEX v1 = hosted authoritative Postgres ledger + hosted authoritative spend + snapshot-shaped entitlements read.**

Current approved implementation stack:

- Supabase Auth
- Supabase Postgres + RLS
- Supabase Edge Functions
- Stripe
- persisted `stripe_webhook_events`
- later thin server-side TypeScript/Node SDK

Not frozen v1:

- public `/check`
- reservations/finalize/cancel
- signed snapshots
- local SDK evaluation
- Redis
- Kafka
- ClickHouse
- AWS runtime migration
- dedicated worker service
- new queue product

Those may be added later only when a real product/customer requirement justifies them.

## Stripe integration

The SaaS company connects its existing Stripe account. APEX must verify connected Stripe events server-side, persist them idempotently, and never treat a browser redirect as proof of payment.

The connected Stripe account is the money/event source. APEX is the product-state authority.

## Credit model

Credits are product units, not currency and not cryptocurrency.

APEX keeps:

- a non-negative projected spendable balance
- source-attributed grant rows
- append-only ledger history
- idempotent operation outcomes, including denied spends

A mutable balance field is a projection/concurrency boundary, not the audit source of truth.

## Grant attribution

Every Stripe-funded grant must remain attributable to the purchase/event that created it. Consumes burn specific grants FIFO by `created_at`, then `id`.

This attribution is required so refunding purchase A cannot revoke credits created by purchase B.

## Authoritative consume

The v1 spend operation is:

`POST /v1/customers/:id/consume`

A consume request includes an amount and workspace-scoped idempotency key.

One Postgres transaction must:

1. decrement the projected `remaining` only if enough value exists
2. allocate the spend across open grant rows FIFO
3. update grant consumed/remaining amounts
4. append consume ledger entries
5. persist the operation outcome
6. commit everything together

If no projection row can be decremented because `remaining < amount`, the result is DENY / `INSUFFICIENT_CREDITS` and that denied result must replay for the same idempotency key.

A read, UI state, browser state, or entitlements document never authorizes a scarce-value spend.

## Balance

`GET /v1/customers/:id/balance` returns authoritative hosted balance state.

Balance never goes negative in v1.

## Entitlements

`GET /v1/customers/:id/entitlements` is a read-only, snapshot-shaped product-state document. It includes current plan/features where available plus `remaining`, `version`, and `as_of`.

The entitlements document may inform UI or feature/preflight behavior. It is **not** a wallet and does not grant a right to spend credits.

There is no public `/check` route in v1.

## Refunds — frozen policy

A refund never deletes history and never creates v1 debt.

For the original Stripe-funded purchase:

- claw back only that purchase's unspent credits
- never touch credits from another purchase/grant
- never reverse product work already consumed
- record recoverable unspent value as refund ledger entries
- record already-spent value as `unrecoverable_spent`
- keep projected balance at or above zero
- future grants increase the current balance; they do not pay an arrears balance

Example:

```text
grant A       +1000
consume         750
refund A       1000 requested
----------------------
clawed_back     250
unrecoverable   750
remaining         0
```

A replay of the same refund event is a no-op.

## Event idempotency

Connected Stripe event identity is scoped to the Stripe connection.

Required uniqueness includes:

- `(workspace_id, idempotency_key)` for API/ledger operations
- `(stripe_connection_id, stripe_event_id)` for connected Stripe events

Verified events are persisted before/while processing so failures remain replayable.

## API

Frozen v1 API surface:

```text
POST /stripe/webhook
GET  /v1/customers/:id/balance
GET  /v1/customers/:id/entitlements
POST /v1/customers/:id/consume
```

The public API must authenticate the APEX server credential, enforce workspace/environment ownership, and keep privileged credit RPCs unavailable to `anon` and ordinary authenticated browser roles.

## SDK

The first `@apex/sdk` is a thin **server-side** client over the hosted APEX API. Product state belongs in the hosted APEX service, not inside the SDK.

Frozen first SDK responsibilities:

- initialize with APEX environment credential
- read balance
- read entitlements
- consume with idempotency

Signed/local entitlement evaluation is v1.1+ and must not change the authoritative spend rule.

## Expiry boundary

`credit_grants.expires_at` exists, and consume skips expired grants, but the current projection does not yet reconcile expired grant remainder out of `credit_accounts.remaining`.

Therefore expiring grants are **not a production-supported v1 capability**. Frozen v1 grants should be non-expiring until expiry reconciliation is implemented and tested.

## Reservations boundary

Reservations are not v1.

If a real start-now/finish-later workload later requires them, the invariant is:

- reserve reduces available capacity immediately
- reserve has a TTL
- finalize converts the hold to consumption without a second decrement
- cancel/expiry releases the hold

Do not add reservations preemptively.

---

# Current implementation truth — September 9, 2026

Implemented/deployed:

- account/workspace/RLS foundation
- APEX's own Stripe test billing and paid provisioning
- customer Stripe Connect implementation, pending External-test OAuth acceptance
- `credit_accounts`
- per-grant consumed/remaining attribution
- append-only `credit_ledger`
- `credit_operations`
- transactional `grant_credits`, `consume_credits`, `refund_unspent_credits`
- balance API
- entitlements API
- consume API
- hosted concurrency proof

Hosted wallet proof passed on a fresh 1,000-credit account:

- two parallel `consume(750)` calls
- one ALLOW, one DENY
- remaining 250
- replay both idempotency keys returned the same outcomes
- no second spend

Not yet accepted/complete:

- Phase 5 External-test OAuth
- connected Stripe payment event → `grant_credits`
- connected Stripe refund event → `refund_unspent_credits`
- persisted event replay processing for connected customer fulfillment
- first complete connected payment→grant→consume→refund proof
- first public SDK
- signed/local entitlement evaluation
- reservations
- expiry reconciliation
- broader renewal/metering/operator features

---

# Two separate Stripe paths

## APEX billing

A SaaS company pays APEX. This provisions the SaaS company's APEX workspace and credentials.

## Connected customer Stripe

That SaaS company connects its own Stripe account. Its end customers pay that account for the SaaS product. This is the Stripe relationship APEX uses to map verified commercial events into product state.

Never mix the two in code, docs, environment variables, webhooks, or product copy.

---

# Communication identity

APEX should communicate as a useful, intelligent layer in an existing SaaS stack.

Prefer concise cause-and-effect language:

- Customer paid → configured credits granted.
- Customer used 250 → 750 remain.
- Second concurrent spend exceeded balance → DENY.
- Refund posted → unspent credits clawed back, spent credits recorded as unrecoverable.
- Retry arrived → same outcome, no duplicate value.

Lead with customer/operator value; reveal technical detail when the reader needs it.

Do not define APEX primarily by opposing another company, category, or product. Explain what APEX adds to the stack.

---

# Non-goals

APEX v1 is not:

- a card processor
- a bank account or stored-value wallet
- cryptocurrency infrastructure
- a general ERP/CRM
- a promise that every Stripe billing feature is reimplemented inside APEX
- an offline wallet that lets cached state authorize scarce-value spend

---

# Required production invariants

1. Money truth comes from verified/reconciled Stripe state.
2. Product-state truth comes from authoritative APEX state.
3. Writes that can retry are idempotent.
4. Concurrent scarce-value usage cannot double-spend final credits.
5. Projection/grant/ledger changes for one operation are atomic.
6. Refunds preserve history, are source-aware, and do not create negative v1 balances.
7. Every customer-owned row is workspace-isolated.
8. Secrets stay server-side.
9. Entitlements reads do not authorize spend.
10. Every DENY or later access decision has a reason.
11. Material state changes are auditable.
12. Simulated/demo behavior is never described as production behavior.

---

# Acceptance evidence

## Wallet proof — passed

A hosted test has already proven:

1. grant 1000
2. two parallel consume 750 requests
3. one ALLOW and one DENY
4. remaining 250
5. replay both operations
6. same results, remaining still 250

## Connected Stripe proof — still required

Frozen v1 is not commercially proven until a connected Stripe test path can:

1. accept one verified configured payment event
2. persist the event once
3. create exactly one +1000 source-attributed grant
4. replay payment with no duplicate grant
5. return balance/entitlements 1000
6. consume against hosted state
7. process a Stripe refund with source-aware clawback/unrecoverable accounting
8. replay refund with no duplicate adjustment
9. explain the final balance from durable history

`ROADMAP.md` owns the implementation sequence and acceptance status.

---

# Documentation rule

When implementation or commercial positioning changes, update together as applicable:

- `docs/BUSINESS_MODEL.md`
- `ROADMAP.md`
- root `README.md`
- this file
- `docs/architecture/APEX_V1_LEDGER.md`
- relevant files under `docs/`
- relevant live documentation under `src/docs/`
- customer-facing website copy when the change affects product identity

A capability may be described as **planned**, **implemented/deployed**, or **production-accepted**. Do not collapse those states.