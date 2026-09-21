-- Phase 7.1.2 acceptance: mapping mutations stay workspace-bound and only
-- requeue mapping_required receipts through requeue_connected_stripe_retry.
-- Fake identifiers only. Transaction rolls back all fixture data.

begin;

create temporary table _ws as
select gen_random_uuid() as a, gen_random_uuid() as b;

insert into public.workspaces (id, name, slug)
select a, 'price mapping test A', 'price-mapping-test-a-' || left(a::text, 8) from _ws
union all
select b, 'price mapping test B', 'price-mapping-test-b-' || left(b::text, 8) from _ws;

insert into public.stripe_credit_price_mappings (workspace_id, stripe_price_id, credit_amount, is_active)
select a, 'price_test_example', 1000, true from _ws;

-- A mutation scoped to workspace B must not touch workspace A's mapping.
update public.stripe_credit_price_mappings m
set credit_amount = 9
from _ws
where m.workspace_id = _ws.b
  and m.stripe_price_id = 'price_test_example';

do $$
declare expected numeric;
begin
  select m.credit_amount into expected
  from public.stripe_credit_price_mappings m, _ws w
  where m.workspace_id = w.a and m.stripe_price_id = 'price_test_example';

  if expected <> 1000 then
    raise exception 'cross-workspace mapping mutation escaped workspace boundary';
  end if;
end $$;

insert into public.stripe_webhook_events (
  workspace_id, stripe_event_id, event_type, payload, status,
  last_error, retry_operator_action, retry_claim
)
select a, 'evt_blocked_a', 'checkout.session.completed',
  jsonb_build_object('ingress','connected_v1','livemode','false','install_mode','test'),
  'failed', 'mapping_required', 'mapping_required', null
from _ws;

insert into public.stripe_webhook_events (
  workspace_id, stripe_event_id, event_type, payload, status, last_error
)
select a, 'evt_processed_a', 'checkout.session.completed',
  jsonb_build_object('ingress','connected_v1','livemode','false','install_mode','test'),
  'processed', null
from _ws;

insert into public.stripe_webhook_events (
  workspace_id, stripe_event_id, event_type, payload, status,
  last_error, retry_operator_action, retry_claim
)
select a, 'evt_claimed_a', 'checkout.session.completed',
  jsonb_build_object('ingress','connected_v1','livemode','false','install_mode','test'),
  'failed', 'mapping_required', 'mapping_required', gen_random_uuid()
from _ws;

insert into public.stripe_webhook_events (
  workspace_id, stripe_event_id, event_type, payload, status,
  last_error, retry_operator_action
)
select b, 'evt_blocked_b', 'checkout.session.completed',
  jsonb_build_object('ingress','connected_v1','livemode','false','install_mode','test'),
  'failed', 'mapping_required', 'mapping_required'
from _ws;

do $$
declare
  wa uuid;
  blocked_a uuid;
  processed_a uuid;
  claimed_a uuid;
  blocked_b uuid;
  ok boolean;
begin
  select a into wa from _ws;
  select id into blocked_a from public.stripe_webhook_events where stripe_event_id='evt_blocked_a';
  select id into processed_a from public.stripe_webhook_events where stripe_event_id='evt_processed_a';
  select id into claimed_a from public.stripe_webhook_events where stripe_event_id='evt_claimed_a';
  select id into blocked_b from public.stripe_webhook_events where stripe_event_id='evt_blocked_b';

  ok := public.requeue_connected_stripe_retry(blocked_a, wa);
  if ok is not true then raise exception 'mapping-required receipt was not requeued'; end if;

  if exists (
    select 1 from public.stripe_webhook_events
    where id=blocked_a
      and (retry_operator_action is not null or retry_attempts <> 0 or next_retry_at > now())
  ) then
    raise exception 'requeued receipt did not reset operator block / attempts / due time';
  end if;

  ok := public.requeue_connected_stripe_retry(processed_a, wa);
  if ok is true then raise exception 'processed receipt was requeued'; end if;

  ok := public.requeue_connected_stripe_retry(claimed_a, wa);
  if ok is true then raise exception 'actively claimed receipt was requeued'; end if;

  ok := public.requeue_connected_stripe_retry(blocked_b, wa);
  if ok is true then raise exception 'foreign-workspace receipt was requeued'; end if;

  ok := public.requeue_connected_stripe_retry(blocked_a, wa);
  if ok is not true then raise exception 'repeated safe requeue unexpectedly failed'; end if;
end $$;

rollback;
