-- Phase 7.1.2 acceptance: mapping mutations stay workspace-bound and only
-- requeue mapping_required receipts through requeue_connected_stripe_retry.
-- Fake identifiers only. Requires the existing retry migration.

begin;

create temporary table _ws as
select gen_random_uuid() as a, gen_random_uuid() as b;

insert into public.stripe_credit_price_mappings (workspace_id, stripe_price_id, credit_amount, is_active)
select a, 'price_test_example', 1000, true from _ws;

update public.stripe_credit_price_mappings m
set credit_amount = 9
from _ws
where m.workspace_id = _ws.b
  and m.stripe_price_id = 'price_test_example';

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

select public.requeue_connected_stripe_retry(e.id, w.a) as a_blocked_requeued
from public.stripe_webhook_events e, _ws w
where e.stripe_event_id = 'evt_blocked_a';

select public.requeue_connected_stripe_retry(e.id, w.a) as a_processed_not_requeued
from public.stripe_webhook_events e, _ws w
where e.stripe_event_id = 'evt_processed_a';

select public.requeue_connected_stripe_retry(e.id, w.a) as a_claimed_not_requeued
from public.stripe_webhook_events e, _ws w
where e.stripe_event_id = 'evt_claimed_a';

select public.requeue_connected_stripe_retry(e.id, w.a) as b_not_requeued_with_a
from public.stripe_webhook_events e, _ws w
where e.stripe_event_id = 'evt_blocked_b';

select public.requeue_connected_stripe_retry(e.id, w.a) as a_blocked_requeued_again
from public.stripe_webhook_events e, _ws w
where e.stripe_event_id = 'evt_blocked_a';

rollback;
