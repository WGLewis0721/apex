-- Phase 6.2 — connected Stripe ingress: canonical normalization and one ledger
-- effect per business action.
--
-- What already existed: `receive_connected_stripe_event` (durable receipt) and
-- `process_connected_stripe_event` (transactional grant/refund for the guided
-- pilot path). Both are left in place and untouched; the manual pilot keeps
-- working exactly as accepted.
--
-- What was missing, and is added here:
--   1. Credit amounts resolved ONLY from server-owned price mappings. An
--      unconfigured price never grants.
--   2. Idempotency scoped to the BUSINESS ACTION (the payment intent, or the
--      refund), not to the Stripe event id — so `checkout.session.completed`
--      and `payment_intent.succeeded` describing the same purchase produce one
--      grant, and `charge.refunded` / `refund.created` / `refund.updated`
--      describing the same refund produce one adjustment.
--   3. One transaction boundary covering mapping resolution, ledger mutation,
--      and event completion.
--   4. A normalized action document that the caller derives from the VERIFIED
--      persisted event (and trusted Stripe retrieval) — never from a
--      customer-supplied credit amount.
--
-- Reuses public.grant_credits and public.refund_unspent_credits unchanged.
-- No second ledger, no second write path, no reservations, no queue product.

-- ---------------------------------------------------------------------
-- Explicit test/live isolation on the connection itself. v1 is test-mode only,
-- so existing rows default to test and a live connected event is refused by
-- ingress rather than silently attributed to a test workspace.
-- ---------------------------------------------------------------------
alter table public.stripe_connections
  add column if not exists livemode boolean not null default false;

comment on column public.stripe_connections.livemode is
  'True only for a live-mode connected Stripe account. Connected ingress refuses any event whose livemode does not match this column.';

-- ---------------------------------------------------------------------
-- Server-owned mapping resolution. Exposed on its own so ingress, operators,
-- and support all read the same authority.
-- ---------------------------------------------------------------------
create or replace function public.resolve_stripe_price_credits(
  p_workspace_id uuid,
  p_stripe_price_id text
) returns numeric
language sql stable security definer set search_path = public
as $$
  select credit_amount
  from public.stripe_credit_price_mappings
  where workspace_id = p_workspace_id
    and stripe_price_id = p_stripe_price_id
    and is_active
  limit 1;
$$;

-- ---------------------------------------------------------------------
-- The one transactional processor for connected-account ingress.
--
-- p_action is a normalized document produced by the server-only ingress entry
-- point from the verified persisted Stripe event plus trusted Stripe retrieval:
--
--   {"kind":"payment","customer_id":<uuid>,"payment_id":"pi_...",
--    "lines":[{"line_id":"li_...","price_id":"price_...","quantity":1}]}
--   {"kind":"refund","refund_id":"re_...","payment_id":"pi_...",
--    "refunded_minor":500,"paid_minor":1000}
--   {"kind":"deauthorize"}
--   {"kind":"noop","reason":"UNSUPPORTED_EVENT_TYPE"}
--
-- Credit quantities are never read from p_action. Payment credits come from
-- stripe_credit_price_mappings; refund credits come from the grants that the
-- originating payment itself created.
-- ---------------------------------------------------------------------
create or replace function public.process_connected_stripe_ingress(
  p_connection_id uuid,
  p_event_id text,
  p_action jsonb
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_event public.stripe_webhook_events;
  v_workspace_id uuid;
  v_kind text := p_action ->> 'kind';
  v_customer_id uuid;
  v_payment_id text;
  v_line jsonb;
  v_credits numeric;
  v_quantity numeric;
  v_results jsonb := '[]'::jsonb;
  v_granted_total numeric := 0;
  v_source_event_id text;
  v_refund_id text;
  v_refunded_minor numeric;
  v_paid_minor numeric;
  v_reverse numeric;
  v_key text;
  v_prior jsonb;
begin
  -- The receipt must already be durably persisted. Ingress never processes an
  -- event it has not verified and stored first.
  select e.* into v_event
  from public.stripe_webhook_events e
  where e.stripe_connection_id = p_connection_id
    and e.stripe_event_id = p_event_id
  for update;
  if not found then raise exception 'event_not_received'; end if;

  v_workspace_id := v_event.workspace_id;
  if v_event.status = 'processed' then
    return jsonb_build_object('replayed', true, 'kind', v_kind);
  end if;

  if v_kind = 'payment' then
    v_customer_id := nullif(p_action ->> 'customer_id', '')::uuid;
    v_payment_id := nullif(p_action ->> 'payment_id', '');
    if v_customer_id is null or v_payment_id is null then
      raise exception 'payment_mapping_incomplete';
    end if;
    if not exists (
      select 1 from public.customers
      where id = v_customer_id and workspace_id = v_workspace_id
    ) then
      raise exception 'customer_not_in_workspace';
    end if;
    if jsonb_array_length(coalesce(p_action -> 'lines', '[]'::jsonb)) = 0 then
      raise exception 'payment_has_no_mapped_lines';
    end if;

    for v_line in select value from jsonb_array_elements(p_action -> 'lines') loop
      -- Server-owned mapping only. An unknown or inactive price NEVER grants;
      -- the whole transaction rolls back and the event stays replayable.
      v_credits := public.resolve_stripe_price_credits(v_workspace_id, v_line ->> 'price_id');
      if v_credits is null then raise exception 'unconfigured_stripe_price'; end if;
      v_quantity := greatest(coalesce((v_line ->> 'quantity')::numeric, 1), 1);

      -- Business-action scoped: the same purchase cannot grant twice even if
      -- Stripe describes it with several different event ids.
      v_key := 'stripe:' || p_connection_id::text || ':payment:' || v_payment_id
               || ':line:' || (v_line ->> 'line_id');

      -- A different event id describing this same purchase line carries a
      -- different request document, so grant_credits would reject the reused
      -- key rather than replay it. The business action is already recorded, so
      -- return the original outcome instead of creating a second ledger effect.
      select result into v_prior from public.credit_operations
      where workspace_id = v_workspace_id and idempotency_key = v_key;

      if found then
        v_results := v_results || jsonb_build_array(
          coalesce(v_prior, '{}'::jsonb) || '{"replayed":true}'::jsonb
        );
      else
        v_results := v_results || jsonb_build_array(public.grant_credits(
          v_workspace_id,
          v_customer_id,
          v_credits * v_quantity,
          v_key,
          p_event_id,
          v_payment_id,
          null,
          'stripe_connected_payment'
        ));
      end if;
      v_granted_total := v_granted_total + (v_credits * v_quantity);
    end loop;

  elsif v_kind = 'refund' then
    v_refund_id := nullif(p_action ->> 'refund_id', '');
    v_payment_id := nullif(p_action ->> 'payment_id', '');
    v_refunded_minor := nullif(p_action ->> 'refunded_minor', '')::numeric;
    v_paid_minor := nullif(p_action ->> 'paid_minor', '')::numeric;
    if v_refund_id is null or v_payment_id is null
       or v_refunded_minor is null or v_refunded_minor <= 0
       or v_paid_minor is null or v_paid_minor <= 0 then
      raise exception 'refund_mapping_incomplete';
    end if;

    -- The refundable credit quantity comes from the grants this payment made,
    -- never from the caller. Source attribution is preserved: only the grants
    -- created by this payment can be clawed back.
    select min(source_stripe_event_id), coalesce(sum(amount), 0), (array_agg(distinct customer_id))[1]
    into v_source_event_id, v_granted_total, v_customer_id
    from public.credit_grants
    where workspace_id = v_workspace_id
      and source_payment_id = v_payment_id;

    if v_source_event_id is null or v_granted_total <= 0 or v_customer_id is null then
      -- The originating payment has not been processed yet. Leave the event
      -- replayable rather than guessing.
      raise exception 'source_grant_not_ready';
    end if;
    if exists (
      select 1 from public.credit_grants
      where workspace_id = v_workspace_id
        and source_payment_id = v_payment_id
        and source_stripe_event_id is distinct from v_source_event_id
    ) then
      raise exception 'refund_source_ambiguous';
    end if;

    v_reverse := least(
      v_granted_total,
      round(v_granted_total * (least(v_refunded_minor, v_paid_minor) / v_paid_minor), 6)
    );
    if v_reverse <= 0 then raise exception 'refund_credit_amount_invalid'; end if;

    -- Refund-scoped: charge.refunded / refund.created / refund.updated for one
    -- refund produce exactly one adjustment, whatever their event ids are.
    v_key := 'stripe:' || p_connection_id::text || ':refund:' || v_refund_id;

    select result into v_prior from public.credit_operations
    where workspace_id = v_workspace_id and idempotency_key = v_key;

    if found then
      v_results := jsonb_build_array(
        coalesce(v_prior, '{}'::jsonb) || '{"replayed":true}'::jsonb
      );
    else
      v_results := jsonb_build_array(public.refund_unspent_credits(
        v_workspace_id,
        v_customer_id,
        v_source_event_id,
        v_reverse,
        v_key,
        p_event_id
      ));
    end if;

  elsif v_kind = 'deauthorize' then
    update public.stripe_connections
    set status = 'disconnected', updated_at = now()
    where id = p_connection_id;

  elsif v_kind <> 'noop' then
    raise exception 'unsupported_ingress_action';
  end if;

  update public.stripe_webhook_events
  set status = 'processed', processed_at = now(), last_error = null, updated_at = now()
  where id = v_event.id;

  return jsonb_build_object(
    'replayed', false,
    'kind', v_kind,
    'results', v_results
  );
end;
$$;

revoke all on function public.resolve_stripe_price_credits(uuid, text) from public, anon, authenticated;
revoke all on function public.process_connected_stripe_ingress(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.resolve_stripe_price_credits(uuid, text) to service_role;
grant execute on function public.process_connected_stripe_ingress(uuid, text, jsonb) to service_role;

comment on function public.process_connected_stripe_ingress(uuid, text, jsonb) is
  'APEX Phase 6.2 connected-ingress processor: one transaction covering server-owned price mapping, grant/refund via the existing ledger functions, and event completion. Business-action scoped idempotency. Service-role only.';
