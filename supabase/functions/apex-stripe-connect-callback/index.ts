import {
  admin,
  appUrl,
  checked,
  env,
  stripeClient,
} from "../_shared/core.ts";

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function back(status: string): Response {
  const url = new URL(appUrl());
  url.searchParams.set("stripe", status);
  url.hash = "start";
  return Response.redirect(url.toString(), 303);
}

async function markNotConnected(workspaceId: string) {
  await admin().from("stripe_connections").upsert({
    workspace_id: workspaceId,
    stripe_account_id: null,
    status: "not_connected",
    connected_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "workspace_id" });
}

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });

  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  if (!state || state.length < 32 || state.length > 256) return back("invalid");

  const db = admin();
  const stateHash = await sha256Hex(state);
  const now = new Date().toISOString();

  // Claim the state before exchanging Stripe's one-time code. Stripe warns
  // that exchanging the same code twice can revoke the connection, so the
  // compare-and-set below makes callback processing single-use.
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
    await markNotConnected(claimed.workspace_id);
    return back("invalid");
  }

  if (url.searchParams.get("error")) {
    await markNotConnected(claimed.workspace_id);
    return back("cancelled");
  }

  const code = url.searchParams.get("code");
  if (!code) {
    await markNotConnected(claimed.workspace_id);
    return back("error");
  }

  try {
    const secret = env("STRIPE_SECRET_KEY");
    if (!/^[rs]k_test_/.test(secret)) throw new Error("Test key required");

    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code,
    });
    const tokenResponse = await fetch("https://connect.stripe.com/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${secret}:`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
    const token = await tokenResponse.json().catch(() => ({})) as {
      stripe_user_id?: string;
      livemode?: boolean;
      scope?: string;
    };
    if (!tokenResponse.ok || !token.stripe_user_id || token.livemode !== false) {
      throw new Error("Stripe OAuth exchange failed");
    }

    // OAuth access/refresh tokens are intentionally discarded. Stripe's current
    // guidance is to use the platform key plus Stripe-Account for connected calls.
    const account = await stripeClient().accounts.retrieve(token.stripe_user_id);
    if (!account || account.id !== token.stripe_user_id) {
      throw new Error("Connected account could not be verified");
    }

    checked(
      await db.from("stripe_connections").upsert({
        workspace_id: claimed.workspace_id,
        stripe_account_id: token.stripe_user_id,
        status: "connected",
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "workspace_id" }),
    );

    return back("connected");
  } catch {
    await markNotConnected(claimed.workspace_id);
    return back("error");
  }
}

if (import.meta.main) Deno.serve(handler);
