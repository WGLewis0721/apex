# APEX Implementation Roadmap

This file is the permanent implementation source of truth for APEX. Read it before
starting any work. Update it after any meaningful change.

## Canonical funnel

**See it → Choose plan → Create account → Pay → Get workspace → Connect Stripe → Install → Verify → Enter dashboard**

Every phase below exists to make one more step of that funnel real.

## Technology rule

Do **not** invent technologies, vendors, frameworks, hosting platforms, queues,
databases, or services. Only the technology explicitly named in a phase below is
approved. If a phase requires a technology that has not been chosen, write
**TBD — architecture/technology not yet selected** instead of choosing one.

---

## Phase 1 — Product/demo foundation

**Infra:** Existing React/Vite frontend, GitHub Pages, simulated localStorage product flows.

**Build:** Marketing site, Forma demo, onboarding funnel, launcher simulation,
dashboard/sandbox UI.

**Done when:** Marketing site, Forma demo, onboarding funnel, launcher simulation,
and dashboard/sandbox UI exist and clearly label simulations.

**Status:** Complete.

## Phase 2 — Accounts + backend foundation

**Tech:** Supabase Auth + Supabase Postgres.

**Build:** `users`/`profiles`, `workspaces`, `workspace_members`, `plans`,
`subscriptions`, `environments`, `api_keys`, `stripe_events`, `audit_events`,
migrations, workspace-scoped RLS.

**Done when:** Real users can create and log into accounts and securely access only
their own workspace.

**Status:** In progress. Migrations, tables and workspace-scoped RLS exist in
`supabase/migrations/`; frontend auth wiring exists in `src/lib/supabaseClient.ts`
and `src/lib/backend.ts` and activates only when the Supabase environment variables
are configured. Not yet verified against a deployed project.

## Phase 3 — APEX billing

**Tech:** Stripe Checkout + Stripe webhooks.

**Build:** APEX's own paid plan checkout, setup fee + recurring subscription,
server-side Checkout Session creation, verified payment webhook.

**Done when:** A real confirmed Stripe payment activates the APEX subscription, and
browser redirects cannot mark accounts paid.

**Status:** In progress. `supabase/functions/create-checkout-session` creates the
session server-side and `supabase/functions/stripe-webhook` is the only path that
marks a subscription active. Not yet verified end to end against live Stripe.

## Phase 4 — Workspace provisioning

**Tech:** The Supabase/Postgres backend created in Phase 2.

**Build:** Automatically create a Sandbox environment and `apex_pk_test_...` /
`apex_sk_test_...` credentials after verified payment.

**Done when:** A paying customer receives one real persisted workspace/environment
and credentials, without duplicate provisioning.

**Status:** In progress. `provision_workspace()` exists in the Phase 2 migration and
is called from both the free-plan and webhook paths with idempotency keyed on
Stripe's event id. Not yet verified end to end.

## Phase 5 — Connect customer Stripe

**Tech:** Stripe Connect.

**Build:** Authorize and link the customer's own Stripe account, and persist that
connection to the workspace.

**Done when:** APEX can securely identify the customer's connected Stripe account.

**Status:** Not started. The onboarding funnel currently shows a simulated Stripe
connection behind `PaymentConnectionProvider` in `src/lib/launchProviders.ts`.

## Phase 6 — APEX Cloud

**Tech:** **TBD — architecture/technology not yet selected.**

**Build:** Hosted customers, subscriptions, usage, credits, entitlements, access
decisions, and Stripe-event processing.

**Done when:** A server-side APEX system can persist usage and return real
ALLOW/DENY decisions.

**Status:** Not started.

## Phase 7 — Install

**Tech:** Node/TypeScript `@apex/sdk`. CLI implementation technology is
**TBD — architecture/technology not yet selected.**

**Build:** A thin SDK that calls APEX Cloud, plus a real install/configuration flow.

**Done when:** An external application can install APEX and authenticate to a
workspace.

**Status:** Not started. `@apex/sdk` and the CLI are unpublished design previews in
the current site and onboarding copy.

## Phase 8 — Verify

**Build:** A real test customer → credits → usage event → access check.

**Done when:** A customer receives a real APEX Cloud ALLOW/DENY result.

**Status:** Not started. The launcher's verification step is simulated.

## Phase 9 — Live dashboard

**Build:** Replace dashboard demo/localStorage data with real backend data.

**Done when:** The dashboard reflects actual workspace customers, payments, usage,
and access state.

**Status:** Not started. The `#console` dashboard/sandbox uses localStorage demo data.

## Phase 10 — Market launch

**Infra:** **TBD — architecture/technology not yet selected**, only where not
previously selected in an earlier phase.

**Done when:** An outside customer completes the entire canonical funnel with real
systems.

**Status:** Not started.

---

## Instructions for AI coding agents

Every Claude Code, Copilot, Cursor, or Codex session must:

1. Read this roadmap first.
2. Work only within the requested phase.
3. Update this roadmap after meaningful changes.
4. Never mark a simulation complete as production infrastructure.
5. Never select an unapproved technology; record unresolved choices as
   **TBD — architecture/technology not yet selected**.
6. Keep roadmap status synchronized with actual repository functionality.
