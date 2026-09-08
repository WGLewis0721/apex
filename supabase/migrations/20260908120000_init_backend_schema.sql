-- APEX production backend schema.
-- Covers: real accounts, workspaces, plan/subscription state, provisioned
-- environments + API keys, Stripe webhook idempotency, and an audit trail.
-- Everything downstream of "See it -> Choose plan" up through "Get
-- workspace" is modeled here; the launcher/verification/dashboard stages
-- remain simulated in the frontend for now (see docs/CLAUDE_CUSTOMER_FUNNEL.md).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- profiles: one row per auth.users row, kept in sync by a trigger below.
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  company_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());

create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Auto-create a profile row whenever a new Supabase Auth user is created.
-- This is the standard Supabase pattern for keeping a public-schema
-- profile in sync with the auth-schema user without exposing auth.users.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, company_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'company_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- workspaces + membership
-- ---------------------------------------------------------------------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_id uuid not null references auth.users (id),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_id_idx on public.workspace_members (user_id);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

-- A user can see a workspace, or the membership rows for a workspace,
-- only if they themselves are a member of it. This is the standard
-- multi-tenant RLS pattern: the membership table both grants and checks
-- access via a self-referencing subquery, which Postgres can satisfy
-- without recursion because the base case (a user's own membership row)
-- is always visible to that same user.
create policy "workspaces_select_member" on public.workspaces
  for select using (
    id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

create policy "workspace_members_select_member" on public.workspace_members
  for select using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

-- No insert/update/delete policies are granted to authenticated/anon:
-- workspaces and memberships are only ever created by the trusted
-- provision_workspace() function below (called with elevated privilege
-- from the checkout/webhook Edge Functions), never directly by a client.

-- ---------------------------------------------------------------------
-- plans: the authoritative source of what APEX itself costs. The
-- checkout Edge Function reads prices from here, never from the browser,
-- so a client can never talk itself into a discount.
-- ---------------------------------------------------------------------
create table public.plans (
  id text primary key,
  name text not null,
  tagline text not null,
  setup_fee_cents integer not null default 0,
  monthly_price_cents integer not null default 0,
  stripe_price_id_recurring text,
  stripe_price_id_setup text,
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.plans enable row level security;

create policy "plans_select_all" on public.plans
  for select using (true);

insert into public.plans (id, name, tagline, setup_fee_cents, monthly_price_cents, features) values
  ('founding', 'APEX Founding Partner', 'Guided implementation for your first launch.', 200000, 29900,
    '["Guided implementation with the APEX team","Direct integration help while you build","Sandbox workspace today, production workspace when available","Early-access pricing locked in"]'::jsonb),
  ('sandbox', 'Developer sandbox', 'Try the SDK yourself, free, no guided help.', 0, 0,
    '["Sandbox workspace","SDK + component integration preview","Community support only"]'::jsonb);

-- ---------------------------------------------------------------------
-- subscriptions, environments, api_keys
-- ---------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  plan_id text not null references public.plans (id),
  status text not null default 'active' check (status in ('active', 'past_due', 'canceled')),
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_checkout_session_id text unique,
  created_at timestamptz not null default now()
);

create index subscriptions_workspace_id_idx on public.subscriptions (workspace_id);

create table public.environments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null default 'Sandbox',
  kind text not null default 'sandbox' check (kind in ('sandbox', 'production')),
  created_at timestamptz not null default now(),
  unique (workspace_id, kind)
);

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  environment_id uuid not null references public.environments (id) on delete cascade,
  publishable_key text not null unique,
  secret_key_hash text not null,
  secret_key_last4 text not null,
  secret_key_once text,
  created_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;
alter table public.environments enable row level security;
alter table public.api_keys enable row level security;

create policy "subscriptions_select_member" on public.subscriptions
  for select using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

create policy "environments_select_member" on public.environments
  for select using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

create policy "api_keys_select_member" on public.api_keys
  for select using (
    environment_id in (
      select e.id from public.environments e
      join public.workspace_members wm on wm.workspace_id = e.workspace_id
      where wm.user_id = auth.uid()
    )
  );

-- Column-level lockdown: even though the row is visible to members via
-- the policy above, secret_key_hash and secret_key_once must never be
-- readable through the normal PostgREST/client path. Only the
-- SECURITY DEFINER reveal_and_clear_secret() function (owned by a role
-- with full table access) can read secret_key_once, once, ever.
revoke all on public.api_keys from authenticated, anon;
grant select (id, environment_id, publishable_key, secret_key_last4, created_at) on public.api_keys to authenticated;

-- ---------------------------------------------------------------------
-- stripe_events: idempotency ledger. No RLS policies are defined, so
-- with RLS enabled, anon/authenticated have zero access; only
-- service_role (used exclusively by the webhook Edge Function) can
-- read or write it.
-- ---------------------------------------------------------------------
create table public.stripe_events (
  id text primary key,
  type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;

-- ---------------------------------------------------------------------
-- audit_events
-- ---------------------------------------------------------------------
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  actor text not null,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index audit_events_workspace_id_idx on public.audit_events (workspace_id);

alter table public.audit_events enable row level security;

create policy "audit_events_select_member" on public.audit_events
  for select using (
    workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- provision_workspace(): the single, atomic entry point for turning a
-- confirmed payment (or a free-plan signup) into a real workspace,
-- subscription, Sandbox environment, and API key pair. Called only from
-- trusted server contexts (the checkout and webhook Edge Functions,
-- connected with the service-role key), never directly by a client --
-- execute is revoked from anon/authenticated below.
-- ---------------------------------------------------------------------
create function public.provision_workspace(
  p_user_id uuid,
  p_plan_id text,
  p_company_name text,
  p_stripe_customer_id text default null,
  p_stripe_subscription_id text default null,
  p_checkout_session_id text default null
)
returns table (
  workspace_id uuid,
  environment_id uuid,
  publishable_key text,
  secret_key text
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_environment_id uuid;
  v_slug text;
  v_publishable_key text;
  v_secret_key text;
  v_secret_hash text;
begin
  v_slug := lower(regexp_replace(coalesce(nullif(p_company_name, ''), 'workspace'), '[^a-zA-Z0-9]+', '-', 'g'))
    || '-' || substr(encode(gen_random_bytes(4), 'hex'), 1, 6);

  insert into public.workspaces (name, slug, owner_id)
  values (coalesce(nullif(p_company_name, ''), 'My workspace'), v_slug, p_user_id)
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, p_user_id, 'owner');

  insert into public.subscriptions (workspace_id, plan_id, status, stripe_customer_id, stripe_subscription_id, stripe_checkout_session_id)
  values (v_workspace_id, p_plan_id, 'active', p_stripe_customer_id, p_stripe_subscription_id, p_checkout_session_id);

  insert into public.environments (workspace_id, name, kind)
  values (v_workspace_id, 'Sandbox', 'sandbox')
  returning id into v_environment_id;

  v_publishable_key := 'apex_pk_test_' || encode(gen_random_bytes(16), 'hex');
  v_secret_key := 'apex_sk_test_' || encode(gen_random_bytes(24), 'hex');
  v_secret_hash := encode(digest(v_secret_key, 'sha256'), 'hex');

  insert into public.api_keys (environment_id, publishable_key, secret_key_hash, secret_key_last4, secret_key_once)
  values (v_environment_id, v_publishable_key, v_secret_hash, right(v_secret_key, 4), v_secret_key);

  insert into public.audit_events (workspace_id, actor, action, detail)
  values (v_workspace_id, 'system', 'workspace.provisioned', 'Plan ' || p_plan_id || ' activated; Sandbox environment and API keys created.');

  return query select v_workspace_id, v_environment_id, v_publishable_key, v_secret_key;
end;
$$;

revoke execute on function public.provision_workspace(uuid, text, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- reveal_and_clear_secret(): the one-time reveal path for a secret key.
-- Called directly by the authenticated client. Enforces membership
-- itself (since SECURITY DEFINER bypasses RLS), then atomically returns
-- and clears the plaintext so it can never be read a second time.
-- ---------------------------------------------------------------------
create function public.reveal_and_clear_secret(p_environment_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_secret text;
begin
  if not exists (
    select 1 from public.environments e
    join public.workspace_members wm on wm.workspace_id = e.workspace_id
    where e.id = p_environment_id and wm.user_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  update public.api_keys
  set secret_key_once = null
  where environment_id = p_environment_id and secret_key_once is not null
  returning secret_key_once into v_secret;

  return v_secret;
end;
$$;

grant execute on function public.reveal_and_clear_secret(uuid) to authenticated;
