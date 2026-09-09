# APEX v1 Ledger Architecture — Frozen

This document freezes the first production ledger/evaluation model for APEX. Phase 6 implementation must follow this contract unless an explicit product decision changes it.

## Product decision

**APEX v1 = hosted authoritative ledger + hosted authoritative scarce-value spend + snapshot-shaped entitlements read.**

The goal is not to maximize infrastructure. The goal is to eliminate the recurring engineering subsystem between “Stripe says the customer paid” and “the SaaS product knows what value is available and can spend it safely.”

## Runtime

APEX v1 uses the existing stack only:

- Supabase Auth
- Supabase Postgres + RLS
- Supabase Edge Functions
- Stripe
- persisted `stripe_webhook_events`
- existing Supabase/Postgres scheduling for replay when connected ingress is wired

The first server-side SDK is a later thin client over this hosted service; it is not a separate state system.

Not v1:

- reservations/finalize/cancel
- signed snapshots
- local SDK evaluation
- public `/check`
- Redis
- Kafka
- ClickHouse
- AWS runtime migration
- dedicated workers
- a new queue product

## API

Frozen v1 surface:

```text
POST /stripe/webhook
GET  /v1/customers/:id/balance
GET  /v1/customers/:id/entitlements
POST /v1/customers/:id/consume
```

`GET /entitlements` includes `remaining`, `version`, and `as_of` so the same document can later become a signed v1.1 snapshot without changing its basic shape.

`GET /entitlements` is read-only. It is not a spend authorization.

`POST /consume` is the v1 scarce-value authorization boundary: if the atomic spend succeeds, the action is allowed to consume those credits; if it returns insufficient credits, the spend is denied.

## Data model

Credits remain attributable to the grant that created them.

### Credit account projection

One `credit_accounts` row per workspace/customer stores current spendable `remaining` and monotonic `version`.

It is the hot-path concurrency boundary, not the audit history.

Rules:

- `remaining >= 0`
- projection changes happen in the same transaction as grant/ledger mutations
- do not compute `SUM(ledger)` on every hot-path spend

### Grants

Each grant stores:

- workspace/customer
- source Stripe event/payment reference when Stripe-funded
- original amount
- consumed amount
- remaining amount
- status
- created timestamp
- optional expiry timestamp

### Ledger

`credit_ledger` is append-only and records:

- `grant`
- `consume`
- `refund`
- `unrecoverable`

Ledger entries may reference the exact grant involved.

### Operations

`credit_operations` stores request idempotency and final outcomes.

This table is required because a denied consume creates no spend ledger row, but replaying the same idempotency key must still return the original DENY rather than trying again against a changed balance.

## Consumption

v1 consumes open grants FIFO by `created_at`, then `id`.

One Postgres transaction must:

1. claim/validate the idempotency operation
2. atomically decrement `credit_accounts.remaining` only when enough remains
3. if insufficient, persist a DENY result without changing the wallet
4. if sufficient, allocate the spend across open grant rows FIFO
5. update each affected grant's `consumed_amount` / `remaining_amount`
6. append consume ledger entries
7. persist the successful operation result
8. commit all changes together

Two concurrent `consume(750)` calls against 1000 cannot both spend. The conditional projection update is the concurrency boundary.

## Lock order

Keep database lock order consistent across mutations:

1. credit account/projection
2. relevant grant rows
3. ledger/operation writes as part of the same transaction

Current consume and refund paths follow account-first then grants. Preserve this ordering to reduce future deadlock risk.

## Refund policy — frozen for v1

Refunds are source-aware and never create a negative balance or debt ledger.

For a Stripe-funded purchase grant:

- load only grant(s) created by that purchase/source
- claw back only the unspent remainder of those grants
- never claw back credits belonging to another purchase/grant
- do not reverse product work already consumed
- decrement the customer projection only by recoverable unspent value
- record recoverable value as refund ledger entries
- record already-spent value as `unrecoverable_spent`
- future grants start from the current non-negative balance; they do not repay arrears

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

If grant B exists, refunding A cannot consume or revoke any of B.

Replay of the same refund idempotency/event must return the same result without applying another adjustment.

## Expiry boundary

`credit_grants.expires_at` existed in the original schema before this v1 migration. Consume currently skips expired grants.

However, the projected `credit_accounts.remaining` is not yet automatically reduced when a grant expires. Therefore the existence of `expires_at` and the consume filter do **not** mean production expiry is complete.

Frozen v1 rule:

- production v1 grants should be non-expiring
- expiry is unsupported until a reconciliation/expiry process atomically removes expired remaining value from the projection and records the state change

## Stripe event processing target

Connected Stripe ingress is not wired yet. The frozen processing model is:

1. Verify Stripe signature outside Postgres.
2. Persist the event uniquely using `(stripe_connection_id, stripe_event_id)`.
3. Invoke transactional Postgres processing keyed by that persisted event.
4. Grant/refund + projection + ledger + operation/event state commit atomically where the database boundary allows it.
5. Failed/pending rows remain replayable.
6. Replay invokes the same processing again; idempotency makes repeats safe.

Do not add an external queue product before a persisted row + retry/replay mechanism proves insufficient.

## Required uniqueness

- `(workspace_id, idempotency_key)` for API/ledger operation idempotency
- `(stripe_connection_id, stripe_event_id)` for connected Stripe events

## Security boundary

Privileged ledger mutation RPCs are callable only by the server role.

The public `apex-api` Edge Function uses the hashed `apex_sk_*` credential path to resolve workspace/environment identity; browser `anon` or ordinary authenticated roles cannot call grant/consume/refund RPCs directly.

PR #19 changed shared server clients to prefer Supabase's current server secret-key model while retaining legacy fallback compatibility after a hosted proof exposed a legacy JWT clock issue.

## Hosted wallet proof — passed

A fresh hosted test wallet proved the concurrency contract:

```text
grant 1000
parallel:
  consume 750
  consume 750
→ one ALLOW
→ one DENY / INSUFFICIENT_CREDITS
→ remaining 250

replay both idempotency keys
→ same ALLOW/DENY results
→ replayed: true
→ remaining still 250
```

This is real hosted Postgres/Edge execution evidence, not only a SQL contract test.

## What this proof does not prove

It does not prove the connected payment lifecycle.

Still required for frozen v1 acceptance:

1. complete Phase 5 External-test Stripe OAuth
2. verified connected payment event persists once
3. payment maps to `grant_credits` exactly once
4. replay does not grant again
5. connected refund maps to `refund_unspent_credits`
6. refund replay is a no-op
7. final ledger explains balance and unrecoverable spend

## v1.1 direction

After the connected lifecycle is green and customer evidence justifies lower-latency feature gates:

- sign the same entitlements document
- add TTL/expiry/invalidation/failure semantics
- let the server SDK evaluate eligible feature/preflight checks locally

Scarce-value spend still hits authoritative consume or a future reservation system.

If reservations are later required for start-now/finish-later workloads:

- reserve reduces available capacity immediately
- reserve requires a TTL
- finalize converts the hold to consumption without a second decrement
- cancel/expiry releases the hold

Do not add that system before a real workload requires it.