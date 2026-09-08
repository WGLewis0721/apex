import { supabase } from './supabaseClient';

// Thin data-access layer between the onboarding UI and the real Supabase
// backend (auth, Postgres, and the create-checkout-session Edge Function).
// Keeping every Supabase call in this one file means Onboarding.tsx only
// ever calls plain async functions — it doesn't know or care that the
// underlying store used to be localStorage.
//
// Secret API keys are one-time-reveal (see reveal_and_clear_secret in the
// schema migration): the *Full loaders below capture the plaintext secret
// exactly once and it is gone from the database from then on. Only call
// them at the deliberate moment the workspace step is actually being
// shown to the user for the first time — never from a background/session
// -restore check, or the reveal gets silently burned before anyone sees it.

export type BackendAccount = { userId: string; email: string; fullName: string | null; companyName: string | null };

export type WorkspaceSummary = { workspaceId: string; workspaceName: string; planId: string };

export type BackendWorkspace = WorkspaceSummary & {
  environmentId: string;
  publishableKey: string;
  /** Plaintext, once. Null if never captured or already revealed-and-cleared. */
  secretKey: string | null;
};

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  return supabase;
}

export async function getCurrentAccount(): Promise<BackendAccount | null> {
  const client = requireClient();
  const { data } = await client.auth.getUser();
  const user = data.user;
  if (!user) return null;
  return {
    userId: user.id,
    email: user.email ?? '',
    fullName: (user.user_metadata?.full_name as string) ?? null,
    companyName: (user.user_metadata?.company_name as string) ?? null,
  };
}

export async function signUpOrSignIn(input: { name: string; email: string; company: string; password: string }): Promise<BackendAccount> {
  const client = requireClient();
  const { data, error } = await client.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { full_name: input.name, company_name: input.company } },
  });

  if (error) {
    // Supabase returns a generic "already registered" style error for an
    // existing email; treat that one case as "log this returning user in"
    // rather than surfacing a dead end.
    if (/already registered|already exists/i.test(error.message)) {
      return signIn({ email: input.email, password: input.password });
    }
    throw new Error(error.message);
  }

  const user = data.user!;
  return { userId: user.id, email: user.email ?? '', fullName: input.name, companyName: input.company };
}

export async function signIn(input: { email: string; password: string }): Promise<BackendAccount> {
  const client = requireClient();
  const { data, error } = await client.auth.signInWithPassword({ email: input.email, password: input.password });
  if (error) throw new Error('Could not sign in with that email and password.');
  const user = data.user;
  return { userId: user.id, email: user.email ?? '', fullName: (user.user_metadata?.full_name as string) ?? null, companyName: (user.user_metadata?.company_name as string) ?? null };
}

export type CheckoutOutcome =
  | { mode: 'checkout'; url: string }
  | { mode: 'provisioned'; workspaceId: string }
  | { mode: 'error'; error: string; message?: string };

export async function startCheckout(input: { planId: string; companyName: string }): Promise<CheckoutOutcome> {
  const client = requireClient();
  const { data, error } = await client.functions.invoke('create-checkout-session', {
    body: {
      planId: input.planId,
      companyName: input.companyName,
      origin: window.location.origin,
      basePath: import.meta.env.BASE_URL,
    },
  });

  if (error) {
    // FunctionsHttpError carries the parsed JSON body of a non-2xx response
    // on `.context`, which is where our function's { error, message } lands.
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const body = await context.clone().json();
        return { mode: 'error', error: body.error ?? 'request_failed', message: body.message };
      } catch {
        // fall through to generic error below
      }
    }
    return { mode: 'error', error: 'request_failed', message: error.message };
  }

  return data as CheckoutOutcome;
}

/** Cheap existence check for session-restore. Never touches secret material. */
export async function getOwnWorkspaceSummary(): Promise<WorkspaceSummary | null> {
  const client = requireClient();
  const { data } = await client.from('workspaces').select('id, name, subscriptions(plan_id)').limit(1).maybeSingle();
  if (!data) return null;
  const planId = (data as unknown as { subscriptions: { plan_id: string }[] }).subscriptions?.[0]?.plan_id;
  if (!planId) return null;
  return { workspaceId: data.id as string, workspaceName: data.name as string, planId };
}

async function loadFullWorkspace(row: { id: string; name: string; environments: { id: string }[]; subscriptions: { plan_id: string }[] } | null): Promise<BackendWorkspace | null> {
  if (!row) return null;
  const environmentId = row.environments[0]?.id;
  const planId = row.subscriptions[0]?.plan_id;
  if (!environmentId || !planId) return null;

  const client = requireClient();
  const { data: keyRow } = await client.from('api_keys').select('publishable_key').eq('environment_id', environmentId).maybeSingle();
  const { data: revealed } = await client.rpc('reveal_and_clear_secret', { p_environment_id: environmentId });

  return {
    workspaceId: row.id,
    workspaceName: row.name,
    planId,
    environmentId,
    publishableKey: keyRow?.publishable_key ?? '',
    secretKey: (revealed as string | null) ?? null,
  };
}

/** Full load (including a one-time secret reveal) by known workspace id. */
export async function loadWorkspaceById(workspaceId: string): Promise<BackendWorkspace | null> {
  const client = requireClient();
  const { data } = await client
    .from('workspaces')
    .select('id, name, environments(id), subscriptions(plan_id)')
    .eq('id', workspaceId)
    .maybeSingle();
  return loadFullWorkspace(data as never);
}

/** Full load (including a one-time secret reveal) by the Stripe Checkout session that created it. */
export async function loadWorkspaceByCheckoutSession(sessionId: string): Promise<BackendWorkspace | null> {
  const client = requireClient();
  const { data } = await client
    .from('subscriptions')
    .select('workspaces!inner(id, name, environments(id), subscriptions(plan_id))')
    .eq('stripe_checkout_session_id', sessionId)
    .maybeSingle();
  const workspace = (data as unknown as { workspaces: { id: string; name: string; environments: { id: string }[]; subscriptions: { plan_id: string }[] } } | null)?.workspaces ?? null;
  return loadFullWorkspace(workspace);
}
