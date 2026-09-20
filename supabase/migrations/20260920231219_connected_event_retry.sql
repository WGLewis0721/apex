-- Phase 6.2: bounded recovery of verified connected-account receipts only.
alter table public.stripe_webhook_events
  add column retry_attempts integer not null default 0,
  add column retry_claim uuid,
  add column retry_claimed_at timestamptz,
  add column next_retry_at timestamptz not null default (now() + interval '2 minutes'),
  add column retry_operator_action text;
alter table public.stripe_webhook_events drop constraint stripe_webhook_events_status_check;
alter table public.stripe_webhook_events add constraint stripe_webhook_events_status_check
  check (status in ('received','processed','failed','processing'));
create index stripe_events_retry_due_idx on public.stripe_webhook_events(next_retry_at)
  where status in ('received','failed','processing') and retry_operator_action is null;

-- Legacy receipts did not bind installation mode. Do not infer a mode later.
update public.stripe_webhook_events set retry_operator_action = 'receipt_binding_missing'
where stripe_connection_id is not null and payload ? 'account'
  and status <> 'processed' and not (payload ? 'install_mode');

create function public.claim_connected_stripe_retries(p_limit integer default 5)
returns setof public.stripe_webhook_events
language plpgsql security definer set search_path = public as $$
begin
  update public.stripe_webhook_events set retry_operator_action = 'retry_exhausted'
  where retry_attempts >= 8 and status <> 'processed' and retry_operator_action is null
    and (retry_claimed_at is null or retry_claimed_at < now() - interval '5 minutes');
  return query
  with due as (
    select e.id from public.stripe_webhook_events e
    where e.status in ('received','failed','processing')
      and e.payload->>'ingress' = 'connected_v1' and e.payload->>'livemode' = 'false'
      and e.payload->>'install_mode' in ('test','sandbox')
      and e.retry_operator_action is null and e.retry_attempts < 8
      and e.next_retry_at <= now()
      and (e.retry_claim is null or e.retry_claimed_at < now() - interval '5 minutes')
    order by e.next_retry_at, e.id for update skip locked
    limit greatest(1,least(coalesce(p_limit,5),10))
  )
  update public.stripe_webhook_events e
    set status='processing', retry_claim=gen_random_uuid(), retry_claimed_at=now(),
        retry_attempts=e.retry_attempts+1, updated_at=now()
    from due where e.id=due.id returning e.*;
end $$;

-- Fence stale workers and recheck binding in the same transaction as the
-- EXISTING ledger processor. This adds no ledger mutation implementation.
create function public.process_claimed_stripe_retry(
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
  r := public.process_connected_stripe_event(e.stripe_connection_id,e.stripe_event_id,
    (p_args->>'p_customer_id')::uuid,p_args->>'p_payment_id',coalesce(p_args->'p_grants','[]'::jsonb),
    p_args->>'p_refund_source_event_id',(p_args->>'p_refund_credits')::numeric);
  update public.stripe_webhook_events set retry_claim=null,retry_claimed_at=null where id=e.id;
  return r;
end $$;

create function public.finish_connected_stripe_retry(p_receipt_id uuid,p_claim uuid,p_reason text,p_operator boolean default false)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_reason not in ('mapping_required','customer_required','source_required','binding_mismatch',
    'payment_pending','provider_unavailable','processing_failed','unsupported_event','receipt_binding_missing')
    then p_reason := 'processing_failed'; end if;
  update public.stripe_webhook_events
    set status=case when status='processed' then status else 'failed' end,
        last_error=case when status='processed' then null else p_reason end,
        retry_operator_action=case when status='processed' then null
          when p_operator then p_reason when retry_attempts>=8 then 'retry_exhausted' else null end,
        next_retry_at=now()+make_interval(secs=>least(3600,30*power(2,least(retry_attempts,7)))::integer),
        retry_claim=null,retry_claimed_at=null,updated_at=now()
    where id=p_receipt_id and retry_claim=p_claim;
end $$;

-- Service-only requeue after an operator fixes configuration; never reset an
-- active lease or processed receipt, and never fabricate missing provenance.
create function public.requeue_connected_stripe_retry(p_receipt_id uuid,p_workspace_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.stripe_webhook_events set retry_operator_action=null,retry_attempts=0,next_retry_at=now()
  where id=p_receipt_id and workspace_id=p_workspace_id and status in ('failed','received')
    and retry_claim is null and payload->>'ingress'='connected_v1'
    and payload->>'livemode'='false' and payload->>'install_mode' in ('test','sandbox');
  return found;
end $$;

-- Scheduler token: hash for verification, encrypted original in Supabase Vault.
create table public.apex_retry_runtime (
  singleton boolean primary key default true check(singleton), token_hash bytea not null
);
alter table public.apex_retry_runtime enable row level security;
revoke all on public.apex_retry_runtime from public,anon,authenticated;
create function public.authorize_connected_stripe_retry(p_token text) returns boolean
language sql security definer set search_path=public as $$
  select coalesce((select token_hash=sha256(convert_to(p_token,'UTF8')) from public.apex_retry_runtime where singleton),false)
$$;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- Deliberately not invoked by the migration; call after the function deploys.
create function public.enable_connected_stripe_retry(p_project_url text) returns bigint
language plpgsql security definer set search_path=public as $$
declare token text; secret_id uuid; job bigint;
begin
  if p_project_url !~ '^https://[a-z0-9]+\.supabase\.co$' then raise exception 'invalid_project_url'; end if;
  token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  select id into secret_id from vault.secrets where name='apex_connected_retry_token';
  if secret_id is null then perform vault.create_secret(token,'apex_connected_retry_token');
  else perform vault.update_secret(secret_id,token); end if;
  insert into public.apex_retry_runtime(singleton,token_hash) values(true,sha256(convert_to(token,'UTF8')))
  on conflict(singleton) do update set token_hash=excluded.token_hash;
  select cron.schedule('apex-connected-stripe-retry','* * * * *',format(
    $job$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json',
    'x-apex-retry-token',(select decrypted_secret from vault.decrypted_secrets where name='apex_connected_retry_token')),
    body := '{}'::jsonb, timeout_milliseconds := 55000);$job$,
    p_project_url || '/functions/v1/apex-connected-stripe-retry')) into job;
  return job;
end $$;

revoke all on function public.claim_connected_stripe_retries(integer),
 public.process_claimed_stripe_retry(uuid,uuid,jsonb),public.finish_connected_stripe_retry(uuid,uuid,text,boolean),
 public.requeue_connected_stripe_retry(uuid,uuid),public.authorize_connected_stripe_retry(text),
 public.enable_connected_stripe_retry(text) from public,anon,authenticated;
grant execute on function public.claim_connected_stripe_retries(integer),
 public.process_claimed_stripe_retry(uuid,uuid,jsonb),public.finish_connected_stripe_retry(uuid,uuid,text,boolean),
 public.requeue_connected_stripe_retry(uuid,uuid),public.authorize_connected_stripe_retry(text),
 public.enable_connected_stripe_retry(text) to service_role;
