import Stripe from "npm:stripe@22.4.0";
import { admin, checked, env } from "./core.ts";
import { decryptCredential } from "./credentials.ts";

export async function connectedStripe(workspaceId: string) {
  const db = admin();
  const token = checked(await db.from("stripe_oauth_tokens")
    .select("refresh_token_ciphertext,install_mode").eq("workspace_id", workspaceId).single());
  if (!token) throw new Error("Stripe OAuth credentials missing");
  const refreshToken = await decryptCredential(
    token.refresh_token_ciphertext, env("APEX_CREDENTIAL_ENCRYPTION_KEY"), workspaceId,
  );
  const response = await fetch("https://api.stripe.com/v1/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // The refresh exchange uses the same mode-specific developer key that
      // accepted the authorization code. It never reaches the browser.
      Authorization: `Basic ${btoa(`${env(token.install_mode === "sandbox" ? "STRIPE_APP_SANDBOX_SECRET_KEY" : "STRIPE_APP_TEST_SECRET_KEY")}:`)}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json().catch(() => ({})) as { access_token?: string };
  if (!response.ok || !body.access_token) throw new Error("Stripe OAuth refresh failed");
  return new Stripe(body.access_token, { apiVersion: "2026-07-29.dahlia", timeout: 10000, maxNetworkRetries: 0 });
}

// Normalization and ledger processing live in `connected_stripe_ingress.ts`,
// the single server-side processor for both initial delivery and retry. This
// module only builds the connected-account Stripe client.
