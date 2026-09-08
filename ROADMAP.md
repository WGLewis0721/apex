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

### Visual design handoff — September 8, 2026

Original brand board, hero artwork, SVG motifs, and implementation brief are provided
in `docs/design/` and `public/assets/brand-v1/`. This is a design asset delivery;
the proposed redesign has not been implemented or deployed. Backend phase status
is unchanged. Start implementation with `docs/design/CLAUDE_HANDOFF.md`.

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
