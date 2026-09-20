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

---

# Phase 6.2 connected Stripe ingress — statuses for OPUS-INGRESS-* (this run)

| Check ID | Status | Note |
| --- | --- | --- |
| OPUS-INGRESS-01 | IMPLEMENTED_PENDING_EVALUATION | Migration applied cleanly on a local PostgreSQL 16 harness in this run; hosted application not performed here. |
| OPUS-INGRESS-02 | IMPLEMENTED_PENDING_EVALUATION | Signature verification runs on the raw body before any parsing; not exercised against a deployed URL in this run. |
| OPUS-INGRESS-03 | IMPLEMENTED_PENDING_EVALUATION | `resolveConnection` compares `event.livemode` to `stripe_connections.livemode` and refuses a mismatch. Not exercised with a signed live fixture. |
| OPUS-INGRESS-04 | IMPLEMENTED_PENDING_EVALUATION | Receipt (full verified payload) is persisted before the processor runs; failures only flip status and `last_error`. |
| OPUS-INGRESS-05 | IMPLEMENTED_PENDING_EVALUATION | Verified locally: an unmapped price raised `unconfigured_stripe_price` and produced no grant. |
| OPUS-INGRESS-06 | IMPLEMENTED_PENDING_EVALUATION | Credit amounts are read only from `stripe_credit_price_mappings`; the previous metadata-driven amount path was removed. Needs a hosted Stripe run to confirm end to end. |
| OPUS-INGRESS-07 | IMPLEMENTED_PENDING_EVALUATION | Verified locally against the real `grant_credits`: two different event ids for one payment intent produced exactly one 1000-credit grant, the second reporting `replayed: true`. Hosted repetition still required. |
| OPUS-INGRESS-08 | IMPLEMENTED_PENDING_EVALUATION | Reuses `refund_unspent_credits` unchanged; refund credits are derived from the originating payment's own grants. Not run end to end here. |
| OPUS-INGRESS-09 | IMPLEMENTED_PENDING_EVALUATION | Implemented with a constant-time key comparison; requires `APEX_INTERNAL_RETRY_KEY` to be set before it can be evaluated. |
| OPUS-INGRESS-10 | IMPLEMENTED_PENDING_EVALUATION | Retry path reads the persisted receipt and re-retrieves from Stripe with APEX credentials; not exercised here. |
| OPUS-INGRESS-11 | IMPLEMENTED_PENDING_EVALUATION | Handled as a `deauthorize` action inside the same transactional processor. |

**External blocker (unchanged by this run):** the Stripe Dashboard External-test selection, the first app
install, the connected event destination, and its signing secret are account-authorized actions. Every
OPUS-INGRESS check that needs a real connected account is gated behind them. Implementation did not stop for
this; only the hosted acceptance run is blocked.

**Defect found and fixed during implementation:** with business-action-scoped idempotency, a second Stripe
event describing the same purchase reached `grant_credits` with a different stored request document and was
rejected as `idempotency_key_reused` instead of replaying. The processor now returns the recorded outcome
from `credit_operations` for an action already effected, so one purchase yields exactly one grant. This was
observed and re-verified locally.

## Deployment record (hosted, this run)

Applied to Supabase project `fnmxlmjrkgojowpzrcwa` and deployed from this session:

- migrations applied: `phase_6_4_expiry_reconciliation`, `phase_6_5_customer_timeline`,
  `connected_stripe_ingress_normalization` (all reported success; applied individually, not via
  `db push --include-all`).
- edge functions deployed: `apex-api` (v6), `apex-connected-stripe-webhook` (v5).
- privilege check against the live database: `expire_credit_grants`, `check_credit_reconciliation`,
  `get_customer_timeline`, `process_connected_stripe_ingress`, and `resolve_stripe_price_credits` are
  executable by `service_role` only (`anon` and `authenticated` have no execute privilege).
- live smoke responses observed: unsigned connected webhook → `400 Invalid signature`; unauthenticated
  `apex-api` timeline → `401 Unauthorized`; `/retry` without a configured key → `503 Retry entry point is
  not configured`.

This records deployment only. It is not lifecycle acceptance, and no OPUS-INGRESS or APEX-* check above is
marked passed — free evaluators still run them.

**Remaining configuration/user actions:**

1. Set the `APEX_INTERNAL_RETRY_KEY` function secret before the retry entry point can serve the scheduler
   (it currently refuses every call with 503 by design).
2. Set `STRIPE_CONNECTED_WEBHOOK_SECRET` to the connected event destination's signing secret.
3. Stripe Dashboard: External-test selection, first install, and creating the connected event destination.
4. Configure at least one `stripe_credit_price_mappings` row per workspace — without it, no connected
   payment grants anything, by design.

## Convergence pass statuses

| Check ID | Status | Note |
| --- | --- | --- |
| OPUS-INGRESS-12 | READY_FOR_FREE_EVALUATION | Static check, no credentials needed. |
| OPUS-INGRESS-13 | IMPLEMENTED_PENDING_EVALUATION | Migration `phase_6_2_persisted_event_retry` applied live and `apex-stripe-event-retry` deployed; unauthenticated call returns 401 as designed. Credentialed paths not exercised. |
| OPUS-INGRESS-14 | IMPLEMENTED_PENDING_EVALUATION | Proportional reversal implemented in `process_connected_stripe_ingress`; not run against a real partial refund. |
| OPUS-INGRESS-15 | IMPLEMENTED_PENDING_EVALUATION | Connected `payment_intent.succeeded` now resolves through the same business action key; not run end to end. |

**Superseded by this pass:** OPUS-INGRESS-09 and OPUS-INGRESS-10 described a `/retry` route on the
connected webhook, guarded by `APEX_INTERNAL_RETRY_KEY`. That route was removed in favour of the
`apex-stripe-event-retry` function, so evaluate OPUS-INGRESS-13 instead of those two, and
`APEX_INTERNAL_RETRY_KEY` is no longer needed. OPUS-INGRESS-03 is also superseded: mode isolation is
now the handler's blanket refusal of any `livemode` event rather than a per-connection comparison.

**Second deployment record:** applied migration `phase_6_2_persisted_event_retry`; deployed
`apex-connected-stripe-webhook` (v7) and `apex-stripe-event-retry` (v1). Live smoke: unsigned webhook →
400, uncredentialed retry → 401. One deliberate difference from the repo file: the live backfill used
`coalesce(received_at, now())` where the file uses `coalesce(received_at, created_at, now())`; both
columns exist, and the backfill only touched rows with a null `received_at`.

**Five pre-existing type errors** in the retry layer (`ProcessorOutcome` narrowing and a Stripe object
cast) were present on the incoming commit and are fixed here; `deno check` is now clean for the
connected webhook, the retry function, and `apex-api`.
