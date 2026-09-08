# APEX Implementation Roadmap

This file is the permanent implementation source of truth for APEX. Read it before
starting any work. Update it after any meaningful change.

## Canonical funnel

**See it → Choose plan → Create account → Pay → Get workspace → Connect Stripe → Install → Verify → Enter dashboard**

Every phase below exists to make one more step of that funnel real.

## What APEX is

APEX is a hosted SaaS product. Its job is to **keep what a SaaS company sells aligned
with what its customers can actually use.**

---

## APEX Production Infrastructure

This is the canonical production model. Every phase below builds part of it.

### 1. APEX Dashboard
The existing customer-facing React web application: workspaces, plans, customers,
usage, credits, access state, settings, and integration health.

### 2. Accounts + Workspaces
Supabase Auth and Supabase Postgres. Workspace-based tenancy, Postgres Row-Level
Security, and the core workspace-owned data.

### 3. Stripe Connection
The customer connects their own Stripe account. Stripe payment and subscription
events update APEX commercial and access state. Includes Stripe webhooks, event
storage, reconciliation, and idempotency.

### 4. APEX API
The hosted API used by customer SaaS applications: customer identification, usage
reporting, access checking, and usage reservation/finalization.
Hosting/runtime: **TBD — architecture/technology not yet selected.**

### 5. APEX SDK
Initial SDK is TypeScript/Node. A thin client for the hosted APEX API, distributed
as `@apex/sdk`.

### 6. Usage + Credits
Usage events, usage counters, credit grants and consumption, and idempotent event
IDs. v1 keeps limits simple; it is not a financial wallet.

### 7. Access Decision Engine
Combines Stripe state, plan, features, usage, and credits, returns `ALLOW` or `DENY`
with a reason, and records each decision.

### 8. Background Processing
Stripe webhook processing, retries, reconciliation, usage forwarding, and async jobs.
Queue/worker technology: **TBD — architecture/technology not yet selected.**

### 9. Audit + Dashboard Data
Access-decision history, Stripe sync status, usage history, and clear
“why was this customer blocked?” visibility.

### Approved technologies

Existing React APEX frontend · Supabase Auth · Supabase Postgres · Postgres RLS ·
Stripe · TypeScript/Node `@apex/sdk`. Anything else is **TBD — architecture/technology
not yet selected**.

---

## Technology rule

Do **not** invent technologies, vendors, frameworks, hosting platforms, queues,
databases, or services. Only the technology explicitly named in a phase below is
approved. If a phase requires a technology that has not been chosen, write
**TBD — architecture/technology not yet selected** instead of choosing one.

---

## Phase 1 — Product/demo foundation

**Systems:** APEX Dashboard (simulated data only).

**Infra:** Existing React/Vite frontend, GitHub Pages, simulated localStorage product flows.

**Build:** Marketing site, Forma demo, onboarding funnel, launcher simulation,
dashboard/sandbox UI.

**Done when:** Marketing site, Forma demo, onboarding funnel, launcher simulation,
and dashboard/sandbox UI exist and clearly label simulations.

**Status:** Complete.

### Visual redesign — September 8, 2026

Original brand board, hero artwork, SVG motifs, and implementation brief were provided
in `docs/design/` and `public/assets/brand-v1/` (`docs/design/CLAUDE_HANDOFF.md`), then
implemented across the marketing site, Forma demo, onboarding, and console chrome.
Backend phase status is unchanged — this is a visual/frontend change only.

**Done:**
- Brand palette (warm ivory canvas, ink navy, cobalt, tangerine, lilac) and Fraunces
  (display) / Manrope (body) typography wired into `src/tokens.css` and `.ap-site`,
  loaded via Google Fonts with Georgia/system-ui fallbacks. Marketing, Forma, and
  onboarding surfaces (`product.css`, `plain-language.css`, `forma.css`,
  `onboarding.css`) recolored from the prior cool-gray/blue palette to the brand
  palette; the console (`styles.css`) got chrome-level brand accents (primary
  buttons, active nav state, brand mark) without a full page-by-page reskin of its
  15 operator pages.
- Homepage hero rebuilt: headline beside the supplied sculpture artwork (stacked
  above it on phones), new copy/buttons ("Try the demo" / "Explore setup"), hero
  video kept prominent and playable and unchanged as an asset.
- The old funnel-graphic + three-text-card explainer replaced with an open visual
  story using the three supplied SVG motifs (`connection.svg`, `credits.svg`,
  `access-pass.svg`): "Customer pays → Credits appear → Your app is ready."
  The interactive Playground demo was moved earlier on the page, directly after
  the visual story, and a new "Your app. Your look." section shows three labeled,
  static illustrative examples (not real separate apps).
- Forma demo: primary actions (Generate, Upgrade, credits remaining) restyled to
  the brand palette and given more visual weight; billing simulation and the
  activity feed moved behind a "For developers" disclosure; a navy explainer band
  ("Stripe takes the payment. APEX connects it to access.") added.
- Bug fixes found during verification: two CSS grid `1fr` tracks (`.ap-developer-grid`,
  `.ap-house-card`) without `minmax(0, ...)` caused real horizontal overflow at
  320px width (long code lines / a 300px-minimum grid track forcing overflow);
  the console's mobile nav drawer was a `position: fixed` overlay inside an
  `overflow: hidden` ancestor with a stray `z-index: 50` on the bar above it,
  which visually clipped/outranked the open drawer — fixed by repositioning the
  drawer relative to its actual page wrapper and lowering that bar's z-index;
  the Billing Sync page's intro paragraph was missing the panel's standard
  horizontal padding (`<p className="muted">` outside a `.panel.compact`); Forma's
  reset button was missing the confirm-before-reset step present in onboarding
  and the console.
- Verified: `npm test` (36/36) and `npm run build` pass. Rechecked at 320/390/768/1024px
  widths across the homepage, Forma, onboarding (all 8 steps), and all 8
  mobile-visible console pages — zero horizontal overflow. Keyboard tab order,
  `prefers-reduced-motion` (video stays paused), the film modal's open/Escape-close,
  and both Forma's and the console's reset flows (now both confirm first) verified
  interactively. Contrast-checked every new text/background pairing against WCAG AA
  (4.5:1) — two failures found and fixed: white-on-tangerine and an invented
  off-palette purple both under 4.5:1, per `docs/design/BRAND_SPEC.md`'s own
  warning not to assume white passes on orange; the "Your app. Your look." example
  cards now use the exact 5-color brand palette with ink text on tangerine/lilac.

**Known limitation:** this sandbox's headless-browser screenshots could not reach
`fonts.googleapis.com` (network policy), so they render the Georgia/system-ui
fallback stack, not actual Fraunces/Manrope — the font `<link>` and CSS
`font-family` stack are correct and will render the real typefaces in a normal
browser with internet access (confirmed via computed-style inspection).

**Not done:** the pre-existing illustrative SVG assets outside this design kit
(e.g. the old customer-funnel and payment-to-access diagrams) were left as-is,
not re-illustrated; the console's 15 operator pages were not individually
redesigned beyond shared chrome accents, consistent with Phase 4's "finish the
implementation without introducing unnecessary infrastructure."

### Homepage story recomposition — September 8, 2026

Same brand (palette, typography, existing assets) — no new visual direction. Turned
the homepage from a sequence of explained sections into one unfolding story told
through a single recurring customer, "Jordan," per Typeform/Pitch/Dropbox-style
execution principles (simple staged actions, large product imagery over
explanation, one consistent visual family). Homepage-only change; routes, the
account/backend flow, the product film, the Forma/console demos, and accessibility
behavior are unchanged.

**Done:**
- **Hero**: added a small ambient badge over the sculpture art that cycles through
  "Payment confirmed → 10 credits added → Access unlocked" (static list, no motion,
  under `prefers-reduced-motion`).
- **Jordan story** (new, replaces the old 3-motif "Customer pays → Credits appear
  → Your app is ready" row): a full-bleed cobalt scene — Jordan buys Pro for
  $29/mo, an oversized number animates 10 → 7 as credits are spent (scroll-triggered
  once, "Watch it again" to replay, shows the final "7" immediately with no
  animation under reduced motion), "Product access stays on the whole time,"
  then a link into the real Forma demo.
- **Business payoff** (new, replaces three separate sections — a 3-card "what APEX
  means for your business" grid, a "why access changed" card, and a 3-card "what
  APEX keeps in sync" feature grid): one floating product-UI close-up (a small
  audit-log window: Payment confirmed / Pro activated / 10 credits added / Access
  changed) beside one headline, one sentence, and a "See what happened" progressive
  disclosure — instead of three more cards.
- **"Your app. Your look."**: the three illustrative examples now read as different
  products, not the same card recolored — distinct shape/corner treatment per
  example (pill-rounded + slightly rotated, sharp-cornered, soft/rotated the other
  way), not just a different accent color.
- **For developers**: the old standalone 3-step "how you build it" section folded
  into a collapsed `<details>` disclosure inside the existing dark developer
  section, so the mechanic is still there without being its own card grid.
- Composition now alternates: quiet ivory hero → dark film → full-bleed cobalt
  scene → quiet ivory demo → floating cards → quiet lilac-wash payoff → dark
  developer reveal → quiet ivory close. No two conventional card-grid sections
  run back to back. Cut roughly 40% of the homepage's explanatory copy by removing
  the three sections consolidated into the one payoff scene, rather than trimming
  sentences in place.
- Contrast-checked every new color pairing against WCAG AA and fixed two failures
  found this way (light-blue captions on the cobalt scene were under 4.5:1).
- Verified: `npm test` (36/36), `npm run build`, and `tsc -b` pass. Rechecked for
  horizontal overflow at 320/390/768/1024/1440px — zero. Verified interactively:
  keyboard tab order, `prefers-reduced-motion` (both the hero badge and the Jordan
  countdown skip animation and show final state), the film modal, and that
  `#forma`/`#start`/`#console` still load correctly.

**Not done:** no new illustration assets were created (the brand kit's existing
SVG motifs and sculpture PNG remain the only imagery); the "10 → 7" countdown
lands on a fixed narrative (bought 10, used 3) rather than reflecting live demo
state, since it's telling one consistent story rather than pulling from the
Playground's separate simulated account.

## Phase 2 — Accounts + backend foundation

**Systems:** Accounts + Workspaces.

**Tech:** Supabase Auth + Supabase Postgres.

**Build:** `profiles`, `workspaces`, `workspace_members`, `plans`, `features`,
`plan_features`, `customers`, `subscriptions`, `environments`, `api_keys`,
`stripe_connections`, `usage_events`, `usage_counters`, `credit_grants`,
`credit_consumptions`, `access_decisions`, `stripe_webhook_events`,
`audit_logs` — every customer-owned table scoped by `workspace_id`, with
foreign keys, timestamps, status fields, and workspace-membership RLS.
Real Supabase Auth signup/login wired into the existing `AccountStep` UI.

**Done when:** Real users can create and log into accounts and securely access only
their own workspace.

**Status:** Complete for accounts + schema. Applied live to the connected Supabase
project (`supabase/migrations/20260908030805_core_platform_schema.sql` and
`20260908030837_lock_down_handle_new_user_rpc.sql`): all 18 tables exist with RLS
enabled, workspace-membership policies (via a `current_workspace_ids()` helper, never
`raw_user_meta_data`/`user_metadata`), and `api_keys` secret columns locked down by
column-level `REVOKE`/`GRANT`. `src/lib/supabaseClient.ts` uses a publishable key
(`sb_publishable_...`) only. `src/lib/backend.ts` + `Onboarding.tsx`'s `AccountStep`
call real `supabase.auth` (sign up, log in, session restore), active only when
`VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` are set; otherwise the original
simulated account step runs unchanged. Verified: `npm test` (36/36) and `npm run
build` pass, tables/RLS confirmed live via Supabase's own advisors (no unresolved
security lints). Not yet done: nothing writes to `workspaces`/`workspace_members`/
`environments`/`api_keys` yet — that is workspace provisioning, explicitly deferred
to Phase 4. `plan_features` cross-workspace consistency (a plan and its features
belonging to the same workspace) is not enforced by a trigger, only by convention.

## Phase 3 — APEX billing

**Systems:** Stripe Connection (APEX's own billing only — the customer's Stripe account arrives in Phase 5).

**Tech:** Stripe Checkout + Stripe webhooks.

**Build:** APEX's own paid plan checkout, setup fee + recurring subscription,
server-side Checkout Session creation, verified payment webhook.

**Done when:** A real confirmed Stripe payment activates the APEX subscription, and
browser redirects cannot mark accounts paid.

**Status:** Not started. The onboarding funnel's Purchase step uses the simulated
`BillingProvider` in `src/lib/launchProviders.ts` regardless of backend
configuration.

## Phase 4 — Workspace provisioning

**Systems:** Accounts + Workspaces.

**Tech:** The Supabase/Postgres backend created in Phase 2.

**Build:** Automatically create a Sandbox environment and `apex_pk_test_...` /
`apex_sk_test_...` credentials after verified payment.

**Done when:** A paying customer receives one real persisted workspace/environment
and credentials, without duplicate provisioning.

**Status:** Not started. The Phase 2 schema and RLS are ready to receive
workspace/environment/api_key rows, but no provisioning function exists yet — the
onboarding funnel's Workspace step still shows locally generated demo keys.

## Phase 5 — Connect customer Stripe

**Systems:** Stripe Connection.

**Tech:** Stripe Connect.

**Build:** Authorize and link the customer's own Stripe account, and persist that
connection to the workspace.

**Done when:** APEX can securely identify the customer's connected Stripe account.

**Status:** Not started. The Phase 2 migration created a `stripe_connections` table
with workspace-scoped RLS, but no OAuth flow writes to it. The onboarding funnel
currently shows a simulated Stripe connection behind `PaymentConnectionProvider` in
`src/lib/launchProviders.ts`.

## Phase 6 — APEX Cloud

APEX Cloud is not one deliverable. Build it in the order below; each step must work
before the next begins.

**Tech:** Supabase Postgres holds the data. Hosting/runtime for the API and the
queue/worker technology for background processing are
**TBD — architecture/technology not yet selected.**

### Phase 6.1 — APEX API foundation

**Systems:** APEX API.

**Build:** Hosted API surface used by customer SaaS applications: workspace/API-key
authentication and customer identification.

**Done when:** A customer application can authenticate to APEX and identify one of
its own customers.

**Status:** Not started.

### Phase 6.2 — Usage + credits

**Systems:** Usage + Credits.

**Build:** Usage events, usage counters, credit grants and consumption, idempotent
event IDs, and usage reservation/finalization. Simple v1 limits, not a financial
wallet.

**Done when:** Reported usage and granted credits persist server-side and are
idempotent against retried event IDs.

**Status:** Not started. The Phase 2 migration created `usage_events`,
`usage_counters`, `credit_grants`, and `credit_consumptions` tables with
workspace-scoped RLS, but no code writes to or reads from them yet.

### Phase 6.3 — Access decision engine

**Systems:** Access Decision Engine.

**Build:** Combine Stripe state, plan, features, usage, and credits into an
`ALLOW`/`DENY` result with a reason, and record every decision.

**Done when:** The server-side APEX system returns real ALLOW/DENY decisions with a
reason and a stored decision record.

**Status:** Not started. The Phase 2 migration created `features`, `plan_features`,
and `access_decisions` tables with workspace-scoped RLS, but no evaluation logic
exists yet.

### Phase 6.4 — Background processing

**Systems:** Background Processing.

**Build:** Stripe webhook processing, retries, reconciliation, usage forwarding, and
async jobs. Queue/worker technology: **TBD — architecture/technology not yet
selected.**

**Done when:** Stripe events and usage forwarding survive failures and retries
without duplicating or losing state.

**Status:** Not started.

### Phase 6 done when

The server-side APEX system can persist usage and return real ALLOW/DENY decisions
for a hosted customer, with Stripe events processed reliably in the background.

**Status:** Not started.

## Phase 7 — Install

**Systems:** APEX SDK.

**Tech:** Node/TypeScript `@apex/sdk`. CLI implementation technology is
**TBD — architecture/technology not yet selected.**

**Build:** A thin SDK that calls APEX Cloud, plus a real install/configuration flow.

**Done when:** An external application can install APEX and authenticate to a
workspace.

**Status:** Not started. `@apex/sdk` and the CLI are unpublished design previews in
the current site and onboarding copy.

## Phase 8 — Verify

**Systems:** APEX API + Usage + Credits + Access Decision Engine, exercised end to end.

**Build:** A real test customer → credits → usage event → access check.

**Done when:** A customer receives a real APEX Cloud ALLOW/DENY result.

**Status:** Not started. The launcher's verification step is simulated.

## Phase 9 — Live dashboard

**Systems:** APEX Dashboard + Audit + Dashboard Data.

**Build:** Replace dashboard demo/localStorage data with real backend data, including access-decision history, Stripe sync status, usage history, and “why was this customer blocked?” visibility.

**Done when:** The dashboard reflects actual workspace customers, payments, usage,
and access state.

**Status:** Not started. The `#console` dashboard/sandbox uses localStorage demo data.

## Phase 10 — Market launch

**Systems:** All nine production systems above, running together.

**Infra:** **TBD — architecture/technology not yet selected**, only where not
previously selected in an earlier phase.

**Done when:** An outside customer completes the entire canonical funnel with real
systems.

**Status:** Not started.

---

## Instructions for AI coding agents

Every Claude Code, Copilot, Cursor, or Codex session must:

1. Read this roadmap first, including the APEX Production Infrastructure section.
2. Work only within the requested phase, and build the nine production systems
   progressively — never all at once.
3. Update this roadmap after meaningful changes.
4. Never mark a simulation complete as production infrastructure.
5. Never select an unapproved technology; record unresolved choices as
   **TBD — architecture/technology not yet selected**.
6. Keep roadmap status synchronized with actual repository functionality.
