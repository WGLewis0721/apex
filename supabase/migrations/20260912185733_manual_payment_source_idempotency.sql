-- Serialize manual-pilot fulfillment by Stripe payment identity. Checkout emits
-- both PaymentIntent and Checkout events; either can arrive first, but only one
-- grant may be created for the underlying payment.
create or replace function public.process_manual_stripe_payment(
  p_connection_id uuid,
  p_event_id text,
  p_customer_id uuid,
  p_payment_id text,
  p_credits numeric
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_event public.stripe_webhook_events;
  v_existing public.credit_grants;
  v_result jsonb;
begin
  select * into v_event from public.stripe_webhook_events
  where stripe_connection_id = p_connection_id and stripe_event_id = p_event_id
  for update;
  if not found then raise exception 'event_not_received'; end if;
  if v_event.status = 'processed' then return jsonb_build_object('replayed', true); end if;
  if p_credits <= 0 or p_payment_id is null then raise exception 'payment_mapping_incomplete'; end if;
  if not exists (select 1 from public.customers where id = p_customer_id and workspace_id = v_event.workspace_id) then
    raise exception 'customer_not_in_workspace';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_event.workspace_id::text || ':' || p_payment_id, 0));
  select * into v_existing from public.credit_grants
  where workspace_id = v_event.workspace_id and customer_id = p_customer_id
    and source_payment_id = p_payment_id
  order by created_at limit 1;

  if found then
    v_result := jsonb_build_object('replayed', true, 'grant_id', v_existing.id);
  else
    v_result := public.grant_credits(
      v_event.workspace_id, p_customer_id, p_credits,
      'stripe:payment:' || p_payment_id || ':manual', p_event_id,
      p_payment_id, null, 'stripe_manual_checkout'
    );
  end if;

  update public.stripe_webhook_events
  set status = 'processed', processed_at = now(), last_error = null, updated_at = now()
  where id = v_event.id;
  return v_result;
end;
$$;

revoke all on function public.process_manual_stripe_payment(uuid,text,uuid,text,numeric)
  from public, anon, authenticated;
