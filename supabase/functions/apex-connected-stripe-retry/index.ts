import { admin, checked } from "../_shared/core.ts";
import { connectedStripe } from "../_shared/connected_event.ts";
import { processConnectedStripeEvent } from "../_shared/connected_stripe_ingress.ts";

type Receipt = {
  id: string; retry_claim: string; stripe_connection_id: string;
  stripe_event_id: string; workspace_id: string; event_type: string;
  payload: { account: string; install_mode: string; livemode: boolean; object_id: string };
};
class OperatorAction extends Error {}

async function retry(receipt: Receipt): Promise<void> {
  const db = admin();
  try {
    const connection = checked(await db.from("stripe_connections")
      .select("id,workspace_id,stripe_account_id,status")
      .eq("id", receipt.stripe_connection_id).maybeSingle());
    const token = checked(await db.from("stripe_oauth_tokens")
      .select("livemode,install_mode").eq("workspace_id", receipt.workspace_id).maybeSingle());
    if (!connection || connection.status !== "connected" || connection.workspace_id !== receipt.workspace_id ||
      connection.stripe_account_id !== receipt.payload.account || !token || token.livemode !== false ||
      token.install_mode !== receipt.payload.install_mode || receipt.payload.livemode !== false ||
      !["test", "sandbox"].includes(token.install_mode)) throw new OperatorAction("binding_mismatch");

    const stripe = await connectedStripe(receipt.workspace_id);
    const account = await stripe.accounts.retrieve(null);
    if (account.id !== receipt.payload.account) throw new OperatorAction("binding_mismatch");
    // Retrieve by persisted Stripe event ID, never by caller-provided object or grant.
    const event = await stripe.events.retrieve(receipt.stripe_event_id);
    if (event.id !== receipt.stripe_event_id || event.type !== receipt.event_type || event.livemode !== false ||
      (event.account && event.account !== receipt.payload.account) ||
      (event.data.object as { id?: string }).id !== receipt.payload.object_id) throw new OperatorAction("binding_mismatch");
    // Same processor as initial delivery; only the RPC is lease-fenced so a
    // stale worker cannot write after its claim expired.
    const outcome = await processConnectedStripeEvent({
      connectionId: connection.id,
      stripeEventId: receipt.stripe_event_id,
      event,
      stripe,
      rpc: async (args) => {
        const { data, error } = await db.rpc("process_claimed_stripe_retry", {
          p_receipt_id: receipt.id, p_claim: receipt.retry_claim, p_args: args,
        });
        // Only classify known DB errors; never retain arbitrary provider/DB text.
        if (error?.message.includes("unconfigured_stripe_price")) throw new OperatorAction("mapping_required");
        if (error?.message.includes("retry_binding_mismatch")) throw new OperatorAction("binding_mismatch");
        return checked({ data, error });
      },
    });

    if (outcome.status === "failed") {
      const reason = outcome.error === "APEX_CUSTOMER_NOT_FOUND"
        ? "customer_required"
        : outcome.error === "NO_MAPPABLE_PRICE_LINES"
        ? "mapping_required"
        : outcome.permanent
        ? "source_required"
        : "processing_failed";
      checked(await db.rpc("finish_connected_stripe_retry", {
        p_receipt_id: receipt.id, p_claim: receipt.retry_claim,
        p_reason: reason, p_operator: Boolean(outcome.permanent),
      }));
      return;
    }
    if (outcome.kind === "noop") {
      checked(await db.rpc("finish_connected_stripe_retry", {
        p_receipt_id: receipt.id, p_claim: receipt.retry_claim,
        p_reason: "payment_pending", p_operator: false,
      }));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const sourceMissing = message.includes("refund_source_ambiguous");
    const attributionMissing = message.includes("APEX_CUSTOMER_NOT_FOUND") ||
      message.includes("customer_not_in_workspace");
    const reason = error instanceof OperatorAction ? error.message : sourceMissing ? "source_required" :
      attributionMissing ? "customer_required" : "processing_failed";
    checked(await db.rpc("finish_connected_stripe_retry", {
      p_receipt_id: receipt.id, p_claim: receipt.retry_claim, p_reason: reason,
      p_operator: error instanceof OperatorAction || sourceMissing || attributionMissing,
    }));
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const token = req.headers.get("x-apex-retry-token");
  if (!token || token.length !== 64) return new Response("Unauthorized", { status: 401 });
  try {
    const db = admin();
    if (!checked(await db.rpc("authorize_connected_stripe_retry", { p_token: token }))) {
      return new Response("Unauthorized", { status: 401 });
    }
    // Fixed bounded batch. Request bodies cannot supply workspace/event/grant data.
    const receipts = checked(await db.rpc("claim_connected_stripe_retries", { p_limit: 5 })) as Receipt[];
    const results = await Promise.allSettled(receipts.map(retry));
    if (results.some((r) => r.status === "rejected")) return new Response("Retry batch interrupted", { status: 503 });
    return Response.json({ attempted: receipts.length });
  } catch {
    // A crash or failed completion write leaves the lease available after timeout.
    return new Response("Retry service unavailable", { status: 503 });
  }
}
if (import.meta.main) Deno.serve(handler);
