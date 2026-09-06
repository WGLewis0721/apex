# APEX — Commercial Control Plane

**Live demo:** https://wglewis0721.github.io/apex/

APEX is a pilot-grade demonstration of commercial infrastructure for software and AI products. It sits between **billing state**, **product plans**, **entitlements**, **usage**, and **application access** so a product team can answer one operational question consistently:

> **Can this customer or agent perform this action right now, and why?**

This repository intentionally focuses on the smallest valuable commercial-control loop rather than trying to implement every possible billing, licensing, IAM, and commerce feature.

## Core loop

`Product / Plan → Entitlements → Billing state → Policy decision → Usage → Audit trail`

The UI includes:

- customer commercial state
- product and plan definitions
- inherited entitlements
- customer-level allow/deny overrides
- deterministic access-policy simulator
- quota / usage metering
- billing webhook simulation
- automatic suspend / resume behavior
- AI-agent policy concept surface
- searchable audit log
- developer API contract examples
- responsive desktop/mobile admin console

## Demo behavior

The current pilot is a browser-side sandbox. State is persisted in `localStorage` so interactions survive refreshes on the same browser.

The following flows are functional:

1. Select a customer.
2. Inspect the customer's plan and effective entitlements.
3. Add an explicit entitlement allow or deny override.
4. Run an access check against the deterministic policy engine.
5. See the allow/deny reason recorded in the audit log.
6. Add metered API usage and watch utilization change.
7. Simulate `invoice.failed` and automatically suspend the account.
8. Verify subsequent access checks are denied because the account is suspended.
9. Simulate `invoice.paid` and automatically restore active access.
10. Reset the sandbox to seed state at any time.

## What is real vs. mocked

### Implemented in this pilot

- deterministic policy evaluation
- plan inheritance
- entitlement overrides
- usage state
- customer status enforcement
- billing-event state transitions
- audit-event creation
- persistent demo state
- full responsive product UI

### Integration-ready / mocked

These surfaces are represented but are **not** connected to production providers in this browser pilot:

- Stripe Billing
- authentication / SSO
- external identity providers
- production PostgreSQL
- service-to-service API keys
- webhook signature verification
- production SDKs
- AI model providers
- enterprise audit export

A production version would move the policy engine and state to a server-side service and make the browser admin console an API client.

## Suggested production architecture

```text
Stripe / billing provider ─┐
Identity provider ─────────┼──> APEX Control API ──> Postgres
Customer product ──────────┤          │
Usage events ──────────────┘          ├── Entitlement engine
                                      ├── Usage meter
                                      ├── Policy engine
                                      └── Audit event stream

Customer application ── POST /v1/access/check ──> allow / deny + reason
```

## Local development

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## GitHub Pages

The repository includes `.github/workflows/deploy-pages.yml`.

After GitHub Pages is configured to use **GitHub Actions** as its deployment source, pushes to `main` build and deploy the Vite app automatically.

Live Pages URL:

https://wglewis0721.github.io/apex/

## Product direction

The near-term product wedge is:

**Licensing + entitlements + usage metering + billing sync + access control**

Potential expansion stacks:

- **Monetization Stack** — billing, licensing, entitlements, subscriptions, usage metering
- **Access & Trust Stack** — identity, permissions, seat management, revocation, audit
- **AI Control Stack** — agent identity, delegated permissions, budget/spending limits, usage tracking, audit trails
- **Digital Commerce Stack** — payments, subscriptions, fraud signals, seller/customer access, digital delivery

The goal is not to become another license-key utility. The product thesis is to become the **commercial control plane for digital products**.
