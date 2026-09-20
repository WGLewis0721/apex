-- Phase 6.4 — expiring-grant reconciliation.
--
-- `credit_grants.expires_at` already existed and `consume_credits` already skipped
-- expired grants, but the expired remainder stayed inside
-- `credit_accounts.remaining`, so an expired grant kept inflating the spendable
-- projection while being unusable. That is the gap the roadmap's "Expiry
-- boundary" note describes, and it is the reason frozen v1 grants had to be
-- non-expiring.
--
-- This migration reconciles expired remainders out of the projection inside the
-- same transactional boundary used by grant/consume/refund, appends the
-- append-only audit entry, and stays replay-safe.
--
-- Deliberately NOT added here: reservations, a debt ledger, a queue product, a
-- second grant/consume write path, or a new runtime. Scheduling remains ordinary
-- Postgres/Supabase scheduling driven by the hosted maintenance endpoint.

-- ---------------------------------------------------------------------
-- Append-only ledger gains one new, non-negative entry type. Existing entry
-- types and rows are untouched.
-- ---------------------------------------------------------------------
alter table public.credit_ledger
  drop constraint credit_ledger_entry_type_check;
alter table public.credit_ledger
  add constraint credit_ledger_entry_type_check
  check (entry_type in ('grant', 'consume', 'refund', 'unrecoverable', 'expire'));

-- Reconciliation scan index: only grants that can still lose value to expiry.
create index credit_grants_expiry_due_idx
  on public.credit_grants (workspace_id, expires_at)
  where status = 'open' and remaining_amount > 0 and expires_at is not null;

-- ---------------------------------------------------------------------
-- Expire: projection decrement + per-grant mutation + ledger append in one
-- transaction, exactly like consume and refund.
--
-- Replay safety comes from grant state: an expired grant is set to
-- remaining_amount = 0 / status = 'expired' and can never be selected again, and
-- the ledger idempotency key is derived from the grant id, so a concurrent or
-- repeated run cannot double-count. Balance can never go negative; the
-- projection decrement is guarded by `remaining >= v_total`.
-- ---------------------------------------------------------------------
create or replace function public.expire_credit_grants(
  p_workspace_id uuid,
  p_customer_id uuid default null,
  p_as_of timestamptz default now(),
  p_limit integer default 500
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_grant public.credit_grants;
  v_account public.credit_accounts;
  v_expired numeric := 0;
  v_grant_count integer := 0;
  v_customers jsonb := '[]'::jsonb;
  v_details jsonb := '[]'::jsonb;
begin
  if p_limit is null or p_limit <= 0 then
    raise exception 'limit_must_be_positive';
  end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers
    where id = p_customer_id and workspace_id = p_workspace_id
  ) then
    raise exception 'customer_not_in_workspace';
  end if;

  for v_grant in
    select * from public.credit_grants
    where workspace_id = p_workspace_id
      and (p_customer_id is null or customer_id = p_customer_id)
      and status = 'open'
      and remaining_amount > 0
      and expires_at is not null
      and expires_at <= p_as_of
    order by expires_at asc, id asc
    limit p_limit
    for update
  loop
    -- Lock the projection row for this grant's customer before mutating it.
    select * into v_account from public.credit_accounts
    where workspace_id = p_workspace_id and customer_id = v_grant.customer_id
    for update;

    update public.credit_grants
    set remaining_amount = 0,
        status = 'expired'
    where id = v_grant.id;

    insert into public.credit_ledger(
      workspace_id, customer_id, credit_grant_id, entry_type, amount,
      idempotency_key, stripe_event_id, source_payment_id, metadata
    ) values (
      p_workspace_id, v_grant.customer_id, v_grant.id, 'expire', v_grant.remaining_amount,
      'expire:' || v_grant.id::text, v_grant.source_stripe_event_id, v_grant.source_payment_id,
      jsonb_build_object(
        'reason', 'GRANT_EXPIRED',
        'expires_at', v_grant.expires_at,
        'as_of', p_as_of
      )
    );

    if v_account.id is not null then
      update public.credit_accounts
      set remaining = remaining - v_grant.remaining_amount,
          version = version + 1,
          updated_at = now()
      where id = v_account.id and remaining >= v_grant.remaining_amount;
      if not found then raise exception 'projection_grant_mismatch'; end if;
    elsif v_grant.remaining_amount > 0 then
      raise exception 'projection_grant_mismatch';
    end if;

    v_expired := v_expired + v_grant.remaining_amount;
    v_grant_count := v_grant_count + 1;
    if not v_customers ? v_grant.customer_id::text then
      v_customers := v_customers || to_jsonb(v_grant.customer_id::text);
    end if;
    v_details := v_details || jsonb_build_object(
      'grant_id', v_grant.id,
      'customer_id', v_grant.customer_id,
      'expired_amount', v_grant.remaining_amount,
      'expires_at', v_grant.expires_at,
      'source_payment_id', v_grant.source_payment_id
    );
  end loop;

  return jsonb_build_object(
    'as_of', p_as_of,
    'expired_grants', v_grant_count,
    'expired_amount', v_expired,
    'customers_affected', jsonb_array_length(v_customers),
    'grants', v_details,
    -- true means another page of due grants may remain for this workspace.
    'more_available', v_grant_count = p_limit
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Read-only reconciliation check: does the projection still equal the sum of
-- spendable (open, unexpired) grant remainders? Support and operators use this
-- to explain a balance without trusting the projection blindly.
-- ---------------------------------------------------------------------
create or replace function public.check_credit_reconciliation(
  p_workspace_id uuid,
  p_customer_id uuid
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_account public.credit_accounts;
  v_spendable numeric := 0;
  v_expired_unreconciled numeric := 0;
begin
  if not exists (
    select 1 from public.customers
    where id = p_customer_id and workspace_id = p_workspace_id
  ) then
    raise exception 'customer_not_in_workspace';
  end if;

  select * into v_account from public.credit_accounts
  where workspace_id = p_workspace_id and customer_id = p_customer_id;

  select
    coalesce(sum(remaining_amount) filter (where expires_at is null or expires_at > now()), 0),
    coalesce(sum(remaining_amount) filter (where expires_at is not null and expires_at <= now()), 0)
  into v_spendable, v_expired_unreconciled
  from public.credit_grants
  where workspace_id = p_workspace_id
    and customer_id = p_customer_id
    and status = 'open'
    and remaining_amount > 0;

  return jsonb_build_object(
    'customer_id', p_customer_id,
    'projected_remaining', coalesce(v_account.remaining, 0),
    'spendable_grant_remaining', v_spendable,
    'expired_unreconciled_remaining', v_expired_unreconciled,
    'reconciled', coalesce(v_account.remaining, 0) = v_spendable + v_expired_unreconciled,
    'expiry_reconciliation_pending', v_expired_unreconciled > 0,
    'as_of', now()
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Privilege boundary matches the rest of the v1 ledger: service-role Edge
-- Functions only. Workspace members keep RLS-scoped table reads.
-- ---------------------------------------------------------------------
revoke all on function public.expire_credit_grants(uuid, uuid, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.check_credit_reconciliation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.expire_credit_grants(uuid, uuid, timestamptz, integer) to service_role;
grant execute on function public.check_credit_reconciliation(uuid, uuid) to service_role;

comment on function public.expire_credit_grants(uuid, uuid, timestamptz, integer) is
  'APEX Phase 6.4 expiry reconciliation: moves expired grant remainders out of the balance projection with an append-only expire ledger entry. Replay-safe and never negative.';
comment on function public.check_credit_reconciliation(uuid, uuid) is
  'APEX Phase 6.4 read-only reconciliation: compares the balance projection against open grant remainders and reports pending expiry reconciliation.';
