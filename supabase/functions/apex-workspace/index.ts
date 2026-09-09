import {
  admin,
  authenticated,
  checked,
  env,
  failure,
  response,
} from "../_shared/core.ts";
import { decryptCredential } from "../_shared/credentials.ts";
export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return response({});
  if (req.method !== "POST") {
    return response({ error: "Method not allowed" }, 405);
  }
  try {
    const user = await authenticated(req);
    const db = admin();
    const billing = checked(
      await db.from("apex_billing_accounts").select(
        "workspace_id,payment_status,subscription_status",
      ).eq("user_id", user.id).maybeSingle(),
    );
    if (!billing?.workspace_id || billing.payment_status !== "paid") {
      return response({ status: "pending" });
    }
    const membership = checked(
      await db.from("workspace_members").select("role").eq("user_id", user.id)
        .eq("workspace_id", billing.workspace_id).maybeSingle(),
    );
    if (membership?.role !== "owner") {
      return response({ error: "Workspace owner access required" }, 403);
    }
    const workspace = checked(
      await db.from("workspaces").select("id,name").eq(
        "id",
        billing.workspace_id,
      ).single(),
    );
    if (!workspace) throw new Error("Workspace missing");
    const environment = checked(
      await db.from("environments").select("id,name").eq(
        "workspace_id",
        workspace.id,
      ).eq("name", "sandbox").single(),
    );
    if (!environment) throw new Error("Environment missing");
    const credentials = checked(
      await db.from("api_keys").select("publishable_key,secret_key_ciphertext")
        .eq("workspace_id", workspace.id).eq("environment_id", environment.id)
        .eq("status", "active").single(),
    );
    if (!credentials) throw new Error("Credentials missing");
    const { reveal = false } = await req.json();
    return response({
      status: "ready",
      workspace,
      environment,
      subscriptionStatus: billing.subscription_status,
      publishable: credentials.publishable_key,
      ...(reveal
        ? {
          secret: await decryptCredential(
            credentials.secret_key_ciphertext,
            env("APEX_CREDENTIAL_ENCRYPTION_KEY"),
            user.id,
          ),
        }
        : {}),
    });
  } catch (error) {
    return failure(error);
  }
}

if (import.meta.main) Deno.serve(handler);
