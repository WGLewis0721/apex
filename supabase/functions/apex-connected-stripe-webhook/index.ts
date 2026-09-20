import Stripe from "npm:stripe@22.4.0";
import { admin, checked, env } from "../_shared/core.ts";
import { processPersistedStripeReceipt } from "../_shared/process_persisted_stripe_event.ts";

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let event: Stripe.Event;
  try {
    event = await Stripe.webhooks.constructEventAsync(
      await req.text(), req.headers.get("stripe-signature") ?? "",
      env("APEX_CONNECTED_STRIPE_WEBHOOK_SECRET"), undefined, Stripe.createSubtleCryptoProvider(),
    );
  } catch { return new Response("Invalid signature", { status: 400 }); }
  if (event.livemode || !event.account) return new Response("Test connected-account event required", { status: 400 });

  const db = admin();
  const connection = checked(await db.from("stripe_connections")
    .select("id,workspace_id").eq("stripe_account_id", event.account).eq("status", "connected").maybeSingle());
  if (!connection) return Response.json({ ignored: true });
  // Durable receipt carries the whole verified event so a retry can reprocess
  // from APEX's own record rather than re-trusting the network.
  const payload = {
    account: event.account,
    object_id: (event.data.object as { id?: string }).id ?? null,
    event: event as unknown as Record<string, unknown>,
  };
  await db.rpc("receive_connected_stripe_event", {
    p_connection_id: connection.id, p_event_id: event.id, p_event_type: event.type,
    p_payload: payload,
  }).then(checked);

  const outcome = await processPersistedStripeReceipt({
    id: event.id,
    workspace_id: connection.workspace_id,
    stripe_connection_id: connection.id,
    stripe_event_id: event.id,
    event_type: event.type,
    payload,
  }, event);

  if (outcome.kind === "processed" || outcome.kind === "replayed" || outcome.kind === "ignored") {
    return Response.json({ received: true, outcome: outcome.kind });
  }

  const row = checked(await db.from("stripe_webhook_events").select("id")
    .eq("stripe_connection_id", connection.id).eq("stripe_event_id", event.id).single());
  if (row?.id) {
    await db.rpc("fail_stripe_webhook_event", {
      p_event_row_id: row.id,
      p_reason: outcome.reason,
      p_failure_class: outcome.kind === "pending_settlement" ? "pending_settlement" : outcome.failureClass,
    });
  }
  if (outcome.kind === "pending_settlement") return Response.json({ pending: true });
  console.error("APEX connected Stripe webhook processing failed", event.id);
  return new Response("Processing failed; retry required", { status: 500 });
}

if (import.meta.main) Deno.serve(handler);
