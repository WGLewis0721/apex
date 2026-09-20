-- Phase 6.5 — audit + support timeline.
--
-- The append-only ledger already holds the credit truth, but support, finance,
-- and engineering still had to join four tables by hand to answer "what happened
-- to whom, why, from which Stripe/APEX event, and when?".
--
-- This migration adds one read-only, tenant-scoped, chronologically merged
-- explanation of a single customer's commercial lifecycle. It creates no new
-- write path, no second source of truth, and no new storage: it reads the
-- existing grants, ledger, operations, and Stripe webhook event rows.

create or replace function public.get_customer_timeline(
  p_workspace_id uuid,
  p_customer_id uuid,
  p_limit integer default 100
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_entries jsonb;
  v_account public.credit_accounts;
begin
  if not exists (
    select 1 from public.customers
    where id = p_customer_id and workspace_id = p_workspace_id
  ) then
    raise exception 'customer_not_in_workspace';
  end if;

  select * into v_account from public.credit_accounts
  where workspace_id = p_workspace_id and customer_id = p_customer_id;

  with ledger_entries as (
    select
      l.created_at as occurred_at,
      'credit.' || l.entry_type as event_type,
      case l.entry_type
        when 'grant' then 'Verified payment created product credits.'
        when 'consume' then 'A credit-gated action spent credits against this grant.'
        when 'refund' then 'A refund clawed back unspent credits from its originating purchase.'
        when 'unrecoverable' then 'Refunded credits had already been consumed and stay consumed; balance is never negative.'
        when 'expire' then 'An expired grant remainder was reconciled out of the spendable balance.'
        else 'Credit ledger entry.'
      end as explanation,
      jsonb_build_object(
        'ledger_id', l.id,
        'entry_type', l.entry_type,
        'amount', l.amount,
        'credit_grant_id', l.credit_grant_id,
        'idempotency_key', l.idempotency_key,
        'stripe_event_id', l.stripe_event_id,
        'source_payment_id', l.source_payment_id,
        'metadata', l.metadata
      ) as detail
    from public.credit_ledger l
    where l.workspace_id = p_workspace_id and l.customer_id = p_customer_id
  ),
  grant_entries as (
    select
      g.created_at as occurred_at,
      'grant.created' as event_type,
      'A source-attributed grant was opened; only its own purchase may claw it back.' as explanation,
      jsonb_build_object(
        'grant_id', g.id,
        'amount', g.amount,
        'consumed_amount', g.consumed_amount,
        'remaining_amount', g.remaining_amount,
        'status', g.status,
        'reason', g.reason,
        'expires_at', g.expires_at,
        'source_stripe_event_id', g.source_stripe_event_id,
        'source_payment_id', g.source_payment_id
      ) as detail
    from public.credit_grants g
    where g.workspace_id = p_workspace_id and g.customer_id = p_customer_id
  ),
  decision_entries as (
    select
      coalesce(o.completed_at, o.created_at) as occurred_at,
      'decision.' || o.operation_type || '.' || o.status as event_type,
      case
        when o.status = 'denied'
          then 'Request denied with machine-readable reason ' ||
               coalesce(o.result ->> 'reason', 'UNKNOWN') || '.'
        when o.status = 'pending' then 'Request recorded and still in flight.'
        else 'Request succeeded against authoritative hosted state.'
      end as explanation,
      jsonb_build_object(
        'operation_id', o.id,
        'operation_type', o.operation_type,
        'status', o.status,
        'reason', o.result ->> 'reason',
        'idempotency_key', o.idempotency_key,
        'request', o.request,
        'result', o.result
      ) as detail
    from public.credit_operations o
    where o.workspace_id = p_workspace_id and o.customer_id = p_customer_id
  ),
  stripe_entries as (
    select
      e.received_at as occurred_at,
      'stripe.' || e.event_type as event_type,
      case e.status
        when 'processed' then 'Verified Stripe event was persisted once and processed.'
        when 'failed' then 'Verified Stripe event is persisted and replayable after a processing failure.'
        else 'Verified Stripe event is persisted and awaiting processing.'
      end as explanation,
      jsonb_build_object(
        'webhook_event_id', e.id,
        'stripe_event_id', e.stripe_event_id,
        'stripe_connection_id', e.stripe_connection_id,
        'event_type', e.event_type,
        'status', e.status,
        'attempt_count', e.attempt_count,
        'last_error', e.last_error,
        'processed_at', e.processed_at
      ) as detail
    from public.stripe_webhook_events e
    where e.workspace_id = p_workspace_id
      and e.stripe_event_id in (
        select distinct source_stripe_event_id from public.credit_grants
        where workspace_id = p_workspace_id and customer_id = p_customer_id
          and source_stripe_event_id is not null
        union
        select distinct stripe_event_id from public.credit_ledger
        where workspace_id = p_workspace_id and customer_id = p_customer_id
          and stripe_event_id is not null
      )
  ),
  merged as (
    select * from ledger_entries
    union all select * from grant_entries
    union all select * from decision_entries
    union all select * from stripe_entries
  )
  select coalesce(jsonb_agg(entry order by entry ->> 'occurred_at' desc), '[]'::jsonb)
  into v_entries
  from (
    select jsonb_build_object(
      'occurred_at', occurred_at,
      'event_type', event_type,
      'explanation', explanation,
      'detail', detail
    ) as entry
    from merged
    order by occurred_at desc
    limit v_limit
  ) page;

  return jsonb_build_object(
    'customer_id', p_customer_id,
    'remaining', coalesce(v_account.remaining, 0),
    'version', coalesce(v_account.version, 0),
    'entry_count', jsonb_array_length(v_entries),
    'limit', v_limit,
    'entries', v_entries,
    'as_of', now()
  );
end;
$$;

revoke all on function public.get_customer_timeline(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.get_customer_timeline(uuid, uuid, integer) to service_role;

comment on function public.get_customer_timeline(uuid, uuid, integer) is
  'APEX Phase 6.5 support/audit timeline: read-only merged explanation of a customer''s Stripe events, grants, credit ledger, and access decisions. No write path.';
