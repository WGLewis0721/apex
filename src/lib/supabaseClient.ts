import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Both of these are meant to be public: a publishable key (sb_publishable_...)
// carries the same low privilege as the legacy anon key and is only ever as
// powerful as the RLS policies in supabase/migrations allow. There is no
// secret here — a real secret key is never used client-side.
export const supabase = url && publishableKey
  ? createClient(url, publishableKey, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

export const backendConfigured = supabase !== null;
