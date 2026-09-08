-- handle_new_user() is meant only to run as the auth.users insert trigger,
-- never to be called directly via PostgREST's exposed RPC surface.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
