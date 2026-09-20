-- A deliberately small, OAuth-free Stripe pilot connection.  The endpoint
-- token selects a single workspace and its Stripe signing secret stays
-- encrypted server-side.  This is separate from Stripe Apps OAuth.
create table public.stripe_manual_webhook_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  stripe_connection_id uuid not null unique references public.stripe_connections(id) on delete cascade,
  endpoint_token uuid not null unique default gen_random_uuid(),
  signing_secret_ciphertext text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stripe_manual_webhook_connections enable row level security;
-- No browser Data API access: only authenticated Edge Functions using the
-- service key may read the endpoint token or encrypted signing secret.
revoke all on public.stripe_manual_webhook_connections from anon, authenticated;
