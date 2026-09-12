import Stripe from "npm:stripe@22.4.0";
import { admin, checked, env } from "../_shared/core.ts";
import { decryptCredential } from "../_shared/credentials.ts";

function endpointToken(req: Request) {
  const token = new URL(req.url).pathname.split("/").filter(Boolean).at(-1) ?? "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token) ? token : null;
}
function stripeId(value: string | { id?: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}
function credits(value: string | undefined) {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 100000 ? amount : null;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const token = endpointToken(req);
  if (!token) return new Response("Not found", { status: 404 });
  const db = admin();
  const manual = checked(await db.from("stripe_manual_webhook_connections")
    .select("workspace_id,stripe_connection_id,signing_secret_ciphertext,enabled")
    .eq("endpoint_token", token).maybeSingle());
  if (!manual?.enabled || !manual.signing_secret_ciphertext) return new Response("Not found", { status: 404 });

  let event: Stripe.Event;
  try {
    const secret = await decryptCredential(manual.signing_secret_ciphertext,
      env("APEX_CREDENTIAL_ENCRYPTION_KEY"), `manual-stripe-webhook:${manual.workspace_id}`);
    event = await Stripe.webhooks.constructEventAsync(await req.text(), req.headers.get("stripe-signature") ?? "", secret,
      undefined, Stripe.createSubtleCryptoProvider());
  } catch { return new Response("Invalid signature", { status: 400 }); }
  if (event.livemode) return new Response("Test-mode event required", { status: 400 });

  checked(await db.rpc("receive_connected_stripe_event", {
    p_connection_id: manual.stripe_connection_id, p_event_id: event.id, p_event_type: event.type,
    p_payload: { object_id: (event.data.object as { id?: string }).id ?? null, mode: "manual_webhook" },
  }));
  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      const stripeCustomerId = stripeId(session.customer);
      const amount = credits(session.metadata?.apex_credits);
      if (session.payment_status !== "paid" || !stripeCustomerId || !amount || !session.payment_intent) {
        throw new Error("manual_checkout_metadata_incomplete");
      }
      let customer = checked(await db.from("customers").select("id")
        .eq("workspace_id", manual.workspace_id).eq("stripe_customer_id", stripeCustomerId).maybeSingle());
      if (!customer) {
        customer = checked(await db.from("customers").insert({
          workspace_id: manual.workspace_id, external_id: `stripe:${stripeCustomerId}`,
          stripe_customer_id: stripeCustomerId,
        }).select("id").single());
      }
      // The existing price-mapping processor is intentionally strict. A pilot
      // grant has no catalog price, so grant directly with the same event-level
      // idempotency and then mark the recorded event processed.
      checked(await db.rpc("grant_credits", {
        p_workspace_id: manual.workspace_id, p_customer_id: customer!.id, p_amount: amount,
        p_idempotency_key: `stripe:${event.id}:manual`, p_stripe_event_id: event.id,
        p_source_payment_id: stripeId(session.payment_intent), p_feature_id: null, p_reason: "stripe_manual_checkout",
      }));
      await db.from("stripe_webhook_events").update({ status: "processed", processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("stripe_connection_id", manual.stripe_connection_id).eq("stripe_event_id", event.id);
    } else {
      checked(await db.rpc("process_connected_stripe_event", { p_connection_id: manual.stripe_connection_id, p_event_id: event.id }));
    }
    return Response.json({ received: true });
  } catch {
    await db.from("stripe_webhook_events").update({ status: "failed", last_error: "manual_event_processing_failed", updated_at: new Date().toISOString() })
      .eq("stripe_connection_id", manual.stripe_connection_id).eq("stripe_event_id", event.id);
    return new Response("Processing failed; retry required", { status: 500 });
  }
}

if (import.meta.main) Deno.serve(handler);
