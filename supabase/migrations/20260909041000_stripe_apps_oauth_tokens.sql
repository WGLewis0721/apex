-- Phase 5: Stripe Apps OAuth credential storage.
-- OAuth refresh tokens are server-only and encrypted before persistence.

create table public.stripe_oauth_tokens (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  refresh_token_ciphertext text not null,
  livemode boolean not null default false,
  scope text not null default 'stripe_apps',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stripe_oauth_tokens enable row level security;

-- Only service-role Edge Functions may read or write OAuth credentials.
revoke all on public.stripe_oauth_tokens from anon, authenticated;

comment on table public.stripe_oauth_tokens is
  'Encrypted Stripe Apps OAuth refresh tokens for a workspace. Never exposed to browser clients.';
comment on column public.stripe_oauth_tokens.refresh_token_ciphertext is
  'AES-256-GCM ciphertext encrypted with APEX_CREDENTIAL_ENCRYPTION_KEY.';
