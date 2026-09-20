-- Ensure exhausted abandoned leases can be operator-requeued; invalid
-- receipt bindings are claimed only to be marked operator-action-needed.
create or replace function public.claim_connected_stripe_retries(p_limit integer default 5)
returns setof public.stripe_webhook_events
language plpgsql security definer set search_path = public as $$
begin
  update public.stripe_webhook_events set retry_operator_action = 'retry_exhausted', status='failed',
    retry_claim=null,retry_claimed_at=null,last_error='retry_exhausted'
  where retry_attempts >= 8 and status <> 'processed' and retry_operator_action is null
    and (retry_claimed_at is null or retry_claimed_at < now() - interval '5 minutes');
  return query
  with due as (
    select e.id from public.stripe_webhook_events e
    where e.status in ('received','failed','processing')
      and e.payload->>'ingress' = 'connected_v1'
      and e.retry_operator_action is null and e.retry_attempts < 8
      and e.next_retry_at <= now()
      and (e.retry_claim is null or e.retry_claimed_at < now() - interval '5 minutes')
    order by e.next_retry_at, e.id for update skip locked
    limit greatest(1,least(coalesce(p_limit,5),10))
  )
  update public.stripe_webhook_events e
    set status='processing', retry_claim=gen_random_uuid(), retry_claimed_at=now(),
        retry_attempts=e.retry_attempts+1, updated_at=now()
    from due where e.id=due.id returning e.*;
end $$;

