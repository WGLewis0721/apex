# APEX — Stripe handles the money. APEX handles what it unlocks.

**Live app:** https://wglewis0721.github.io/apex/

APEX is a hosted payment-and-access layer for SaaS products that already use Stripe. It connects a payment to the thing the customer is supposed to receive inside the product: credits, tokens, coins, usage allowance, plan rights, or feature access.

**Stripe moves the money. APEX knows what the money unlocks.**

A typical APEX flow is:

```text
Customer wants 1,000 more credits
        ↓
Customer's SaaS app
        ↓
APEX
        ↓
Customer's connected Stripe account
        ↓
Verified payment event
        ↓
APEX grants 1,000 credits
        ↓
Usage consumes credits
        ↓
APEX returns current balance + ALLOW/DENY
```

APEX complements Stripe; it does not replace Stripe or process card data itself.

## Production promise

The production product is being built to provide one coherent subsystem instead of making every SaaS team build it from scratch:

- Stripe integration for the SaaS company's own Stripe account
- credit ledger and balance calculation
- usage metering
- plan and feature entitlements
- one-time purchase packs / top-ups
- subscription renewals and recurring allowance grants
- refund-aware credit adjustments
- audit history and reconciliation
- hosted API
- TypeScript/Node SDK (`@apex/sdk`)
- customer-facing balance data/UI
- operator dashboard showing customers, payments, credits, usage, access, and why a decision happened

`ROADMAP.md` is the implementation source of truth for that promise. Do not mark a production capability complete until its roadmap acceptance test passes.

## Two Stripe relationships — do not confuse them

APEX has two separate Stripe paths:

1. **APEX's own billing** — a business pays APEX for APEX. This uses the APEX Stripe sandbox today.
2. **A customer's connected Stripe account** — that business's end customers buy subscriptions, credits, tokens, add-ons, or other product value. This is the Stripe connection APEX uses to keep the customer's product state in sync.

Phase 3/4 built the first path in test mode. Phase 5 connects the second path. Phase 6+ turns events from that connected account into real credits, usage, entitlements, refunds, and access decisions.

## Current implementation status — September 9, 2026

| Capability | Status |
| --- | --- |
| Marketing site, Forma demo, onboarding preview, docs, console preview | ✅ Built |
| Supabase Auth accounts | ✅ Real |
| Multi-tenant Supabase/Postgres schema + RLS | ✅ Real |
| APEX test Checkout + verified webhook processing | ✅ Real |
| Paid workspace/environment/API credential provisioning | ✅ Real |
| Connect customer's Stripe account | 🟡 Code + migrations + Edge Functions built in PR #16; external-test Stripe App registration/OAuth acceptance remains |
| Hosted APEX API | ⏳ Planned — Phase 6.1 |
| Production credit ledger + usage metering | ⏳ Planned — Phase 6.2 |
| Purchase packs, renewals, refunds | ⏳ Planned — Phase 6.2/6.4 |
| Production entitlement/access engine | ⏳ Planned — Phase 6.3 |
| Background retries/reconciliation | ⏳ Planned — Phase 6.4 |
| `@apex/sdk` | ⏳ Planned — Phase 7 |
| Customer balance UI backed by real APEX data | ⏳ Planned — Phase 7 |
| End-to-end real credit purchase verification | ⏳ Planned — Phase 8 |
| Real operator dashboard data | ⏳ Planned — Phase 9 |

### Current Phase 5 blocker

The implementation branch is `implementation/phase5-stripe-connect` and PR #16 is **Phase 5: real Stripe Apps OAuth connection**. The Supabase migrations and `apex-stripe-connect` / `apex-stripe-connect-callback` Edge Functions are deployed. Phase 5 is not complete until the APEX Stripe App is uploaded/registered for External test, its test OAuth client ID is configured, and one real test authorization returns with `stripe_connections.status = 'connected'` for the paid workspace.

Do not advance the production funnel into Install/APEX Cloud until that acceptance test passes.

## The proof APEX must eventually demonstrate

The first production proof is intentionally simple and concrete:

```text
Forma customer clicks "Buy 1,000 credits"
        ↓
APEX creates/coordinates the purchase through Forma's connected Stripe account
        ↓
Stripe test payment succeeds
        ↓
APEX verifies the webhook exactly once
        ↓
credit ledger: +1,000
        ↓
GET balance → 1,000
        ↓
record usage → 250
        ↓
GET balance → 750
        ↓
access check → ALLOW
        ↓
consume the remaining credits
        ↓
access check → DENY
```

That flow must use the hosted API/database, not the Forma reducer or localStorage simulation. Phase 8 is not complete until this works end to end.

## Existing data foundation

The Supabase schema already contains the core production structures:

`profiles`, `workspaces`, `workspace_members`, `plans`, `features`, `plan_features`, `customers`, `subscriptions`, `environments`, `api_keys`, `stripe_connections`, `usage_events`, `usage_counters`, `credit_grants`, `credit_consumptions`, `access_decisions`, `stripe_webhook_events`, `audit_logs`.

Every customer-owned table is workspace-scoped and protected by Postgres RLS. The usage/credit/access tables are real schema, but their production processing logic is not built yet.

## Forma: working product model, not production infrastructure

The Forma experience demonstrates the intended behavior today: subscribe, receive an allowance, consume usage, hit a hard limit, upgrade without losing prior usage, buy a top-up, simulate renewal failure/recovery, and inspect activity.

That behavior is useful as an executable product specification, but it is still client-side demo state. Production Phase 6 must reproduce the same core outcomes using Stripe events, the APEX API, Postgres, idempotent ledger writes, and server-side access checks.

## Canonical onboarding funnel

```text
See APEX
  → Choose plan
  → Create account
  → Pay APEX
  → Get workspace
  → Connect Stripe
  → Install
  → Verify / Go live
  → Dashboard
```

The visible onboarding UI may combine some of those into seven steps, but the backend acceptance gates remain separate in `ROADMAP.md`.

## Architecture

```text
SaaS app
   ↓
@apex/sdk / APEX API
   ↓
APEX Cloud
   ├─ customer identity
   ├─ plans + entitlements
   ├─ credit ledger
   ├─ usage metering
   ├─ balance
   ├─ ALLOW / DENY
   ├─ audit history
   └─ Stripe reconciliation
   ↓
Customer's connected Stripe account
```

Approved technology and unresolved architecture choices are maintained in `ROADMAP.md`. Do not introduce a new database, queue, framework, cloud service, or runtime without updating that source of truth.

## Documentation map

- `ROADMAP.md` — permanent implementation source of truth
- `docs/PRODUCT_CONTRACT.md` — canonical product promise, invariants, and end-to-end behavior
- `docs/CLAUDE_CUSTOMER_FUNNEL.md` — onboarding/customer journey
- `docs/APEX_LAUNCH_DISTRIBUTION.md` — how APEX is sold, shipped, and explained
- `docs/implementation/APEX_BILLING.md` — APEX's own billing/provisioning versus customer Stripe
- `stripe-app/README.md` — Phase 5 Stripe Apps OAuth setup
- `#docs` in the live app — learning + technical documentation; planned capabilities must remain labeled planned until production acceptance passes

## Development

```bash
npm ci
npm test
npm run build
```

Vite uses the `/apex/` base path. GitHub Pages deploys from the existing workflow after tests/build pass.

## Honesty boundary

Do not use the existence of UI, schema, docs, or simulations as proof that a production capability is live. APEX currently proves real account creation, its own test billing/webhook path, workspace provisioning, and most of the Phase 5 Stripe connection implementation. Production end-customer credit purchases, usage metering, refunds, entitlement enforcement, SDK calls, and balance UI remain roadmap work until their acceptance tests pass.
