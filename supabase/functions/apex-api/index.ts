import { admin } from "../_shared/core.ts";
import { authenticateApexApi } from "../_shared/apex_api_auth.ts";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function fail(error: unknown) {
  const unauthorized = error instanceof Error && error.message === "UNAUTHORIZED";
  return json({ error: unauthorized ? "Unauthorized" : "Could not complete request" }, unauthorized ? 401 : 503);
}

function routeParts(req: Request) {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const v1 = parts.lastIndexOf("v1");
  return v1 >= 0 ? parts.slice(v1) : parts;
}

function isUuid(value: string | undefined) {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function handler(req: Request): Promise<Response> {
  try {
    const identity = await authenticateApexApi(req);
    const parts = routeParts(req);
    if (parts[0] !== "v1" || parts[1] !== "customers" || !isUuid(parts[2])) {
      return json({ error: "Not found" }, 404);
    }

    const customerId = parts[2];
    const action = parts[3];
    const db = admin();

    if (req.method === "GET" && action === "balance") {
      const { data, error } = await db.rpc("get_credit_balance", {
        p_workspace_id: identity.workspaceId,
        p_customer_id: customerId,
      });
      if (error) throw error;
      return json(data);
    }

    if (req.method === "GET" && action === "entitlements") {
      const { data, error } = await db.rpc("get_customer_entitlements", {
        p_workspace_id: identity.workspaceId,
        p_customer_id: customerId,
      });
      if (error) throw error;
      return json(data);
    }

    if (req.method === "POST" && action === "consume") {
      const body = await req.json().catch(() => null) as { amount?: number; idempotency_key?: string } | null;
      const amount = body?.amount;
      const idempotencyKey = body?.idempotency_key?.trim();
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || !idempotencyKey || idempotencyKey.length > 200) {
        return json({ error: "amount and idempotency_key are required" }, 400);
      }

      const { data, error } = await db.rpc("consume_credits", {
        p_workspace_id: identity.workspaceId,
        p_customer_id: customerId,
        p_amount: amount,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;
      return json(data);
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    console.error("APEX API request failed");
    return fail(error);
  }
}

if (import.meta.main) Deno.serve(handler);
