# APEX — Stripe handles the money. APEX handles what it unlocks.

**Live app:** https://wglewis0721.github.io/apex/

APEX is a hosted payment-and-access layer for SaaS products that use Stripe. It turns commercial events into usable product state: credits, tokens, coins, usage allowance, plan rights, feature access, balances, and access decisions.

**Stripe moves the money. APEX knows what the money unlocks.**

## Business model — the North Star

The commercial model is the decision filter for APEX product, roadmap, pricing, docs, and UX.

### TL;DR

**Your customers pay you through Stripe. You pay APEX for the infrastructure that makes those purchases usable inside your product.**

### One sentence

**APEX is recurring infrastructure SaaS for software companies that sell digital value through Stripe: the company pays APEX to turn successful payments into accurate credits, usage, entitlements, balances, and product access.**

### Standard explanation

APEX sells a recurring software service to SaaS companies that already monetize through Stripe. Their end customers continue paying them through their own Stripe account; APEX sits alongside that flow and turns commercial events into reliable product behavior.

The SaaS company pays APEX for the infrastructure that grants credits, tracks usage, enforces plan rights, replenishes balances, handles renewals and refund adjustments, and explains why access changed. The core revenue model is a recurring APEX platform subscription. Early or complex deployments may also include a one-time guided implementation fee. Future plans can scale with real platform capacity such as active customers, metered events, environments, or advanced operational capabilities.

### Long-form explanation

APEX is a B2B infrastructure SaaS product built for software companies whose customers buy digital value. That value might be a subscription tier, 1,000 AI credits, 5,000 tokens, 10,000 game gold, 100 report generations, premium features, add-ons, or another measurable right inside a product.

The SaaS company's customer pays the SaaS company through its existing Stripe account. Stripe remains the system that moves money and reports commercial events. APEX uses those events to maintain the corresponding product state: what was purchased, how much remains, what has been consumed, what renews, what was refunded, and whether the next protected action should be allowed.

The SaaS company is the APEX customer. It pays APEX a recurring platform subscription because the payment-to-product-state layer is ongoing infrastructure, not a one-time code snippet. APEX must keep working through retries, renewals, top-ups, usage, failed payments, refunds, plan changes, concurrency, support questions, and scale. Founding or high-touch implementations may add a one-time guided setup fee.

The value equation is straightforward: APEX should help a SaaS company monetize faster, support more flexible product packaging, reduce custom billing-and-entitlement logic, keep usage and balances dependable, and make every purchase/usage/access change explainable. Those outcomes are why APEX earns recurring revenue.

See [`docs/BUSINESS_MODEL.md`](docs/BUSINESS_MODEL.md) for the canonical commercial model and roadmap filter.

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
   ├─ purchase → credits / rights
   ├─ usage → balance
   ├─ renewal → replenishment
   ├─ refund → adjustment
   ├─ state → ALLOW / DENY
   └─ lifecycle → audit history
```

APEX is valuable when it makes that loop easier, safer, more flexible, or more explainable for the SaaS company.

## Production promise

The production product is being built as one coherent subsystem:

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

`ROADMAP.md` is the implementation source of truth for that promise. A UI, schema, demo, or documentation page does not make a production capability complete by itself.

## Current implementation status — September 9, 2026

| Capability | Status |
| --- | --- |
| Marketing site, Forma demo, onboarding preview, docs, console preview | ✅ Built |
| Supabase Auth accounts | ✅ Real |
| Multi-tenant Supabase/Postgres schema + RLS | ✅ Real |
| APEX test Checkout + verified webhook processing | ✅ Real |
| Paid workspace/environment/API credential provisioning | ✅ Real |
| Customer Stripe connection implementation | 🟡 Merged to `main`; External-test Stripe App OAuth acceptance still required |
| Hosted APEX API | ⏳ Planned — Phase 6.1 |
| Production credit ledger + usage metering | ⏳ Planned — Phase 6.2 |
| Purchase packs, renewals, refunds | ⏳ Planned — Phase 6.2/6.4 |
| Production entitlement/access engine | ⏳ Planned — Phase 6.3 |
| Background retries/reconciliation | ⏳ Planned — Phase 6.4 |
| Audit/support timeline | ⏳ Planned — Phase 6.5 |
| `@apex/sdk` + customer balance UI | ⏳ Planned — Phase 7 |
| End-to-end real credit purchase verification | ⏳ Planned — Phase 8 |
| Real operator dashboard data | ⏳ Planned — Phase 9 |

## Immediate acceptance gate

Phase 5 code is merged, but the real Stripe Apps connection is not yet accepted. Before production work moves into APEX Cloud/SDK/Verify, complete the External-test Stripe App setup, configure the OAuth client ID, complete one real test authorization from APEX onboarding, and confirm the paid workspace persists a connected Stripe account.

## The proof APEX must demonstrate

```text
Customer clicks "Buy 1,000 credits"
        ↓
APEX uses the SaaS company's configured pack
        ↓
Customer's Stripe test payment succeeds
        ↓
Verified Stripe event reaches APEX
        ↓
credit ledger +1,000
        ↓
balance = 1,000
        ↓
record usage 250
        ↓
balance = 750
        ↓
access = ALLOW
        ↓
consume remaining credits
        ↓
access = DENY
        ↓
refund purchase
        ↓
ledger adjustment + auditable explanation
```

That flow must use hosted APEX infrastructure and persisted data, not the Forma reducer/localStorage simulation.

## Existing data foundation

The Supabase schema already contains the core production structures:

`profiles`, `workspaces`, `workspace_members`, `plans`, `features`, `plan_features`, `customers`, `subscriptions`, `environments`, `api_keys`, `stripe_connections`, `usage_events`, `usage_counters`, `credit_grants`, `credit_consumptions`, `access_decisions`, `stripe_webhook_events`, `audit_logs`.

Every customer-owned table is workspace-scoped and protected by Postgres RLS. Usage/credit/access tables are real schema but their production processing logic remains roadmap work.

## Forma: executable product model

The Forma experience demonstrates the intended behavior: subscribe, receive an allowance, consume usage, hit a hard limit, upgrade without losing prior usage, buy a top-up, simulate renewal failure/recovery, and inspect activity.

Forma is a working model of APEX behavior, not production infrastructure. Phase 6+ must reproduce those outcomes using connected Stripe events, the hosted APEX API, Postgres, idempotent ledger writes, and server-side access checks.

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
SaaS company's connected Stripe account
```

## Documentation map

- `docs/BUSINESS_MODEL.md` — commercial North Star: who pays, why, and how APEX creates recurring value
- `ROADMAP.md` — permanent implementation source of truth
- `docs/PRODUCT_CONTRACT.md` — canonical technical product promise and invariants
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

Before adding a meaningful feature, ask:

> **Does this make it easier, safer, or more scalable for a SaaS company to sell digital value and keep that value correct inside the product?**

If yes, it belongs near the APEX nucleus. If not, it needs a strong reason to exist.

## Honesty boundary

Do not use the existence of UI, schema, docs, or simulations as proof that a production capability is live. Planned, implemented-but-not-accepted, and production-accepted are separate states.