import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import Stripe from "npm:stripe@22.4.0";

export function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing configuration: ${name}`);
  return value;
}

function supabaseServerKey(): string {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    try {
      const keys = JSON.parse(raw) as Record<string, string>;
      if (keys.default) return keys.default;
    } catch {
      throw new Error("Invalid SUPABASE_SECRET_KEYS configuration");
    }
  }
  return env("SUPABASE_SERVICE_ROLE_KEY");
}

export const admin = () =>
  createClient(env("SUPABASE_URL"), supabaseServerKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
export const stripeClient = () => {
  const key = env("STRIPE_SECRET_KEY");
  if (!/^[rs]k_test_/.test(key)) {
    throw new Error("This milestone requires a Stripe test-mode key");
  }
  return new Stripe(key, { apiVersion: "2026-07-29.dahlia" });
};
export const appUrl = () =>
  (Deno.env.get("APEX_APP_URL") || "https://wglewis0721.github.io/apex/")
    .replace(/\/$/, "") + "/";
export function response(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Access-Control-Allow-Origin": new URL(appUrl()).origin,
      "Access-Control-Allow-Headers":
        "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Cache-Control": "no-store",
      "Vary": "Origin",
    },
  });
}
export async function authenticated(req: Request) {
  const token = req.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw new Error("UNAUTHORIZED");
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user || !data.user.email_confirmed_at) {
    throw new Error("UNAUTHORIZED");
  }
  return data.user;
}
export function failure(error: unknown): Response {
  const unauthorized = error instanceof Error &&
    error.message === "UNAUTHORIZED";
  // Never return Stripe payloads, credentials, database details, or tokens.
  return response({
    error: unauthorized
      ? "Sign in with a confirmed email to continue."
      : "Could not complete this request. Please retry.",
  }, unauthorized ? 401 : 503);
}
export function checked<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw new Error("Database operation failed");
  return data;
}
export const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id ?? null;
