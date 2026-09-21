-- Phase 6.2 — converge connected ingress on one processor and one retry engine.
--
-- Before this migration the system carried two generations side by side:
--
--   * initial webhook delivery normalized events itself and called
--     `process_connected_stripe_event` (idempotency keyed on the Stripe event
--     id), while
--   * `process_connected_stripe_ingress` (idempotency keyed on the business
--     action: the payment intent, or the refund id) existed but was reached by
--     nothing.
--
-- The scheduled retry worker used the first path. So one purchase described by
-- two Stripe event ids could produce two grants, and initial delivery and retry
-- ran different business logic for the same receipt.
--
-- This migration makes the lease-fenced retry wrapper call the same processor
-- the webhook now calls, and retires the duplicate claim/backoff engine.
--
-- Kept exactly as they are: the lease fencing and binding re-checks below, the
-- ledger functions `grant_credits` / `refund_unspent_credits`, and the accepted
-- manual pilot path through `process_connected_stripe_event`.

-- ---------------------------------------------------------------------
-- Lease-fenced retry now forwards the normalized action to the canonical
-- processor. The fencing and binding checks are unchanged; only the call at
-- the end differs, and the legacy argument shape still works so an in-flight
-- worker mid-deploy cannot fail.
-- ---------------------------------------------------------------------
create or replace function public.process_claimed_stripe_retry(
  p_receipt_id uuid, p_claim uuid, p_args jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.stripe_webhook_events; c public.stripe_connections; t public.stripe_oauth_tokens; r jsonb;
begin
  select * into e from public.stripe_webhook_events where id=p_receipt_id for update;
  if not found or e.retry_claim is distinct from p_claim or p_claim is null
    or e.retry_claimed_at < now()-interval '5 minutes' then raise exception 'stale_retry_claim'; end if;
  if e.status='processed' then return '{"replayed":true}'::jsonb; end if;
  select * into c from public.stripe_connections where id=e.stripe_connection_id for share;
  if not found or c.status <> 'connected' or c.workspace_id is distinct from e.workspace_id
    or c.stripe_account_id is distinct from e.payload->>'account' then raise exception 'retry_binding_mismatch'; end if;
  select * into t from public.stripe_oauth_tokens where workspace_id=e.workspace_id for share;
  if not found or t.livemode or t.install_mode is distinct from e.payload->>'install_mode'
    or e.payload->>'livemode' is distinct from 'false' or e.payload->>'ingress' is distinct from 'connected_v1'
    then raise exception 'retry_binding_mismatch'; end if;

  if p_args ? 'p_action' then
    -- Canonical path: business-action idempotency, server-owned price
    -- mappings, proportional refunds.
    r := public.process_connected_stripe_ingress(
      e.stripe_connection_id, e.stripe_event_id, p_args->'p_action');
  else
    -- Legacy argument shape, retained only so a worker that was already
    -- running when this deployed still completes its batch.
    r := public.process_connected_stripe_event(e.stripe_connection_id,e.stripe_event_id,
      (p_args->>'p_customer_id')::uuid,p_args->>'p_payment_id',coalesce(p_args->'p_grants','[]'::jsonb),
      p_args->>'p_refund_source_event_id',(p_args->>'p_refund_credits')::numeric);
  end if;

  update public.stripe_webhook_events set retry_claim=null,retry_claimed_at=null where id=e.id;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- Retire the duplicate claim/backoff engine.
--
-- These were deployed during the parallel-implementation period and are not
-- part of the repository any more. The lease-based
-- `claim_connected_stripe_retries` / `finish_connected_stripe_retry` pair is
-- the one retry engine. Dropping these guarantees a second scheduler cannot be
-- pointed at the same receipts.
-- ---------------------------------------------------------------------
drop function if exists public.claim_stripe_webhook_events(integer, uuid, interval, uuid, uuid, boolean);
drop function if exists public.fail_stripe_webhook_event(uuid, text, text, uuid);
drop function if exists public.request_stripe_event_replay(uuid, uuid);

comment on function public.process_claimed_stripe_retry(uuid, uuid, jsonb) is
  'APEX Phase 6.2 lease-fenced retry: re-checks the receipt binding and forwards the normalized action to process_connected_stripe_ingress, the same processor initial webhook delivery uses.';
