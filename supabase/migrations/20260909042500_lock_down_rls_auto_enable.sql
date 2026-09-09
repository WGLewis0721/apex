-- Security hardening: rls_auto_enable is an event-trigger helper and must not be
-- callable through PostgREST by anonymous or authenticated users.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
