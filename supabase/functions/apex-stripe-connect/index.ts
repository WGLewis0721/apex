import {
  admin,
  authenticated,
  checked,
  env,
  failure,
  response,
} from "../_shared/core.ts";

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function callbackUrl(): string {
  return env("SUPABASE_URL").replace(/\/$/, "") +
    "/functions/v1/apex-stripe-connect-callback";
}

async function ownerWorkspace(userId: string) {
  const db = admin();
  const billing = checked(
    await db.from("apex_billing_accounts")
      .select("workspace_id,payment_status")
      .eq("user_id", userId)
      .maybeSingle(),
  );
  if (!billing?.workspace_id || billing.payment_status !== "paid") {
    throw new Error("WORKSPACE_REQUIRED");
  }
  const membership = checked(
    await db.from("workspace_members")
      .select("role")
      .eq("workspace_id", billing.workspace_id)
      .eq("user_id", userId)
      .maybeSingle(),
  );
  if (membership?.role !== "owner") throw new Error("OWNER_REQUIRED");
  return billing.workspace_id as string;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return response({});
  if (req.method !== "POST") {
    return response({ error: "Method not allowed" }, 405);
  }
  try {
    const user = await authenticated(req);
    const workspaceId = await ownerWorkspace(user.id);
    const db = admin();
    const body = await req.json().catch(() => ({}));
    const action = body?.action === "start" ? "start" : "status";

    const connection = checked(
      await db.from("stripe_connections")
        .select("stripe_account_id,status,connected_at")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
    );

    if (action === "status") {
      return response({
        status: connection?.status ?? "not_connected",
        stripeAccountId: connection?.stripe_account_id ?? null,
        connectedAt: connection?.connected_at ?? null,
      });
    }

    if (connection?.status === "connected" && connection.stripe_account_id) {
      return response({
        status: "connected",
        stripeAccountId: connection.stripe_account_id,
      });
    }

    const clientId = env("STRIPE_CONNECT_CLIENT_ID");
    if (!/^ca_[A-Za-z0-9]+$/.test(clientId)) {
      throw new Error("Invalid Stripe Connect client ID");
    }

    const state = randomState();
    const stateHash = await sha256Hex(state);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();

    checked(
      await db.from("stripe_connect_oauth_states").insert({
        workspace_id: workspaceId,
        user_id: user.id,
        state_hash: stateHash,
        expires_at: expiresAt,
      }),
    );

    checked(
      await db.from("stripe_connections").upsert({
        workspace_id: workspaceId,
        stripe_account_id: null,
        status: "pending",
        connected_at: null,
        updated_at: now.toISOString(),
      }, { onConflict: "workspace_id" }),
    );

    const authorize = new URL("https://connect.stripe.com/oauth/authorize");
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("client_id", clientId);
    authorize.searchParams.set("scope", "read_only");
    authorize.searchParams.set("redirect_uri", callbackUrl());
    authorize.searchParams.set("state", state);
    if (user.email) authorize.searchParams.set("stripe_user[email]", user.email);

    return response({ url: authorize.toString(), status: "pending" });
  } catch (error) {
    if (error instanceof Error && error.message === "WORKSPACE_REQUIRED") {
      return response({ error: "A paid workspace is required before connecting Stripe." }, 409);
    }
    if (error instanceof Error && error.message === "OWNER_REQUIRED") {
      return response({ error: "Only the workspace owner can connect Stripe." }, 403);
    }
    return failure(error);
  }
}

if (import.meta.main) Deno.serve(handler);
