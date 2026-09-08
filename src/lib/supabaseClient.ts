import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Both of these are meant to be public: the anon key is only ever as
// powerful as the RLS policies in supabase/migrations allow. There is no
// secret here — real secrets (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
// SUPABASE_SERVICE_ROLE_KEY) live only in Supabase Edge Function config,
// never in this bundle.
export const supabase = url && anonKey
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

export const backendConfigured = supabase !== null;
