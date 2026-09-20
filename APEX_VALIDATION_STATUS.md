# APEX validation status — this run only

Statuses for **only** the checks created in this run (`APEX_VALIDATION_CHECKS.md`).
No check is marked PASS here; free evaluation models run them later.

Statuses used: `IMPLEMENTED_PENDING_EVALUATION`, `BLOCKED_USER_ACTION`, `NOT_IMPLEMENTED`,
`READY_FOR_FREE_EVALUATION`.

| Check ID | Phase | Status | Note |
| --- | --- | --- | --- |
| APEX-6.4-01 | 6.4 expiry boundary | BLOCKED_USER_ACTION | Migration file is written and applies cleanly on a local PostgreSQL 16 harness; applying it to the hosted Supabase project needs project credentials this run does not hold, and remote migration history has known legacy drift, so it must be applied as a single reviewed file. |
| APEX-6.4-02 | 6.4 expiry boundary | IMPLEMENTED_PENDING_EVALUATION | Exercised locally against a stub schema: 1000 projection, 400 expired + 600 live → first run expired 400, second run expired 0, one `expire` ledger row, projection 600. Hosted repetition still required. |
| APEX-6.4-03 | 6.4 expiry boundary | IMPLEMENTED_PENDING_EVALUATION | The `projection_grant_mismatch` guard is implemented in `expire_credit_grants`; the negative fixture has not been run. |
| APEX-6.4-04 | 6.4 expiry boundary | BLOCKED_USER_ACTION | Requires the deployed `apex-api` and an active `apex_sk_*` key. |
| APEX-6.4-05 | 6.4 expiry boundary | BLOCKED_USER_ACTION | Requires an active `apex_sk_*` key plus a second workspace's fixture data to prove isolation. |
| APEX-6.5-01 | 6.5 audit + support data | BLOCKED_USER_ACTION | Same hosted-migration credential dependency as APEX-6.4-01. |
| APEX-6.5-02 | 6.5 audit + support data | IMPLEMENTED_PENDING_EVALUATION | Timeline shape verified locally (stripe / grant / credit / decision entries merged in time order with explanations); the full pilot-lifecycle chain must be read against hosted data. |
| APEX-6.5-03 | 6.5 audit + support data | IMPLEMENTED_PENDING_EVALUATION | A denied `credit_operations` row surfaced as `decision.consume.denied` with `detail.reason = INSUFFICIENT_CREDITS` locally; the hosted DENY path is unchanged by this run and still needs the end-to-end read. |
| APEX-6.5-04 | 6.5 audit + support data | BLOCKED_USER_ACTION | Requires an active `apex_sk_*` key and a customer id from a second workspace. |
| APEX-SDK-01 | 6.4 / 6.5 client surface | READY_FOR_FREE_EVALUATION | Runs offline with no credentials. All 6 SDK tests (4 pre-existing + 2 new) passed in this run using the repo-pinned `typescript@5.6.3`; the sandbox's default TypeScript 6.x binary fails `tsc` with pre-existing `TS5011`, which is an environment artifact, not a change from this run. |
| APEX-DEPLOY-01 | 6.4 / 6.5 hosted surface | BLOCKED_USER_ACTION | Requires Supabase Edge Function deploy rights. |

## Roadmap ambiguity recorded

No phase was invented. The current `ROADMAP.md` lists **nine** phases; 1–4 and 9 are complete,
5 / 7 / 8 are blocked on Dashboard, npm, and OAuth-install actions that only a human with those
accounts can take, and Phase 6 is the only phase with uncompleted, unblocked, net-new engineering
work. Within Phase 6 this run implemented the two concretely specified gaps: 6.4's "Expiry
boundary" and 6.5's operator/support timeline.

Two genuine ambiguities are recorded rather than resolved by invention:

1. **Phase 6.4 scheduling.** The roadmap says to retry/schedule "using existing Supabase/Postgres
   scheduling before adding another queue system" but does not name a scheduler. This run exposed
   the reconciliation as an authenticated, replay-safe `POST /v1/maintenance/expire-grants` route and
   did **not** enable `pg_cron` or any new component. Who or what calls it on a schedule is an open
   decision for the next agent or the operator.
2. **Phase 6.4 remaining scope.** Recurring allowance grants, rollover policy, failed-payment
   recovery state, Stripe↔APEX reconciliation, and broader usage counters are explicitly gated in the
   roadmap on "core ingress proof/customer need". No customer need is recorded in the repository, so
   they were left unimplemented rather than guessed at. Phase 6.4 is therefore partially, not fully,
   delivered — deliberately.

`expiry_reconciliation_pending` is reported separately from `reconciled` in
`check_credit_reconciliation`: an unreconciled expired remainder is still internally consistent with
the projection, so `reconciled` stays true while `expiry_reconciliation_pending` flags the work.
Evaluators should not read `reconciled: true` as "no expiry work due".


## ASTRA-RETRY — Phase 6.2

| Check ID | Phase | Status | Evidence / limitation |
| --- | --- | --- | --- |
| ASTRA-RETRY-001 | 6.2 | READY_FOR_FREE_EVALUATION | Targeted Deno check executed successfully after installing pinned function dependencies and passing null to Stripe account retrieval. Initial command lacked node_modules; automatic Deno download was interrupted; manual-node-modules command succeeded. |
| ASTRA-RETRY-002 | 6.2 | IMPLEMENTED_PENDING_EVALUATION | SKIP LOCKED claims, five-minute lease recovery, and transactional token fencing implemented. Concurrency fixtures not executed. |
| ASTRA-RETRY-003 | 6.2 | IMPLEMENTED_PENDING_EVALUATION | Bounded backoff, eight-attempt cap, sanitized errors, operator stop and service-only requeue implemented. Fault fixtures not executed. |
| ASTRA-RETRY-004 | 6.2 | IMPLEMENTED_PENDING_EVALUATION | Receipt binding checked before provider retrieval and again under transaction locks; service-only grants. Isolation fixtures not executed. |
| ASTRA-RETRY-005 | 6.2 | IMPLEMENTED_PENDING_EVALUATION | Existing normalization extracted once into `_shared/connected_event.ts`; initial delivery and retries reuse it. No lifecycle proof run. |
| ASTRA-RETRY-006 | 6.2 | READY_FOR_FREE_EVALUATION | Two migrations applied to fnmxlmjrkgojowpzrcwa; retry v1 and webhook v4 deployed ACTIVE; cron job 1 enabled every minute. First scheduled HTTP invocation returned 200, timed_out=false, body {"attempted":0}. This proves idle scheduler reachability, not event/lifecycle acceptance. |

### Exact deployment / activation handoff

Target: `fnmxlmjrkgojowpzrcwa` (Apex). Project recovered from RESTORING during this run.
Applied individually, without bulk history reconciliation:
- `20260920231219_connected_event_retry.sql`
- `20260920231711_retry_claim_recovery.sql`

Deployed `apex-connected-stripe-retry` and `apex-connected-stripe-webhook` with their
shared core, credentials and connected-event module. Custom scheduler authentication
is enforced before any claim; gateway JWT verification is disabled for that function.
Token generated inside Postgres, encrypted in Vault, with only a verification hash
stored in the server-only RLS table. No secret is committed or returned to the caller.

Activated with:
`select public.enable_connected_stripe_retry('https://fnmxlmjrkgojowpzrcwa.supabase.co');`
Named job: `apex-connected-stripe-retry`, schedule `* * * * *`, batch 5 (DB maximum 10).
Calling enable again rotates the scheduler token and updates the named job.
To stop: `select cron.unschedule('apex-connected-stripe-retry');`.
To requeue after correcting configuration, use the privileged
`requeue_connected_stripe_retry(receipt_id, workspace_id)` RPC. It cannot upgrade old
receipts lacking original mode provenance. Existing ledger functions are unchanged.

Commands: Supabase CLI migration new (twice), pinned function `npm ci`, targeted Deno
check, `git diff --check`, git commit/push; Supabase apply_migration, deploy_edge_function,
and the scheduler activation SQL. No broad tests, real purchases/refunds, or Phase 8 proof.
Previous local Phase 5 work was preserved in its original checkout, not included here.
