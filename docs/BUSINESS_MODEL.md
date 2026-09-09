# APEX Business Model — North Star

This document is the commercial compass for APEX. Product, roadmap, pricing, documentation, onboarding, and UX should reinforce this model rather than drift into unrelated infrastructure.

## North Star

**APEX makes money when SaaS companies make digital value easier to sell, deliver, meter, replenish, and explain.**

APEX is a B2B SaaS infrastructure product for software companies that use Stripe and sell subscriptions, credits, tokens, coins, usage allowance, add-ons, or paid product access.

The customer relationship is simple:

```text
End customer
   │ pays for the SaaS product
   ↓
SaaS company ← Stripe moves the money
   │
   │ pays APEX for recurring infrastructure
   ↓
APEX
   ├─ maps purchases to product value
   ├─ keeps balances and usage accurate
   ├─ applies entitlements and access rules
   ├─ handles renewals / top-ups / refund adjustments
   └─ makes the lifecycle auditable and explainable
```

The SaaS company remains the seller of its product and keeps its customer relationship. APEX sits naturally in that stack as the infrastructure that connects commercial events to product state.

---

## TL;DR

**Your customers pay you through Stripe. You pay APEX for the infrastructure that makes those purchases usable inside your product.**

---

## One sentence

**APEX is recurring infrastructure SaaS for software companies that sell digital value through Stripe: the company pays APEX to turn successful payments into accurate credits, usage, entitlements, balances, and product access.**

---

## Standard explanation

APEX sells a recurring software service to SaaS companies that already monetize through Stripe. Their end customers continue paying them through their own Stripe account; APEX does not need to become the seller or sit between the company and its customer relationship.

The SaaS company pays APEX for the infrastructure that turns those commercial events into reliable product behavior: granting credits, tracking usage, enforcing plan rights, replenishing balances, handling renewals and refund adjustments, and explaining why access changed.

The core revenue model is a recurring APEX platform subscription. Early or complex deployments may also include a one-time guided implementation fee. As APEX matures, plans may scale with meaningful platform capacity such as active customers, metered events, environments, or operational volume while preserving a simple recurring-subscription relationship.

---

## Long-form explanation

APEX is a B2B infrastructure SaaS product built for software companies whose customers buy digital value. That value might be a subscription tier, 1,000 AI credits, 5,000 tokens, 10,000 game gold, 100 report generations, premium features, add-ons, or another measurable right inside a product.

The SaaS company's customer pays the SaaS company through its existing Stripe account. Stripe remains the system that moves money and reports commercial events. APEX uses those events to maintain the corresponding product state: what was purchased, how much remains, what has been consumed, what renews, what was refunded, and whether the next protected action should be allowed.

The SaaS company is the APEX customer. It pays APEX a recurring platform subscription because the payment-to-product-state layer is ongoing infrastructure, not a one-time code snippet. APEX must keep working through retries, renewals, top-ups, usage, failed payments, refunds, plan changes, concurrency, support questions, and scale. For early adopters or deployments that need hands-on setup, APEX may also charge a one-time guided implementation fee.

The value equation is straightforward: APEX should help a SaaS company monetize faster, support more flexible product packaging, reduce custom billing-and-entitlement logic, make usage and balances dependable, and give product/support teams a clear history of why customer access changed. Those benefits are the reason APEX earns recurring revenue.

Over time, packaging can grow from a base platform subscription into tiers that reflect real operating scale—such as active customers, usage events, environments, or advanced operational capabilities—without changing the core relationship. The business should not depend on confusing the buyer about who gets paid or inserting APEX into the customer's brand relationship. The SaaS company sells its product; APEX quietly powers the commercial logic behind it.

---

## Commercial model

### Who pays APEX

The SaaS company / software product operator.

### What they pay for

A recurring hosted infrastructure service that provides:

- Stripe connection and commercial-state synchronization
- credit ledger and balances
- usage metering
- entitlements and access decisions
- purchase packs / top-ups
- recurring allowance renewals
- refund-aware adjustments
- audit history and reconciliation
- API / SDK access
- customer balance integration
- operator visibility and support tooling

### How APEX earns revenue

1. **Recurring platform subscription** — the core business model.
2. **Guided implementation fee** — appropriate for founding, high-touch, or complex deployments.
3. **Scaled platform tiers** — future packaging can grow with active customers, metered events, environments, or advanced capabilities once real usage data validates the right metric.

The current Founding Partner offer is a launch configuration, not the permanent pricing architecture.

---

## Value-addition filter

Every meaningful APEX feature should strengthen at least one of these outcomes:

1. **Monetize faster** — make a new paid unit, plan, or add-on easier to launch.
2. **Deliver accurately** — ensure customers receive exactly what they bought.
3. **Meter reliably** — keep usage and balances correct under real production conditions.
4. **Replenish cleanly** — make top-ups and renewals predictable.
5. **Protect access** — turn commercial state into deterministic product decisions.
6. **Explain the lifecycle** — make purchases, usage, refunds, and access changes auditable.
7. **Reduce custom engineering** — remove repeat infrastructure work from the SaaS team's backlog.

A feature that does not materially improve one of these outcomes needs a strong reason to exist.

---

## Architecture and implementation discipline

The technology stack serves the business model; it is not the product identity.

For every proposed runtime, cache, queue, database, SDK behavior, or distributed-systems feature, ask:

1. Which buyer-visible value outcome does this improve?
2. What current failure, latency, scale, or adoption problem proves it is needed?
3. Can the approved stack solve that problem more simply?
4. Does the change preserve APEX's core responsibility: correct product state after commercial events?

For frozen v1, the most valuable proof is a correct hosted ledger and payment-to-product-value lifecycle. That is why authoritative Postgres spend, idempotent event handling, source-aware refunds, and a thin API come before signed local evaluation, reservation systems, caches, extra queues, or cloud migrations.

Latency features are valuable only when they reduce adoption/integration friction without weakening correctness. In particular, cached or locally evaluated state may inform UI or feature gates later, but it must not become an unsafe authorization mechanism for scarce product value.

This discipline keeps APEX aligned with the commercial promise: **reduce the custom engineering burden while making monetized product state more reliable and explainable.**

---

## Communication identity

APEX should communicate as a useful, intelligent layer in an existing SaaS stack.

Prefer:

- clear cause-and-effect language
- customer outcomes before technical mechanisms
- concise explanations supported by deeper detail when needed
- concrete examples using credits, tokens, usage, plans, and access
- language that shows how APEX fits naturally with Stripe and the customer's own app

Avoid defining APEX primarily by opposition to another company, category, or product. APEX should be understood by the value it adds.

Canonical short line:

**Stripe moves the money. APEX knows what the money unlocks.**

Canonical commercial line:

**Your customers pay you. You pay APEX to keep what they bought usable inside your product.**

---

## Roadmap filter

Before approving roadmap work, ask:

> Does this make it easier, safer, or more scalable for a SaaS company to sell digital value and keep that value correct inside the product?

If yes, it belongs near the nucleus of APEX.

If not, it should remain secondary, optional, or outside the product.

`ROADMAP.md` defines implementation order. `docs/PRODUCT_CONTRACT.md` defines the technical promise. `docs/architecture/APEX_V1_LEDGER.md` freezes the current v1 architecture. This document defines why the business exists and how it earns money.