# APEX validation checks — this run only

Scope of this file: **only** the checks created for the net-new work implemented in this run.

Net-new work in this run, from the current `ROADMAP.md`:

- **Phase 6.4 — Renewals, reconciliation, expiry, broader metering**: the "Expiry boundary" gap
  (expired grant remainders were never reconciled out of `credit_accounts.remaining`).
- **Phase 6.5 — Audit + support data**: the customer support/audit timeline that explains
  what happened, to whom, why, from which Stripe/APEX event, and when.

Nothing from Phases 1–3 is re-validated here. Phase 5 External-test OAuth, Phase 7 npm publication,
and Phase 8 OAuth-connected repetition are unchanged by this run and are not covered by these checks.

Files under test:

- `supabase/migrations/20260920120000_phase_6_4_expiry_reconciliation.sql`
- `supabase/migrations/20260920120100_phase_6_5_customer_timeline.sql`
- `supabase/functions/apex-api/index.ts`
- `packages/sdk/src/index.ts`, `packages/sdk/test/index.test.mjs`

Substitutions used below:

- `$WS` — a workspace UUID
- `$CUST` — a customer UUID in that workspace
- `$APEX_KEY` — an active `apex_sk_*` secret API key for that workspace
- `$API` — the deployed `apex-api` base URL (e.g. `https://<project>.supabase.co/functions/v1/apex-api`)

---

## APEX-6.4-01 — Expiry reconciliation migration applies cleanly

- **Check ID:** APEX-6.4-01
- **Phase:** Phase 6.4 — expiry boundary
- **Command / action:**
  Apply only the reviewed migration (remote migration history has known legacy drift; do **not** run
  `supabase db push --include-all`):
  `supabase migration up --file supabase/migrations/20260920120000_phase_6_4_expiry_reconciliation.sql`
  or apply the same file through the Supabase SQL editor / `apply_migration`.
- **Expected result:** Migration applies with no error. `public.expire_credit_grants` and
  `public.check_credit_reconciliation` exist; `credit_ledger_entry_type_check` now accepts
  `expire`; index `credit_grants_expiry_due_idx` exists.
- **Evaluator type:** Automated (SQL / CLI), requires hosted project access.
- **Credentials / user action required:** Supabase project access with migration privileges.

## APEX-6.4-02 — Expired grant remainder leaves the projection exactly once

- **Check ID:** APEX-6.4-02
- **Phase:** Phase 6.4 — expiry boundary
- **Command / action:** In a test workspace, create a customer with two grants: one already expired
  with 400 remaining and one non-expiring with 600 remaining, and a projection of 1000. Then run:
  `select public.expire_credit_grants('$WS');`
  twice in a row.
- **Expected result:** First call returns `expired_grants = 1`, `expired_amount = 400`,
  `customers_affected = 1`. Second call returns `expired_grants = 0`, `expired_amount = 0`
  (replay-safe). `credit_accounts.remaining` is 600. Exactly one `credit_ledger` row with
  `entry_type = 'expire'`, `amount = 400`, `idempotency_key = 'expire:<grant_id>'`. The expired grant
  is `status = 'expired'`, `remaining_amount = 0`. The non-expiring grant is untouched.
- **Evaluator type:** Automated (SQL).
- **Credentials / user action required:** Supabase service-role/SQL access to a test workspace.

## APEX-6.4-03 — Expiry never drives the balance negative

- **Check ID:** APEX-6.4-03
- **Phase:** Phase 6.4 — expiry boundary
- **Command / action:** Deliberately desynchronize a test fixture so an expired grant's
  `remaining_amount` exceeds `credit_accounts.remaining`, then run
  `select public.expire_credit_grants('$WS','$CUST');`
- **Expected result:** The function raises `projection_grant_mismatch` and the whole transaction
  rolls back. No ledger row is written, `credit_accounts.remaining` is unchanged, and the balance is
  never negative. No debt row of any kind is created.
- **Evaluator type:** Automated (SQL), negative test.
- **Credentials / user action required:** Supabase service-role/SQL access to a throwaway test
  workspace (this check intentionally creates inconsistent fixture data).

## APEX-6.4-04 — Reconciliation read reports pending expiry work

- **Check ID:** APEX-6.4-04
- **Phase:** Phase 6.4 — expiry boundary
- **Command / action:**
  `curl -sS -H "Authorization: Bearer $APEX_KEY" "$API/v1/customers/$CUST/reconciliation"`
  before and after running the expiry maintenance endpoint.
- **Expected result:** Before: `expiry_reconciliation_pending: true` with
  `expired_unreconciled_remaining` equal to the expired remainder, `projected_remaining` still
  including it. After: `expiry_reconciliation_pending: false`,
  `expired_unreconciled_remaining: 0`, `reconciled: true`, and `projected_remaining` equal to
  `spendable_grant_remaining`.
- **Evaluator type:** Automated (HTTP).
- **Credentials / user action required:** Active `apex_sk_*` key for the test workspace; deployed
  `apex-api`.

## APEX-6.4-05 — Maintenance endpoint is tenant-scoped, authenticated, and input-validated

- **Check ID:** APEX-6.4-05
- **Phase:** Phase 6.4 — expiry boundary
- **Command / action:**
  1. `curl -sS -X POST "$API/v1/maintenance/expire-grants"` (no Authorization header)
  2. `curl -sS -X POST -H "Authorization: Bearer $APEX_KEY" -H 'content-type: application/json' -d '{"limit":0}' "$API/v1/maintenance/expire-grants"`
  3. `curl -sS -X POST -H "Authorization: Bearer $APEX_KEY" -H 'content-type: application/json' -d '{"customer_id":"not-a-uuid"}' "$API/v1/maintenance/expire-grants"`
  4. `curl -sS -X GET -H "Authorization: Bearer $APEX_KEY" "$API/v1/maintenance/expire-grants"`
  5. `curl -sS -X POST -H "Authorization: Bearer $APEX_KEY" -H 'content-type: application/json' -d '{}' "$API/v1/maintenance/expire-grants"`
- **Expected result:** (1) `401 Unauthorized`; (2) `400` with the limit message; (3) `400` with the
  customer_id message; (4) `404`; (5) `200` whose result covers only the key's own workspace — no
  grant belonging to another workspace is ever expired.
- **Evaluator type:** Automated (HTTP), includes negative tests.
- **Credentials / user action required:** Active `apex_sk_*` key; a second workspace's fixture data
  is needed to prove isolation in step 5.

## APEX-6.5-01 — Timeline migration applies cleanly

- **Check ID:** APEX-6.5-01
- **Phase:** Phase 6.5 — audit + support data
- **Command / action:** Apply only
  `supabase/migrations/20260920120100_phase_6_5_customer_timeline.sql`
  (same single-file rule as APEX-6.4-01).
- **Expected result:** Migration applies with no error. `public.get_customer_timeline` exists and is
  executable by `service_role` only — `anon` and `authenticated` have no execute privilege.
- **Evaluator type:** Automated (SQL / CLI).
- **Credentials / user action required:** Supabase project access with migration privileges.

## APEX-6.5-02 — Timeline explains a full purchase → consume → refund → expire chain

- **Check ID:** APEX-6.5-02
- **Phase:** Phase 6.5 — audit + support data
- **Command / action:** Against a customer that has the accepted pilot lifecycle data
  (grant 1000 → consume 750 → full refund → replays), run:
  `curl -sS -H "Authorization: Bearer $APEX_KEY" "$API/v1/customers/$CUST/timeline?limit=200"`
- **Expected result:** A single JSON document, newest first, containing `stripe.*` entries for the
  persisted verified events, `grant.created`, `credit.grant`, `credit.consume`, `credit.refund`, and
  `credit.unrecoverable` entries, plus `decision.*` entries. Each entry carries `occurred_at`,
  `event_type`, a human `explanation`, and a `detail` object including the originating
  `stripe_event_id` / `source_payment_id` where present. The entries account for the customer's
  current `remaining`. Replayed operations appear once each and create no duplicate credit effect.
- **Evaluator type:** Automated (HTTP) plus human reading of the explanations.
- **Credentials / user action required:** Active `apex_sk_*` key for the workspace holding the
  pilot lifecycle data.

## APEX-6.5-03 — Every DENY carries a machine-readable reason

- **Check ID:** APEX-6.5-03
- **Phase:** Phase 6.5 — audit + support data (product invariant 11)
- **Command / action:** Drive a customer to `remaining = 0`, attempt
  `POST $API/v1/customers/$CUST/consume` with `{"amount":1,"idempotency_key":"deny-probe-1"}`, then
  read `GET $API/v1/customers/$CUST/timeline?limit=50`.
- **Expected result:** The consume response is `allowed: false` with
  `reason: "INSUFFICIENT_CREDITS"`. The timeline contains a
  `decision.consume.denied` entry whose `detail.reason` is `INSUFFICIENT_CREDITS` and whose
  explanation names that reason. No ledger entry was created for the denied request.
- **Evaluator type:** Automated (HTTP).
- **Credentials / user action required:** Active `apex_sk_*` key and a test customer that may be
  spent to zero.

## APEX-6.5-04 — Timeline is read-only, bounded, and cross-tenant safe

- **Check ID:** APEX-6.5-04
- **Phase:** Phase 6.5 — audit + support data
- **Command / action:**
  1. `curl -sS "$API/v1/customers/$CUST/timeline"` (no Authorization header)
  2. `curl -sS -H "Authorization: Bearer $APEX_KEY" "$API/v1/customers/$CUST/timeline?limit=501"`
  3. `curl -sS -H "Authorization: Bearer $APEX_KEY" "$API/v1/customers/<other-workspace-customer>/timeline"`
  4. `curl -sS -X POST -H "Authorization: Bearer $APEX_KEY" "$API/v1/customers/$CUST/timeline"`
  5. Compare `credit_accounts.version` and `credit_ledger` row counts before and after all timeline reads.
- **Expected result:** (1) `401`; (2) `400` limit message; (3) failure — never another workspace's
  history; (4) `404`; (5) no change: the timeline mutates nothing and is not a spend authorization.
- **Evaluator type:** Automated (HTTP), includes negative and isolation tests.
- **Credentials / user action required:** Active `apex_sk_*` key plus one customer id from a second
  workspace.

## APEX-SDK-01 — SDK timeline/reconciliation methods build and pass unit tests

- **Check ID:** APEX-SDK-01
- **Phase:** Phase 6.4 / 6.5 client surface (Phase 7 SDK package)
- **Command / action:** `npm --prefix packages/sdk test`
- **Expected result:** TypeScript build succeeds and all `node --test` cases pass, including
  `timeline requests the audit history with a bounded limit` and
  `reconciliation reports pending expiry reconciliation`. `timeline` rejects limits outside 1–500 and
  issues a GET; neither method sends a request body.
- **Evaluator type:** Automated (local command).
- **Credentials / user action required:** None. Note: the sandbox used for this run resolves a
  TypeScript 6.x binary, which fails `tsc` with pre-existing `TS5011` on this repo's
  `packages/sdk/tsconfig.json`. Evaluate with the pinned `typescript@5.6.3` from the repo's
  devDependencies (`npm ci` at the repo root first).

## APEX-DEPLOY-01 — Updated apex-api deploys with the new routes

- **Check ID:** APEX-DEPLOY-01
- **Phase:** Phase 6.4 / 6.5 hosted surface
- **Command / action:** `supabase functions deploy apex-api`, then re-run APEX-6.4-04 and APEX-6.5-02
  against the deployed URL.
- **Expected result:** Deployment succeeds; `balance`, `entitlements`, and `consume` continue to
  behave exactly as before, and the three new routes respond as specified above.
- **Evaluator type:** Automated (CLI + HTTP).
- **Credentials / user action required:** Supabase project access with Edge Function deploy rights.

---

# Phase 6.2 connected Stripe ingress — checks added this run (OPUS-INGRESS-*)

Files under test: `supabase/migrations/20260920140000_connected_stripe_ingress_normalization.sql`,
`supabase/functions/_shared/connected_stripe_ingress.ts`,
`supabase/functions/apex-connected-stripe-webhook/index.ts`.

Substitutions: `$WS` workspace uuid, `$CONN` `stripe_connections.id`, `$FN` the deployed
`apex-connected-stripe-webhook` URL.

## OPUS-INGRESS-01 — Ingress migration applies and keeps the pilot path intact
- **Purpose:** Confirm the new normalization objects install without disturbing the accepted manual pilot.
- **Command:** Apply `supabase/migrations/20260920140000_connected_stripe_ingress_normalization.sql` alone.
- **Expected:** Applies cleanly. `process_connected_stripe_ingress` and `resolve_stripe_price_credits` exist
  (service_role execute only); `stripe_connections.livemode` exists defaulting to false; the pre-existing
  `receive_connected_stripe_event` and `process_connected_stripe_event` are unchanged.
- **Required:** Supabase migration access.

## OPUS-INGRESS-02 — Unsigned or tampered bodies are rejected before interpretation
- **Purpose:** Raw-body signature verification precedes any parsing or ledger effect.
- **Command:** `curl -X POST -d '{"type":"payment_intent.succeeded"}' $FN` and again with a valid body but a
  mutated `stripe-signature` header.
- **Expected:** `400 Invalid signature` both times; no `stripe_webhook_events` row is created.
- **Required:** Deployed function URL. No Stripe account needed.

## OPUS-INGRESS-03 — Live events cannot be attributed to a test connection
- **Purpose:** Explicit test/live isolation.
- **Command:** Send a correctly signed connected event with `livemode: true` for a connection whose
  `livemode` is false (Stripe CLI or a signed fixture).
- **Expected:** The event is acknowledged as ignored, no receipt is processed, and no grant is created.
- **Required:** Connected webhook signing secret.

## OPUS-INGRESS-04 — Durable receipt exists before any ledger work
- **Purpose:** Prove the receipt is written first and survives processing failure.
- **Command:** Deliver a signed connected event for a price that has no mapping, then
  `select status,attempt_count,last_error,payload is not null from stripe_webhook_events where stripe_event_id='<evt>'`.
- **Expected:** Row exists with the full verified payload, `status='failed'`,
  `last_error='unconfigured_stripe_price'`, and no `credit_grants` row. Redelivering increments
  `attempt_count` and still creates no grant.
- **Required:** Connected test-mode Stripe account with an unmapped price.

## OPUS-INGRESS-05 — Unknown price mappings never grant
- **Purpose:** Server-owned mappings are the only credit authority.
- **Command:** `select public.process_connected_stripe_ingress('$CONN','<evt>','{"kind":"payment","customer_id":"<cust>","payment_id":"pi_x","lines":[{"line_id":"li_x","price_id":"price_unmapped","quantity":1}]}'::jsonb);`
- **Expected:** Raises `unconfigured_stripe_price`; transaction rolls back; no grant, no ledger row, event
  still replayable.
- **Required:** Supabase SQL access to a test workspace.

## OPUS-INGRESS-06 — Customer-supplied credit amounts are ignored
- **Purpose:** No customer application can set how many credits a payment grants.
- **Command:** Create a test payment whose `metadata.apex_credits` is 999999 on a price mapped to 1000
  credits, deliver the event, then read the resulting grant.
- **Expected:** Exactly one grant for 1000 credits (the mapped amount). The metadata value appears nowhere in
  `credit_grants` or `credit_ledger`.
- **Required:** Connected test-mode Stripe account and one configured price mapping.

## OPUS-INGRESS-07 — One ledger effect per business action across different event ids
- **Purpose:** The core Phase 6.2 requirement.
- **Command:** For one purchase, process both `checkout.session.completed` and `payment_intent.succeeded`
  (different Stripe event ids, same payment intent). Then
  `select count(*),sum(amount) from credit_grants where source_payment_id='<pi>'`.
- **Expected:** Exactly one grant; the second event returns `replayed: true` for that line and marks its own
  receipt `processed`; balance reflects one grant only. Same for a refund described by `charge.refunded`
  and `refund.created`/`refund.updated`: exactly one adjustment.
- **Required:** Connected test-mode Stripe account, or SQL fixtures calling the RPC directly.

## OPUS-INGRESS-08 — Refund stays source-aware, non-negative, and replay-safe
- **Purpose:** The frozen refund policy is unchanged by the new ingress path.
- **Command:** Grant 1000 from purchase A, consume 750, refund A fully, then redeliver the refund event.
- **Expected:** `clawed_back 250`, `unrecoverable_spent 750`, `remaining 0`; purchase B's credits untouched;
  the redelivery creates no second adjustment.
- **Required:** Connected test-mode Stripe account.

## OPUS-INGRESS-09 — Retry entry point requires the internal key and never accepts a grant
- **Purpose:** The reusable processing entry point is server-only.
- **Command:** `curl -X POST $FN/retry -d '{"connection_id":"$CONN","stripe_event_id":"<evt>"}'` with no
  key, then with a wrong key, then with `x-apex-internal-key: $APEX_INTERNAL_RETRY_KEY`, and finally with a
  body that also contains `{"amount":5000,"customer_id":"..."}`.
- **Expected:** 401, 401, then a settled outcome (`processed` / `already_processed` / `failed`); the extra
  amount and customer fields are ignored entirely — no grant reflects them.
- **Required:** `APEX_INTERNAL_RETRY_KEY` configured as a function secret.

## OPUS-INGRESS-10 — Retry reprocesses from the persisted receipt only
- **Purpose:** Replays use verified persisted receipts plus trusted Stripe retrieval.
- **Command:** Force a transient failure (temporarily remove the price mapping), deliver the event, restore
  the mapping, then call `$FN/retry` for that event id.
- **Expected:** The retry succeeds using the stored payload without a new Stripe delivery; the receipt flips
  `failed → processed`; exactly one grant exists.
- **Required:** Supabase access plus `APEX_INTERNAL_RETRY_KEY`.

## OPUS-INGRESS-11 — Deauthorization closes the connection
- **Purpose:** `account.application.deauthorized` is handled through the same transactional path.
- **Command:** Deliver a signed `account.application.deauthorized` for `$CONN`.
- **Expected:** `stripe_connections.status='disconnected'`, receipt `processed`, no ledger effect.
- **Required:** Connected test-mode Stripe account.

## ASTRA-RETRY checks — Phase 6.2

Only new retry/replay work is covered. No prior ledger or lifecycle re-evaluation.

| ID | Purpose | Command / manual action | Expected | Stripe credentials / Dashboard / free evaluator |
| --- | --- | --- | --- | --- |
| ASTRA-RETRY-001 | Changed server code compiles | `npx deno check --node-modules-dir=manual --config supabase/functions/deno.json supabase/functions/apex-connected-stripe-retry/index.ts supabase/functions/apex-connected-stripe-webhook/index.ts` | Exit 0 | No / No / optional independent rerun |
| ASTRA-RETRY-002 | Claims, timeout recovery and stale-worker fencing | In an isolated DB fixture, run `claim_connected_stripe_retries(5)` concurrently; age a claim five minutes; reclaim; invoke `process_claimed_stripe_retry` with the old token | Disjoint claims; new claim replaces abandoned claim; stale token cannot mutate ledger | No / DB access / yes |
| ASTRA-RETRY-003 | Bounded retry and operator recovery | With isolated receipts, call `finish_connected_stripe_retry`; inspect retry_attempts, next_retry_at, last_error, retry_operator_action; exhaust eight attempts, then call service-only `requeue_connected_stripe_retry(receipt_id,workspace_id)` after fixing configuration | 60-second initial backoff doubling to one hour; eight-attempt cap; operator failures stop automatic claims; active leases/processed rows cannot be requeued | No / DB access / yes |
| ASTRA-RETRY-004 | Account, workspace and mode binding | In isolated fixtures, mismatch the receipt account/workspace/mode with the connection/token; invoke retry; attempt RPCs with anon/authenticated roles | Operator action recorded, no ledger effect; privileged RPCs denied to public clients | Yes for provider path / DB access / yes |
| ASTRA-RETRY-005 | Safe retry provenance and mapping failure | Use a failed signed test receipt; restore its customer/price configuration and requeue. Confirm `events.retrieve` uses persisted ID and the shared processor. Use an unknown price first | Unknown mapping never grants; failure sanitized; corrected receipt uses existing atomic processor; secrets absent from persisted payload/logs | Yes / Stripe access / yes |
| ASTRA-RETRY-006 | Deployment and scheduler activation | Apply only the two retry migrations; deploy retry and webhook functions; invoke `enable_connected_stripe_retry(project_url)`; inspect cron job and its HTTP result | Active per-minute job; authenticated request reaches retry function and returns 200 | Existing server secrets / Supabase access / optional independent review |

Legacy receipts without installation-mode provenance remain flagged
`receipt_binding_missing`; automatic retry does not guess their original mode.
Manual-pilot and APEX-own-billing events are excluded. Stripe event retrieval depends on
provider retention and existing event-read OAuth permission. Repeated provider failures
stop after eight attempts for operator handling.

