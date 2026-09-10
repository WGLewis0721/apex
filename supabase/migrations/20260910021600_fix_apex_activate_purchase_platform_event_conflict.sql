create or replace function public.apex_activate_purchase(
  p_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_attempt_id uuid,
  p_session_id text,
  p_customer_id text,
  p_subscription_id text,
  p_invoice_id text,
  p_amount integer,
  p_status text,
  p_period_end timestamptz,
  p_publishable text,
  p_secret_hash text,
  p_ciphertext text
)
returns uuid
language plpgsql
set search_path to ''
as $function$
declare
  b public.apex_billing_accounts;
  w uuid;
  e uuid;
  plan uuid;
  event_row uuid;
begin
  select * into b
  from public.apex_billing_accounts
  where user_id = p_user_id
  for update;

  if not found or b.attempt_id <> p_attempt_id then
    raise exception 'Unknown checkout attempt';
  end if;
  if b.checkout_session_id is not null and b.checkout_session_id <> p_session_id then
    raise exception 'Session mismatch';
  end if;
  if b.stripe_subscription_id is not null and b.stripe_subscription_id <> p_subscription_id then
    raise exception 'Subscription mismatch';
  end if;

  insert into public.stripe_webhook_events(stripe_event_id,event_type,payload)
    values(p_event_id,p_event_type,jsonb_build_object('checkout_session_id',p_session_id))
    on conflict (stripe_event_id) where stripe_connection_id is null do nothing
    returning id into event_row;

  if event_row is null then
    return b.workspace_id;
  end if;

  if b.workspace_id is not null then
    update public.stripe_webhook_events
    set status='processed', processed_at=now(), workspace_id=b.workspace_id
    where id=event_row;
    return b.workspace_id;
  end if;

  if p_amount <> 229900 then
    raise exception 'Payment is not eligible for activation';
  end if;

  select id into strict plan
  from public.plans
  where workspace_id is null and key='founding';

  w := gen_random_uuid();
  insert into public.workspaces(id,name,slug,created_by)
  values(
    w,
    coalesce((select nullif(company_name,'') from public.profiles where id=p_user_id),'My workspace'),
    'apex-'||w::text,
    p_user_id
  );
  insert into public.workspace_members(workspace_id,user_id,role)
    values(w,p_user_id,'owner');
  insert into public.environments(workspace_id,name,status)
    values(w,'sandbox','active') returning id into e;
  insert into public.api_keys(workspace_id,environment_id,name,publishable_key,secret_key_hash,secret_key_ciphertext)
    values(w,e,'Sandbox',p_publishable,p_secret_hash,p_ciphertext);
  insert into public.subscriptions(workspace_id,plan_id,status,stripe_subscription_id,current_period_end)
    values(w,plan,p_status,p_subscription_id,p_period_end);
  update public.apex_billing_accounts
  set checkout_session_id=p_session_id,
      stripe_customer_id=p_customer_id,
      stripe_subscription_id=p_subscription_id,
      workspace_id=w,
      payment_status='paid',
      subscription_status=p_status,
      initial_amount_paid=p_amount,
      initial_invoice_id=p_invoice_id,
      paid_at=now()
  where user_id=p_user_id;
  update public.stripe_webhook_events
  set status='processed', processed_at=now(), workspace_id=w
  where id=event_row;
  return w;
end
$function$;
