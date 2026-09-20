-- Connected Stripe ingress: configure explicit customer/price mappings, persist
-- verified events once, and make ledger mutation plus event completion atomic.

alter table public.customers
  add column if not exists stripe_customer_id text;

create unique index if not exists customers_workspace_stripe_customer_idx
  on public.customers (workspace_id, stripe_customer_id)
  where stripe_customer_id is not null;

create table public.stripe_credit_price_mappings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  stripe_price_id text not null,
  credit_amount numeric not null check (credit_amount > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, stripe_price_id)
);
create index stripe_credit_price_mappings_workspace_idx
  on public.stripe_credit_price_mappings(workspace_id);
alter table public.stripe_credit_price_mappings enable row level security;
create policy "stripe_credit_price_mappings_select_member"
  on public.stripe_credit_price_mappings for select
  using (workspace_id in (select public.current_workspace_ids()));
revoke all on public.stripe_credit_price_mappings from anon, authenticated;
grant select on public.stripe_credit_price_mappings to authenticated;

create or replace function public.receive_connected_stripe_event(
  p_connection_id uuid,
  p_event_id text,
  p_event_type text,
  p_payload jsonb
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_workspace_id uuid; v_id uuid;
begin
  select workspace_id into v_workspace_id from public.stripe_connections
  where id = p_connection_id and status = 'connected';
  if not found then raise exception 'unknown_connected_stripe_account'; end if;

  insert into public.stripe_webhook_events(
    stripe_connection_id,stripe_event_id,event_type,workspace_id,payload,status,
    attempt_count,updated_at
  ) values(
    p_connection_id,p_event_id,p_event_type,v_workspace_id,p_payload,'received',0,now()
  ) on conflict (stripe_connection_id,stripe_event_id) where stripe_connection_id is not null
  do update set attempt_count = public.stripe_webhook_events.attempt_count + 1,
                updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.process_connected_stripe_event(
  p_connection_id uuid,
  p_event_id text,
  p_customer_id uuid default null,
  p_payment_id text default null,
  p_grants jsonb default '[]'::jsonb,
  p_refund_source_event_id text default null,
  p_refund_credits numeric default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_event public.stripe_webhook_events;
  v_mapping public.stripe_credit_price_mappings;
  v_grant jsonb;
  v_result jsonb := '[]'::jsonb;
  v_workspace_id uuid;
begin
  select e.* into v_event
  from public.stripe_webhook_events e
  where e.stripe_connection_id = p_connection_id and e.stripe_event_id = p_event_id
  for update;
  if not found then raise exception 'event_not_received'; end if;
  v_workspace_id := v_event.workspace_id;
  if v_event.status = 'processed' then return jsonb_build_object('replayed',true); end if;

  if jsonb_array_length(p_grants) > 0 then
    if p_customer_id is null or p_payment_id is null then raise exception 'payment_mapping_incomplete'; end if;
    for v_grant in select value from jsonb_array_elements(p_grants) loop
      select * into v_mapping from public.stripe_credit_price_mappings
      where workspace_id = v_workspace_id
        and stripe_price_id = v_grant->>'price_id'
        and is_active;
      if not found then raise exception 'unconfigured_stripe_price'; end if;
      v_result := v_result || jsonb_build_array(public.grant_credits(
        v_workspace_id,p_customer_id,v_mapping.credit_amount,
        'stripe:' || p_event_id || ':line:' || (v_grant->>'line_item_id'),
        p_event_id,p_payment_id,null,'stripe_checkout'
      ));
    end loop;
  elsif p_refund_source_event_id is not null and p_refund_credits is not null then
    if p_customer_id is null then raise exception 'refund_mapping_incomplete'; end if;
    v_result := jsonb_build_array(public.refund_unspent_credits(
      v_workspace_id,p_customer_id,p_refund_source_event_id,p_refund_credits,
      'stripe:' || p_event_id || ':refund',p_event_id
    ));
  end if;

  update public.stripe_webhook_events
  set status = 'processed', processed_at = now(), last_error = null,
      updated_at = now()
  where id = v_event.id;
  return jsonb_build_object('replayed',false,'results',v_result);
end;
$$;

revoke all on function public.receive_connected_stripe_event(uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.process_connected_stripe_event(uuid,text,uuid,text,jsonb,text,numeric) from public, anon, authenticated;
