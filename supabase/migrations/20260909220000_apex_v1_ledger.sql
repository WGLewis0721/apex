-- APEX v1 ledger: authoritative Postgres balance projection + append-only audit,
-- source-aware grants, FIFO consumption, strict idempotency, and non-negative
-- source-scoped refund clawback.
--
-- Deliberately NOT v1: reservations, signed snapshots, local SDK evaluation,
-- /check, Redis, Kafka, ClickHouse, AWS, dedicated workers, or a queue product.

-- ---------------------------------------------------------------------
-- Hot-path balance projection. This row is the spend/concurrency boundary.
-- The ledger remains the audit trail; do not SUM the ledger on every request.
-- ---------------------------------------------------------------------
create table public.credit_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  remaining numeric not null default 0 check (remaining >= 0),
  version bigint not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, customer_id)
);
create index credit_accounts_customer_idx on public.credit_accounts (customer_id);
alter table public.credit_accounts enable row level security;
create policy "credit_accounts_select_member" on public.credit_accounts
  for select using (workspace_id in (select public.current_workspace_ids()));

-- ---------------------------------------------------------------------
-- Per-grant attribution. A refund of purchase A may only claw back the
-- unspent remainder of grant(s) created by purchase A. Grant B is untouchable.
-- ---------------------------------------------------------------------
alter table public.credit_grants
  add column source_stripe_event_id text,
  add column source_payment_id text,
  add column consumed_amount numeric not null default 0 check (consumed_amount >= 0),
  add column status text not null default 'open'
    check (status in ('open', 'exhausted', 'refunded', 'expired', 'revoked'));

alter table public.credit_grants
  add constraint credit_grants_amount_nonnegative check (amount >= 0),
  add constraint credit_grants_remaining_nonnegative check (remaining_amount >= 0),
  add constraint credit_grants_consumed_lte_amount check (consumed_amount <= amount),
  add constraint credit_grants_remaining_lte_amount check (remaining_amount <= amount),
  add constraint credit_grants_amount_reconciles check (consumed_amount + remaining_amount <= amount);

create index credit_grants_fifo_idx
  on public.credit_grants (workspace_id, customer_id, created_at, id)
  where status = 'open' and remaining_amount > 0;
create index credit_grants_source_event_idx
  on public.credit_grants (workspace_id, source_stripe_event_id)
  where source_stripe_event_id is not null;
create index credit_grants_source_payment_idx
  on public.credit_grants (workspace_id, source_payment_id)
  where source_payment_id is not null;

-- ---------------------------------------------------------------------
-- Append-only normalized ledger. `amount` is always non-negative; entry_type
-- determines meaning. Audit rows are never rewritten to make the balance look
-- right. Mutability for request status belongs in credit_operations below.
-- ---------------------------------------------------------------------
create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  credit_grant_id uuid references public.credit_grants (id) on delete set null,
  entry_type text not null check (entry_type in ('grant', 'consume', 'refund', 'unrecoverable')),
  amount numeric not null check (amount >= 0),
  idempotency_key text not null,
  stripe_event_id text,
  source_payment_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (workspace_id, idempotency_key)
);
create index credit_ledger_customer_idx on public.credit_ledger (customer_id, created_at);
create index credit_ledger_grant_idx on public.credit_ledger (credit_grant_id);
create index credit_ledger_stripe_event_idx on public.credit_ledger (workspace_id, stripe_event_id)
  where stripe_event_id is not null;
alter table public.credit_ledger enable row level security;
create policy "credit_ledger_select_member" on public.credit_ledger
  for select using (workspace_id in (select public.current_workspace_ids()));

-- ---------------------------------------------------------------------
-- Request idempotency. The operation row is mutable; the ledger is not.
-- Concurrent duplicate keys serialize on the unique constraint and return
-- the original result after the first transaction commits.
-- ---------------------------------------------------------------------
create table public.credit_operations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  operation_type text not null check (operation_type in ('grant', 'consume', 'refund')),
  idempotency_key text not null,
  request jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'denied')),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (workspace_id, idempotency_key)
);
create index credit_operations_customer_idx on public.credit_operations (customer_id, created_at);
alter table public.credit_operations enable row level security;
create policy "credit_operations_select_member" on public.credit_operations
  for select using (workspace_id in (select public.current_workspace_ids()));

-- ---------------------------------------------------------------------
-- Connected Stripe event identity is scoped to the Stripe connection. APEX's
-- own platform billing events remain globally unique in the null-connection
-- partition.
-- ---------------------------------------------------------------------
alter table public.stripe_webhook_events
  add column stripe_connection_id uuid references public.stripe_connections (id) on delete set null,
  add column last_error text,
  add column attempt_count integer not null default 0 check (attempt_count >= 0),
  add column updated_at timestamptz not null default now();

alter table public.stripe_webhook_events
  drop constraint if exists stripe_webhook_events_stripe_event_id_key;

create unique index stripe_webhook_events_connection_event_idx
  on public.stripe_webhook_events (stripe_connection_id, stripe_event_id)
  where stripe_connection_id is not null;
create unique index stripe_webhook_events_platform_event_idx
  on public.stripe_webhook_events (stripe_event_id)
  where stripe_connection_id is null;

-- ---------------------------------------------------------------------
-- Internal helper: validate tenant ownership before creating/reading account.
-- ---------------------------------------------------------------------
create or replace function public.ensure_credit_account(
  p_workspace_id uuid,
  p_customer_id uuid
) returns public.credit_accounts
language plpgsql security definer set search_path = public
as $$
declare
  v_account public.credit_accounts;
begin
  if not exists (
    select 1 from public.customers
    where id = p_customer_id and workspace_id = p_workspace_id
  ) then
    raise exception 'customer_not_in_workspace';
  end if;

  insert into public.credit_accounts (workspace_id, customer_id)
  values (p_workspace_id, p_customer_id)
  on conflict (workspace_id, customer_id) do nothing;

  select * into v_account from public.credit_accounts
  where workspace_id = p_workspace_id and customer_id = p_customer_id;
  return v_account;
end;
$$;

-- ---------------------------------------------------------------------
-- Read APIs. These do not mutate state.
-- ---------------------------------------------------------------------
create or replace function public.get_credit_balance(
  p_workspace_id uuid,
  p_customer_id uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
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

  return jsonb_build_object(
    'remaining', coalesce(v_account.remaining, 0),
    'version', coalesce(v_account.version, 0),
    'as_of', now()
  );
end;
$$;

create or replace function public.get_customer_entitlements(
  p_workspace_id uuid,
  p_customer_id uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_account public.credit_accounts;
  v_customer public.customers;
  v_subscription public.subscriptions;
  v_plan public.plans;
  v_features jsonb := '[]'::jsonb;
begin
  select * into v_customer from public.customers
  where id = p_customer_id and workspace_id = p_workspace_id;
  if not found then raise exception 'customer_not_in_workspace'; end if;

  select * into v_account from public.credit_accounts
  where workspace_id = p_workspace_id and customer_id = p_customer_id;

  select * into v_subscription
  from public.subscriptions
  where workspace_id = p_workspace_id and customer_id = p_customer_id
  order by created_at desc
  limit 1;

  if v_subscription.id is not null then
    select * into v_plan from public.plans where id = v_subscription.plan_id;
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', f.key,
      'name', f.name,
      'limit', pf.limit_value
    ) order by f.key), '[]'::jsonb)
    into v_features
    from public.plan_features pf
    join public.features f on f.id = pf.feature_id
    where pf.plan_id = v_subscription.plan_id and f.is_active;
  end if;

  return jsonb_build_object(
    'customer_id', p_customer_id,
    'customer_status', v_customer.status,
    'subscription_status', v_subscription.status,
    'plan', case when v_plan.id is null then null else jsonb_build_object('key', v_plan.key, 'name', v_plan.name) end,
    'features', v_features,
    'remaining', coalesce(v_account.remaining, 0),
    'version', coalesce(v_account.version, 0),
    'as_of', now()
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Grant: projection + source-attributed grant + ledger in one transaction.
-- ---------------------------------------------------------------------
create or replace function public.grant_credits(
  p_workspace_id uuid,
  p_customer_id uuid,
  p_amount numeric,
  p_idempotency_key text,
  p_stripe_event_id text default null,
  p_source_payment_id text default null,
  p_feature_id uuid default null,
  p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_op uuid;
  v_existing public.credit_operations;
  v_request jsonb;
  v_result jsonb;
  v_grant public.credit_grants;
  v_account public.credit_accounts;
begin
  if p_amount <= 0 then raise exception 'amount_must_be_positive'; end if;
  perform public.ensure_credit_account(p_workspace_id, p_customer_id);
  v_request := jsonb_build_object('amount', p_amount, 'stripe_event_id', p_stripe_event_id, 'source_payment_id', p_source_payment_id, 'feature_id', p_feature_id);

  insert into public.credit_operations(workspace_id,customer_id,operation_type,idempotency_key,request)
  values(p_workspace_id,p_customer_id,'grant',p_idempotency_key,v_request)
  on conflict (workspace_id,idempotency_key) do nothing returning id into v_op;

  if v_op is null then
    select * into v_existing from public.credit_operations
    where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key;
    if v_existing.customer_id <> p_customer_id or v_existing.operation_type <> 'grant' or v_existing.request <> v_request then
      raise exception 'idempotency_key_reused';
    end if;
    return coalesce(v_existing.result, '{}'::jsonb) || '{"replayed":true}'::jsonb;
  end if;

  select * into v_account from public.credit_accounts
  where workspace_id = p_workspace_id and customer_id = p_customer_id for update;

  insert into public.credit_grants(
    workspace_id,customer_id,feature_id,amount,remaining_amount,consumed_amount,
    source_stripe_event_id,source_payment_id,reason,status
  ) values(
    p_workspace_id,p_customer_id,p_feature_id,p_amount,p_amount,0,
    p_stripe_event_id,p_source_payment_id,p_reason,'open'
  ) returning * into v_grant;

  update public.credit_accounts
  set remaining = remaining + p_amount, version = version + 1, updated_at = now()
  where id = v_account.id returning * into v_account;

  insert into public.credit_ledger(
    workspace_id,customer_id,credit_grant_id,entry_type,amount,idempotency_key,
    stripe_event_id,source_payment_id
  ) values(
    p_workspace_id,p_customer_id,v_grant.id,'grant',p_amount,p_idempotency_key||':grant',
    p_stripe_event_id,p_source_payment_id
  );

  v_result := jsonb_build_object('replayed',false,'grant_id',v_grant.id,'remaining',v_account.remaining,'version',v_account.version);
  update public.credit_operations set status='succeeded',result=v_result,completed_at=now() where id=v_op;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- Consume: one atomic spend. The conditional projection UPDATE is the lock.
-- Once it succeeds, the same transaction FIFO-burns oldest open grants.
-- ---------------------------------------------------------------------
create or replace function public.consume_credits(
  p_workspace_id uuid,
  p_customer_id uuid,
  p_amount numeric,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_op uuid;
  v_existing public.credit_operations;
  v_request jsonb;
  v_result jsonb;
  v_account public.credit_accounts;
  v_grant public.credit_grants;
  v_to_burn numeric;
  v_take numeric;
  v_piece integer := 0;
begin
  if p_amount <= 0 then raise exception 'amount_must_be_positive'; end if;
  perform public.ensure_credit_account(p_workspace_id, p_customer_id);
  v_request := jsonb_build_object('amount', p_amount);

  insert into public.credit_operations(workspace_id,customer_id,operation_type,idempotency_key,request)
  values(p_workspace_id,p_customer_id,'consume',p_idempotency_key,v_request)
  on conflict (workspace_id,idempotency_key) do nothing returning id into v_op;

  if v_op is null then
    select * into v_existing from public.credit_operations
    where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key;
    if v_existing.customer_id <> p_customer_id or v_existing.operation_type <> 'consume' or v_existing.request <> v_request then
      raise exception 'idempotency_key_reused';
    end if;
    return coalesce(v_existing.result, '{}'::jsonb) || '{"replayed":true}'::jsonb;
  end if;

  update public.credit_accounts
  set remaining = remaining - p_amount, version = version + 1, updated_at = now()
  where workspace_id = p_workspace_id and customer_id = p_customer_id and remaining >= p_amount
  returning * into v_account;

  if not found then
    select * into v_account from public.credit_accounts
    where workspace_id = p_workspace_id and customer_id = p_customer_id;
    v_result := jsonb_build_object('replayed',false,'allowed',false,'remaining',v_account.remaining,'version',v_account.version,'reason','INSUFFICIENT_CREDITS');
    update public.credit_operations set status='denied',result=v_result,completed_at=now() where id=v_op;
    return v_result;
  end if;

  v_to_burn := p_amount;
  for v_grant in
    select * from public.credit_grants
    where workspace_id = p_workspace_id
      and customer_id = p_customer_id
      and status = 'open'
      and remaining_amount > 0
      and (expires_at is null or expires_at > now())
    order by created_at asc, id asc
    for update
  loop
    exit when v_to_burn <= 0;
    v_take := least(v_grant.remaining_amount, v_to_burn);
    v_piece := v_piece + 1;

    update public.credit_grants
    set remaining_amount = remaining_amount - v_take,
        consumed_amount = consumed_amount + v_take,
        status = case when remaining_amount - v_take = 0 then 'exhausted' else status end
    where id = v_grant.id;

    insert into public.credit_ledger(
      workspace_id,customer_id,credit_grant_id,entry_type,amount,idempotency_key,metadata
    ) values(
      p_workspace_id,p_customer_id,v_grant.id,'consume',v_take,
      p_idempotency_key||':grant:'||v_piece::text,
      jsonb_build_object('request_idempotency_key',p_idempotency_key)
    );

    v_to_burn := v_to_burn - v_take;
  end loop;

  if v_to_burn <> 0 then raise exception 'projection_grant_mismatch'; end if;

  v_result := jsonb_build_object('replayed',false,'allowed',true,'consumed',p_amount,'remaining',v_account.remaining,'version',v_account.version);
  update public.credit_operations set status='succeeded',result=v_result,completed_at=now() where id=v_op;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- Refund: p_refund_amount is a CREDIT quantity to revoke, not a dollar value.
-- Claw back only unspent units from the originating source grant(s). Already
-- consumed units are recorded as unrecoverable_spent. No debt, no negative.
-- ---------------------------------------------------------------------
create or replace function public.refund_unspent_credits(
  p_workspace_id uuid,
  p_customer_id uuid,
  p_source_stripe_event_id text,
  p_refund_amount numeric,
  p_idempotency_key text,
  p_refund_stripe_event_id text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_op uuid;
  v_existing public.credit_operations;
  v_request jsonb;
  v_result jsonb;
  v_account public.credit_accounts;
  v_grant public.credit_grants;
  v_requested numeric := p_refund_amount;
  v_recoverable numeric := 0;
  v_unrecoverable numeric := 0;
  v_unrecoverable_piece numeric;
  v_take numeric;
  v_claw numeric;
  v_piece integer := 0;
begin
  if p_refund_amount <= 0 then raise exception 'refund_amount_must_be_positive'; end if;
  perform public.ensure_credit_account(p_workspace_id, p_customer_id);
  v_request := jsonb_build_object('source_stripe_event_id',p_source_stripe_event_id,'refund_amount',p_refund_amount,'refund_stripe_event_id',p_refund_stripe_event_id);

  insert into public.credit_operations(workspace_id,customer_id,operation_type,idempotency_key,request)
  values(p_workspace_id,p_customer_id,'refund',p_idempotency_key,v_request)
  on conflict (workspace_id,idempotency_key) do nothing returning id into v_op;

  if v_op is null then
    select * into v_existing from public.credit_operations
    where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key;
    if v_existing.customer_id <> p_customer_id or v_existing.operation_type <> 'refund' or v_existing.request <> v_request then
      raise exception 'idempotency_key_reused';
    end if;
    return coalesce(v_existing.result, '{}'::jsonb) || '{"replayed":true}'::jsonb;
  end if;

  select * into v_account from public.credit_accounts
  where workspace_id = p_workspace_id and customer_id = p_customer_id for update;

  for v_grant in
    select * from public.credit_grants
    where workspace_id = p_workspace_id
      and customer_id = p_customer_id
      and source_stripe_event_id = p_source_stripe_event_id
    order by created_at asc, id asc
    for update
  loop
    exit when v_requested <= 0;
    v_piece := v_piece + 1;
    v_take := least(v_grant.amount, v_requested);
    v_claw := least(v_grant.remaining_amount, v_take);
    v_unrecoverable_piece := greatest(0, v_take - v_claw);

    if v_claw > 0 then
      update public.credit_grants
      set remaining_amount = remaining_amount - v_claw,
          status = case when remaining_amount - v_claw = 0 then 'refunded' else status end
      where id = v_grant.id;

      v_recoverable := v_recoverable + v_claw;
      insert into public.credit_ledger(
        workspace_id,customer_id,credit_grant_id,entry_type,amount,idempotency_key,
        stripe_event_id,source_payment_id,metadata
      ) values(
        p_workspace_id,p_customer_id,v_grant.id,'refund',v_claw,
        p_idempotency_key||':refund:'||v_piece::text,
        p_refund_stripe_event_id,v_grant.source_payment_id,
        jsonb_build_object('source_grant_event_id',p_source_stripe_event_id)
      );
    end if;

    if v_unrecoverable_piece > 0 then
      v_unrecoverable := v_unrecoverable + v_unrecoverable_piece;
      insert into public.credit_ledger(
        workspace_id,customer_id,credit_grant_id,entry_type,amount,idempotency_key,
        stripe_event_id,source_payment_id,metadata
      ) values(
        p_workspace_id,p_customer_id,v_grant.id,'unrecoverable',v_unrecoverable_piece,
        p_idempotency_key||':unrecoverable:'||v_piece::text,
        p_refund_stripe_event_id,v_grant.source_payment_id,
        jsonb_build_object('source_grant_event_id',p_source_stripe_event_id)
      );
    end if;

    v_requested := v_requested - v_take;
  end loop;

  -- Never steal from another purchase. Any requested credit reversal beyond
  -- the known source grants is audit-only unrecoverable state.
  if v_requested > 0 then
    v_unrecoverable := v_unrecoverable + v_requested;
    insert into public.credit_ledger(
      workspace_id,customer_id,entry_type,amount,idempotency_key,stripe_event_id,metadata
    ) values(
      p_workspace_id,p_customer_id,'unrecoverable',v_requested,
      p_idempotency_key||':unrecoverable:unmatched',p_refund_stripe_event_id,
      jsonb_build_object('source_grant_event_id',p_source_stripe_event_id,'unmatched_source_amount',true)
    );
  end if;

  if v_recoverable > 0 then
    update public.credit_accounts
    set remaining = remaining - v_recoverable, version = version + 1, updated_at = now()
    where id = v_account.id and remaining >= v_recoverable
    returning * into v_account;
    if not found then raise exception 'projection_grant_mismatch'; end if;
  end if;

  select * into v_account from public.credit_accounts
  where workspace_id = p_workspace_id and customer_id = p_customer_id;

  v_result := jsonb_build_object(
    'replayed',false,
    'clawed_back',v_recoverable,
    'unrecoverable_spent',v_unrecoverable,
    'remaining',v_account.remaining,
    'version',v_account.version
  );
  update public.credit_operations set status='succeeded',result=v_result,completed_at=now() where id=v_op;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- Privilege boundary: service-role Edge Functions only for privileged RPCs.
-- Authenticated workspace members may read their RLS-scoped audit/projection
-- tables, but cannot mutate credits through PostgREST.
-- ---------------------------------------------------------------------
revoke all on function public.ensure_credit_account(uuid,uuid) from public,anon,authenticated;
revoke all on function public.get_credit_balance(uuid,uuid) from public,anon,authenticated;
revoke all on function public.get_customer_entitlements(uuid,uuid) from public,anon,authenticated;
revoke all on function public.grant_credits(uuid,uuid,numeric,text,text,text,uuid,text) from public,anon,authenticated;
revoke all on function public.consume_credits(uuid,uuid,numeric,text) from public,anon,authenticated;
revoke all on function public.refund_unspent_credits(uuid,uuid,text,numeric,text,text) from public,anon,authenticated;

grant execute on function public.ensure_credit_account(uuid,uuid) to service_role;
grant execute on function public.get_credit_balance(uuid,uuid) to service_role;
grant execute on function public.get_customer_entitlements(uuid,uuid) to service_role;
grant execute on function public.grant_credits(uuid,uuid,numeric,text,text,text,uuid,text) to service_role;
grant execute on function public.consume_credits(uuid,uuid,numeric,text) to service_role;
grant execute on function public.refund_unspent_credits(uuid,uuid,text,numeric,text,text) to service_role;

comment on table public.credit_accounts is 'APEX v1 hot-path spendable balance projection; locked/updated transactionally with grant/consume/refund ledger writes.';
comment on table public.credit_ledger is 'APEX v1 append-only product-credit audit ledger.';
comment on table public.credit_operations is 'APEX v1 request idempotency and immutable-outcome replay state; separate from append-only ledger.';
