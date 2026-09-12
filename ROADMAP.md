# APEX Implementation Roadmap

This file is the permanent implementation source of truth for APEX. Read it before starting work and update it after every meaningful implementation change.

## Business North Star

**APEX makes money when SaaS companies make digital value easier to sell, deliver, meter, replenish, and explain.**

The commercial model is the roadmap compass:

- the SaaS company is the APEX customer
- its end customers continue paying it through its own Stripe account
- the SaaS company pays APEX a recurring platform subscription for infrastructure that turns commercial events into correct product state
- early or complex deployments may also carry a one-time guided implementation fee
- future pricing tiers may scale with validated platform capacity such as active customers, metered events, environments, or advanced operational capabilities

Before approving meaningful roadmap work, ask:

> **Does this make it easier, safer, or more scalable for a SaaS company to sell digital value and keep that value correct inside the product?**

If not, it is not core APEX work without a strong reason.

See `docs/BUSINESS_MODEL.md` for the canonical commercial model.

## September 12, 2026 execution update — current status override

The Stripe webhook pilot completed a real sandbox Checkout-to-credit proof:

```text
Stripe Checkout (paid)
  → Stripe-signed checkout.session.completed
  → workspace-specific Supabase Edge Function endpoint
  → persisted stripe_webhook_events receipt
  → idempotent source-attributed grant_credits(+1000)
  → open credit_grant / projected balance
```

Evidence: the Stripe event had no pending webhook deliveries; APEX recorded it as `processed` with no
error; exactly one open 1,000-credit grant was tied to the payment intent. This satisfies a **test-pilot
payment → grant proof**, not the whole frozen-v1 acceptance gate. Any older wording below that says ingress
is “not wired” applies only to the unaccepted Stripe Apps OAuth path, not this verified manual pilot.

### Lessons learned

1. Separate APEX billing from a customer’s Stripe events in code, event destinations, secrets, and proof.
2. A successful Checkout is not acceptance by itself. Require Stripe payment, persisted webhook event, and
   one source-attributed grant.
3. Stripe App OAuth and direct Dashboard webhooks solve different distribution problems. The latter is the
   shortest controlled-pilot path; the former is the scalable self-serve path.
4. Never place a Stripe webhook signing secret, Supabase PAT, service key, or APEX secret API key in the
   browser or repository. Rotate the PAT exposed during this session and rotate the demo webhook secret
   before sharing the project.
5. Remote Supabase migration history has legacy version drift. Apply only reviewed migrations and do not run
   bulk `supabase db push --include-all` until that history is reconciled.

### Ordered next steps

1. **Security cleanup:** rotate the exposed Supabase PAT and demo webhook secret.
2. **Pilot lifecycle proof is complete:** payment replay, consume 750, full refund, and refund replay now
   pass without duplicate grants or adjustments. Preserve the evidence in an automated integration test.
3. **Remove guided-demo coupling:** use encrypted, per-workspace Dashboard secrets and server-side
   product/price mappings rather than Checkout metadata for normal pilot customers.
4. **Automate the proof:** add an isolated integration test and runbook for payment, duplicate event,
   consume, refund, refund replay, and ledger reconciliation.
5. **Publish the thin SDK:** add package tests and release provenance; keep it server-only.
6. **Build scalable onboarding:** create a public Stripe App under an eligible developer owner, enable
   sandbox/External test, register connected-account events, and repeat the full acceptance proof.
7. **Operator visibility:** build a live, tenant-scoped dashboard for connection health, event failures,
   balance/grant history, and support replay.

## Canonical product statement

APEX is a hosted payment-and-product-state layer for SaaS products that use Stripe.

**Stripe moves the money. APEX knows what the money unlocks.**

APEX turns verified commercial events into usable product state: credits, balances, usage, plan rights, feature entitlements, replenishment, refund adjustments, and ultimately product access.

APEX should be understood by the value it adds to an existing SaaS stack, not by opposition to another product or category.

---

## Frozen v1 product/evaluation model

The architecture decision is closed for v1 unless an explicit product decision reopens it.

**v1 = hosted authoritative ledger + hosted authoritative spend + snapshot-shaped entitlements read.**

```text
Stripe event / APEX API call
        ↓
Supabase Edge Function
        ↓
Postgres transaction
  ├─ credit operation/idempotency
  ├─ per-grant credit state
  ├─ append-only ledger
  └─ projected remaining balance
```

Public v1 integration rules:

- `GET /v1/customers/:id/entitlements` is read-only product state. It includes `remaining`, `version`, and `as_of`.
- `POST /v1/customers/:id/consume` is the authoritative scarce-credit spend operation.
- a read, UI state, or entitlements document is never a right to spend
- no public `/check` route in v1
- no reservations/finalize/cancel in v1
- no signed snapshots or local SDK evaluation in v1
- no Redis, Kafka, ClickHouse, AWS runtime, dedicated worker service, or new queue product in v1

Later, the same entitlements document may be signed and evaluated locally for feature/preflight decisions. Scarce-value spend still remains authoritative through `consume` or a future reservation primitive.

Canonical architecture details live in `docs/architecture/APEX_V1_LEDGER.md`.

---

## Product scope: frozen v1 versus broader promise

### Frozen v1 sellable core

1. Connect the SaaS company's Stripe account.
2. Persist verified connected Stripe events idempotently.
3. Map an authoritative payment/configuration to a durable credit grant.
4. Return authoritative balance/entitlements state.
5. Consume credits atomically without double-spend.
6. Apply source-scoped refund clawback without negative balances or debt.
7. Replay payment/refund/API writes without duplicating state.
8. Preserve an auditable ledger explaining the resulting balance.
9. Expose the core through a hosted APEX API and later a thin server SDK.

### Broader product promise after the frozen core

APEX may expand into recurring allowance renewals, richer usage metering, feature-access evaluation, customer balance components, reconciliation/support tooling, operator workflows, reservations for long-running work, signed local entitlement evaluation, and scaling infrastructure when customer evidence justifies them.

Do not drag those later systems into v1 merely because they appear in a demo or earlier plan.

---

## Two Stripe relationships

Keep these separate everywhere in code and documentation.

### A. APEX's own Stripe billing
A business pays APEX for APEX. This is the Phase 3/4 test-mode Checkout, webhook, subscription, workspace, environment, and APEX credential provisioning path.

### B. A customer's connected Stripe account
The SaaS business connects its own Stripe account to APEX. Its end customers pay that SaaS business for credits, subscriptions, add-ons, or other product value. APEX observes verified events and maps them to product state.

Phase 5 establishes relationship B. Phase 6 makes it useful.

---

## Canonical customer funnel

**See APEX → Choose plan → Create account → Pay APEX → Get workspace → Connect Stripe → Install → Verify / Go live → Dashboard**

The visible UI may combine these into fewer screens, but implementation gates stay separate.

---

## Approved production technology

Approved for the frozen v1:

- existing React/Vite frontend
- GitHub Pages for the current public frontend
- Supabase Auth
- Supabase Postgres
- Postgres Row-Level Security
- Supabase Edge Functions for current server/API/webhook work
- `stripe_webhook_events` persisted-event replay using existing Supabase/Postgres capabilities when ingress is wired
- Stripe
- TypeScript/Node for the first server SDK (`@apex/sdk`)

### Technology rule

Do not invent a queue vendor, new database, new cloud runtime, cache, framework, or worker platform just to finish a phase. A new component requires a measured problem that the approved v1 stack cannot reasonably solve and a concrete customer-value reason for adding it.

---

# Current status — September 9, 2026

| Phase | Capability | Status |
| --- | --- | --- |
| 1 | Product/demo foundation | ✅ Complete |
| 2 | Accounts + backend foundation | ✅ Complete |
| 3 | APEX's own Stripe billing | ✅ Real in test mode |
| 4 | Paid workspace provisioning | ✅ Real |
| 5 | Connect customer's Stripe | 🟡 Implementation merged; External-test Stripe App OAuth acceptance remains |
| 6 | Hosted product-state core | 🟡 In progress — ledger/API deployed and concurrency-proven; connected Stripe ingress still missing |
| 7 | SDK + customer balance integration | ⏳ Not started |
| 8 | Connected Stripe end-to-end proof | ⏳ Not started |
| 9 | Live operator dashboard | ⏳ Not started |

The hosted wallet proof does **not** depend on Phase 5 and has already passed. Customer-facing onboarding still stops at Connect Stripe until Phase 5 acceptance passes.

---

# Phase 1 — Product/demo foundation

**Systems:** marketing site, Forma demonstration, onboarding preview, console preview, docs.

**Business purpose:** make the recurring value proposition obvious: SaaS companies pay APEX because payment-to-product-state behavior is ongoing infrastructure that should not need to be rebuilt for every product.

**Important:** Forma/localStorage and assurance simulations are executable product models, not production infrastructure. They may show later concepts such as reservations without making those concepts part of frozen v1.

**Status:** ✅ Complete.

---

# Phase 2 — Accounts + backend foundation

**Systems:** Supabase Auth + workspace-based Postgres tenancy.

Foundation includes plans, features, customers, subscriptions, environments, API keys, Stripe connections, usage tables, credit tables, access decisions, Stripe event history, and audit structures.

Phase 6 added the production credit projection/ledger/idempotency structures on top of that foundation.

**Status:** ✅ Complete as backend foundation.

---

# Phase 3 — APEX's own billing

**Systems:** APEX's own Stripe account only.

**Business purpose:** establish the recurring B2B relationship: the software company pays APEX for hosted infrastructure.

**Done when:** an authenticated user can complete a Stripe test payment and APEX can prove the payment server-side without duplicate fulfillment.

**Status:** ✅ Real in test mode.

The current Founding Partner Stripe catalog is a launch configuration, not a permanent pricing architecture.

---

# Phase 4 — Paid workspace provisioning

**Systems:** Supabase/Postgres + APEX billing webhook.

**Done when:** a successful verified APEX purchase creates exactly one recoverable workspace/environment/credential set and duplicate Stripe delivery cannot provision twice.

**Status:** ✅ Real.

---

# Phase 5 — Connect customer's Stripe

**Systems:** Stripe Apps OAuth / customer Stripe connection.

**Tech:** Stripe Apps OAuth + existing Supabase Edge Functions/Postgres.

**Implementation history:** merged through PR #16, `Phase 5: real Stripe Apps OAuth connection`.

**Built and merged:**

- Stripe App v2 manifest under `stripe-app/`
- authenticated connect/status Edge Function
- one-time OAuth state and callback Edge Function
- workspace-scoped `stripe_connections` persistence
- encrypted OAuth refresh-token storage
- browser cannot read refresh token
- real users are blocked from entering simulated Install before Stripe connection is accepted

**Remaining acceptance dependency:**

1. Run `stripe apps upload` from `stripe-app/` using the APEX sandbox/developer Stripe account.
2. Register the APEX Stripe App for **External test**.
3. Confirm callback URI:
   `https://fnmxlmjrkgojowpzrcwa.supabase.co/functions/v1/apex-stripe-connect-callback`
4. Set the External-test OAuth client ID as `STRIPE_APP_CLIENT_ID` in Supabase Edge Function secrets.
5. Complete one real test OAuth authorization from live APEX onboarding.
6. Confirm the paid workspace has `stripe_connections.status = 'connected'` and the expected connected Stripe account ID.

**Status:** 🟡 Implementation merged; acceptance not complete.

**Customer-funnel gate:** real onboarding stops here until the six checks pass. This gate does not prohibit independent backend ledger/API testing.

---

# Phase 6 — Hosted product-state core

Phase 6 is the first production layer that directly proves why a SaaS company should keep paying APEX: correct product value under retries, concurrency, usage, and refunds.

## Phase 6.1 — Ledger + authoritative consume API

**Business value:** remove the hardest reusable wallet plumbing: durable grants, accurate balances, atomic spend, idempotency, and source-aware refunds.

**Runtime:** Supabase Auth + Postgres/RLS + Edge Functions. No new cloud/runtime.

**Deployed data model:**

- `credit_accounts` — non-negative hot-path balance projection
- `credit_grants` — per-grant source attribution, consumed amount, remaining amount, status
- `credit_ledger` — append-only `grant` / `consume` / `refund` / `unrecoverable` history
- `credit_operations` — idempotent request-outcome replay, including DENY outcomes

**Deployed API:**

- `GET /v1/customers/:id/balance`
- `GET /v1/customers/:id/entitlements`
- `POST /v1/customers/:id/consume`

**Concurrency contract:** projection decrement and grant burn happen inside one Postgres function/transaction. `remaining` can never go negative.

**Hosted proof passed:** fresh balance 1000 → two parallel `consume(750)` calls → one ALLOW, one DENY, remaining 250 → replay both keys returns the same outcomes with no second spend.

The first proof attempt exposed a legacy Supabase service-role JWT clock issue. PR #19 changed server clients to prefer the current Supabase server secret-key model; the fresh hosted proof then passed.

**Status:** ✅ Implemented, deployed, and concurrency-proven. This is not full Phase 6 acceptance because Stripe ingress is not wired.

---

## Phase 6.2 — Connected Stripe ingress: payment → grant, refund → source-aware clawback

**Business value:** turn the proven wallet into the product customers actually buy: verified money movement automatically becomes correct product value.

**Build:**

1. verify connected Stripe event signatures outside Postgres
2. persist each event uniquely using the connected Stripe identity + Stripe event ID
3. process the persisted event through transactional Postgres logic
4. map authoritative Stripe product/price/payment data to a configured grant amount
5. call `grant_credits` exactly once for successful configured purchases
6. call `refund_unspent_credits` for the originating purchase on refund
7. mark event processed in the same transactional processing boundary where practical
8. leave failed/pending event rows replayable
9. retry persisted failures using existing Supabase/Postgres scheduling before adding another queue system

### Frozen refund rule

Balance never goes negative. There is no v1 debt ledger.

For a refund of purchase A:

- claw back only the unspent credits still attributable to A
- never steal credits from purchase B
- already-consumed credits remain consumed
- record the spent portion as `unrecoverable_spent`
- future grants increase the current non-negative balance; they do not repay debt

Example:

```text
grant A +1000
consume   750
refund A 1000
→ clawed_back 250
→ unrecoverable_spent 750
→ remaining 0
```

**Status:** ⏳ Not wired. Begin after Phase 5 External-test OAuth acceptance so the connected-account path can be proven for real.

---

## Phase 6.3 — Entitlements and access evolution

**Business value:** keep product rights understandable and prepare low-latency enforcement without weakening wallet correctness.

Already deployed:

- `GET /v1/customers/:id/entitlements`
- current plan/features where present
- `remaining`, `version`, and `as_of`

Frozen semantics:

- entitlements is a read-only, snapshot-shaped document
- it may inform UI or feature/preflight logic
- it does **not** authorize scarce-credit spend
- v1 has no public `/check` endpoint
- a credit-gated action starts/succeeds only through authoritative `consume`

### v1.1 direction

If customer latency/use cases justify it, sign the same entitlements document and let the server SDK evaluate eligible feature gates locally. Add TTL/expiry/invalidation/failure policy then, not before.

Reservations/finalize/cancel are also deferred until a real start-now/finish-later workload requires them. If added, reserve must reduce available capacity immediately and carry a TTL; finalize must not decrement twice; cancel/expiry releases the hold.

**Status:** 🟡 Snapshot-shaped hosted read exists; broader/local access evaluation is later.

---

## Phase 6.4 — Renewals, reconciliation, expiry, broader metering

**Business value:** expand the reliable product-value lifecycle only after the core purchase/consume/refund path is proven with a customer.

Planned capabilities include:

- recurring allowance grants/resets keyed to a durable Stripe billing-period/invoice reference
- explicit rollover policy
- failed-payment/recovery state where it materially affects product rights
- reconciliation between Stripe state and APEX product state
- broader usage counters/events when needed beyond direct credit consume
- expiring-grant support

### Expiry boundary

`credit_grants.expires_at` already exists and consume skips expired grants, but v1 does **not** yet reconcile expired grant remainder out of `credit_accounts.remaining`. Therefore expiring grants are not a supported production feature yet. Frozen v1 grants should be non-expiring until expiry reconciliation is implemented and tested.

**Status:** ⏳ Planned after core ingress proof/customer need.

---

## Phase 6.5 — Audit + support data

**Business value:** make the commercial lifecycle explainable to product, finance, engineering, and support teams.

The append-only ledger already provides the core credit audit. Future operator views should explain:

- Stripe connection changes
- payment/refund events
- credit grants
- credit consumption
- unrecoverable refunded spend
- recurring grants when added
- entitlement/access changes when added
- manual corrections when later supported

Every meaningful state change should answer: **what happened, to whom, why, from which Stripe/APEX event, and when?**

**Status:** 🟡 Core credit ledger exists; operator/support timeline remains planned.

### Frozen Phase 6 v1 acceptance

Phase 6 v1 is accepted when a connected Stripe test purchase/refund path proves:

1. verified payment event persists once
2. configured payment creates exactly one +1000 grant
3. replay creates no second grant
4. entitlements/balance returns 1000
5. authoritative consume works against hosted state
6. refund is source-aware, non-negative, and replay-safe
7. ledger history explains the final balance

The hosted parallel-consume proof has already passed independently and remains part of the acceptance evidence.

---

# Phase 7 — Install, SDK, and customer balance UI

## 7.1 TypeScript/Node server SDK

**Business value:** reduce integration friction so APEX can be adopted without a large custom implementation project.

The first SDK is a thin **server-side** client over the hosted APEX API. Product state remains in the hosted APEX service.

Frozen first responsibilities:

- initialize with APEX environment credential
- get customer balance
- get customer entitlements
- consume credits with an idempotency key

Later SDK responsibilities may add signed local entitlement evaluation, purchase coordination, reservations, or richer usage only after the underlying product capability is accepted.

Do not put APEX secret credentials in browser-only code.

**Status:** ⏳ Not started.

## 7.2 Customer balance UI

**Business value:** help the SaaS company's end customer understand what they have and what they used without APEX taking over the merchant's brand relationship.

Minimum eventual display contract:

- product unit name
- current spendable balance/allowance
- low/empty state
- purchase-more action when configured
- renewal/reset information when that capability exists

The authoritative data comes from APEX. The merchant may use a reference component or build its own UI.

**Status:** ⏳ Not started.

---

# Phase 8 — Connected Stripe end-to-end proof

This is the non-negotiable proof that APEX can do what the core business promise says without localStorage/reducer state.

Required flow:

```text
1. SaaS company's Stripe account is connected through accepted Phase 5 OAuth.
2. End customer buys a configured 1,000-credit pack in Stripe test mode.
3. Verified connected Stripe event is persisted once.
4. APEX creates exactly one +1,000 source-attributed grant.
5. Balance/entitlements returns 1,000.
6. consume(250) succeeds → remaining 750.
7. consume(750) succeeds → remaining 0.
8. next consume(1) returns DENY / INSUFFICIENT_CREDITS.
9. replay original payment event → no second grant.
10. refund original purchase → claw back only that purchase's unspent remainder, record unrecoverable spent, never go negative.
11. replay refund event → no second adjustment.
12. ledger/audit data explains the whole chain.
```

A later broader proof adds recurring renewal behavior, signed/local feature evaluation, or reservations only after those capabilities are intentionally added.

**Status:** ⏳ Not started.

---

# Phase 9 — Live operator dashboard

**Business value:** give the SaaS company operational visibility that turns infrastructure into an ongoing service rather than an opaque black box.

Minimum eventual views:

- workspace/environment/integration health
- connected Stripe status
- customers
- plan/entitlement state
- balances
- credit grants/consumptions/refunds/unrecoverable spend
- Stripe event/replay state
- audit timeline
- clear explanation of why a credit-gated consume was denied

Later views may add usage counters, renewals, access-decision history, reservations, or reconciliation data as those features become production capabilities.

**Status:** ⏳ Not started.

---

# Product invariants

1. Stripe is the source of truth for money movement; APEX is the source of truth for mapped product state.
2. APEX never trusts browser claims that a payment succeeded.
3. External events and write APIs must be idempotent.
4. Concurrent scarce-value usage cannot double-spend the final credits.
5. Projection + per-grant mutation + ledger append for one spend/refund must commit atomically.
6. Refunds preserve history, never steal from another purchase, and never make v1 balance negative.
7. Workspace isolation is enforced server-side.
8. Secrets never ship in browser bundles or logs.
9. APEX units are product units, not stored currency.
10. `GET /entitlements` is advisory/read-only; it is not a spend authorization.
11. Every DENY or later access decision must have a machine-readable reason.
12. Every material state change must be explainable from durable history.
13. Simulations stay labeled simulations.
14. README, docs, live Docs, and this roadmap must distinguish **planned**, **implemented/deployed**, and **production-accepted**.
15. Major features must map back to the business North Star and a concrete customer value addition.
16. APEX should communicate by explaining what it adds to the stack, not by defining itself through opposition to another product.

---

# Immediate next actions

1. Finish **Phase 5 External-test OAuth acceptance**:
   `stripe apps upload` → External test registration → configure `STRIPE_APP_CLIENT_ID` → complete one real test OAuth connection → confirm persisted connected account.
2. Wire connected `stripe_webhook_events` → `grant_credits` / `refund_unspent_credits` with replay-safe processing.
3. Run the connected payment/refund acceptance flow.
4. Only then mark frozen Phase 6 v1 accepted.

Do not reopen cloud/runtime selection, add reservations, add `/check`, or build signed local evaluation unless a later explicit product/customer requirement justifies it.
