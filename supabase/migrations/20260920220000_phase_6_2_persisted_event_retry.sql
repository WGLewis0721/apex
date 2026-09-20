-- Phase 6.2: recover verified persisted Stripe receipts left pending/failed.
-- Scheduling uses existing Postgres claim functions. No queue product.
-- This does not interpret Stripe objects or write the ledger; it only
-- selects work and records retry state around process_connected_stripe_event
-- / process_manual_stripe_payment.

alter table public.stripe_webhook_events
  add column if not exists received_at timestamptz,
  add column if not exists next_retry_at timestamptz,
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_token uuid,
  add column if not exists failure_class text;

update public.stripe_webhook_events
  set received_at = coalesce(received_at, created_at, now())
  where received_at is null;

alter table public.stripe_webhook_events
  alter column received_at set default now(),
  alter column received_at set not null;

alter table public.stripe_webhook_events
  drop constraint if exists stripe_webhook_events_status_check;

alter table public.stripe_webhook_events
  add constraint stripe_webhook_events_status_check
  check (status in ('received', 'processing', 'processed', 'failed'));

alter table public.stripe_webhook_events
  drop constraint if exists stripe_webhook_events_failure_class_check;

alter table public.stripe_webhook_events
  add constraint stripe_webhook_events_failure_class_check
  check (failure_class is null or failure_class in (
    'retryable', 'needs_configuration', 'needs_operator', 'pending_settlement'
  ));

create index if not exists stripe_webhook_events_retry_claim_idx
  on public.stripe_webhook_events (coalesce(next_retry_at, received_at), status)
  where stripe_connection_id is not null
    and status in ('received', 'failed', 'processing');

create or replace function public.claim_stripe_webhook_events(
  p_limit integer default 25,
  p_claim_token uuid default gen_random_uuid(),
  p_stale_after interval default interval '5 minutes',
  p_workspace_id uuid default null,
  p_event_row_id uuid default null,
  p_include_held boolean default false
) returns setof public.stripe_webhook_events
language plpgsql security definer set search_path = public
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'retry_limit_invalid';
  end if;

  update public.stripe_webhook_events
     set status = 'failed',
         last_error = coalesce(nullif(last_error, ''), 'processing_claim_abandoned'),
         failure_class = coalesce(failure_class, 'retryable'),
         claimed_at = null,
         claim_token = null,
         next_retry_at = now(),
         updated_at = now()
   where status = 'processing'
     and claimed_at is not null
     and claimed_at < now() - p_stale_after
     and stripe_connection_id is not null
     and (p_workspace_id is null or workspace_id = p_workspace_id)
     and (p_event_row_id is null or id = p_event_row_id);

  return query
  with picked as (
    select e.id
      from public.stripe_webhook_events e
     where e.stripe_connection_id is not null
       and (p_workspace_id is null or e.workspace_id = p_workspace_id)
       and (p_event_row_id is null or e.id = p_event_row_id)
       and (
         (
           e.status in ('received', 'failed')
           and (e.next_retry_at is null or e.next_retry_at <= now())
           and (
             p_include_held
             or coalesce(e.failure_class, 'retryable') = 'retryable'
           )
           and e.attempt_count < 8
         )
         or (
           p_include_held
           and p_event_row_id is not null
           and e.status = 'processed'
         )
       )
     order by coalesce(e.next_retry_at, e.received_at) asc
     limit p_limit
     for update skip locked
  )
  update public.stripe_webhook_events e
     set status = 'processing',
         claimed_at = now(),
         claim_token = p_claim_token,
         attempt_count = e.attempt_count + 1,
         updated_at = now()
    from picked
   where e.id = picked.id
  returning e.*;
end;
$$;

create or replace function public.fail_stripe_webhook_event(
  p_event_row_id uuid,
  p_reason text,
  p_failure_class text default 'retryable',
  p_claim_token uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_event public.stripe_webhook_events;
  v_reason text;
  v_class text;
  v_delay integer;
begin
  select * into v_event
    from public.stripe_webhook_events
   where id = p_event_row_id
     and stripe_connection_id is not null
     for update;
  if not found then raise exception 'event_not_received'; end if;
  if v_event.status = 'processed' then
    return jsonb_build_object('ignored', true, 'status', 'processed');
  end if;
  if p_claim_token is not null and v_event.claim_token is not null
     and v_event.claim_token <> p_claim_token then
    raise exception 'retry_claim_mismatch';
  end if;

  v_reason := left(regexp_replace(lower(coalesce(p_reason, 'processing_failed')), '[^a-z0-9_]+', '_', 'g'), 80);
  if v_reason is null or v_reason = '' then v_reason := 'processing_failed'; end if;

  v_class := coalesce(p_failure_class, 'retryable');
  if v_class not in ('retryable', 'needs_configuration', 'needs_operator', 'pending_settlement') then
    v_class := 'retryable';
  end if;

  if v_class = 'retryable' and v_event.attempt_count >= 8 then
    v_class := 'needs_operator';
    v_reason := 'max_retry_attempts_exceeded';
  end if;

  if v_class = 'pending_settlement' then
    v_delay := 900;
  else
    v_delay := least(3600, 30 * power(2, greatest(v_event.attempt_count - 1, 0))::int);
  end if;

  update public.stripe_webhook_events
     set status = case when v_class = 'pending_settlement' then 'received' else 'failed' end,
         last_error = v_reason,
         failure_class = v_class,
         claimed_at = null,
         claim_token = null,
         next_retry_at = case
           when v_class in ('needs_configuration', 'needs_operator') then null
           when v_class = 'pending_settlement' and v_event.attempt_count >= 8 then null
           else now() + make_interval(secs => v_delay)
         end,
         updated_at = now()
   where id = v_event.id;

  return jsonb_build_object(
    'id', v_event.id,
    'status', case when v_class = 'pending_settlement' then 'received' else 'failed' end,
    'failure_class', v_class,
    'last_error', v_reason
  );
end;
$$;

create or replace function public.request_stripe_event_replay(
  p_workspace_id uuid,
  p_event_row_id uuid
) returns public.stripe_webhook_events
language plpgsql security definer set search_path = public
as $$
declare
  v_event public.stripe_webhook_events;
begin
  select * into v_event
    from public.stripe_webhook_events
   where id = p_event_row_id
     for update;
  if not found then raise exception 'event_not_received'; end if;
  if v_event.workspace_id is distinct from p_workspace_id then
    raise exception 'event_workspace_mismatch';
  end if;
  if v_event.stripe_connection_id is null then
    raise exception 'platform_event_not_replayable';
  end if;

  update public.stripe_webhook_events
     set status = case when status = 'processed' then status else 'failed' end,
         failure_class = 'retryable',
         last_error = case when status = 'processed' then last_error else 'operator_replay_requested' end,
         next_retry_at = now(),
         claimed_at = null,
         claim_token = null,
         updated_at = now()
   where id = v_event.id
  returning * into v_event;

  return v_event;
end;
$$;

revoke all on function public.claim_stripe_webhook_events(integer, uuid, interval, uuid, uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.fail_stripe_webhook_event(uuid, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.request_stripe_event_replay(uuid, uuid)
  from public, anon, authenticated;
