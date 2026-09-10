import {
  admin,
  appUrl,
  checked,
  env,
} from "../_shared/core.ts";

const encoder = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

type StripeOAuthMode = "test" | "sandbox";

async function encryptionKey(value: string) {
  const bytes = unb64(value);
  if (bytes.length !== 32) {
    throw new Error("Credential encryption key must contain 32 random bytes");
  }
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt"]);
}

async function encryptRefreshToken(
  token: string,
  workspaceId: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = encoder.encode(`stripe-app-oauth:${workspaceId}`);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData },
    await encryptionKey(env("APEX_CREDENTIAL_ENCRYPTION_KEY")),
    encoder.encode(token),
  );
  return `v1.${b64(iv)}.${b64(new Uint8Array(encrypted))}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function modeFromState(state: string): StripeOAuthMode | null {
  if (state.startsWith("test.")) return "test";
  if (state.startsWith("sandbox.")) return "sandbox";
  return null;
}

function exchangeKeyFor(mode: StripeOAuthMode): string {
  const name = mode === "sandbox"
    ? "STRIPE_APP_SANDBOX_SECRET_KEY"
    : "STRIPE_APP_TEST_SECRET_KEY";
  const key = env(name);
  // Preserve the previously-supported restricted test-key prefix. Stripe will
  // still reject an rk_test_ key at exchange time if it lacks the permissions
  // required by the app, but configuration should not fail solely on prefix.
  if (!/^[rs]k_test_/.test(key)) {
    throw new Error(`Invalid ${name}`);
  }
  return key;
}

function back(status: string): Response {
  const url = new URL(appUrl());
  url.searchParams.set("stripe", status);
  url.hash = "start";
  return Response.redirect(url.toString(), 303);
}

async function clearConnection(workspaceId: string) {
  const db = admin();
  await db.from("stripe_oauth_tokens").delete().eq("workspace_id", workspaceId);
  await db.from("stripe_connections").upsert({
    workspace_id: workspaceId,
    stripe_account_id: null,
    status: "not_connected",
    connected_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "workspace_id" });
}

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  if (!state || state.length < 32 || state.length > 256) return back("invalid");
  const mode = modeFromState(state);
  if (!mode) return back("invalid");

  const db = admin();
  const stateHash = await sha256Hex(state);
  const now = new Date().toISOString();

  // Claim the state exactly once before exchanging Stripe's one-time code.
  // Because the mode is part of the hashed state, it can't be changed without
  // making the stored CSRF state fail validation.
  const claimed = checked(
    await db.from("stripe_connect_oauth_states")
      .update({ consumed_at: now })
      .eq("state_hash", stateHash)
      .is("consumed_at", null)
      .gt("expires_at", now)
      .select("workspace_id,user_id")
      .maybeSingle(),
  );
  if (!claimed) return back("invalid");

  const billing = checked(
    await db.from("apex_billing_accounts")
      .select("payment_status,workspace_id")
      .eq("user_id", claimed.user_id)
      .eq("workspace_id", claimed.workspace_id)
      .maybeSingle(),
  );
  const membership = checked(
    await db.from("workspace_members")
      .select("role")
      .eq("user_id", claimed.user_id)
      .eq("workspace_id", claimed.workspace_id)
      .maybeSingle(),
  );
  if (billing?.payment_status !== "paid" || membership?.role !== "owner") {
    await clearConnection(claimed.workspace_id);
    return back("invalid");
  }

  if (url.searchParams.get("error")) {
    await clearConnection(claimed.workspace_id);
    return back("cancelled");
  }

  const code = url.searchParams.get("code");
  if (!code) {
    await clearConnection(claimed.workspace_id);
    return back("error");
  }

  try {
    // Stripe requires the API key used for the OAuth code exchange to match
    // the install link type: developer test key for Test Mode, managed-sandbox
    // key for a general Sandbox install.
    const developerKey = exchangeKeyFor(mode);

    const tokenResponse = await fetch("https://api.stripe.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${developerKey}:`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
      }),
    });
    const token = await tokenResponse.json().catch(() => ({})) as {
      access_token?: string;
      refresh_token?: string;
      stripe_user_id?: string;
      livemode?: boolean;
      scope?: string;
      token_type?: string;
    };
    if (
      !tokenResponse.ok ||
      !token.access_token ||
      !token.refresh_token ||
      !token.stripe_user_id ||
      token.livemode !== false ||
      token.scope !== "stripe_apps"
    ) {
      throw new Error("Stripe Apps OAuth exchange failed");
    }

    // Verify the OAuth access token identifies the same account Stripe returned.
    const accountResponse = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const account = await accountResponse.json().catch(() => ({})) as { id?: string };
    if (!accountResponse.ok || account.id !== token.stripe_user_id) {
      throw new Error("Stripe account verification failed");
    }

    const ciphertext = await encryptRefreshToken(
      token.refresh_token,
      claimed.workspace_id,
    );
    const connectedAt = new Date().toISOString();

    // Persist the encrypted refresh token first. The public connection is only
    // marked connected after durable OAuth credentials exist.
    checked(
      await db.from("stripe_oauth_tokens").upsert({
        workspace_id: claimed.workspace_id,
        refresh_token_ciphertext: ciphertext,
        livemode: false,
        scope: token.scope,
        install_mode: mode,
        updated_at: connectedAt,
      }, { onConflict: "workspace_id" }),
    );

    checked(
      await db.from("stripe_connections").upsert({
        workspace_id: claimed.workspace_id,
        stripe_account_id: token.stripe_user_id,
        status: "connected",
        connected_at: connectedAt,
        updated_at: connectedAt,
      }, { onConflict: "workspace_id" }),
    );

    return back("connected");
  } catch {
    await clearConnection(claimed.workspace_id);
    return back("error");
  }
}

if (import.meta.main) Deno.serve(handler);
