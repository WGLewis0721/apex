-- v1 ledger RPCs are server-only. Browser roles cannot execute them; the
-- service-role Edge API can.
grant execute on function public.ensure_credit_account(uuid,uuid) to service_role;
grant execute on function public.grant_credits(uuid,uuid,numeric,text,text,text,uuid,text) to service_role;
grant execute on function public.consume_credits(uuid,uuid,numeric,text) to service_role;
grant execute on function public.refund_unspent_credits(uuid,uuid,text,numeric,text,text) to service_role;
grant execute on function public.get_credit_balance(uuid,uuid) to service_role;
grant execute on function public.get_customer_entitlements(uuid,uuid) to service_role;
