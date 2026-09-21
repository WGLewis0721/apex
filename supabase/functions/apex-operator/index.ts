import {
  admin,
  authenticated,
  checked,
  failure,
  response,
} from "../_shared/core.ts";

const PRICE_ID_PATTERN = /^price_[A-Za-z0-9_]+$/;

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

function validatePriceId(value: unknown) {
  const priceId = typeof value === "string" ? value.trim() : "";
  if (!PRICE_ID_PATTERN.test(priceId) || priceId.length > 255) {
    return { error: "Use a Stripe Price ID such as price_test_example." };
  }
  return { priceId };
}

function validateAmount(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return { error: "Credit amount must be a whole number greater than zero." };
  }
  return { amount };
}

function mappingRow(row: {
  id: string;
  stripe_price_id: string;
  credit_amount: number | string;
  is_active: boolean;
  updated_at: string;
}) {
  return {
    id: row.id,
    stripe_price_id: row.stripe_price_id,
    credit_amount: Number(row.credit_amount),
    is_active: row.is_active,
    updated_at: row.updated_at,
  };
}

function needsMapping(event: { last_error?: string | null; retry_operator_action?: string | null }) {
  const error = event.last_error ?? "";
  const action = event.retry_operator_action ?? "";
  return error.includes("unconfigured_stripe_price")
    || error.includes("mapping_required")
    || action === "mapping_required";
}

async function requeueMappingBlockedEvents(workspaceId: string) {
  const db = admin();
  const events = checked(await db.from("stripe_webhook_events")
    .select("id,status,last_error,retry_operator_action")
    .eq("workspace_id", workspaceId)
    .in("status", ["failed", "received"])) ?? [];
  let requeued = 0;
  for (const event of events) {
    if (!needsMapping(event)) continue;
    const result = await db.rpc("requeue_connected_stripe_retry", {
      p_receipt_id: event.id,
      p_workspace_id: workspaceId,
    });
    if (result.error) throw new Error("Database operation failed");
    if (result.data === true) requeued += 1;
  }
  return requeued;
}

async function snapshot(workspaceId: string) {
  const db = admin();
  const [workspaceResult, connectionsResult, customersResult, accountsResult,
    grantsResult, ledgerResult, eventsResult, mappingsResult] = await Promise.all([
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
    db.from("stripe_webhook_events").select("id,stripe_connection_id,stripe_event_id,event_type,status,attempt_count,last_error,retry_operator_action,received_at,processed_at,updated_at")
      .eq("workspace_id", workspaceId).order("received_at", { ascending: false }).limit(100),
    db.from("stripe_credit_price_mappings").select("id,stripe_price_id,credit_amount,is_active,updated_at")
      .eq("workspace_id", workspaceId).order("stripe_price_id", { ascending: true }),
  ]);

  const events = checked(eventsResult) ?? [];
  return {
    asOf: new Date().toISOString(),
    workspace: checked(workspaceResult),
    connections: checked(connectionsResult) ?? [],
    customers: checked(customersResult) ?? [],
    accounts: checked(accountsResult) ?? [],
    grants: checked(grantsResult) ?? [],
    ledger: checked(ledgerResult) ?? [],
    events,
    mappings: (checked(mappingsResult) ?? []).map(mappingRow),
    mappingNeeded: events.some(needsMapping),
  };
}

async function upsertMapping(workspaceId: string, body: Record<string, unknown>) {
  const price = validatePriceId(body.stripe_price_id);
  if ("error" in price) return response({ error: price.error }, 400);
  const credits = validateAmount(body.credit_amount);
  if ("error" in credits) return response({ error: credits.error }, 400);

  const db = admin();
  const existing = checked(await db.from("stripe_credit_price_mappings")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("stripe_price_id", price.priceId)
    .maybeSingle());

  const saved = existing
    ? checked(await db.from("stripe_credit_price_mappings").update({
      credit_amount: credits.amount,
      is_active: true,
      updated_at: new Date().toISOString(),
    }).eq("id", existing.id).eq("workspace_id", workspaceId)
      .select("id,stripe_price_id,credit_amount,is_active,updated_at").single())
    : checked(await db.from("stripe_credit_price_mappings").insert({
      workspace_id: workspaceId,
      stripe_price_id: price.priceId,
      credit_amount: credits.amount,
      is_active: true,
    }).select("id,stripe_price_id,credit_amount,is_active,updated_at").single());

  const requeued = await requeueMappingBlockedEvents(workspaceId);
  return response({ mapping: mappingRow(saved!), requeued });
}

async function setMappingActive(workspaceId: string, body: Record<string, unknown>) {
  const mappingId = typeof body.mapping_id === "string" ? body.mapping_id : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mappingId)) {
    return response({ error: "Choose an existing price mapping." }, 400);
  }
  if (typeof body.is_active !== "boolean") {
    return response({ error: "Choose whether this price should stay active." }, 400);
  }

  const db = admin();
  const saved = checked(await db.from("stripe_credit_price_mappings").update({
    is_active: body.is_active,
    updated_at: new Date().toISOString(),
  }).eq("id", mappingId).eq("workspace_id", workspaceId)
    .select("id,stripe_price_id,credit_amount,is_active,updated_at").maybeSingle());
  if (!saved) return response({ error: "That price mapping is not in this workspace." }, 404);
  const requeued = saved.is_active ? await requeueMappingBlockedEvents(workspaceId) : 0;
  return response({ mapping: mappingRow(saved), requeued });
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return response({});
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  try {
    const workspaceId = await ownedWorkspace(req);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "snapshot";

    if (action === "upsert_price_mapping") return await upsertMapping(workspaceId, body);
    if (action === "set_price_mapping_active") return await setMappingActive(workspaceId, body);
    if (action !== "snapshot") return response({ error: "Unknown operator action." }, 404);

    return response(await snapshot(workspaceId));
  } catch (error) {
    console.error("APEX operator request failed");
    return failure(error);
  }
}

if (import.meta.main) Deno.serve(handler);
