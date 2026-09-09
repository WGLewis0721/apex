-- Hardening for APEX v1 ledger operations.
-- Claims idempotency before state mutation, validates tenant ownership inside
-- privileged RPCs, and exposes the unsigned future-snapshot entitlements shape.

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
  if not exists (
    select 1 from public.customers
    where id = p_customer_id and workspace_id = p_workspace_id
  ) then
    raise exception 'customer_not_in_workspace';
  end if;

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
  v_claim uuid;
  v_grant public.credit_grants;
  v_account public.credit_accounts;
begin
  if p_amount <= 0 then raise exception 'amount_must_be_positive'; end if;
  perform public.ensure_credit_account(p_workspace_id, p_customer_id);

  insert into public.credit_ledger (
    workspace_id, customer_id, entry_type, amount, idempotency_key,
    stripe_event_id, source_payment_id, metadata
  ) values (
    p_workspace_id, p_customer_id, 'grant', 0, p_idempotency_key,
    p_stripe_event_id, p_source_payment_id,
    jsonb_build_object('aggregate', true, 'requested', p_amount)
  )
  on conflict (workspace_id, idempotency_key) do nothing
  returning id into v_claim;

  if v_claim is null then
    select * into v_account from public.credit_accounts
    where workspace_id = p_workspace_id and customer_id = p_customer_id;
    return jsonb_build_object('replayed', true, 'remaining', v_account.remaining, 'version', v_account.version);
  end if;

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
    p_idempotency_key || ':grant', p_stripe_event_id, p_source_payment_id
  );

  return jsonb_build_object(
    'replayed', false,
    'grant_id', v_grant.id,
    'remaining', v_account.remaining,
    'version', v_account.version
  );
end;
$$;
revoke all on function public.grant_credits(uuid, uuid, numeric, text, text, text, uuid, text) from public, anon, authenticated;

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
  v_claim uuid;
  v_account public.credit_accounts;
  v_grant public.credit_grants;
  v_to_burn numeric;
  v_take numeric;
  v_piece integer := 0;
begin
  if p_amount <= 0 then raise exception 'amount_must_be_positive'; end if;
  perform public.ensure_credit_account(p_workspace_id, p_customer_id);

  -- The aggregate row claims the request key before any balance mutation.
  -- Concurrent duplicate keys serialize on the unique constraint.
  insert into public.credit_ledger (
    workspace_id, customer_id, entry_type, amount, idempotency_key, metadata
  ) values (
    p_workspace_id, p_customer_id, 'consume', 0, p_idempotency_key,
    jsonb_build_object('aggregate', true, 'requested', p_amount)
  )
  on conflict (workspace_id, idempotency_key) do nothing
  returning id into v_claim;

  if v_claim is null then
    select * into v_account from public.credit_accounts
    where workspace_id = p_workspace_id and customer_id = p_customer_id;
    return jsonb_build_object('replayed', true, 'remaining', v_account.remaining, 'version', v_account.version);
  end if;

  -- This conditional UPDATE is the spend lock. It serializes competing spends
  -- without Redis/advisory locks and can never drive remaining below zero.
  update public.credit_accounts
  set remaining = remaining - p_amount,
      version = version + 1,
      updated_at = now()
  where workspace_id = p_workspace_id
    and customer_id = p_customer_id
    and remaining >= p_amount
  returning * into v_account;

  if not found then
    -- A DENY is not a spend operation; remove the request claim so a later retry
    -- after a new grant can be evaluated again under the same caller key only if
    -- the caller chooses to retry. No credit state changed in this transaction.
    delete from public.credit_ledger where id = v_claim;
    select * into v_account from public.credit_accounts
    where workspace_id = p_workspace_id and customer_id = p_customer_id;
    return jsonb_build_object(
      'replayed', false,
      'allowed', false,
      'remaining', v_account.remaining,
      'version', v_account.version,
      'reason', 'INSUFFICIENT_CREDITS'
    );
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

  return jsonb_build_object(
    'replayed', false,
    'allowed', true,
    'consumed', p_amount,
    'remaining', v_account.remaining,
    'version', v_account.version
  );
end;
$$;
revoke all on function public.consume_credits(uuid, uuid, numeric, text) from public, anon, authenticated;

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
  v_claim uuid;
  v_account public.credit_accounts;
  v_grant public.credit_grants;
  v_requested numeric := p_refund_amount;
  v_recoverable numeric := 0;
  v_unrecoverable numeric := 0;
  v_take numeric;
  v_claw numeric;
  v_piece integer := 0;
begin
  if p_refund_amount <= 0 then raise exception 'refund_amount_must_be_positive'; end if;
  perform public.ensure_credit_account(p_workspace_id, p_customer_id);

  insert into public.credit_ledger (
    workspace_id, customer_id, entry_type, amount, idempotency_key,
    stripe_event_id, metadata
  ) values (
    p_workspace_id, p_customer_id, 'refund', 0, p_idempotency_key,
    p_refund_stripe_event_id,
    jsonb_build_object('aggregate', true, 'requested', p_refund_amount, 'source_grant_event_id', p_source_stripe_event_id)
  )
  on conflict (workspace_id, idempotency_key) do nothing
  returning id into v_claim;

  if v_claim is null then
    select * into v_account from public.credit_accounts
    where workspace_id = p_workspace_id and customer_id = p_customer_id;
    return jsonb_build_object('replayed', true, 'remaining', v_account.remaining, 'version', v_account.version);
  end if;

  select * into v_account from public.credit_accounts
  where workspace_id = p_workspace_id and customer_id = p_customer_id
  for update;

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

    if v_claw > 0 then
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
    end if;

    v_unrecoverable := v_unrecoverable + greatest(0, v_take - v_claw);
    v_requested := v_requested - v_take;
  end loop;

  -- A refund larger than the known source grant is never allowed to steal
  -- credits from another grant. Preserve the unmatched amount as audit only.
  if v_requested > 0 then
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

create or replace function public.get_customer_entitlements(
  p_workspace_id uuid,
  p_customer_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
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

  perform public.ensure_credit_account(p_workspace_id, p_customer_id);
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
    'remaining', v_account.remaining,
    'version', v_account.version,
    'as_of', now()
  );
end;
$$;
revoke all on function public.get_customer_entitlements(uuid, uuid) from public, anon, authenticated;
