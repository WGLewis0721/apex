-- APEX billing only. Stripe Connect and downstream customer billing are unchanged.
-- Membership may read its own rows without recursively querying itself.
drop policy workspace_members_select_member on public.workspace_members;
create policy workspace_members_select_own on public.workspace_members
  for select to authenticated using (user_id = (select auth.uid()));

alter table public.api_keys rename column secret_key_once to secret_key_ciphertext;
comment on column public.api_keys.secret_key_ciphertext is 'AES-256-GCM ciphertext; encryption key lives only in Edge Function secrets.';

update public.plans set stripe_price_id_setup = 'price_1UDVvQCsDEFORFLNZRqlVSYU',
  stripe_price_id_recurring = 'price_1UDVvWCsDEFORFLNbwjiwxmI'
where workspace_id is null and key = 'founding';
alter table public.subscriptions drop constraint subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('incomplete','incomplete_expired','trialing','active','past_due','canceled','unpaid','paused'));

-- Exists before a workspace does. One initial purchase per authenticated account.
create table public.apex_billing_accounts (
  user_id uuid primary key references auth.users(id),
  attempt_id uuid not null default gen_random_uuid(),
  attempt_created_at timestamptz not null default now(),
  checkout_email text not null,
  checkout_session_id text unique,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  workspace_id uuid unique references public.workspaces(id),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid')),
  subscription_status text,
  initial_amount_paid integer,
  initial_invoice_id text,
  paid_at timestamptz,
  last_subscription_event bigint not null default 0
);
alter table public.apex_billing_accounts enable row level security;
revoke all on public.apex_billing_accounts from anon, authenticated;
grant select on public.apex_billing_accounts to authenticated;
create policy apex_billing_select_own on public.apex_billing_accounts
  for select to authenticated using (user_id = (select auth.uid()));

-- Invoker RPCs: only service_role can call them. All writes are transactional.
create function public.apex_reserve_checkout(p_user_id uuid, p_email text, p_expired_session text default null)
returns public.apex_billing_accounts language plpgsql security invoker set search_path = '' as $$
declare b public.apex_billing_accounts;
begin
  insert into public.apex_billing_accounts(user_id, checkout_email) values(p_user_id,p_email)
  on conflict(user_id) do nothing;
  select * into b from public.apex_billing_accounts where user_id=p_user_id for update;
  if b.payment_status='unpaid' and p_expired_session is not null and b.checkout_session_id=p_expired_session then
    update public.apex_billing_accounts set attempt_id=gen_random_uuid(), attempt_created_at=now(),
      checkout_session_id=null, checkout_email=p_email where user_id=p_user_id returning * into b;
  end if;
  return b;
end $$;
revoke all on function public.apex_reserve_checkout(uuid,text,text) from public,anon,authenticated;
grant execute on function public.apex_reserve_checkout(uuid,text,text) to service_role;

create function public.apex_activate_purchase(
  p_event_id text, p_event_type text, p_user_id uuid, p_attempt_id uuid,
  p_session_id text, p_customer_id text, p_subscription_id text,
  p_invoice_id text, p_amount integer, p_status text, p_period_end timestamptz,
  p_publishable text, p_secret_hash text, p_ciphertext text
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare b public.apex_billing_accounts; w uuid; e uuid; plan uuid; event_row uuid;
begin
  select * into b from public.apex_billing_accounts where user_id=p_user_id for update;
  if not found or b.attempt_id<>p_attempt_id then raise exception 'Unknown checkout attempt'; end if;
  if b.checkout_session_id is not null and b.checkout_session_id<>p_session_id then raise exception 'Session mismatch'; end if;
  if b.stripe_subscription_id is not null and b.stripe_subscription_id<>p_subscription_id then raise exception 'Subscription mismatch'; end if;
  insert into public.stripe_webhook_events(stripe_event_id,event_type,payload)
    values(p_event_id,p_event_type,jsonb_build_object('checkout_session_id',p_session_id))
    on conflict(stripe_event_id) do nothing returning id into event_row;
  if event_row is null then return b.workspace_id; end if;
  if b.workspace_id is not null then
    update public.stripe_webhook_events set status='processed',processed_at=now(),workspace_id=b.workspace_id where id=event_row;
    return b.workspace_id;
  end if;
  if p_amount<>229900 then raise exception 'Payment is not eligible for activation'; end if;
  select id into strict plan from public.plans where workspace_id is null and key='founding';
  w:=gen_random_uuid();
  insert into public.workspaces(id,name,slug,created_by) values(w,
    coalesce((select nullif(company_name,'') from public.profiles where id=p_user_id),'My workspace'),
    'apex-'||w::text,p_user_id);
  insert into public.workspace_members(workspace_id,user_id,role) values(w,p_user_id,'owner');
  insert into public.environments(workspace_id,name,status) values(w,'sandbox','active') returning id into e;
  insert into public.api_keys(workspace_id,environment_id,name,publishable_key,secret_key_hash,secret_key_ciphertext)
    values(w,e,'Sandbox',p_publishable,p_secret_hash,p_ciphertext);
  insert into public.subscriptions(workspace_id,plan_id,status,stripe_subscription_id,current_period_end)
    values(w,plan,p_status,p_subscription_id,p_period_end);
  update public.apex_billing_accounts set checkout_session_id=p_session_id,stripe_customer_id=p_customer_id,
    stripe_subscription_id=p_subscription_id,workspace_id=w,payment_status='paid',subscription_status=p_status,
    initial_amount_paid=p_amount,initial_invoice_id=p_invoice_id,paid_at=now() where user_id=p_user_id;
  update public.stripe_webhook_events set status='processed',processed_at=now(),workspace_id=w where id=event_row;
  return w;
end $$;
revoke all on function public.apex_activate_purchase(text,text,uuid,uuid,text,text,text,text,integer,text,timestamptz,text,text,text) from public,anon,authenticated;
grant execute on function public.apex_activate_purchase(text,text,uuid,uuid,text,text,text,text,integer,text,timestamptz,text,text,text) to service_role;

create function public.apex_sync_subscription(p_event_id text,p_event_type text,p_created bigint,
  p_subscription_id text,p_status text,p_period_end timestamptz)
returns void language plpgsql security invoker set search_path = '' as $$
declare b public.apex_billing_accounts; event_row uuid;
begin
  select * into b from public.apex_billing_accounts where stripe_subscription_id=p_subscription_id for update;
  if not found then raise exception 'Activation pending'; end if;
  insert into public.stripe_webhook_events(stripe_event_id,event_type,payload,workspace_id)
    values(p_event_id,p_event_type,jsonb_build_object('subscription_id',p_subscription_id),b.workspace_id)
    on conflict(stripe_event_id) do nothing returning id into event_row;
  if event_row is null then return; end if;
  if p_created>=b.last_subscription_event and b.subscription_status<>'canceled' then
    update public.apex_billing_accounts set subscription_status=p_status,last_subscription_event=p_created where user_id=b.user_id;
    update public.subscriptions set status=p_status,current_period_end=p_period_end,updated_at=now() where stripe_subscription_id=p_subscription_id;
  end if;
  update public.stripe_webhook_events set status='processed',processed_at=now() where id=event_row;
end $$;
revoke all on function public.apex_sync_subscription(text,text,bigint,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.apex_sync_subscription(text,text,bigint,text,text,timestamptz) to service_role;
