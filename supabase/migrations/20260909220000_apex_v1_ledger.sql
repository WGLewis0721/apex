-- APEX v1 ledger: source-aware grants, FIFO consumption, non-negative projection,
-- and source-scoped refund clawback. No reservations, signed snapshots, Redis,
-- worker service, or queue product in v1.

-- ---------------------------------------------------------------------
-- Projection: one hot-path balance row per workspace/customer.
-- The append-only ledger is audit history; this projection is the spend lock.
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

create index credit_accounts_customer_id_idx on public.credit_accounts (customer_id);
alter table public.credit_accounts enable row level security;
create policy "credit_accounts_select_member" on public.credit_accounts
  for select using (workspace_id in (select public.current_workspace_ids()));

-- Extend grants so every Stripe-funded unit remains attributable to its source.
alter table public.credit_grants
  add column source_stripe_event_id text,
  add column source_payment_id text,
  add column consumed_amount numeric not null default 0 check (consumed_amount >= 0),
  add column status text not null default 'open' check (status in ('open', 'exhausted', 'refunded', 'expired', 'revoked'));

alter table public.credit_grants
  add constraint credit_grants_amount_nonnegative check (amount >= 0),
  add constraint credit_grants_remaining_nonnegative check (remaining_amount >= 0),
  add constraint credit_grants_consumed_lte_amount check (consumed_amount <= amount),
  add constraint credit_grants_remaining_lte_amount check (remaining_amount <= amount),
  add constraint credit_grants_amount_reconciles check (consumed_amount + remaining_amount <= amount);

create index credit_grants_fifo_idx
  on public.credit_grants (workspace_id, customer_id, created_at, id)
  where remaining_amount > 0 and status = 'open';
create index credit_grants_source_event_idx
  on public.credit_grants (workspace_id, source_stripe_event_id)
  where source_stripe_event_id is not null;
create index credit_grants_source_payment_idx
  on public.credit_grants (workspace_id, source_payment_id)
  where source_payment_id is not null;

-- Append-only normalized ledger. Positive amount means units affected by the
-- entry; entry_type determines direction/meaning.
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

create index credit_ledger_customer_id_idx on public.credit_ledger (customer_id, created_at);
create index credit_ledger_grant_id_idx on public.credit_ledger (credit_grant_id);
create index credit_ledger_stripe_event_id_idx on public.credit_ledger (workspace_id, stripe_event_id)
  where stripe_event_id is not null;
alter table public.credit_ledger enable row level security;
create policy "credit_ledger_select_member" on public.credit_ledger
  for select using (workspace_id in (select public.current_workspace_ids()));

-- Connected Stripe event identity is scoped to the connection, not globally.
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

-- Preserve global uniqueness for APEX's own billing events, which have no
-- connected Stripe account row.
create unique index stripe_webhook_events_platform_event_idx
  on public.stripe_webhook_events (stripe_event_id)
  where stripe_connection_id is null;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.ensure_credit_account(
  p_workspace_id uuid,
  p_customer_id uuid
) returns public.credit_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.credit_accounts;
begin
  insert into public.credit_accounts (workspace_id, customer_id)
  values (p_workspace_id, p_customer_id)
  on conflict (workspace_id, customer_id) do nothing;

  select * into v_account
  from public.credit_accounts
  where workspace_id = p_workspace_id and customer_id = p_customer_id;

  return v_account;
end;
$$;

revoke all on function public.ensure_credit_account(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Grant: source-aware, idempotent, projection + grant row + ledger in one tx.
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
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.credit_ledger;
  v_grant public.credit_grants;
  v_account public.credit_accounts;
begin
  if p_amount <= 0 then raise exception 'amount_must_be_positive'; end if;

  select * into v_existing from public.credit_ledger
  where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key;
  if found then
    select * into v_account from public.credit_accounts
      where workspace_id = p_workspace_id and customer_id = p_customer_id;
    return jsonb_build_object('replayed', true, 'remaining', coalesce(v_account.remaining, 0), 'version', coalesce(v_account.version, 0));
  end if;

  perform public.ensure_credit_account(p_workspace_id, p_customer_id);

  select * into v_account from public.credit_accounts
  where workspace_id = p_workspace_id and customer_id = p_customer_id
  for update;

  insert into public.credit_grants (
    workspace_id, customer_id, feature_id, amount, remaining_amount,
    consumed_amount, source_stripe_event_id, source_payment_id, reason, status
  ) values (
    p_workspace_id, p_customer_id, p_feature_id, p_amount, p_amount,
    0, p_stripe_event_id, p_source_payment_id, p_reason, 'open'
  ) returning * into v_grant;

  update public.credit_accounts
  set remaining = remaining + p_amount,
      version = version + 1,
      updated_at = now()
  where id = v_account.id
  returning * into v_account;

  insert into public.credit_ledger (
    workspace_id, customer_id, credit_grant_id, entry_type, amount,
    idempotency_key, stripe_event_id, source_payment_id
  ) values (
    p_workspace_id, p_customer_id, v_grant.id, 'grant', p_amount,
    p_idempotency_key, p_stripe_event_id, p_source_payment_id
  );

  return jsonb_build_object('replayed', false, 'grant_id', v_grant.id, 'remaining', v_account.remaining, 'version', v_account.version);
end;
$$;

revoke all on function public.grant_credits(uuid, uuid, numeric, text, text, text, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Consume: projection decrement is atomic; grant burn is FIFO by created_at/id.
-- All grant mutations + ledger rows + projection commit together.
-- ---------------------------------------------------------------------
create or replace function public.consume_credits(
  p_workspace_id uuid,
  p_customer_id uuid,
  p_amount numeric,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.credit_ledger;
  v_account public.credit_accounts;
  v_grant public.credit_grants;
  v_to_burn numeric;
  v_take numeric;
  v_piece integer := 0;
begin
  if p_amount <= 0 then raise exception 'amount_must_be_positive'; end if;

  select * into v_existing from public.credit_ledger
  where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key;
  if found then
    select * into v_account from public.credit_accounts
      where workspace_id = p_workspace_id and customer_id = p_customer_id;
    return jsonb_build_object('replayed', true, 'allowed', true, 'remaining', coalesce(v_account.remaining, 0), 'version', coalesce(v_account.version, 0));
  end if;

  perform public.ensure_credit_account(p_workspace_id, p_customer_id);

  update public.credit_accounts
  set remaining = remaining - p_amount,
      version = version + 1,
      updated_at = now()
  where workspace_id = p_workspace_id
    and customer_id = p_customer_id
    and remaining >= p_amount
  returning * into v_account;

  if not found then
    select * into v_account from public.credit_accounts
    where workspace_id = p_workspace_id and customer_id = p_customer_id;
    return jsonb_build_object('replayed', false, 'allowed', false, 'remaining', coalesce(v_account.remaining, 0), 'version', coalesce(v_account.version, 0), 'reason', 'INSUFFICIENT_CREDITS');
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

    insert into public.credit_ledger (
      workspace_id, customer_id, credit_grant_id, entry_type, amount,
      idempotency_key, metadata
    ) values (
      p_workspace_id, p_customer_id, v_grant.id, 'consume', v_take,
      p_idempotency_key || ':grant:' || v_piece::text,
      jsonb_build_object('request_idempotency_key', p_idempotency_key)
    );

    v_to_burn := v_to_burn - v_take;
  end loop;

  if v_to_burn <> 0 then
    raise exception 'projection_grant_mismatch';
  end if;

  -- Anchor row gives request-level idempotency even when one consume burns many grants.
  insert into public.credit_ledger (
    workspace_id, customer_id, entry_type, amount, idempotency_key, metadata
  ) values (
    p_workspace_id, p_customer_id, 'consume', 0, p_idempotency_key,
    jsonb_build_object('aggregate', true, 'amount', p_amount)
  );

  return jsonb_build_object('replayed', false, 'allowed', true, 'consumed', p_amount, 'remaining', v_account.remaining, 'version', v_account.version);
end;
$$;

revoke all on function public.consume_credits(uuid, uuid, numeric, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Refund: source-scoped, claw back only unspent credits from originating
-- grant(s). Never negative. Already-spent units become unrecoverable audit.
-- ---------------------------------------------------------------------
create or replace function public.refund_unspent_credits(
  p_workspace_id uuid,
  p_customer_id uuid,
  p_source_stripe_event_id text,
  p_refund_amount numeric,
  p_idempotency_key text,
  p_refund_stripe_event_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.credit_ledger;
  v_account public.credit_accounts;
  v_grant public.credit_grants;
  v_requested numeric;
  v_recoverable numeric := 0;
  v_unrecoverable numeric := 0;
  v_take numeric;
  v_piece integer := 0;
begin
  if p_refund_amount <= 0 then raise exception 'refund_amount_must_be_positive'; end if;

  select * into v_existing from public.credit_ledger
  where workspace_id = p_workspace_id and idempotency_key = p_idempotency_key;
  if found then
    select * into v_account from public.credit_accounts
      where workspace_id = p_workspace_id and customer_id = p_customer_id;
    return jsonb_build_object('replayed', true, 'remaining', coalesce(v_account.remaining, 0), 'version', coalesce(v_account.version, 0));
  end if;

  perform public.ensure_credit_account(p_workspace_id, p_customer_id);
  select * into v_account from public.credit_accounts
  where workspace_id = p_workspace_id and customer_id = p_customer_id
  for update;

  v_requested := p_refund_amount;

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

    -- Recover at most the unspent part of this source grant.
    if v_grant.remaining_amount > 0 then
      declare v_claw numeric := least(v_grant.remaining_amount, v_take);
      begin
        update public.credit_grants
        set remaining_amount = remaining_amount - v_claw,
            status = case when remaining_amount - v_claw = 0 then 'refunded' else status end
        where id = v_grant.id;

        v_recoverable := v_recoverable + v_claw;

        insert into public.credit_ledger (
          workspace_id, customer_id, credit_grant_id, entry_type, amount,
          idempotency_key, stripe_event_id, source_payment_id, metadata
        ) values (
          p_workspace_id, p_customer_id, v_grant.id, 'refund', v_claw,
          p_idempotency_key || ':refund:' || v_piece::text,
          p_refund_stripe_event_id, v_grant.source_payment_id,
          jsonb_build_object('request_idempotency_key', p_idempotency_key, 'source_grant_event_id', p_source_stripe_event_id)
        );
      end;
    end if;

    v_unrecoverable := v_unrecoverable + greatest(0, v_take - least(v_grant.remaining_amount, v_take));
    v_requested := v_requested - v_take;
  end loop;

  if v_requested > 0 then
    -- Refund exceeds known originating grant amount; preserve the gap for audit.
    v_unrecoverable := v_unrecoverable + v_requested;
  end if;

  if v_recoverable > 0 then
    update public.credit_accounts
    set remaining = greatest(0, remaining - v_recoverable),
        version = version + 1,
        updated_at = now()
    where id = v_account.id
    returning * into v_account;
  end if;

  if v_unrecoverable > 0 then
    insert into public.credit_ledger (
      workspace_id, customer_id, entry_type, amount, idempotency_key,
      stripe_event_id, metadata
    ) values (
      p_workspace_id, p_customer_id, 'unrecoverable', v_unrecoverable,
      p_idempotency_key || ':unrecoverable', p_refund_stripe_event_id,
      jsonb_build_object('request_idempotency_key', p_idempotency_key, 'source_grant_event_id', p_source_stripe_event_id)
    );
  end if;

  insert into public.credit_ledger (
    workspace_id, customer_id, entry_type, amount, idempotency_key,
    stripe_event_id, metadata
  ) values (
    p_workspace_id, p_customer_id, 'refund', 0, p_idempotency_key,
    p_refund_stripe_event_id,
    jsonb_build_object('aggregate', true, 'requested', p_refund_amount, 'clawed_back', v_recoverable, 'unrecoverable_spent', v_unrecoverable)
  );

  select * into v_account from public.credit_accounts
  where workspace_id = p_workspace_id and customer_id = p_customer_id;

  return jsonb_build_object(
    'replayed', false,
    'clawed_back', v_recoverable,
    'unrecoverable_spent', v_unrecoverable,
    'remaining', v_account.remaining,
    'version', v_account.version
  );
end;
$$;

revoke all on function public.refund_unspent_credits(uuid, uuid, text, numeric, text, text) from public, anon, authenticated;

-- Read helpers for trusted API code. Browser clients should use the Edge API,
-- not call these privileged functions directly.
create or replace function public.get_credit_balance(p_workspace_id uuid, p_customer_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'remaining', coalesce(a.remaining, 0),
    'version', coalesce(a.version, 0),
    'as_of', now()
  )
  from (select 1) seed
  left join public.credit_accounts a
    on a.workspace_id = p_workspace_id and a.customer_id = p_customer_id;
$$;

revoke all on function public.get_credit_balance(uuid, uuid) from public, anon, authenticated;
