import { waitlistHandlerFromEnv } from "../_shared/waitlist.ts";

// Public beta waitlist → Google Sheets. Secrets are Supabase function secrets;
// see docs/WAITLIST_API.md. Kept free of _shared/core.ts so the function does
// not bundle Stripe/Supabase clients it never uses.
const appUrl = Deno.env.get("APEX_APP_URL") || "https://wglewis0721.github.io/apex/";

export const handler = waitlistHandlerFromEnv(Deno.env.toObject(), {
  product: "APEX",
  siteUrl: appUrl,
  allowedOrigins: [new URL(appUrl).origin],
});

if (import.meta.main) Deno.serve(handler);
