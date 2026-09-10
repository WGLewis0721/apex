alter table public.stripe_oauth_tokens
  add column if not exists install_mode text not null default 'test'
  check (install_mode in ('test','sandbox'));

comment on column public.stripe_oauth_tokens.install_mode is
  'Stripe Apps OAuth link type used for this workspace. Test mode uses the developer test key; sandbox uses the managed-sandbox key.';
