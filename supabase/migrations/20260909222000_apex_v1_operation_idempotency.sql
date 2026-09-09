-- Strict request idempotency lives outside the append-only ledger so retries
-- can return the original outcome without mutating audit rows.
create table public.credit_operations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  operation_type text not null check (operation_type in ('grant', 'consume', 'refund')),
  idempotency_key text not null,
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
  v_op uuid; v_result jsonb; v_grant public.credit_grants; v_account public.credit_accounts;
begin
  if p_amount <= 0 then raise exception 'amount_must_be_positive'; end if;
  perform public.ensure_credit_account(p_workspace_id, p_customer_id);

  insert into public.credit_operations(workspace_id,customer_id,operation_type,idempotency_key)
  values(p_workspace_id,p_customer_id,'grant',p_idempotency_key)
  on conflict (workspace_id,idempotency_key) do nothing returning id into v_op;
  if v_op is null then
    select result into v_result from public.credit_operations
    where workspace_id=p_workspace_id and idempotency_key=p_idempotency_key;
    return coalesce(v_result,'{"replayed":true}'::jsonb) || '{"replayed":true}'::jsonb;
  end if;

  select * into v_account from public.credit_accounts
  where workspace_id=p_workspace_id and customer_id=p_customer_id for update;

  insert into public.credit_grants(workspace_id,customer_id,feature_id,amount,remaining_amount,consumed_amount,source_stripe_event_id,source_payment_id,reason,status)
  values(p_workspace_id,p_customer_id,p_feature_id,p_amount,p_amount,0,p_stripe_event_id,p_source_payment_id,p_reason,'open')
  returning * into v_grant;

  update public.credit_accounts set remaining=remaining+p_amount,version=version+1,updated_at=now()
  where id=v_account.id returning * into v_account;

  insert into public.credit_ledger(workspace_id,customer_id,credit_grant_id,entry_type,amount,idempotency_key,stripe_event_id,source_payment_id)
  values(p_workspace_id,p_customer_id,v_grant.id,'grant',p_amount,p_idempotency_key||':grant',p_stripe_event_id,p_source_payment_id);

  v_result:=jsonb_build_object('replayed',false,'grant_id',v_grant.id,'remaining',v_account.remaining,'version',v_account.version);
  update public.credit_operations set status='succeeded',result=v_result,completed_at=now() where id=v_op;
  return v_result;
end $$;
revoke all on function public.grant_credits(uuid,uuid,numeric,text,text,text,uuid,text) from public,anon,authenticated;

create or replace function public.consume_credits(
  p_workspace_id uuid,
  p_customer_id uuid,
  p_amount numeric,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_op uuid; v_result jsonb; v_account public.credit_accounts; v_grant public.credit_grants;
  v_to_burn numeric; v_take numeric; v_piece integer:=0;
begin
  if p_amount <= 0 then raise exception 'amount_must_be_positive'; end if;
  perform public.ensure_credit_account(p_workspace_id,p_customer_id);

  insert into public.credit_operations(workspace_id,customer_id,operation_type,idempotency_key)
  values(p_workspace_id,p_customer_id,'consume',p_idempotency_key)
  on conflict (workspace_id,idempotency_key) do nothing returning id into v_op;
  if v_op is null then
    select result into v_result from public.credit_operations
    where workspace_id=p_workspace_id and idempotency_key=p_idempotency_key;
    return coalesce(v_result,'{"replayed":true}'::jsonb) || '{"replayed":true}'::jsonb;
  end if;

  update public.credit_accounts
  set remaining=remaining-p_amount,version=version+1,updated_at=now()
  where workspace_id=p_workspace_id and customer_id=p_customer_id and remaining>=p_amount
  returning * into v_account;

  if not found then
    select * into v_account from public.credit_accounts where workspace_id=p_workspace_id and customer_id=p_customer_id;
    v_result:=jsonb_build_object('replayed',false,'allowed',false,'remaining',v_account.remaining,'version',v_account.version,'reason','INSUFFICIENT_CREDITS');
    update public.credit_operations set status='denied',result=v_result,completed_at=now() where id=v_op;
    return v_result;
  end if;

  v_to_burn:=p_amount;
  for v_grant in
    select * from public.credit_grants
    where workspace_id=p_workspace_id and customer_id=p_customer_id and status='open' and remaining_amount>0
      and (expires_at is null or expires_at>now())
    order by created_at asc,id asc for update
  loop
    exit when v_to_burn<=0;
    v_take:=least(v_grant.remaining_amount,v_to_burn); v_piece:=v_piece+1;
    update public.credit_grants
    set remaining_amount=remaining_amount-v_take,consumed_amount=consumed_amount+v_take,
        status=case when remaining_amount-v_take=0 then 'exhausted' else status end
    where id=v_grant.id;
    insert into public.credit_ledger(workspace_id,customer_id,credit_grant_id,entry_type,amount,idempotency_key,metadata)
    values(p_workspace_id,p_customer_id,v_grant.id,'consume',v_take,p_idempotency_key||':grant:'||v_piece::text,
      jsonb_build_object('request_idempotency_key',p_idempotency_key));
    v_to_burn:=v_to_burn-v_take;
  end loop;
  if v_to_burn<>0 then raise exception 'projection_grant_mismatch'; end if;

  v_result:=jsonb_build_object('replayed',false,'allowed',true,'consumed',p_amount,'remaining',v_account.remaining,'version',v_account.version);
  update public.credit_operations set status='succeeded',result=v_result,completed_at=now() where id=v_op;
  return v_result;
end $$;
revoke all on function public.consume_credits(uuid,uuid,numeric,text) from public,anon,authenticated;

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
  v_op uuid; v_result jsonb; v_account public.credit_accounts; v_grant public.credit_grants;
  v_requested numeric:=p_refund_amount; v_recoverable numeric:=0; v_unrecoverable numeric:=0;
  v_take numeric; v_claw numeric; v_piece integer:=0;
begin
  if p_refund_amount<=0 then raise exception 'refund_amount_must_be_positive'; end if;
  perform public.ensure_credit_account(p_workspace_id,p_customer_id);

  insert into public.credit_operations(workspace_id,customer_id,operation_type,idempotency_key)
  values(p_workspace_id,p_customer_id,'refund',p_idempotency_key)
  on conflict (workspace_id,idempotency_key) do nothing returning id into v_op;
  if v_op is null then
    select result into v_result from public.credit_operations where workspace_id=p_workspace_id and idempotency_key=p_idempotency_key;
    return coalesce(v_result,'{"replayed":true}'::jsonb) || '{"replayed":true}'::jsonb;
  end if;

  select * into v_account from public.credit_accounts where workspace_id=p_workspace_id and customer_id=p_customer_id for update;

  for v_grant in
    select * from public.credit_grants
    where workspace_id=p_workspace_id and customer_id=p_customer_id and source_stripe_event_id=p_source_stripe_event_id
    order by created_at asc,id asc for update
  loop
    exit when v_requested<=0;
    v_piece:=v_piece+1; v_take:=least(v_grant.amount,v_requested); v_claw:=least(v_grant.remaining_amount,v_take);
    if v_claw>0 then
      update public.credit_grants set remaining_amount=remaining_amount-v_claw,
        status=case when remaining_amount-v_claw=0 then 'refunded' else status end where id=v_grant.id;
      v_recoverable:=v_recoverable+v_claw;
      insert into public.credit_ledger(workspace_id,customer_id,credit_grant_id,entry_type,amount,idempotency_key,stripe_event_id,source_payment_id,metadata)
      values(p_workspace_id,p_customer_id,v_grant.id,'refund',v_claw,p_idempotency_key||':refund:'||v_piece::text,
        p_refund_stripe_event_id,v_grant.source_payment_id,jsonb_build_object('source_grant_event_id',p_source_stripe_event_id));
    end if;
    v_unrecoverable:=v_unrecoverable+greatest(0,v_take-v_claw); v_requested:=v_requested-v_take;
  end loop;
  if v_requested>0 then v_unrecoverable:=v_unrecoverable+v_requested; end if;

  if v_recoverable>0 then
    update public.credit_accounts set remaining=greatest(0,remaining-v_recoverable),version=version+1,updated_at=now()
    where id=v_account.id returning * into v_account;
  end if;
  if v_unrecoverable>0 then
    insert into public.credit_ledger(workspace_id,customer_id,entry_type,amount,idempotency_key,stripe_event_id,metadata)
    values(p_workspace_id,p_customer_id,'unrecoverable',v_unrecoverable,p_idempotency_key||':unrecoverable',p_refund_stripe_event_id,
      jsonb_build_object('source_grant_event_id',p_source_stripe_event_id));
  end if;

  select * into v_account from public.credit_accounts where workspace_id=p_workspace_id and customer_id=p_customer_id;
  v_result:=jsonb_build_object('replayed',false,'clawed_back',v_recoverable,'unrecoverable_spent',v_unrecoverable,'remaining',v_account.remaining,'version',v_account.version);
  update public.credit_operations set status='succeeded',result=v_result,completed_at=now() where id=v_op;
  return v_result;
end $$;
revoke all on function public.refund_unspent_credits(uuid,uuid,text,numeric,text,text) from public,anon,authenticated;
