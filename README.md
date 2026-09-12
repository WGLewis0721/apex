# APEX — Stripe handles the money. APEX handles what it unlocks.

**Live app:** https://wglewis0721.github.io/apex/

APEX is a hosted payment-to-product-state layer for SaaS products that use Stripe. It turns commercial events into usable product state: credits, tokens, coins, usage allowance, plan rights, feature entitlements, balances, refunds, and product access.

**Stripe moves the money. APEX knows what the money unlocks.**

## Business model — the North Star

**Your customers pay you through Stripe. You pay APEX for the infrastructure that makes those purchases usable inside your product.**

APEX is recurring infrastructure SaaS for software companies that sell digital value through Stripe. The SaaS company remains the seller; APEX maps verified commercial events to correct product state.

APEX earns recurring value when it helps a SaaS company:

- monetize faster
- deliver exactly what customers bought
- meter usage/balances reliably
- replenish credits cleanly
- protect product access safely
- explain purchases, usage, refunds, and denials
- reduce repeated custom engineering

See [`docs/BUSINESS_MODEL.md`](docs/BUSINESS_MODEL.md) for the canonical commercial model and value filter.

## September 12, 2026 — verified Stripe webhook pilot

APEX now has a deployed **test-mode manual webhook pilot**. A Stripe Checkout Session carrying
server-created `apex_credits` metadata was paid in a Stripe sandbox; APEX verified the signed event,
persisted it once, and created exactly one source-attributed open 1,000-credit grant. This is a real
Stripe → Supabase → APEX ledger proof, not a browser simulation.

The pilot is intentionally not yet the general customer connection product. It uses a workspace-specific
Stripe Dashboard endpoint and secret rather than self-serve Stripe Apps OAuth. The public Stripe App path
remains a separate acceptance dependency. See
[`docs/implementation/STRIPE_WEBHOOK_DEMO.md`](docs/implementation/STRIPE_WEBHOOK_DEMO.md) and
[`ROADMAP.md`](ROADMAP.md) for the current acceptance boundary and ordered next steps.

## Who pays who

```text
End customer
   │ buys the SaaS product
   ↓
SaaS company ← Stripe processes payment
   │
   │ recurring APEX platform subscription
   ↓
APEX
   ├─ payment → product value
   ├─ usage → balance
   ├─ refund → source-aware adjustment
   └─ lifecycle → durable explanation
```

## Frozen v1 architecture

The current architecture decision is closed:

**hosted authoritative Postgres ledger + hosted authoritative spend + snapshot-shaped entitlements read.**

```text
Customer SaaS server
        ↓
     APEX API
        ↓
Supabase Edge Functions
        ↓
Supabase Postgres
  ├─ credit_accounts projection
  ├─ source-attributed credit_grants
  ├─ append-only credit_ledger
  └─ credit_operations idempotency

Connected Stripe events
        ↓
verified + persisted
        ↓
transactional grant/refund processing (next ingress step)
```

Frozen v1 does **not** include public `/check`, reservations/finalize/cancel, signed snapshots, local SDK evaluation, Redis, Kafka, ClickHouse, AWS runtime migration, a dedicated worker service, or a new queue product.

See [`docs/architecture/APEX_V1_LEDGER.md`](docs/architecture/APEX_V1_LEDGER.md).

## Current implementation status — September 9, 2026

| Capability | Status |
| --- | --- |
| Marketing/demo/onboarding/docs/console previews | ✅ Built |
| Supabase Auth + workspace tenancy/RLS | ✅ Real |
| APEX test Checkout + verified own-billing webhook | ✅ Real |
| Paid workspace/environment/API credential provisioning | ✅ Real |
| Customer Stripe Connect implementation | 🟡 Merged; External-test OAuth acceptance still required |
| Hosted balance API | ✅ Deployed |
| Hosted entitlements API | ✅ Deployed |
| Hosted atomic consume API | ✅ Deployed |
| Per-grant credit attribution + append-only ledger | ✅ Deployed |
| Source-aware non-negative refund RPC | ✅ Deployed; connected Stripe refund ingress not wired |
| Hosted concurrency proof | ✅ Passed — parallel 750/750 against 1000 produced one ALLOW, one DENY, remaining 250 |
| Connected Stripe payment → grant ingress | ⏳ Not wired |
| Connected Stripe refund → clawback ingress | ⏳ Not wired |
| First public `@apex/sdk` | ⏳ Planned |
| Signed/local entitlement evaluation | ⏳ v1.1+ only if customer need justifies it |
| Reservations | ⏳ Not v1; only if start-now/finish-later workload requires them |
| Expiring grants | ⏳ Not production-supported until projection reconciliation exists |
| End-to-end connected Stripe proof | ⏳ Pending Phase 5 + ingress |
| Live operator dashboard | ⏳ Planned |

## What is proven now

The hosted wallet/concurrency contract is real:

```text
grant 1000
parallel consume 750 / consume 750
→ one succeeds
→ one DENY / INSUFFICIENT_CREDITS
→ remaining 250

replay both idempotency keys
→ same results
→ remaining still 250
```

The first hosted attempt exposed a legacy Supabase service-role JWT clock error. PR #19 changed server clients to prefer Supabase's current server secret-key model; a fresh hosted race then passed.

This proves the wallet does not double-spend. It does **not** yet prove money automatically becomes product value from a customer's connected Stripe account.

## Immediate acceptance gates

### 1. Finish Phase 5 Connect Stripe

- `stripe apps upload`
- register External test
- configure `STRIPE_APP_CLIENT_ID`
- complete one live test OAuth authorization from APEX onboarding
- confirm `stripe_connections.status = 'connected'` for the expected connected account

### 2. Wire connected Stripe ingress

```text
verified connected payment event
→ persist event once
→ configured source mapping
→ grant_credits exactly once

verified connected refund event
→ persist event once
→ refund_unspent_credits for the originating purchase
→ replay-safe result
```

Only after that connected lifecycle passes should frozen Phase 6 v1 be called accepted.

## Frozen refund policy

Balance never goes negative. There is no v1 debt ledger.

```text
grant A +1000
consume   750
refund A 1000
→ clawed_back 250
→ unrecoverable_spent 750
→ remaining 0
```

Refunding A cannot steal credits from grant B. Already-consumed product work remains consumed.

## v1 API

```text
GET  /v1/customers/:id/balance
GET  /v1/customers/:id/entitlements
POST /v1/customers/:id/consume
```

`GET /entitlements` is read-only and includes `remaining`, `version`, and `as_of`. It may inform UI/preflight behavior but does not authorize scarce-credit spend.

`POST /consume` is the current authoritative spend boundary.

## The connected Stripe proof APEX must demonstrate

```text
connected SaaS Stripe account
        ↓
end customer buys configured 1,000-credit pack
        ↓
verified event persisted once
        ↓
source-attributed grant +1000
        ↓
balance / entitlements = 1000
        ↓
consume 250 → 750
        ↓
consume 750 → 0
        ↓
next consume 1 → DENY
        ↓
payment replay → no duplicate grant
        ↓
refund → source-aware clawback + unrecoverable accounting
        ↓
refund replay → no duplicate adjustment
```

That flow must use hosted persisted APEX state, not the Forma reducer/localStorage simulation.

## Existing data foundation

The schema includes the core tenancy/product tables plus the deployed v1 wallet structures:

- `profiles`, `workspaces`, `workspace_members`
- `plans`, `features`, `plan_features`
- `customers`, `subscriptions`, `environments`, `api_keys`
- `stripe_connections`, `stripe_webhook_events`
- `usage_events`, `usage_counters`
- `credit_grants`, `credit_consumptions`
- `credit_accounts`, `credit_ledger`, `credit_operations`
- `access_decisions`, `audit_logs`

The existence of a table does not mean the corresponding product capability is accepted.

## Forma and assurance experiences

The demo experiences remain executable product models. They may demonstrate later behaviors such as richer access logic or reservation/settlement flows.

Those simulations do **not** redefine frozen v1. Production v1 follows the ledger/API contract in `docs/architecture/APEX_V1_LEDGER.md`.

## Canonical onboarding

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

Real paid onboarding currently stops at Connect Stripe until Phase 5 External-test OAuth acceptance passes.

## Documentation map

- `docs/BUSINESS_MODEL.md` — commercial North Star, value-addition filter, architecture discipline
- `ROADMAP.md` — implementation source of truth and acceptance status
- `docs/PRODUCT_CONTRACT.md` — canonical technical/product promise and invariants
- `docs/architecture/APEX_V1_LEDGER.md` — frozen v1 ledger/evaluation architecture
- `docs/CLAUDE_CUSTOMER_FUNNEL.md` — onboarding/customer journey
- `docs/APEX_LAUNCH_DISTRIBUTION.md` — how APEX is sold, shipped, and explained
- `docs/implementation/APEX_BILLING.md` — APEX's own billing/provisioning versus customer Stripe
- `stripe-app/README.md` — Stripe Apps OAuth setup
- `#docs` in the live app — learning + technical documentation

## Development

```bash
npm ci
npm test
npm run build
```

Vite uses the `/apex/` base path. GitHub Pages deploys from the existing workflow after tests/build pass.

## Decision rule

Before adding a meaningful feature or new technology, ask:

> **Does this make it easier, safer, or more scalable for a SaaS company to sell digital value and keep that value correct inside the product?**

Then ask whether the existing approved stack can solve the proven problem more simply.

## Honesty boundary

Planned, implemented/deployed, and production-accepted are separate states. UI, schema, docs, simulations, or a successful isolated proof must never be presented as a complete connected-customer lifecycle when the required ingress is still missing.
