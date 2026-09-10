create or replace function public.apex_sync_subscription(
  p_event_id text,
  p_event_type text,
  p_created bigint,
  p_subscription_id text,
  p_status text,
  p_period_end timestamptz
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  b public.apex_billing_accounts;
  event_row uuid;
begin
  select * into b
  from public.apex_billing_accounts
  where stripe_subscription_id = p_subscription_id
  for update;

  if not found then
    raise exception 'Activation pending';
  end if;

  insert into public.stripe_webhook_events(
    stripe_event_id,
    event_type,
    payload,
    workspace_id
  )
  values(
    p_event_id,
    p_event_type,
    jsonb_build_object('subscription_id', p_subscription_id),
    b.workspace_id
  )
  on conflict (stripe_event_id)
    where stripe_connection_id is null
  do nothing
  returning id into event_row;

  if event_row is null then
    return;
  end if;

  if p_created >= b.last_subscription_event
     and b.subscription_status <> 'canceled' then
    update public.apex_billing_accounts
      set subscription_status = p_status,
          last_subscription_event = p_created
      where user_id = b.user_id;

    update public.subscriptions
      set status = p_status,
          current_period_end = p_period_end,
          updated_at = now()
      where stripe_subscription_id = p_subscription_id;
  end if;

  update public.stripe_webhook_events
    set status = 'processed',
        processed_at = now()
    where id = event_row;
end
$$;

revoke all on function public.apex_sync_subscription(text,text,bigint,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.apex_sync_subscription(text,text,bigint,text,text,timestamptz)
  to service_role;
