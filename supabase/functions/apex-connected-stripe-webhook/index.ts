import Stripe from "npm:stripe@22.4.0";
import { admin, checked, env } from "../_shared/core.ts";
import { processConnectedEvent } from "../_shared/connected_event.ts";

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
  await db.rpc("receive_connected_stripe_event", {
    p_connection_id: connection.id, p_event_id: event.id, p_event_type: event.type,
    p_payload: { account: event.account, object_id: (event.data.object as { id?: string }).id ?? null,
      ingress: "connected_v1", livemode: event.livemode,
      install_mode: token?.livemode === false ? token.install_mode : null },
  }).then(checked);

  try {
    return await processConnectedEvent(event, connection, async (args) =>
      checked(await db.rpc("process_connected_stripe_event", args)));
  } catch {
    // The receipt RPC committed before processing begins. Keep this failure
    // replayable without retaining provider or customer data in the error.
    await db.from("stripe_webhook_events").update({
      status: "failed", last_error: "connected_event_processing_failed",
      updated_at: new Date().toISOString(),
    }).eq("stripe_connection_id", connection.id).eq("stripe_event_id", event.id);
    console.error("APEX connected Stripe webhook processing failed", event.id);
    return new Response("Processing failed; retry required", { status: 500 });
  }
}

if (import.meta.main) Deno.serve(handler);
