import { admin, authenticated, checked } from "../_shared/core.ts";
import { authenticateApexApi } from "../_shared/apex_api_auth.ts";
import {
  processPersistedStripeReceipt,
  type PersistedStripeReceipt,
} from "../_shared/process_persisted_stripe_event.ts";

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function isUuid(value: string | undefined) {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function authorize(req: Request): Promise<{ workspaceId: string | null; includeHeld: boolean }> {
  const retrySecret = Deno.env.get("APEX_EVENT_RETRY_SECRET");
  const provided = req.headers.get("x-apex-retry-secret") ?? "";
  if (retrySecret && provided && timingSafeEqual(provided, retrySecret)) {
    return { workspaceId: null, includeHeld: false };
  }

  try {
    const identity = await authenticateApexApi(req);
    return { workspaceId: identity.workspaceId, includeHeld: true };
  } catch {
    // fall through to operator session
  }

  const user = await authenticated(req);
  const db = admin();
  const billing = checked(await db.from("apex_billing_accounts")
    .select("workspace_id,payment_status").eq("user_id", user.id).maybeSingle());
  if (!billing?.workspace_id || billing.payment_status !== "paid") throw new Error("UNAUTHORIZED");
  const membership = checked(await db.from("workspace_members")
    .select("role").eq("workspace_id", billing.workspace_id).eq("user_id", user.id).maybeSingle());
  if (membership?.role !== "owner") throw new Error("UNAUTHORIZED");
  return { workspaceId: billing.workspace_id as string, includeHeld: true };
}

async function processClaimed(claimToken: string, rows: PersistedStripeReceipt[]) {
  const db = admin();
  const results = [];
  for (const row of rows) {
    const outcome = await processPersistedStripeReceipt(row);
    if (outcome.kind === "processed" || outcome.kind === "replayed" || outcome.kind === "ignored") {
      results.push({ id: row.id, stripe_event_id: row.stripe_event_id, outcome: outcome.kind });
      continue;
    }
    const failed = checked(await db.rpc("fail_stripe_webhook_event", {
      p_event_row_id: row.id,
      p_reason: outcome.reason,
      p_failure_class: outcome.kind === "pending_settlement" ? "pending_settlement" : outcome.failureClass,
      p_claim_token: claimToken,
    }));
    results.push({
      id: row.id,
      stripe_event_id: row.stripe_event_id,
      outcome: outcome.kind,
      failure: failed,
    });
  }
  return results;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return json({});
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = await authorize(req);
    const body = await req.json().catch(() => ({})) as {
      limit?: number;
      event_id?: string;
    };
    const limit = body.limit ?? (body.event_id ? 1 : 25);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return json({ error: "limit must be an integer between 1 and 100" }, 400);
    }
    if (body.event_id !== undefined && !isUuid(body.event_id)) {
      return json({ error: "event_id must be a stripe_webhook_events row uuid" }, 400);
    }

    const claimToken = crypto.randomUUID();
    const db = admin();

    if (body.event_id && auth.workspaceId) {
      checked(await db.rpc("request_stripe_event_replay", {
        p_workspace_id: auth.workspaceId,
        p_event_row_id: body.event_id,
      }));
    }

    const claimed = checked(await db.rpc("claim_stripe_webhook_events", {
      p_limit: limit,
      p_claim_token: claimToken,
      p_stale_after: "5 minutes",
      p_workspace_id: auth.workspaceId,
      p_event_row_id: body.event_id ?? null,
      p_include_held: Boolean(body.event_id && auth.workspaceId),
    })) as PersistedStripeReceipt[] | null;

    const rows = claimed ?? [];
    const results = await processClaimed(claimToken, rows);
    return json({
      claimed: rows.length,
      workspace_scoped: Boolean(auth.workspaceId),
      results,
    });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === "UNAUTHORIZED";
    console.error("APEX stripe event retry failed");
    return json(
      { error: unauthorized ? "Unauthorized" : "Could not complete request" },
      unauthorized ? 401 : 503,
    );
  }
}

if (import.meta.main) Deno.serve(handler);
