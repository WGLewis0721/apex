import Stripe from "npm:stripe@22.4.0";
import { admin, checked, env } from "../_shared/core.ts";
import { decryptCredential } from "../_shared/credentials.ts";
import { processPersistedStripeReceipt } from "../_shared/process_persisted_stripe_event.ts";

function endpointToken(req: Request) {
  const token = new URL(req.url).pathname.split("/").filter(Boolean).at(-1) ?? "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token) ? token : null;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const token = endpointToken(req);
  if (!token) return new Response("Not found", { status: 404 });
  const db = admin();
  const manual = checked(await db.from("stripe_manual_webhook_connections")
    .select("workspace_id,stripe_connection_id,signing_secret_ciphertext,enabled")
    .eq("endpoint_token", token).maybeSingle());
  if (!manual?.enabled) return new Response("Not found", { status: 404 });

  let event: Stripe.Event;
  try {
    const secret = manual.signing_secret_ciphertext
      ? await decryptCredential(manual.signing_secret_ciphertext,
        env("APEX_CREDENTIAL_ENCRYPTION_KEY"), `manual-stripe-webhook:${manual.workspace_id}`)
      : env("APEX_MANUAL_STRIPE_WEBHOOK_SECRET");
    event = await Stripe.webhooks.constructEventAsync(await req.text(), req.headers.get("stripe-signature") ?? "", secret,
      undefined, Stripe.createSubtleCryptoProvider());
  } catch { return new Response("Invalid signature", { status: 400 }); }
  if (event.livemode) return new Response("Test-mode event required", { status: 400 });

  const payload = { object_id: (event.data.object as { id?: string }).id ?? null, mode: "manual_webhook" };
  checked(await db.rpc("receive_connected_stripe_event", {
    p_connection_id: manual.stripe_connection_id, p_event_id: event.id, p_event_type: event.type,
    p_payload: payload,
  }));

  const outcome = await processPersistedStripeReceipt({
    id: event.id,
    workspace_id: manual.workspace_id,
    stripe_connection_id: manual.stripe_connection_id,
    stripe_event_id: event.id,
    event_type: event.type,
    payload,
  }, event);

  if (outcome.kind === "processed" || outcome.kind === "replayed" || outcome.kind === "ignored") {
    return Response.json({ received: true, outcome: outcome.kind });
  }
  const row = checked(await db.from("stripe_webhook_events").select("id")
    .eq("stripe_connection_id", manual.stripe_connection_id).eq("stripe_event_id", event.id).single());
  if (row?.id) {
    await db.rpc("fail_stripe_webhook_event", {
      p_event_row_id: row.id,
      p_reason: outcome.reason,
      p_failure_class: outcome.kind === "pending_settlement" ? "pending_settlement" : outcome.failureClass,
    });
  }
  if (outcome.kind === "pending_settlement") return Response.json({ pending: true });
  return new Response("Processing failed; retry required", { status: 500 });
}

if (import.meta.main) Deno.serve(handler);
