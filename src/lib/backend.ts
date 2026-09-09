import { supabase } from './supabaseClient';

// Account, billing, workspace, and Stripe Connect calls for the real onboarding flow.

export type BackendAccount = { userId: string; email: string; fullName: string | null; companyName: string | null };

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
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
  const emailRedirectTo = `${window.location.origin}${window.location.pathname}#start`;
  const { data, error } = await client.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { full_name: input.name, company_name: input.company },
      emailRedirectTo,
    },
  });

  if (error) {
    if (/already registered|already exists/i.test(error.message)) {
      return signIn({ email: input.email, password: input.password });
    }
    throw new Error(error.message);
  }

  if (!data.session) throw new Error('Check your email to confirm your account, then log in here.');
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

export type ProvisionedWorkspace = {
  status: 'ready'; workspace: { id: string; name: string }; environment: { id: string; name: string };
  subscriptionStatus: string; publishable: string; secret?: string;
};

export type StripeConnection = {
  status: 'not_connected' | 'pending' | 'connected' | 'disconnected';
  stripeAccountId: string | null;
  connectedAt: string | null;
};

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const client = requireClient();
  const { data: session } = await client.auth.getSession();
  if (!session.session) throw new Error('Sign in and confirm your email before continuing.');
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? 'Could not reach APEX. Please try again.');
  }
  return data as T;
}

export const startCheckout = () => invoke<{ url?: string; pending?: boolean; provisioned?: boolean }>('apex-checkout', { planId: 'founding' });
export const getProvisionedWorkspace = (reveal = false) => invoke<ProvisionedWorkspace | { status: 'pending' }>('apex-workspace', { reveal });
export const getStripeConnection = () => invoke<StripeConnection>('apex-stripe-connect', { action: 'status' });
export const startStripeConnect = () => invoke<{ url?: string; status: 'pending' | 'connected'; stripeAccountId?: string }>('apex-stripe-connect', { action: 'start' });
