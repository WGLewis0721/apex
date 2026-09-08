-- APEX core platform schema: accounts, workspaces, and the full table set
-- the product will need as it grows into a real multi-tenant SaaS control
-- plane. This migration is schema-only: real accounts + workspace-scoped
-- Row-Level Security are wired up now; Stripe Checkout, Stripe Connect,
-- the APEX SDK/API, usage processing, and ALLOW/DENY logic are deliberately
-- NOT implemented here (see ROADMAP.md for phasing) and are left as
-- structure only for later phases to fill in.
--
-- Tenancy model: `workspaces` are APEX's own paying customers (a company
-- using APEX). `customers` are *their* end customers. Two tables serve
-- both APEX's own billing and each workspace's downstream product:
--   - `plans` with workspace_id = null is APEX's own platform catalog
--     (Founding/Sandbox); `plans` with workspace_id set is a plan a
--     workspace defines for its own customers.
--   - `subscriptions` with customer_id = null is a workspace's own APEX
--     subscription; with customer_id set, it is one of the workspace's
--     customers subscribed to one of that workspace's own plans.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- profiles: one row per auth.users row, kept in sync by a trigger.
-- full_name/company_name are display data only -- never read by any RLS
-- policy or authorization check in this schema.
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  company_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using ((select auth.uid()) = id);

create policy "profiles_update_own" on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Auto-create a profile row whenever a new Supabase Auth user is created.
-- raw_user_meta_data is user-editable and is used here purely to seed
-- display fields -- it is never consulted by any RLS policy.
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
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index workspace_members_user_id_idx on public.workspace_members (user_id);
create index workspace_members_workspace_id_idx on public.workspace_members (workspace_id);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

-- Never read from user-editable metadata: membership (and therefore every
-- policy below that depends on it) is decided entirely by rows in this
-- table, which only trusted server-side code can ever write.
create function public.current_workspace_ids()
returns setof uuid
language sql
stable
security invoker
set search_path = public
as $$
  select workspace_id from public.workspace_members where user_id = (select auth.uid());
$$;

create policy "workspaces_select_member" on public.workspaces
  for select using (id in (select public.current_workspace_ids()));

create policy "workspace_members_select_member" on public.workspace_members
  for select using (workspace_id in (select public.current_workspace_ids()));

-- No insert/update/delete policies are granted to authenticated/anon on
-- either table: workspaces and memberships are only ever created by
-- trusted server-side code (service role), never directly by a client.
-- That provisioning logic is out of scope for this migration.

-- ---------------------------------------------------------------------
-- plans: workspace_id null = APEX's own platform catalog (seeded below).
-- workspace_id set = a plan a workspace defines for its own customers.
-- ---------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  key text not null,
  name text not null,
  monthly_price_cents integer not null default 0,
  setup_fee_cents integer not null default 0,
  currency text not null default 'usd',
  stripe_price_id_recurring text,
  stripe_price_id_setup text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index plans_platform_key_idx on public.plans (key) where workspace_id is null;
create unique index plans_workspace_key_idx on public.plans (workspace_id, key) where workspace_id is not null;
create index plans_workspace_id_idx on public.plans (workspace_id);

alter table public.plans enable row level security;

create policy "plans_select_platform_or_member" on public.plans
  for select using (workspace_id is null or workspace_id in (select public.current_workspace_ids()));

insert into public.plans (workspace_id, key, name, monthly_price_cents, setup_fee_cents) values
  (null, 'founding', 'APEX Founding Partner', 29900, 200000),
  (null, 'sandbox', 'Developer sandbox', 0, 0);

-- ---------------------------------------------------------------------
-- features + plan_features: a workspace's own entitlement catalog for
-- its downstream product. No ALLOW/DENY evaluation logic lives here yet.
-- ---------------------------------------------------------------------
create table public.features (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, key)
);

create index features_workspace_id_idx on public.features (workspace_id);

alter table public.features enable row level security;

create policy "features_select_member" on public.features
  for select using (workspace_id in (select public.current_workspace_ids()));

create table public.plan_features (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  feature_id uuid not null references public.features (id) on delete cascade,
  limit_value bigint,
  created_at timestamptz not null default now(),
  unique (plan_id, feature_id)
);

create index plan_features_plan_id_idx on public.plan_features (plan_id);
create index plan_features_feature_id_idx on public.plan_features (feature_id);

alter table public.plan_features enable row level security;

create policy "plan_features_select_member" on public.plan_features
  for select using (
    plan_id in (select id from public.plans where workspace_id in (select public.current_workspace_ids()))
  );

-- ---------------------------------------------------------------------
-- customers: a workspace's own end customers.
-- ---------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  external_id text not null,
  email text,
  name text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, external_id)
);

create index customers_workspace_id_idx on public.customers (workspace_id);

alter table public.customers enable row level security;

create policy "customers_select_member" on public.customers
  for select using (workspace_id in (select public.current_workspace_ids()));

-- ---------------------------------------------------------------------
-- subscriptions: customer_id null = the workspace's own APEX
-- subscription; customer_id set = one of the workspace's customers
-- subscribed to one of the workspace's own plans.
-- ---------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  status text not null default 'incomplete' check (status in ('incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid')),
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_workspace_id_idx on public.subscriptions (workspace_id);
create index subscriptions_customer_id_idx on public.subscriptions (customer_id);
create index subscriptions_plan_id_idx on public.subscriptions (plan_id);

alter table public.subscriptions enable row level security;

create policy "subscriptions_select_member" on public.subscriptions
  for select using (workspace_id in (select public.current_workspace_ids()));

-- ---------------------------------------------------------------------
-- environments + api_keys
-- ---------------------------------------------------------------------
create table public.environments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null default 'sandbox',
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create index environments_workspace_id_idx on public.environments (workspace_id);

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  environment_id uuid not null references public.environments (id) on delete cascade,
  name text,
  publishable_key text not null unique,
  secret_key_hash text not null,
  secret_key_once text,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index api_keys_workspace_id_idx on public.api_keys (workspace_id);
create index api_keys_environment_id_idx on public.api_keys (environment_id);

alter table public.environments enable row level security;
alter table public.api_keys enable row level security;

create policy "environments_select_member" on public.environments
  for select using (workspace_id in (select public.current_workspace_ids()));

create policy "api_keys_select_member" on public.api_keys
  for select using (workspace_id in (select public.current_workspace_ids()));

-- Column-level lockdown: even on a row visible via the policy above,
-- secret_key_hash/secret_key_once must never be readable through the
-- normal PostgREST/client path. A future phase's SECURITY DEFINER
-- reveal function (owned by a role with full table access) is the only
-- thing that should ever read secret_key_once -- not implemented yet.
revoke all on public.api_keys from authenticated, anon;
grant select (id, workspace_id, environment_id, name, publishable_key, status, created_at, revoked_at) on public.api_keys to authenticated;

-- ---------------------------------------------------------------------
-- stripe_connections: a workspace's own connected Stripe account
-- (Stripe Connect). No OAuth flow is implemented yet.
-- ---------------------------------------------------------------------
create table public.stripe_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces (id) on delete cascade,
  stripe_account_id text unique,
  status text not null default 'not_connected' check (status in ('not_connected', 'pending', 'connected', 'disconnected')),
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stripe_connections enable row level security;

create policy "stripe_connections_select_member" on public.stripe_connections
  for select using (workspace_id in (select public.current_workspace_ids()));

-- ---------------------------------------------------------------------
-- usage_events, usage_counters, credit_grants, credit_consumptions,
-- access_decisions: structure for the future Access Decision Engine.
-- No usage processing or ALLOW/DENY evaluation logic is implemented yet.
-- ---------------------------------------------------------------------
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  feature_id uuid references public.features (id) on delete set null,
  event_id text not null,
  quantity numeric not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (workspace_id, event_id)
);

create index usage_events_workspace_id_idx on public.usage_events (workspace_id);
create index usage_events_customer_id_idx on public.usage_events (customer_id);
create index usage_events_feature_id_idx on public.usage_events (feature_id);

alter table public.usage_events enable row level security;

create policy "usage_events_select_member" on public.usage_events
  for select using (workspace_id in (select public.current_workspace_ids()));

create table public.usage_counters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  feature_id uuid not null references public.features (id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  total_quantity numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (customer_id, feature_id, period_start)
);

create index usage_counters_workspace_id_idx on public.usage_counters (workspace_id);
create index usage_counters_customer_id_idx on public.usage_counters (customer_id);
create index usage_counters_feature_id_idx on public.usage_counters (feature_id);

alter table public.usage_counters enable row level security;

create policy "usage_counters_select_member" on public.usage_counters
  for select using (workspace_id in (select public.current_workspace_ids()));

create table public.credit_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  feature_id uuid references public.features (id) on delete set null,
  amount numeric not null,
  remaining_amount numeric not null,
  expires_at timestamptz,
  reason text,
  created_at timestamptz not null default now()
);

create index credit_grants_workspace_id_idx on public.credit_grants (workspace_id);
create index credit_grants_customer_id_idx on public.credit_grants (customer_id);
create index credit_grants_feature_id_idx on public.credit_grants (feature_id);

alter table public.credit_grants enable row level security;

create policy "credit_grants_select_member" on public.credit_grants
  for select using (workspace_id in (select public.current_workspace_ids()));

create table public.credit_consumptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  credit_grant_id uuid not null references public.credit_grants (id) on delete cascade,
  usage_event_id uuid references public.usage_events (id) on delete set null,
  amount numeric not null,
  created_at timestamptz not null default now()
);

create index credit_consumptions_workspace_id_idx on public.credit_consumptions (workspace_id);
create index credit_consumptions_credit_grant_id_idx on public.credit_consumptions (credit_grant_id);
create index credit_consumptions_usage_event_id_idx on public.credit_consumptions (usage_event_id);

alter table public.credit_consumptions enable row level security;

create policy "credit_consumptions_select_member" on public.credit_consumptions
  for select using (workspace_id in (select public.current_workspace_ids()));

create table public.access_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete cascade,
  feature_id uuid references public.features (id) on delete set null,
  decision text not null check (decision in ('allow', 'deny')),
  reason text,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index access_decisions_workspace_id_idx on public.access_decisions (workspace_id);
create index access_decisions_customer_id_idx on public.access_decisions (customer_id);
create index access_decisions_feature_id_idx on public.access_decisions (feature_id);

alter table public.access_decisions enable row level security;

create policy "access_decisions_select_member" on public.access_decisions
  for select using (workspace_id in (select public.current_workspace_ids()));

-- ---------------------------------------------------------------------
-- stripe_webhook_events: idempotency ledger. No RLS policies are
-- defined, so with RLS enabled, anon/authenticated have zero access;
-- only service_role (used exclusively by a future webhook handler) can
-- read or write it.
-- ---------------------------------------------------------------------
create table public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  workspace_id uuid references public.workspaces (id) on delete set null,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'processed', 'failed')),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index stripe_webhook_events_workspace_id_idx on public.stripe_webhook_events (workspace_id);

alter table public.stripe_webhook_events enable row level security;

-- ---------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_workspace_id_idx on public.audit_logs (workspace_id);

alter table public.audit_logs enable row level security;

create policy "audit_logs_select_member" on public.audit_logs
  for select using (workspace_id in (select public.current_workspace_ids()));
