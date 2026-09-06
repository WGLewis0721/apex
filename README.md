# APEX — Commercial assurance for software and AI

**Live app: https://wglewis0721.github.io/apex/**

APEX compares what a customer was promised with what the application actually permits and consumes. The product direction is **observe → explain → preview → correct → selectively enforce**.

Version 0.2 upgrades the original control-plane pilot into an interactive verification workspace. It preserves the existing customer, plan, entitlement, usage, billing, access-lab, and audit capabilities.

## What's new

- **Command Center:** evidence-driven findings, affected customers, resolutions, source coverage, and recent decisions.
- **Findings:** five commercial discrepancy scenarios, status/search filters, source comparisons, operation IDs, impact classification, correction previews, local corrections, intentional exceptions, and JSON exports.
- **Customer 360:** effective terms, overrides, commercial relationships, account findings, and a correlated timeline.
- **Policy Studio:** draft feature grants and quotas, simulate affected customers while preserving overrides, then publish the reviewed policy to the sandbox.
- **Execution Demo:** a 12-step DocketFlow walkthrough from subscription through reservation, settlement, quota denial, upgrade, restored access, delegated agent spending, an approval-required denial, and replay protection.
- **AI Controls:** working local spending requests, separate agent and product-credit units, per-operation and session budget enforcement, and revocation.
- **Connections:** inspect and export the proposed billing, application-evidence, and identity contracts. No credentials are collected.
- **Design:** a responsive evidence-first workspace with custom Higgsfield-generated prism artwork, readable typography, keyboard focus states, and reduced-motion support.

## Run locally

```bash
npm ci
npm run dev
npm test
npm run build
```

The development server uses the existing Vite base path `/apex/`.

## Try the product

1. Run verification in **Command Center**.
2. Open a finding and inspect approved terms versus observed behavior.
3. Preview and apply a **sandbox correction**; inspect the audit trail.
4. Open **Policy Studio**, change a feature or API allowance, and simulate customer impact before publishing.
5. Run **Execution Demo** from beginning to end. A blocked request does not increment downstream execution; an upgrade preserves consumed credits; settlement replay does not repeat a debit.
6. In **AI Controls**, test $4 and $7 requests, then revoke authority and try another request.

All sample companies, evidence amounts, transactions, and execution receipts are fictional fixtures. The DocketFlow/Acme execution walkthrough is a separate local fixture from the imported customer evidence.

## Implemented versus proposed

This remains a **browser-local sandbox**, with state stored in localStorage. Existing v1 local customer/plan state is migrated into the v2 format. If storage is unavailable, interactions remain usable for the current session.

Implemented locally:

- deterministic commercial comparisons and state transitions;
- preview-before-correction and preview-before-policy-publication;
- reservation and settlement state model, stable operation IDs, replay checks;
- explicit override handling, API quota checks, and positive-integer validation;
- grace-period behavior for payment failures;
- payment recovery that preserves manual suspension;
- structured local audit history and exports.

Not implemented or claimed:

- production Stripe connections or signature verification;
- hosted API, published npm SDK, identity provider, or resource authorization;
- real AI execution, financial transactions, or provider credentials;
- distributed transactions, production concurrency/availability guarantees, or durable server audit retention;
- daily/rolling agent budget resets, delegation expiry, or arbitrary provider enforcement;
- parsing uploaded contracts or ingesting arbitrary production evidence.

The reservation tests validate a serial in-memory model. A production implementation needs an authoritative transactional ledger, trusted executor, and explicit uncertain-execution handling. Do not use the browser demo to protect production workloads.

## Tests and deployment

`npm test` compiles the dependency-free domain modules and runs Node's test runner. It covers findings and corrections, policy preview behavior, quota validation, grace/suspension rules, reservation capacity, idempotency conflicts, settlement retries, delegated limits, the complete walkthrough, and storage migration.

The GitHub Pages workflow runs `npm ci`, tests, and a TypeScript/Vite build before publishing `dist/`. Pushes to `main` trigger the existing deployment workflow.

## Visual asset provenance

`public/assets/control-prism.webp` is an original Higgsfield generation produced for this upgrade (job `e8024cb1-3972-4908-a0d8-3c77822c3631`; returned model `nano_banana_2`). The optimized generation output is used as decorative artwork. Controls, text, data, and relationships are native HTML/CSS/React and Lucide icons.
