-- APEX v1 ledger contract tests. Run against migrated local Supabase.
begin;

insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-4000-8000-000000000401','ledger-owner@example.invalid','{}'),
 ('00000000-0000-4000-8000-000000000402','ledger-other@example.invalid','{}');

set local role service_role;

do $$
declare
  w uuid := '00000000-0000-4000-8000-000000000410';
  c uuid := '00000000-0000-4000-8000-000000000411';
  p uuid := '00000000-0000-4000-8000-000000000412';
  f uuid := '00000000-0000-4000-8000-000000000413';
  r jsonb;
begin
  insert into public.workspaces(id,name,slug,created_by)
  values(w,'Ledger Test','ledger-test','00000000-0000-4000-8000-000000000401');
  insert into public.workspace_members(workspace_id,user_id,role)
  values(w,'00000000-0000-4000-8000-000000000401','owner');
  insert into public.customers(id,workspace_id,external_id,email)
  values(c,w,'cust-ledger-1','customer@example.invalid');
  insert into public.plans(id,workspace_id,key,name) values(p,w,'pro','Pro');
  insert into public.features(id,workspace_id,key,name) values(f,w,'generate','Generate');
  insert into public.plan_features(plan_id,feature_id,limit_value) values(p,f,1000);
  insert into public.subscriptions(workspace_id,customer_id,plan_id,status)
  values(w,c,p,'active');

  -- Purchase A grants 1000 exactly once.
  r := public.grant_credits(w,c,1000,'grant:a','evt_purchase_a','pi_purchase_a',null,'purchase');
  if (r->>'remaining')::numeric <> 1000 then raise exception 'Grant A failed: %', r; end if;
  r := public.grant_credits(w,c,1000,'grant:a','evt_purchase_a','pi_purchase_a',null,'purchase');
  if coalesce((r->>'replayed')::boolean,false) is not true then raise exception 'Grant replay not detected'; end if;
  if (select count(*) from public.credit_grants where workspace_id=w and source_stripe_event_id='evt_purchase_a') <> 1 then
    raise exception 'Grant replay duplicated source grant';
  end if;

  -- First spend succeeds. A competing 750 spend sees only 250 and denies.
  r := public.consume_credits(w,c,750,'consume:first');
  if coalesce((r->>'allowed')::boolean,false) is not true or (r->>'remaining')::numeric <> 250 then
    raise exception 'First consume wrong: %', r;
  end if;
  r := public.consume_credits(w,c,750,'consume:second');
  if coalesce((r->>'allowed')::boolean,true) is not false or (r->>'remaining')::numeric <> 250 then
    raise exception 'Overspend was not denied: %', r;
  end if;
  -- A denied request is also idempotent.
  r := public.consume_credits(w,c,750,'consume:second');
  if coalesce((r->>'replayed')::boolean,false) is not true or coalesce((r->>'allowed')::boolean,true) is not false then
    raise exception 'Denied replay changed outcome: %', r;
  end if;

  -- Purchase B proves refund-of-A cannot steal from another grant.
  r := public.grant_credits(w,c,500,'grant:b','evt_purchase_b','pi_purchase_b',null,'purchase');
  if (r->>'remaining')::numeric <> 750 then raise exception 'Grant B failed: %', r; end if;

  r := public.refund_unspent_credits(w,c,'evt_purchase_a',1000,'refund:a','evt_refund_a');
  if (r->>'clawed_back')::numeric <> 250 or (r->>'unrecoverable_spent')::numeric <> 750 or (r->>'remaining')::numeric <> 500 then
    raise exception 'Source-aware refund wrong: %', r;
  end if;
  if (select remaining_amount from public.credit_grants where workspace_id=w and source_stripe_event_id='evt_purchase_b') <> 500 then
    raise exception 'Refund A stole from grant B';
  end if;
  if (select remaining from public.credit_accounts where workspace_id=w and customer_id=c) < 0 then
    raise exception 'Balance went negative';
  end if;

  -- Refund replay is a no-op.
  r := public.refund_unspent_credits(w,c,'evt_purchase_a',1000,'refund:a','evt_refund_a');
  if coalesce((r->>'replayed')::boolean,false) is not true or (r->>'remaining')::numeric <> 500 then
    raise exception 'Refund replay changed state: %', r;
  end if;
  if (select count(*) from public.credit_ledger where workspace_id=w and entry_type='unrecoverable') <> 1 then
    raise exception 'Refund replay duplicated unrecoverable audit';
  end if;

  -- Burn B to zero; next credit-gated consume is denied.
  r := public.consume_credits(w,c,500,'consume:b');
  if (r->>'remaining')::numeric <> 0 then raise exception 'Final consume failed: %', r; end if;
  r := public.consume_credits(w,c,1,'consume:empty');
  if coalesce((r->>'allowed')::boolean,true) is not false then raise exception 'Empty wallet allowed spend'; end if;

  -- Entitlements use the future snapshot shape now, unsigned.
  r := public.get_customer_entitlements(w,c);
  if (r->>'remaining')::numeric <> 0 or (r->>'version')::bigint < 1 or r->>'as_of' is null then
    raise exception 'Entitlements missing balance/version/as_of: %', r;
  end if;
  if r#>>'{plan,key}' <> 'pro' or jsonb_array_length(r->'features') <> 1 then
    raise exception 'Entitlements missing plan/features: %', r;
  end if;

  -- Ledger and grant allocation reconcile with the projection.
  if exists(select 1 from public.credit_grants where workspace_id=w and remaining_amount < 0) then
    raise exception 'Grant remaining went negative';
  end if;
  if (select remaining from public.credit_accounts where workspace_id=w and customer_id=c) <> 0 then
    raise exception 'Projection mismatch at end of test';
  end if;
end $$;

reset role;

-- Workspace owner may read ledger state but cannot execute privileged mutation RPCs.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000401',true);
do $$
begin
  if (select count(*) from public.credit_accounts) <> 1 then raise exception 'Owner cannot read credit account'; end if;
  if not exists(select 1 from public.credit_ledger) then raise exception 'Owner cannot read ledger audit'; end if;
  begin
    perform public.consume_credits('00000000-0000-4000-8000-000000000410','00000000-0000-4000-8000-000000000411',1,'browser-must-fail');
    raise exception 'Privileged consume RPC exposed';
  exception when insufficient_privilege then null; end;
end $$;

-- Unrelated authenticated user sees no tenant credit state.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000402',true);
do $$ begin
  if exists(select 1 from public.credit_accounts) or exists(select 1 from public.credit_ledger) or exists(select 1 from public.credit_operations) then
    raise exception 'Cross-workspace credit state exposed';
  end if;
end $$;

reset role;
rollback;
