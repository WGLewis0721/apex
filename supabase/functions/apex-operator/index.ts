import {
  admin,
  authenticated,
  checked,
  failure,
  response,
} from "../_shared/core.ts";

async function ownedWorkspace(req: Request) {
  const user = await authenticated(req);
  const db = admin();
  const billing = checked(await db.from("apex_billing_accounts")
    .select("workspace_id,payment_status")
    .eq("user_id", user.id).maybeSingle());
  if (!billing?.workspace_id || billing.payment_status !== "paid") {
    throw new Error("UNAUTHORIZED");
  }
  const membership = checked(await db.from("workspace_members")
    .select("role").eq("workspace_id", billing.workspace_id)
    .eq("user_id", user.id).maybeSingle());
  if (membership?.role !== "owner") throw new Error("UNAUTHORIZED");
  return billing.workspace_id as string;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return response({});
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  try {
    const workspaceId = await ownedWorkspace(req);
    const db = admin();
    const [workspaceResult, connectionsResult, customersResult, accountsResult,
      grantsResult, ledgerResult, eventsResult] = await Promise.all([
      db.from("workspaces").select("id,name,status,created_at").eq("id", workspaceId).single(),
      db.from("stripe_connections").select("id,stripe_account_id,status,connected_at,updated_at")
        .eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(10),
      db.from("customers").select("id,external_id,stripe_customer_id,status,created_at")
        .eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(100),
      db.from("credit_accounts").select("customer_id,remaining,version,updated_at")
        .eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(100),
      db.from("credit_grants").select("id,customer_id,amount,consumed_amount,remaining_amount,status,reason,source_stripe_event_id,source_payment_id,created_at")
        .eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(100),
      db.from("credit_ledger").select("id,customer_id,credit_grant_id,entry_type,amount,idempotency_key,created_at")
        .eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(100),
      db.from("stripe_webhook_events").select("id,stripe_connection_id,stripe_event_id,event_type,status,attempt_count,last_error,received_at,processed_at,updated_at")
        .eq("workspace_id", workspaceId).order("received_at", { ascending: false }).limit(100),
    ]);

    return response({
      asOf: new Date().toISOString(),
      workspace: checked(workspaceResult),
      connections: checked(connectionsResult) ?? [],
      customers: checked(customersResult) ?? [],
      accounts: checked(accountsResult) ?? [],
      grants: checked(grantsResult) ?? [],
      ledger: checked(ledgerResult) ?? [],
      events: checked(eventsResult) ?? [],
    });
  } catch (error) {
    console.error("APEX operator snapshot failed");
    return failure(error);
  }
}

if (import.meta.main) Deno.serve(handler);
