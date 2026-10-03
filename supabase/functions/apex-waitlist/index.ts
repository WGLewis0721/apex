import { waitlistHandlerFromEnv, type WaitlistEnv } from "../_shared/waitlist.ts";

// Public beta waitlist → Google Sheets; see docs/WAITLIST_API.md. Kept free of
// _shared/core.ts so the function does not bundle Stripe/Supabase clients.
const appUrl = Deno.env.get("APEX_APP_URL") || "https://wglewis0721.github.io/apex/";
const product = { product: "APEX", siteUrl: appUrl, allowedOrigins: [new URL(appUrl).origin] };

const GOOGLE_VARS = ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY", "WAITLIST_SPREADSHEET_ID"] as const;
const VAULT_NAMES: Record<(typeof GOOGLE_VARS)[number], string> = {
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "apex_waitlist_google_service_account_email",
  GOOGLE_PRIVATE_KEY: "apex_waitlist_google_private_key",
  WAITLIST_SPREADSHEET_ID: "apex_waitlist_spreadsheet_id",
};

function serviceKey(env: WaitlistEnv) {
  try {
    const keys = JSON.parse(env["SUPABASE_SECRET_KEYS"] ?? "{}") as Record<string, string>;
    if (keys["default"]) return keys["default"];
  } catch { /* fall back to the legacy key */ }
  return env["SUPABASE_SERVICE_ROLE_KEY"];
}

/**
 * Function secrets win. Otherwise the Google credentials come from Vault via
 * public.apex_waitlist_config(), which only the service role may execute.
 * Returns null on a lookup failure so the next request retries.
 */
async function loadEnv(): Promise<WaitlistEnv | null> {
  // Alerts are sent by the browser (docs/WAITLIST_API.md); a WAITLIST_NOTIFY_EMAIL
  // function secret turns the server-side alert back on.
  const env: WaitlistEnv = { WAITLIST_NOTIFY_EMAIL: "off", ...Deno.env.toObject() };
  if (GOOGLE_VARS.every((name) => env[name])) return env;
  const url = env["SUPABASE_URL"];
  const key = serviceKey(env);
  if (!url || !key) return env;
  try {
    const response = await fetch(`${url}/rest/v1/rpc/apex_waitlist_config`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      console.error("waitlist config lookup failed", response.status);
      return null;
    }
    const vault = (await response.json()) as Record<string, string | undefined>;
    const merged: WaitlistEnv = { ...env };
    for (const name of GOOGLE_VARS) merged[name] = env[name] || vault[VAULT_NAMES[name]];
    return merged;
  } catch (error) {
    console.error("waitlist config lookup failed", (error as Error)?.message ?? error);
    return null;
  }
}

let ready: Promise<(request: Request) => Promise<Response>> | null = null;

export async function handler(request: Request): Promise<Response> {
  ready ??= loadEnv().then((env) => {
    if (!env) {
      ready = null; // retry the lookup on the next request
      return waitlistHandlerFromEnv({ WAITLIST_NOTIFY_EMAIL: "off", ...Deno.env.toObject() }, product);
    }
    return waitlistHandlerFromEnv(env, product);
  });
  return (await ready)(request);
}

if (import.meta.main) Deno.serve(handler);
