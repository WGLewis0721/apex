# APEX waitlist product film

## Purpose

Create a silent 20-second APEX waitlist film. The payoff is not “payments happen”; it is the final, intelligible answer to **what a payment unlocked, what value was granted, and what has been used**. Present APEX as the state layer between Stripe and the SaaS product.

## Product truth to preserve

APEX receives a payment event, records the authoritative product-value state, grants access/credits, and tracks use. Stripe moves money; APEX knows what it unlocks. The shown account, payment, and credits are a fictional product demo—not production customer data. Do not use wallet/crypto imagery and do not imply a payment processor replacement.

## Reference grammar

Use [Stripe Products](https://stripe.com/products) as a product-film reference for concrete interface states and a clear business action. Borrow the principle of showing a real workflow, never Stripe’s visual identity, copy, or specific UI.

## Deliverable and placement

- Master: 3840 × 2160, 16:9, 20.0 seconds, 30 fps, ProRes 422 HQ.
- Web asset: 1440 × 810 muted H.264 MP4 plus WebP poster; under 8 MB.
- Autoplay only in view. Do not loop: hold the end state and provide replay. Reduced-motion state is the end poster.
- Build from current APEX interface states and the documented cobalt-ribbon/orange-disc motifs—not generic SaaS dashboard imagery.

## Film sentence

**A payment becomes a product entitlement with a ledger anyone on the team can understand.**

## Beat grid

| Time | Picture and motion | On-screen copy | Product proof |
| --- | --- | --- | --- |
| 0:00–0:02.5 | A customer is inside a fictional SaaS product and clicks a clear paid action: `Run full analysis`. The action is purposeful, not a checkout ad. | `A payment should unlock something.` | Customer outcome comes first. |
| 0:02.5–0:05.0 | A compact payment-confirmed state moves in from the edge. A cobalt ribbon travels from `Stripe event` through `APEX` to the product—one uninterrupted path. | `Payment received.` | Shows APEX alongside Stripe, not instead of it. |
| 0:05.0–0:08.0 | The ribbon resolves into a grant: `100 analysis credits`. An orange disc increments once; the product action becomes available. | `100 credits granted.` | Value is explicitly granted. |
| 0:08.0–0:11.0 | The customer runs the analysis. A concise usage meter moves from `100` to `88`; no fake loading spectacle. | `12 credits used.` | Usage consumes product value. |
| 0:11.0–0:14.5 | The camera moves through the same container to an APEX event trail: payment received → credit grant → usage recorded. Each event is timestamped as `Sample event`. | `One state of truth.` | Hosted, auditable payment-to-product lifecycle. |
| 0:14.5–0:17.0 | A support/admin view taps `Why does this customer have access?` and the three linked events become the answer. | `Know what it unlocked.` | Explains the operational benefit without claiming automation magic. |
| 0:17.0–0:20.0 | **Final reward.** A balanced final board holds the customer outcome on one side and the clean APEX ledger on the other, connected by the cobalt ribbon. | `Payments in. Product value out.`<br>`Join the beta` | The whole lifecycle is visible in one calm frame. |

## Art and motion direction

- Use APEX’s warm canvas, ink/navy type, cobalt, tangerine, and lilac accents. Fraunces can carry one editorial phrase; Manrope carries all operational UI.
- The cobalt ribbon is a causal path, never abstract decoration. Orange discs represent a discrete grant or consumption event—not coins.
- Preserve a single continuity container: product action → receipt → grant → ledger. No fake 3D banking scenes, neon finance tropes, stock photos, blockchain visuals, or inaccessible tiny tables.
- Use a confident, deliberate cadence: each cause produces one visible effect. UI state changes should be larger than cursor movement.

## Required assets before animation

1. Screens of the current APEX dashboard/event ledger, grant state, and usage state; if a state is not built, create a clearly marked product-demo mock, not a claim of shipped functionality.
2. A fictional product shell and fictional customer data (`Northstar Demo`) approved for the film.
3. Brand logo, Fraunces/Manrope usage confirmation, color tokens, cobalt ribbon, and orange disc assets.
4. An end-frame implementation spec for the existing waitlist video component (held final frame + replay).

## Honest-demo rules and acceptance test

- Label all demo events and never show a real card, real Stripe dashboard, or an unqualified “live” claim.
- Do not promise automatic refunds, access revocation, taxes, billing support, or every integration unless that capability is present.
- A silent viewer must understand, in order: payment → grant → product use → event record.
- At 0:19 the end screen must answer “why does this customer have access?” in under three seconds.

## Implemented production treatment

The final render is a silent 20-second product walkthrough with seven workflow beats, a short Higgsfield materials transition, and a held final UI outcome. Exact UI and copy are deterministic, fixture-based reconstructions of the current components. Native 3840×2160 H.264 masters and 1440×810 web exports are produced by `scripts/film/render.py`; H.264 replaces the proposed ProRes archival format. See `scripts/film/README.md` for reproducible rendering and playback acceptance. The original waitlist form contract remains unchanged.
