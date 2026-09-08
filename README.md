# APEX — Make sure what you sell is what customers get.

**Live app: https://wglewis0721.github.io/apex/**

APEX keeps plans, payments, usage limits, credits, and product access in sync. When a customer pays, upgrades, cancels, misses a payment, or reaches their limit, what they can use stays correct.

**Customer buys something → APEX knows what they bought → APEX tracks what they use → APEX keeps their product access in sync.**

Stripe handles the payment. APEX helps make sure your product responds correctly.

**Stripe → APEX → Your product.** APEX connects plans, payment state, usage, credits, access decisions, and audit history, so finance, product, and support can all see why a customer gained or lost access.

`ROADMAP.md` in this repository is the implementation source of truth: read it first, and keep it synchronized with what actually exists.

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

The homepage's **Start with APEX** / **Get APEX** buttons open a dedicated onboarding funnel, built to the spec in `docs/CLAUDE_CUSTOMER_FUNNEL.md`: choose a plan, create a workspace account, pay, select/detect your stack, connect Stripe, run the **APEX Launcher**, then land on a launch checklist. State lives in `src/lib/onboarding.ts` (a pure reducer, same shape as `src/lib/embeddedDemo.ts`) and persists to `localStorage` under a versioned key with a **Reset onboarding demo** control.

The APEX Launcher (`LauncherStep` in `src/components/Onboarding.tsx`) is a Battle.net/WoW-launcher-style single screen, not a stack of separate wizard pages: it plays 14 named stages end to end, each moving through the status glyphs `○ Pending → ◌ Running → ✓ Complete` (a `!` Attention state exists in the same vocabulary for future use) — signing into the workspace, detecting the project, finding React/Node/TypeScript, installing `@apex/sdk`, writing environment config, linking the workspace, confirming Stripe, registering a webhook, creating a sample customer, granting 1,000 credits, recording 250 credits of usage, running an access check, and receiving ALLOW — ending in **"APEX IS READY."** with two actions: **Verify APEX** (re-runs a live access check on demand) and **Open dashboard**. Launcher progress is tracked as `launcherStage` (0–14) in `OnboardingState`, so a mid-run refresh resumes exactly where it left off instead of replaying from the start, and **Reset onboarding demo** clears it along with everything else. A persistent architecture strip states the real shape of the system — **Your app → @apex/sdk / CLI → APEX Cloud → Stripe** — so nothing implies the APEX Cloud backend installs locally; only a thin client does. A separate "How APEX ships" strip explains APEX's own release pipeline (GitHub source → CI/CD → npm/installer distribution → customer app → hosted APEX Cloud). `npx @apex/cli init` is labeled **CLI design preview**; `@apex/sdk` and the embedded components remain **API design preview** — none of these packages are published.

Every screen that still stands in for a real integration says so: an interactive preview of a Stripe *connection*, not a real OAuth flow; `npx @apex/cli init` and `npm install @apex/sdk` both marked as API design preview since neither package is published. (Account creation/login is **real** when the backend is configured — see the section below — and honestly labeled as a preview when it isn't; purchase, workspace provisioning, and everything after remain simulated for this milestone regardless.) The remaining simulated integration points are isolated behind adapters in `src/lib/launchProviders.ts` (`BillingProvider` and `PaymentConnectionProvider` — the latter for the customer's *own* future Stripe Connect integration, a separate, unbuilt feature from APEX's own billing below — plus `InstallerProvider`, `EnvironmentProvider`, `VerificationProvider`), each with TODOs describing the production implementation. Once the checklist is complete, **Open APEX dashboard** hands off to the existing `#console` sandbox.

## Real backend: accounts + workspaces (Supabase)

Only the **Create account** step of the canonical funnel is backed by a real Supabase project, not simulation, once the environment variables below are set. Everything else (Pay, Get workspace, stack selection, the APEX Launcher, verification, the dashboard) remains intentionally simulated for this milestone — no Stripe Checkout, Stripe Connect, SDK, usage processing, or ALLOW/DENY logic exists yet.

**Architecture**: Vite/React on GitHub Pages talks directly to Supabase (Postgres + Auth) from the browser using a publishable key (`sb_publishable_...`), protected entirely by Postgres row-level security — never a secret key or the service role.

**Schema** (`supabase/migrations/`): `profiles`, `workspaces`, `workspace_members`, `plans`, `features`, `plan_features`, `customers`, `subscriptions`, `environments`, `api_keys`, `stripe_connections`, `usage_events`, `usage_counters`, `credit_grants`, `credit_consumptions`, `access_decisions`, `stripe_webhook_events`, `audit_logs`. Every customer-owned table carries a `workspace_id` and RLS scopes it to workspaces the requesting user is a member of, via a `current_workspace_ids()` helper backed by the `workspace_members` table (the standard Supabase multi-tenant self-join pattern) — never via `raw_user_meta_data`/`user_metadata`, which is user-editable and only ever used for display. `plans`/`subscriptions` do double duty by design: a `plans` row with `workspace_id = null` is part of APEX's own platform catalog (Founding/Sandbox, seeded); one with `workspace_id` set is a plan a workspace defines for its own customers. A `subscriptions` row with `customer_id = null` is a workspace's own APEX subscription; with `customer_id` set, it is one of that workspace's customers subscribed to one of the workspace's own plans. `api_keys.secret_key_hash`/`secret_key_once` are additionally locked down with column-level `REVOKE`/`GRANT` — no client role can select them directly — though nothing writes to `api_keys` yet, since workspace provisioning is a later phase. `stripe_webhook_events` has RLS enabled with zero policies (service-role only). This migration only creates structure: no provisioning, checkout, usage, or access-decision logic runs against any of it yet.

**Frontend wiring** (`src/lib/supabaseClient.ts`, `src/lib/backend.ts`): `Onboarding.tsx`'s account step calls real `supabase.auth` (sign up, log in, session restore) instead of the old local-only reducer action — **only when `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` are set**. Without them, the app transparently falls back to the original fully-simulated flow, so nothing breaks for anyone who hasn't configured a backend yet. Purchase and workspace creation continue to use the pre-existing simulated reducer actions regardless of backend configuration.

**Required environment variables**:

| Variable | Where | Notes |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend build (`.env.local`, GitHub Actions secrets) | Public by design; protected by RLS, not secrecy. |

**Deploying the backend** (once you have a Supabase project):

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push                       # runs supabase/migrations/*.sql
```

Then set `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` wherever the frontend is built.

## Implementation boundary

Purchase, workspace provisioning, stack selection, the APEX Launcher (SDK "install", environment "configuration", webhook "registration", verification), and the advanced `#console` sandbox remain a **functional product preview** — no published npm SDK or CLI, no real AI execution, no Stripe Checkout or Stripe Connect, no usage metering or entitlement enforcement outside the demo Forma app. Illustrative prices for those simulated screens are launch-strategy examples, not a Stripe price list. Only account creation/login is real once the Supabase environment variables above are configured — see the section above for exactly what that does and does not cover.

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
