# APEX visual/product handoff

Read these in order before changing APEX:

1. `../../ROADMAP.md` — implementation source of truth and phase gates
2. `../PRODUCT_CONTRACT.md` — canonical product promise/invariants
3. `BRAND_SPEC.md` — visual/message system

Do not let design copy redefine production status.

## Canonical product story

APEX is the payment-and-access layer for SaaS products that use Stripe.

> **Stripe moves the money. APEX knows what the money unlocks.**

The simplest customer story is:

```text
End customer wants more credits/tokens/coins/allowance
        ↓
SaaS app
        ↓
APEX
        ↓
connected Stripe account
        ↓
verified payment
        ↓
credits/entitlements/balance/access update
```

APEX complements Stripe. Never position it as replacing Stripe, storing money, or being cryptocurrency infrastructure.

## Current implementation boundary

As of September 9, 2026:

- product/demo surfaces are built
- accounts are real
- APEX's own test Checkout/webhook is real
- paid workspace provisioning is real
- Phase 5 customer Stripe connection is implemented in PR #16 but still awaits Stripe App External-test OAuth acceptance
- hosted API, production credit ledger, usage metering, entitlements, purchase packs, renewals, refunds, SDK, customer balance UI, end-to-end verification, and live operator data remain roadmap phases

If a visual shows planned behavior, label it as demo/design preview unless the roadmap says that behavior has passed production acceptance.

## Phase 1 — Keep the established visual system

Use the supplied brand assets and existing React components. Preserve warm ivory, ink navy, cobalt, tangerine, lilac, Fraunces display typography, Manrope body typography, the recurring connection/credit/access motifs, and the existing APEX wordmark.

Treat the board as inspiration; ignore incidental generated text/trademark artifacts. Do not redesign from scratch unless explicitly directed.

## Phase 2 — Homepage/product story

Lead with outcomes and keep reading light.

Recommended framing:

**Headline territory:**
> Your customer pays. Your product knows what to give them.

**Supporting idea:**
> Connect Stripe to credits, tokens, usage, plan rights, and customer access without rebuilding the whole system yourself.

Useful short line:
> Stripe moves the money. APEX knows what it unlocks.

The visual sequence should show cause/effect rather than architecture diagrams first:

**Customer pays → Product value appears → Customer uses it → Access stays correct.**

Keep the product film prominent. Keep the Forma demo as interactive proof of the product model, while clearly separating demo behavior from production status.

## Phase 3 — Forma/demo emphasis

Prioritize:

- buy/subscribe
- current balance
- consume usage
- upgrade
- purchase more
- renewal/failure/recovery
- activity/audit explanation

Examples such as 1,000 credits → use 250 → 750 remaining are good visual teaching tools. They are not evidence that the production Phase 6 ledger/API is already live.

When explaining mechanics, use:

> Stripe takes the payment. APEX connects it to what the customer can use.

Developer detail belongs behind progressive disclosure or Docs.

## Phase 4 — Production-promise surfaces

As later roadmap phases are implemented, the UI should grow to show the complete v1 promise:

- connected Stripe health
- purchase packs/top-ups
- recurring allowance/renewal
- refunds/reversals
- credit ledger/balance
- usage
- plan/feature entitlements
- ALLOW/DENY reason
- audit timeline
- API/SDK integration state
- customer-facing balance/purchase-more UI

Do not invent fake production records to make a screen look complete. Use explicit demo fixtures until live backend data exists.

## Quality requirements

- mobile/tablet/desktop
- no horizontal overflow
- keyboard/focus usability
- WCAG-aware contrast
- reduced-motion behavior
- clear loading/success/error states
- no dead controls
- one primary action per important screen
- no false production claims
- tests/build pass

## Delivery rule

Every meaningful product change must update `ROADMAP.md` and the relevant docs in the same branch/PR. If a new promise is added to marketing copy, it must have a corresponding roadmap phase and acceptance test.
