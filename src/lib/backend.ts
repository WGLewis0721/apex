import { supabase } from './supabaseClient';

// Thin data-access layer between the onboarding UI and real Supabase Auth.
// Keeping every Supabase call in this one file means Onboarding.tsx only
// ever calls plain async functions — it doesn't know or care that the
// underlying store used to be entirely local.
//
// Scope: account signup/login only. Purchase, workspace provisioning,
// Stripe Checkout, and everything after "Create account" in the canonical
// funnel remain simulated until a later phase (see ROADMAP.md).

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
