-- Run against the migrated database. Every test row is rolled back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-4000-8000-000000000301','apex-billing-test@example.invalid','{}'),
 ('00000000-0000-4000-8000-000000000302','apex-other-test@example.invalid','{}');
set local role service_role;
do $$
declare b public.apex_billing_accounts; w uuid; w2 uuid;
begin
 b:=public.apex_reserve_checkout('00000000-0000-4000-8000-000000000301','apex-billing-test@example.invalid');
 if b.attempt_id<>(public.apex_reserve_checkout(b.user_id,b.checkout_email)).attempt_id then raise exception 'Duplicate attempt'; end if;
 -- Failed activation must roll back the ledger and all provisioning.
 begin
  perform public.apex_activate_purchase('evt_apex_bad','checkout.session.completed',b.user_id,b.attempt_id,
   'cs_apex_test','cus_apex_test','sub_apex_test','in_apex_test',1,'active',now(),'pk_test_fixture','hash_fixture','encrypted_fixture');
  raise exception 'Incorrect amount accepted';
 exception when others then
  if sqlerrm='Incorrect amount accepted' then raise; end if;
 end;
 if exists(select 1 from public.stripe_webhook_events where stripe_event_id='evt_apex_bad') then raise exception 'Failed event committed'; end if;
 w:=public.apex_activate_purchase('evt_apex_ok','checkout.session.completed',b.user_id,b.attempt_id,
   'cs_apex_test','cus_apex_test','sub_apex_test','in_apex_test',229900,'active',now(),'pk_test_fixture','hash_fixture','encrypted_fixture');
 w2:=public.apex_activate_purchase('evt_apex_ok','checkout.session.completed',b.user_id,b.attempt_id,
   'cs_apex_test','cus_apex_test','sub_apex_test','in_apex_test',229900,'active',now(),'pk_different','hash_different','encrypted_different');
 if w<>w2 then raise exception 'Duplicate workspace'; end if;
 perform public.apex_activate_purchase('evt_apex_async','checkout.session.async_payment_succeeded',b.user_id,b.attempt_id,
   'cs_apex_test','cus_apex_test','sub_apex_test','in_apex_test',229900,'active',now(),'pk_different','hash_different','encrypted_different');
 if (select count(*) from public.api_keys where workspace_id=w)<>1 then raise exception 'Duplicate credentials'; end if;
 if (select count(*) from public.environments where workspace_id=w)<>1 then raise exception 'Duplicate environment'; end if;
 if (select count(*) from public.workspace_members where workspace_id=w)<>1 then raise exception 'Duplicate membership'; end if;
 perform public.apex_sync_subscription('evt_apex_new','customer.subscription.updated',200,'sub_apex_test','past_due',now());
 perform public.apex_sync_subscription('evt_apex_old','customer.subscription.updated',100,'sub_apex_test','active',now());
 if (select status from public.subscriptions where workspace_id=w)<>'past_due' then raise exception 'Stale event overwrote status'; end if;
 perform public.apex_sync_subscription('evt_apex_recover','invoice.paid',300,'sub_apex_test','active',now());
 if (select status from public.subscriptions where workspace_id=w)<>'active' then raise exception 'Recovery failed'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
do $$
begin
 if (select count(*) from public.workspaces)<>1 then raise exception 'Owner cannot read workspace'; end if;
 if (select count(*) from public.workspace_members)<>1 then raise exception 'Membership policy failed'; end if;
 begin
  perform secret_key_hash from public.api_keys;
  raise exception 'Secret hash exposed';
 exception when insufficient_privilege then null; end;
 begin
  perform secret_key_ciphertext from public.api_keys;
  raise exception 'Ciphertext exposed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.apex_reserve_checkout('00000000-0000-4000-8000-000000000301','changed@example.invalid');
  raise exception 'Privileged RPC exposed';
 exception when insufficient_privilege then null; end;
 begin
  update public.apex_billing_accounts set payment_status='paid';
  raise exception 'Client can activate payment';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
do $$ begin
 if exists(select 1 from public.workspaces) or exists(select 1 from public.api_keys) or exists(select 1 from public.apex_billing_accounts) then
  raise exception 'Cross-account data exposed'; end if;
end $$;
reset role;
rollback;
