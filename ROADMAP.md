# APEX Implementation Roadmap

This file is the permanent implementation source of truth for APEX. Read it before starting work and update it after every meaningful implementation change.

## Business North Star

**APEX makes money when SaaS companies make digital value easier to sell, deliver, meter, replenish, and explain.**

The commercial model is the roadmap compass:

- the SaaS company is the APEX customer
- its end customers continue paying it through its own Stripe account
- the SaaS company pays APEX a recurring platform subscription for the infrastructure that turns commercial events into correct product state
- early or complex deployments may also carry a one-time guided implementation fee
- future pricing tiers may scale with validated platform capacity such as active customers, metered events, environments, or advanced operational capabilities

Before approving meaningful roadmap work, ask:

> **Does this make it easier, safer, or more scalable for a SaaS company to sell digital value and keep that value correct inside the product?**

If not, it is not core APEX work without a strong reason.

See `docs/BUSINESS_MODEL.md` for the canonical commercial model.

## Canonical product statement

APEX is a hosted payment-and-access layer for SaaS products that use Stripe.

**Stripe moves the money. APEX knows what the money unlocks.**

APEX is responsible for turning paid product state into the thing a customer can actually use: credits, tokens, coins, plan rights, usage allowance, feature access, and the decision to allow or deny an action.

APEX should be understood by the value it adds to an existing SaaS stack, not by opposition to another product or category.

## Production promise

The v1 production product must provide:

1. Stripe connection for the SaaS company's own Stripe account.
2. Credit ledger and balance calculation.
3. Usage metering.
4. Plan and feature entitlements.
5. One-time purchase packs / top-ups.
6. Subscription renewals and recurring allowance grants.
7. Refund-aware credit adjustments.
8. Audit logs and reconciliation history.
9. Hosted APEX API.
10. TypeScript/Node SDK (`@apex/sdk`).
11. Customer-facing balance data/UI.
12. Operator dashboard showing customer, payment, credit, usage, access, and sync state.

No marketing page, docs page, simulation, schema, or UI preview counts as production completion by itself. Each phase below has an acceptance gate.

---

## Two Stripe relationships

Keep these separate everywhere in code and documentation.

### A. APEX's own Stripe billing
A business pays APEX for APEX. This is the Phase 3/4 test-mode Checkout, webhook, subscription, workspace, environment, and APEX credential provisioning path.

### B. A customer's connected Stripe account
The SaaS business connects its own Stripe account to APEX. Its end customers can then buy subscriptions, credits, tokens, add-ons, or other product value through that Stripe account. APEX observes/coordinates those purchases and updates product state.

Phase 5 establishes relationship B. Phase 6+ makes it useful.

---

## Canonical customer funnel

**See APEX → Choose plan → Create account → Pay APEX → Get workspace → Connect Stripe → Install → Verify / Go live → Dashboard**

The visible UI may combine these into seven screens, but implementation gates stay separate.

---

## Approved production technology

Approved today:

- Existing React/Vite frontend
- GitHub Pages for the current public frontend
- Supabase Auth
- Supabase Postgres
- Postgres Row-Level Security
- Supabase Edge Functions where already approved for billing, provisioning, and Stripe connection
- Stripe
- TypeScript/Node for the first SDK (`@apex/sdk`)

Anything else is **TBD — architecture/technology not yet selected**.

### Technology rule

Do not invent a queue vendor, new database, new cloud runtime, framework, worker platform, or external service just to finish a phase. If a capability requires technology that is not approved, write **TBD — architecture/technology not yet selected** and stop at that architecture decision.

---

# Current status — September 9, 2026

| Phase | Capability | Status |
| --- | --- | --- |
| 1 | Product/demo foundation | ✅ Complete |
| 2 | Accounts + backend foundation | ✅ Complete |
| 3 | APEX's own Stripe billing | ✅ Real in test mode |
| 4 | Paid workspace provisioning | ✅ Real |
| 5 | Connect customer's Stripe | 🟡 Implementation merged to `main`; External-test Stripe App registration/OAuth acceptance remains |
| 6 | APEX Cloud: API, credits, usage, entitlements, fulfillment | ⏳ Not started |
| 7 | SDK + customer balance integration | ⏳ Not started |
| 8 | End-to-end production proof | ⏳ Not started |
| 9 | Live operator dashboard | ⏳ Not started |

Current production work must remain focused on completing the **Phase 5 acceptance gate** before Phase 6 begins.

---

# Phase 1 — Product/demo foundation

**Systems:** marketing site, Forma demonstration, onboarding preview, console preview, docs.

**Build:** show the product story and model the intended lifecycle: subscription, allowance, usage, top-up, upgrade, renewal failure/recovery, audit events, and access decisions.

**Business purpose:** make the recurring value proposition obvious: SaaS companies pay APEX because this lifecycle is ongoing infrastructure that should not need to be rebuilt for every product.

**Important:** Forma/localStorage logic is an executable product model, not production infrastructure.

**Done when:** the demos work, tests/build pass, and simulated behavior is clearly labeled.

**Status:** ✅ Complete.

---

# Phase 2 — Accounts + backend foundation

**Systems:** Supabase Auth + workspace-based Postgres tenancy.

**Existing schema:**

`profiles`, `workspaces`, `workspace_members`, `plans`, `features`, `plan_features`, `customers`, `subscriptions`, `environments`, `api_keys`, `stripe_connections`, `usage_events`, `usage_counters`, `credit_grants`, `credit_consumptions`, `access_decisions`, `stripe_webhook_events`, `audit_logs`.

**Requirements:** workspace ownership, RLS isolation, protected credential columns, customer/plan/subscription structure, and schema needed by future usage/credit/access work.

**Status:** ✅ Complete as backend foundation. The usage/credit/access tables are structure only until Phase 6.

---

# Phase 3 — APEX's own billing

**Systems:** APEX's own Stripe account only.

**Build:** authenticated Stripe Checkout, verified webhooks, subscription lifecycle, idempotency, current-state reconciliation, and failure-safe processing.

**Business purpose:** establish the recurring B2B SaaS relationship: the software company pays APEX for hosted infrastructure.

**Security:** never trust client-provided amount, user ID, price ID, or payment status. A verified server-side Stripe event must drive fulfillment.

**Done when:** an authenticated user can complete a Stripe test payment and APEX can prove the payment server-side without double-processing retries.

**Status:** ✅ Real in test mode.

The current Founding Partner Stripe catalog is a launch configuration, not a permanent pricing architecture.

---

# Phase 4 — Paid workspace provisioning

**Systems:** Supabase/Postgres + APEX billing webhook.

**Build:** one transaction activates the paid APEX subscription and provisions the workspace, owner membership, Sandbox environment, and APEX API credentials.

**Done when:** a successful APEX test purchase creates exactly one recoverable workspace/environment/credential set, survives refresh/sign-in, and duplicate Stripe delivery cannot provision twice.

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
- relevant security hardening migration

**Remaining acceptance dependency:**

1. Run `stripe apps upload` from `stripe-app/` using the APEX sandbox/developer Stripe account.
2. Register the APEX Stripe App for **External test**.
3. Confirm callback URI:
   `https://fnmxlmjrkgojowpzrcwa.supabase.co/functions/v1/apex-stripe-connect-callback`
4. Set the External-test OAuth client ID as `STRIPE_APP_CLIENT_ID` in Supabase Edge Function secrets.
5. Complete one real test OAuth authorization from live APEX onboarding.
6. Confirm the paid workspace has `stripe_connections.status = 'connected'` and the expected connected Stripe account ID.

**Done when:** all six checks pass.

**Status:** 🟡 Implementation merged; acceptance not complete.

**Hard gate:** do not begin production Install, SDK, Verify, Dashboard, or APEX Cloud work until Phase 5 passes.

---

# Phase 6 — APEX Cloud

APEX Cloud is where the business model earns its recurring value. Build in the order below. Each subphase must pass before later layers depend on it.

## Phase 6.1 — Hosted API foundation

**Systems:** APEX API.

**Purpose:** give a customer's SaaS server a stable authenticated way to talk to APEX.

**Business value:** make APEX reusable infrastructure rather than project-specific code.

**Minimum responsibilities:**

- authenticate workspace/environment API credentials
- identify/upsert a workspace-owned end customer by external ID
- read customer product state
- expose balance/access/usage operations required by later subphases
- enforce workspace isolation server-side
- use idempotency keys for all write operations that can be retried

**Initial API contract must support, at minimum:**

- identify customer
- get customer balance/state
- report/reserve/finalize usage
- request access decision
- initiate or retrieve a configured purchase-pack checkout path once Phase 6.2/6.4 exists

Exact route names may be finalized during implementation; the responsibilities above are mandatory.

**Runtime:** **TBD — architecture/technology not yet selected** unless the existing approved Edge Function model is explicitly extended for this phase.

**Done when:** a server-side sample app can authenticate to APEX and identify/read one of its own customers without direct browser writes to protected tables.

**Status:** ⏳ Not started.

---

## Phase 6.2 — Credit ledger, usage metering, purchase packs, renewals

**Systems:** Usage + Credits.

**Business value:** let SaaS companies package, sell, replenish, and meter digital value without rebuilding ledger logic for each product.

Use the existing `usage_events`, `usage_counters`, `credit_grants`, and `credit_consumptions` foundation. Add only the schema necessary to durably map Stripe purchases/renewals/refunds to credit changes.

### Credit ledger invariants

- Grants and consumptions are durable history; do not rewrite history to make a balance look right.
- Every external purchase/renewal/adjustment must have a durable source reference.
- Retried requests/events must be idempotent.
- Balance is derived from durable credit state, not trusted from the client.
- Concurrent usage cannot spend the same final credits twice.
- Reservation/finalization must support actions where cost is only known after work completes.
- Credits are product units, not stored money and not cryptocurrency.

### Usage metering

Build:

- idempotent usage events
- period counters
- atomic consumption
- reservation/finalization/cancel flow
- per-feature or general-credit usage where configured
- current balance and remaining allowance calculation

### Purchase packs / top-ups

A workspace must be able to configure a one-time Stripe Price as a product pack such as:

- 1,000 AI credits
- 5,000 tokens
- 10,000 game gold
- 100 report generations

The durable configuration must map the connected Stripe Price/product to the APEX grant amount and optional feature/credit bucket. Never accept a client-supplied dollar amount or grant quantity as authoritative fulfillment data.

A successful verified Stripe payment creates the configured credit grant **exactly once**.

### Renewals

For plans that include recurring credits/allowance, a verified successful subscription renewal creates the new-period grant/reset exactly once. The grant must be keyed to a durable Stripe billing-period/invoice reference so retries cannot duplicate allowance.

Whether unused recurring credits roll over is workspace/product policy. v1 must support an explicit deterministic policy rather than hidden behavior.

### Refunds and reversals

Refund handling must preserve history.

- Link the refund to the original Stripe-funded grant.
- Post a compensating credit adjustment/reversal instead of deleting the original purchase/grant.
- Record the Stripe reference and audit event.
- Recalculate balance/access from the resulting ledger state.
- If refunded credits have already been consumed, do not silently fabricate history. Apply the documented workspace policy and expose the condition to support/operators.

The exact schema for durable purchase-pack configuration and compensating adjustments must be designed in this phase using the approved Postgres stack and documented before migration.

**Done when:** the server can grant, consume, reserve/finalize, renew, top up, and reverse/refund credits safely under retries and concurrency, with a reproducible balance.

**Status:** ⏳ Not started. Existing tables are schema foundation only.

---

## Phase 6.3 — Entitlements + Access Decision Engine

**Systems:** plans, features, subscriptions, usage, credits, `access_decisions`.

**Business value:** ensure a SaaS company's pricing and product behavior stay synchronized as customers buy and use value.

**Build:** combine:

- connected Stripe payment/subscription state
- workspace plan
- plan features/limits
- customer status
- current period
- usage counters
- credit balance
- refund/reversal state

Return:

- `ALLOW` or `DENY`
- machine-readable reason code
- human-readable reason
- relevant balance/limit context
- durable `access_decisions` record

Examples: `ALLOW`, `NO_ACTIVE_PLAN`, `PAYMENT_PAST_DUE`, `FEATURE_NOT_INCLUDED`, `CREDIT_LIMIT_REACHED`, `USAGE_LIMIT_REACHED`.

**Done when:** the same request with the same underlying state returns a deterministic decision and support can see why it happened.

**Status:** ⏳ Not started.

---

## Phase 6.4 — Stripe fulfillment, retries, reconciliation, refunds

**Systems:** connected Stripe webhooks + background processing.

**Business value:** make the payment-to-product-value lifecycle dependable enough to be infrastructure a SaaS company can pay for every month.

**Build:**

- receive and verify connected-account events
- persist each Stripe event before/while processing with idempotency
- fulfill configured purchase packs
- process subscription changes and renewals
- process payment failures/recovery
- process refund/reversal events
- retry safely after transient failures
- reconcile APEX state against Stripe current state
- never lose or double-apply a purchase, renewal, or refund

Queue/worker technology, if required beyond approved Edge Function behavior: **TBD — architecture/technology not yet selected**.

**Done when:** killing/retrying processing at any safe point cannot create duplicate credits or permanently lose a valid Stripe event.

**Status:** ⏳ Not started.

---

## Phase 6.5 — Audit + support data

**Systems:** `audit_logs`, Stripe event history, access decisions, usage/credit history.

**Business value:** make the commercial lifecycle explainable to product, finance, engineering, and support teams.

Record at least:

- Stripe connection changes
- purchase created/paid/failed
- credit grant
- credit consumption
- usage reservation/finalization/cancel
- recurring renewal grant/reset
- refund/reversal adjustment
- entitlement/access change
- ALLOW/DENY decision
- manual operator correction when later supported

Every meaningful state change should answer: **what happened, to whom, why, from which Stripe/APEX event, and when?**

**Done when:** one customer timeline can explain their current balance and access without reading raw database rows.

**Status:** ⏳ Not started.

### Phase 6 complete when

A hosted customer can pay through the SaaS company's connected Stripe account, receive the configured product value, spend it through real usage calls, renew/refund safely, and receive deterministic access decisions with audit history.

---

# Phase 7 — Install, SDK, and customer balance UI

## 7.1 TypeScript/Node SDK

**Tech:** `@apex/sdk`.

**Business value:** reduce integration friction so APEX can be adopted without a large custom implementation project.

The SDK is a thin server-side client over the hosted APEX API; business state remains in APEX Cloud.

Initial SDK responsibilities should cover:

- client initialization with environment credential
- customer identification
- balance/state lookup
- usage record/reserve/finalize
- access check
- purchase-pack checkout initiation once supported by API
- clear typed errors and idempotency support

Do not put secrets in browser-only code.

**Done when:** a sample Node/TypeScript SaaS server can complete the Phase 8 proof using the SDK rather than raw database access.

## 7.2 Customer balance UI

**Business value:** help a SaaS company's own customers understand what they have, what they used, and how to buy more—without APEX taking over the merchant's brand relationship.

Minimum data contract:

- display label/unit (`credits`, `tokens`, `gold`, etc.)
- current spendable balance
- included/recurring allowance where relevant
- purchased/top-up balance where relevant
- next reset/renewal date where relevant
- low/empty state
- purchase-more action when the workspace has configured packs

The authoritative data comes from the APEX API. A reference React balance/purchase component may be provided using the existing frontend stack; final package/distribution details beyond the SDK are **TBD — architecture/technology not yet selected**.

The merchant remains free to build its own UI against the same API.

**Done when:** the sample Forma integration renders a real server-backed balance and a purchase-more action without reading demo/localStorage state.

**Status:** ⏳ Not started.

---

# Phase 8 — End-to-end production proof

This is the first non-negotiable proof that APEX can do what the homepage promises and justify the recurring business model.

Use a hosted sample SaaS/Forma test flow and a connected Stripe test account.

## Required acceptance flow

```text
1. End customer starts with 0 purchased credits.
2. End customer chooses "Buy 1,000 credits."
3. APEX uses the workspace's configured pack + connected Stripe account.
4. Stripe test payment succeeds.
5. Verified connected-account event reaches APEX.
6. APEX creates exactly one +1,000 credit grant.
7. Balance API/SDK returns 1,000.
8. Sample app records 250 usage.
9. Balance returns 750.
10. Access check returns ALLOW.
11. Remaining credits are consumed.
12. Next protected action returns DENY with a credit-limit reason.
13. Retrying the original Stripe event does not grant again.
14. Refund the purchase in Stripe test mode.
15. APEX records the compensating adjustment and recalculates balance/access according to the documented refund policy.
16. Audit history explains purchase → grant → usage → decision → refund.
```

Also verify one subscription-renewal case: a recurring allowance is granted/reset exactly once for the new billing period.

**Done when:** every step above runs against real hosted APEX infrastructure and persisted data, not a reducer, fixture-only path, or localStorage simulation.

**Status:** ⏳ Not started.

---

# Phase 9 — Live operator dashboard

**Systems:** APEX Dashboard + real backend data.

**Business value:** give the SaaS company the operational visibility that turns infrastructure into an ongoing service rather than an opaque black box.

Replace demo/localStorage operator data with live APEX data.

Minimum views:

- workspaces/environments/integration health
- connected Stripe status
- customers
- subscriptions/plans/features
- customer balance
- credit grants/consumptions/adjustments
- usage history/counters
- purchase/renewal/refund history
- access-decision history
- audit timeline
- clear "why is this customer allowed/blocked?" explanation

The dashboard is for the SaaS operator. Customer-facing balance UI remains Phase 7.2 and belongs inside/alongside the customer's product experience.

**Done when:** an operator can troubleshoot the entire Phase 8 lifecycle from the dashboard without database-console access.

**Status:** ⏳ Not started.

---

# Product invariants

These apply across all later phases.

1. Stripe is the source of truth for money movement; APEX is the source of truth for mapped product access/usage state.
2. APEX never trusts browser claims that a payment succeeded.
3. External events and write APIs must be idempotent.
4. Credits/usage changes must be concurrency-safe.
5. Financial/refund corrections preserve history; do not delete past events to make state look clean.
6. Workspace isolation is enforced server-side.
7. Secrets never ship in browser bundles or logs.
8. APEX units are product units, not stored currency.
9. Every access decision has a reason.
10. Every material state change is auditable.
11. Simulations stay labeled simulations.
12. README, docs, live Docs, and this roadmap must not claim a feature is live before its acceptance gate passes.
13. Major features must map back to the business North Star and a concrete customer value addition.
14. APEX should communicate by explaining what it adds to the stack, not by defining itself through opposition to another product.

---

# Immediate next action

Finish **Phase 5 acceptance only**:

`stripe apps upload` → External test registration → configure `STRIPE_APP_CLIENT_ID` → complete one real test OAuth connection → confirm persisted connected account.

After Phase 5 passes, begin Phase 6.1. Do not skip directly to SDK/UI work; the API/ledger must become authoritative first.