# APEX — Embedded payments & usage infrastructure

**Live app: https://wglewis0721.github.io/apex/**

Payments, subscriptions, credits, and token tracking. One service, built into your app.

APEX's product direction is a configurable service that connects a payment provider to product plans, customer access, and usage, with components developers can style to match their SaaS. The provider processes money; APEX tracks payment state and connects it to the product experience.

## Version 0.3 experience

- A new product homepage with restrained typography, generous spacing, and an actual 36-second hero video.
- A silent MP4 walkthrough with pause/play, chapter seeking, a large viewing dialog, native playback controls, captions, a poster, and reduced-motion handling.
- An interactive embedded billing demo for the fictional Forma application.
- Editable app name, four accent themes, light/dark appearance, rounded/sharp corners, and copyable theme configuration.
- Subscribe, generate content in 250-token increments, reach a hard usage limit, upgrade while preserving consumption, and buy token top-ups.
- Payment receipts and an activity feed backed by the same session state as the customer preview.
- Simulated renewal failure/grace and payment recovery.
- Illustrative frontend and backend integration code, explicitly marked as an API design preview.
- The existing advanced customer/plan/usage/billing sandbox remains accessible at `#console`; assurance and agent workflows are no longer the main product navigation.

## Try it

1. Watch the film in the homepage hero, or select a chapter.
2. Scroll to **Make it yours** and change Forma's name, color, or appearance.
3. Choose **Subscribe**. A $29 **simulated** payment activates 1,000 tokens.
4. Generate four times. Try again at the limit; the balance stays unchanged.
5. Upgrade to Pro. The allowance becomes 5,000, with previously consumed tokens preserved.
6. Open **Billing** for receipts and **Activity** for corresponding events.
7. Try a token top-up, failed renewal, recovery, and reset.

All payments, accounts, generated content, integrations, and film scenes are simulated. No payment details or credentials are collected. The homepage playground stores only in-session state. The retained advanced sandbox uses browser localStorage.

## Buy and install APEX (`#start`)

The homepage's **Start with APEX** / **Get APEX** buttons open a dedicated onboarding funnel, built to the spec in `docs/CLAUDE_CUSTOMER_FUNNEL.md`: choose a plan, create a workspace account, pay, then move through a WoW-launcher-style installer — select/detect your stack, connect Stripe, install the SDK, configure the environment, and verify a live access decision — before landing on a launch checklist. State lives in `src/lib/onboarding.ts` (a pure reducer, same shape as `src/lib/embeddedDemo.ts`) and persists to `localStorage` under a versioned key with a **Reset onboarding demo** control.

The install/configure/verify steps play out as an animated, terminal-style install log (signing into the workspace, detecting Node/React, installing `@apex/sdk`, writing `.env.local`, confirming the Stripe connection, configuring a webhook listener, sending a test customer, recording a usage event, and receiving an ALLOW decision), ending in an **"APEX is ready."** state. A persistent architecture strip on those steps spells out the real shape of the system — **Your app → @apex/sdk / CLI → APEX Cloud → Stripe** — so nothing implies the APEX Cloud backend installs locally; only a thin client does. A separate "How APEX ships" strip explains APEX's own release pipeline (GitHub source → CI/CD → npm/installer distribution → customer app → hosted APEX Cloud).

Every screen that stands in for a real integration says so — simulated checkout, no card collected; an interactive preview of a Stripe connection, not a real OAuth flow; demo API keys (`apex_test_...`), never real credentials; `npx @apex/cli init` and `npm install @apex/sdk` both marked as API design preview since neither package is published. The integration points a real build would swap in are isolated behind adapters in `src/lib/launchProviders.ts` (`BillingProvider`, `PaymentConnectionProvider`, `InstallerProvider`, `EnvironmentProvider`, `VerificationProvider`), each with TODOs describing the production implementation. Once the checklist is complete, **Open APEX dashboard** hands off to the existing `#console` sandbox.

## Implementation boundary

This deployment is a **functional product preview**, not a hosted payment or metering backend. There is no production Stripe connection, published npm SDK, real AI execution, real charge, or server-side enforcement. Production payment connections and SDKs remain to be built. Illustrative prices are for the fictional customer application, not an APEX service price list. The upgrade demo uses the $50 plan-price difference and intentionally omits production proration calculations.

## How the new Forma entitlement engine works

**Live app: https://wglewis0721.github.io/apex/**

`src/lib/forma.ts` is a second, self-contained product domain living beside the
existing customer/plan/entitlement control plane, wired into the same `Store`
the rest of APEX already uses (`src/lib/controlPlane.ts`) — it adds a `forma`
field to `Store` the same way `assurance.ts` adds an `assurance` field,
reuses the shared audit log (`log()` from `assurance.ts`), and persists
through the existing `loadStore` / `saveStore` localStorage helpers. It is not
a parallel storage or persistence system.

**Product rules**

- **Free** — 3 generations total, no renewal.
- **Pro** — 50 generations per month ($20/mo in this simulation).
- Top-ups add bonus generations on top of the plan allowance; bonus
  generations are never consumed by a period renewal.

**State shape** (`FormaAccount`, in `src/lib/forma.ts`):

```ts
type FormaAccount = {
  plan: 'free' | 'pro';
  status: 'active' | 'grace_period';
  generationsUsed: number;
  bonusGenerations: number;
  periodStart: string;
};
```

**Pure domain functions** operate on `FormaAccount` alone (no I/O, no
`Store`), so they're trivial to unit test:

- `canGenerate(account)` — the allow/deny entitlement check, run before every
  generation. Denies once `generationsUsed >= formaAllowance(account)`
  (plan limit + bonus generations) — a **hard deny**, not a soft warning.
- `consumeGeneration(account)` — re-checks `canGenerate` and only increments
  `generationsUsed` if allowed; a denied call returns the account unchanged.
- `subscribe(account, plan)`, `upgradeToPro(account)` — change plan.
  Upgrading Free → Pro **preserves** `generationsUsed`; it only raises the
  allowance.
- `topUp(account, amount)` — adds bonus generations.
- `failPayment(account)` / `recoverPayment(account)` — move a Pro account
  into/out of `grace_period`. Access is **not** blocked during grace in this
  demo (that's the point of a grace period); it exists so the UI/audit trail
  can distinguish "payment at risk" from "payment healthy."
- `renewPeriod(account)` — simulates the start of a new Pro billing month:
  resets `generationsUsed` to 0, leaves bonus generations untouched, no-ops
  for Free accounts.
- `resetForma()` — returns a fresh Free account (full demo reset).

A thin `Store`-level wrapper for each function (`recordGeneration`,
`subscribeForma`, `upgradeForma`, `topUpForma`, `failFormaPayment`,
`recoverFormaPayment`, `renewFormaPeriod`, `resetFormaAccount`) clones the
`Store`, applies the pure function, and writes one entry to the shared audit
log — the same pattern `assurance.ts` uses for `scan` / `resolveFinding`.

**Page shell**: `src/components/FormaPage.tsx` is an unstyled, functional
component that loads/saves the shared `Store` and calls every Forma action.
It is intentionally not wired into product navigation or styled — that is
left to a follow-up pass, along with picking where it lives in the nav.

**Still simulated / explicitly not built**: there is no real payment
provider. `src/lib/paymentProvider.ts` is a stub — a typed
`PaymentProvider` interface (`createSubscription`, `changeSubscriptionPlan`,
`chargeTopUp`, `cancelSubscription`) with `TODO` comments describing what a
real Stripe-backed implementation would need (webhook verification,
idempotency keys, persisted provider customer/subscription IDs). Nothing in
`forma.ts` calls it; `failFormaPayment` / `recoverFormaPayment` are UI-driven
simulations, not provider webhook handlers. There is also no server-side
enforcement — `canGenerate` is a client-side, in-memory check, same
limitation already called out below for the rest of APEX.

Domain tests for the full lifecycle live in `tests/forma.test.cjs`: allow →
consume → deny at the Free limit → upgrade preserving usage → top-up →
payment failure/grace → recovery → period renewal → reset.

## Development and verification

```bash
npm ci
npm run dev
npm test
npm run build
```

Vite serves the existing `/apex/` base path. The GitHub Pages workflow tests and builds on pushes to `main` before deploying `dist/`.

Domain tests cover the full subscription → consumption → denial → upgrade lifecycle, repeated subscription/upgrade protection, credit purchases, renewal grace and recovery, receipt retention, and earlier sandbox policy/reservation behavior. These tests validate a serial local model, not production distributed concurrency.

## Product film

- `public/assets/apex-product-film.mp4` — 36 seconds, 1440 × 810, H.264, 24 fps, silent, optimized for progressive playback.
- `public/assets/apex-film-poster.jpg` — a frame from the walkthrough.
- `public/assets/apex-film.vtt` — English explanatory captions.
- `scripts/render_product_film.py` — reproducible UI animation renderer; requires Python Pillow, DejaVu Sans fonts, and ffmpeg.

The film is an authored motion walkthrough with exact UI text and fictional state transitions, not a recording of a live payment integration. No third-party footage, music, or Apple assets are used. The visual direction takes inspiration from restrained product launches without copying Apple branding.

The older `public/assets/control-prism.webp` remains available for legacy sandbox components. It was generated through Higgsfield for the previous version (job `e8024cb1-3972-4908-a0d8-3c77822c3631`, returned model `nano_banana_2`).
