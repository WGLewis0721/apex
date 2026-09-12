import { admin, authenticated, checked, env, failure, response } from "../_shared/core.ts";

const encoder = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

async function encryptionKey() {
  const bytes = unb64(env("APEX_CREDENTIAL_ENCRYPTION_KEY"));
  if (bytes.length !== 32) throw new Error("Invalid credential encryption key");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt"]);
}

async function encrypt(secret: string, workspaceId: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(`manual-stripe-webhook:${workspaceId}`) },
    await encryptionKey(), encoder.encode(secret),
  );
  return `v1.${b64(iv)}.${b64(new Uint8Array(encrypted))}`;
}

async function ownerWorkspace(userId: string) {
  const db = admin();
  const billing = checked(await db.from("apex_billing_accounts")
    .select("workspace_id,payment_status").eq("user_id", userId).maybeSingle());
  if (!billing?.workspace_id || billing.payment_status !== "paid") throw new Error("WORKSPACE_REQUIRED");
  const member = checked(await db.from("workspace_members").select("role")
    .eq("workspace_id", billing.workspace_id).eq("user_id", userId).maybeSingle());
  if (member?.role !== "owner") throw new Error("OWNER_REQUIRED");
  return billing.workspace_id as string;
}

function endpoint(token: string) {
  return `${env("SUPABASE_URL").replace(/\/$/, "")}/functions/v1/apex-manual-stripe-webhook/${token}`;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return response({});
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);
  try {
    const user = await authenticated(req);
    const workspaceId = await ownerWorkspace(user.id);
    const body = await req.json().catch(() => ({}));
    const db = admin();
    let existing = checked(await db.from("stripe_manual_webhook_connections")
      .select("endpoint_token,enabled").eq("workspace_id", workspaceId).maybeSingle());

    if (body.action !== "configure") {
      if (!existing) {
        const connection = checked(await db.from("stripe_connections").upsert({
          workspace_id: workspaceId, stripe_account_id: `manual_webhook:${crypto.randomUUID()}`,
          status: "connected", connected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }, { onConflict: "workspace_id" }).select("id").single());
        existing = checked(await db.from("stripe_manual_webhook_connections").insert({
          workspace_id: workspaceId, stripe_connection_id: connection!.id, enabled: false,
        }).select("endpoint_token,enabled").single());
      }
      return response({ configured: !!existing!.enabled, endpoint: endpoint(existing!.endpoint_token) });
    }
    const signingSecret = typeof body.signingSecret === "string" ? body.signingSecret.trim() : "";
    if (!/^whsec_[A-Za-z0-9]+$/.test(signingSecret)) {
      return response({ error: "Paste the Stripe webhook signing secret (whsec_…)." }, 400);
    }

    let connection = checked(await db.from("stripe_connections").select("id")
      .eq("workspace_id", workspaceId).maybeSingle());
    if (!connection) {
      connection = checked(await db.from("stripe_connections").insert({
        workspace_id: workspaceId, stripe_account_id: `manual_webhook:${crypto.randomUUID()}`,
        status: "connected", connected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).select("id").single());
    } else {
      checked(await db.from("stripe_connections").update({
        stripe_account_id: `manual_webhook:${crypto.randomUUID()}`,
        status: "connected", connected_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", connection.id));
    }
    const ciphertext = await encrypt(signingSecret, workspaceId);
    const row = checked(await db.from("stripe_manual_webhook_connections").upsert({
      workspace_id: workspaceId, stripe_connection_id: connection!.id,
      signing_secret_ciphertext: ciphertext, enabled: true, updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id" }).select("endpoint_token").single());
    return response({ configured: true, endpoint: endpoint(row!.endpoint_token) });
  } catch (error) {
    if (error instanceof Error && error.message === "WORKSPACE_REQUIRED") return response({ error: "A paid workspace is required." }, 409);
    if (error instanceof Error && error.message === "OWNER_REQUIRED") return response({ error: "Only the workspace owner can configure Stripe." }, 403);
    return failure(error);
  }
}

if (import.meta.main) Deno.serve(handler);
