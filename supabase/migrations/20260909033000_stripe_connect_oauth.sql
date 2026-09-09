-- Phase 5: Stripe Connect OAuth state.
-- This table is server-only. Browser clients never read or write OAuth state.

create table public.stripe_connect_oauth_states (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  state_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index stripe_connect_oauth_states_workspace_idx
  on public.stripe_connect_oauth_states (workspace_id);
create index stripe_connect_oauth_states_expires_idx
  on public.stripe_connect_oauth_states (expires_at);

alter table public.stripe_connect_oauth_states enable row level security;

-- Service-role Edge Functions are the only callers. An authenticated user
-- starts OAuth through apex-stripe-connect; the callback claims the hashed
-- state before exchanging Stripe's one-time authorization code.
revoke all on public.stripe_connect_oauth_states from anon, authenticated;
