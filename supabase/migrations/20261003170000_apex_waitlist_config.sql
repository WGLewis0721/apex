-- Waitlist Google Sheets credentials for the apex-waitlist edge function.
--
-- The values live in Supabase Vault (encrypted at rest), not in this file:
--   select vault.create_secret('<value>', 'apex_waitlist_google_service_account_email');
--   select vault.create_secret('<value>', 'apex_waitlist_google_private_key');
--   select vault.create_secret('<value>', 'apex_waitlist_spreadsheet_id');
-- Edge function secrets with the GOOGLE_* / WAITLIST_* names still take
-- precedence; this is the fallback when they are not set.
create or replace function public.apex_waitlist_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(s.name, s.decrypted_secret), '{}'::jsonb)
  from vault.decrypted_secrets s
  where s.name in (
    'apex_waitlist_google_service_account_email',
    'apex_waitlist_google_private_key',
    'apex_waitlist_spreadsheet_id'
  );
$$;

revoke all on function public.apex_waitlist_config() from public, anon, authenticated;
grant execute on function public.apex_waitlist_config() to service_role;
