// Phase 6.2 — direct Stripe-to-APEX connected-account webhook ingress.
//
// This function does ingress only: verify the raw-body signature, bind the
// event to a workspace through its connected Stripe account, isolate test from
// live, and persist the verified event durably. Everything that touches the
// ledger runs inside `processConnectedStripeEvent`, the same processor the
// scheduled retry worker uses.

import Stripe from "npm:stripe@22.4.0";
import { admin, checked, env } from "../_shared/core.ts";
import { processConnectedStripeEvent } from "../_shared/connected_stripe_ingress.ts";

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
  const token = checked(await db.from("stripe_oauth_tokens")
    .select("install_mode,livemode").eq("workspace_id", connection.workspace_id).maybeSingle());

  // Durable receipt before any ledger work. The retry worker's claim filter
  // reads these provenance keys, so they must stay exactly as written here.
  await db.rpc("receive_connected_stripe_event", {
    p_connection_id: connection.id, p_event_id: event.id, p_event_type: event.type,
    p_payload: {
      account: event.account, object_id: (event.data.object as { id?: string }).id ?? null,
      ingress: "connected_v1", livemode: event.livemode,
      install_mode: token?.livemode === false ? token.install_mode : null,
    },
  }).then(checked);

  const outcome = await processConnectedStripeEvent({
    connectionId: connection.id,
    stripeEventId: event.id,
    event,
  });

  if (outcome.status !== "failed") {
    return Response.json({ received: true, outcome: outcome.status, kind: outcome.kind });
  }
  if (outcome.permanent) {
    // Recorded, replayable by an operator, and not worth another delivery.
    return Response.json({ received: true, failed: true });
  }
  // The receipt is committed and the scheduled retry worker owns it from here.
  console.error("APEX connected Stripe webhook processing failed", event.id);
  return new Response("Processing failed; retry required", { status: 500 });
}

if (import.meta.main) Deno.serve(handler);
