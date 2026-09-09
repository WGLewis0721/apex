# APEX v1 Ledger Architecture — Frozen

This document freezes the first production ledger model for APEX. Phase 6 implementation must follow this contract unless an explicit product decision changes it.

## Runtime

APEX v1 uses the existing stack only:

- Supabase Auth
- Supabase Postgres + RLS
- Supabase Edge Functions
- `stripe_webhook_events` persistence + scheduled replay
- Stripe
- server-side APEX SDK

Not v1: reservations, signed snapshots, local SDK evaluation, `/check`, Redis, Kafka, ClickHouse, AWS, dedicated workers, or a new queue product.

## API

- `POST /stripe/webhook`
- `GET /v1/customers/:id/balance`
- `GET /v1/customers/:id/entitlements`
- `POST /v1/customers/:id/consume`

`GET /entitlements` includes `remaining`, `version`, and `as_of` so the same document can become the v1.1 snapshot without changing its shape.

## Data model

Credits remain attributable to the grant that created them.

### Credit account projection

One projection row per workspace/customer credit account stores the current spendable `remaining` and monotonic `version`. It is the hot-path concurrency boundary, not the audit history.

### Grants

Each grant stores:

- workspace/customer
- source Stripe event/payment reference when Stripe-funded
- original amount
- consumed amount
- remaining amount
- status
- created/expiry timestamps

### Ledger

Append-only entries represent:

- grant
- consume
- refund
- unrecoverable

Ledger entries may reference a specific grant. Unique workspace-scoped idempotency prevents retried API writes from duplicating state.

## Consumption

v1 consumes grants FIFO by `created_at`, then `id`, skipping exhausted, revoked, or expired grants.

One Postgres transaction must:

1. atomically decrement the customer projection only when enough remains,
2. allocate the spend across open grant rows FIFO,
3. update each affected grant's consumed/remaining amount,
4. append the consume ledger rows,
5. commit all changes together.

Two parallel `consume(750)` calls against a balance of 1000 must produce one success and one DENY.

## Refund policy — frozen for v1

Refunds are source-aware and never create a negative balance.

For a Stripe-funded purchase grant:

- claw back only the unspent remainder of the grant(s) created by that purchase,
- never claw back credits belonging to another purchase/grant,
- do not reverse work already consumed,
- set the refunded grant's remaining amount to zero,
- decrement the customer projection only by the recoverable unspent amount,
- record the recoverable amount as a refund ledger entry,
- record the already-spent portion as `unrecoverable_spent`,
- future grants start from the current non-negative balance; there is no debt ledger in v1.

Example:

```text
grant A       +1000
consume A      -750
refund A       1000 requested
----------------------
clawed_back     250
unrecoverable   750
remaining         0
```

If grant B exists, refunding A cannot consume or revoke any of B.

## Stripe event processing

1. Verify Stripe signature outside Postgres.
2. Persist the event uniquely using `(stripe_connection_id, stripe_event_id)`.
3. Invoke a transactional Postgres function keyed by that persisted event.
4. Ledger/projection/grant changes and event `processed` state commit together.
5. Failed/pending rows remain replayable. Scheduled replay invokes the RPC again; idempotency makes repeats safe.

## Required uniqueness

- `(workspace_id, idempotency_key)` for API/ledger idempotency
- `(stripe_connection_id, stripe_event_id)` for connected Stripe events

## v1 proof

1. Verified Stripe payment creates one grant of 1000 and balance 1000.
2. Replaying the payment event creates no second grant.
3. Entitlements returns balance 1000 plus plan/features/version/as_of.
4. Two parallel `consume(750)` calls produce one success with balance 250 and one DENY.
5. `consume(250)` produces balance 0; next consume is DENY.
6. Refund of the original 1000 purchase records `clawed_back=0` if fully consumed, otherwise claws back only that purchase's unspent remainder; `unrecoverable_spent` records the rest.
7. Replaying the refund is a no-op.
8. Audit/ledger history can explain the final balance.
