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

async function ensureCustomer(workspaceId: string, stripeCustomerId: string) {
  const db = admin();
  let customer = checked(await db.from("customers").select("id")
    .eq("workspace_id", workspaceId).eq("stripe_customer_id", stripeCustomerId).maybeSingle());
  if (!customer) {
    customer = checked(await db.from("customers").insert({
      workspace_id: workspaceId, external_id: `stripe:${stripeCustomerId}`,
      stripe_customer_id: stripeCustomerId,
    }).select("id").single());
  }
  return customer!.id;
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
    // A workspace owner normally saves the secret through the authenticated
    // setup function. The deployment fallback lets the first guided demo be
    // completed without exposing the one-time Stripe secret in the browser.
    const secret = manual.signing_secret_ciphertext
      ? await decryptCredential(manual.signing_secret_ciphertext,
        env("APEX_CREDENTIAL_ENCRYPTION_KEY"), `manual-stripe-webhook:${manual.workspace_id}`)
      : env("APEX_MANUAL_STRIPE_WEBHOOK_SECRET");
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
      const paymentId = stripeId(session.payment_intent)!;
      const customerId = await ensureCustomer(manual.workspace_id, stripeCustomerId);
      checked(await db.rpc("process_manual_stripe_payment", {
        p_connection_id: manual.stripe_connection_id, p_event_id: event.id,
        p_customer_id: customerId, p_payment_id: paymentId, p_credits: amount,
      }));
    } else if (event.type === "payment_intent.succeeded") {
      const payment = event.data.object as Stripe.PaymentIntent;
      const stripeCustomerId = stripeId(payment.customer);
      const amount = credits(payment.metadata?.apex_credits);
      if (payment.status !== "succeeded" || !stripeCustomerId || !amount) {
        throw new Error("manual_payment_metadata_incomplete");
      }
      const customerId = await ensureCustomer(manual.workspace_id, stripeCustomerId);
      checked(await db.rpc("process_manual_stripe_payment", {
        p_connection_id: manual.stripe_connection_id, p_event_id: event.id,
        p_customer_id: customerId, p_payment_id: payment.id, p_credits: amount,
      }));
    } else if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      const paymentId = stripeId(charge.payment_intent);
      const stripeCustomerId = stripeId(charge.customer);
      if (!charge.refunded || !paymentId || !stripeCustomerId) throw new Error("manual_refund_mapping_incomplete");
      const customer = checked(await db.from("customers").select("id")
        .eq("workspace_id", manual.workspace_id).eq("stripe_customer_id", stripeCustomerId).maybeSingle());
      if (!customer) throw new Error("manual_refund_customer_missing");
      const grants = checked(await db.from("credit_grants").select("source_stripe_event_id,amount")
        .eq("workspace_id", manual.workspace_id).eq("customer_id", customer.id).eq("source_payment_id", paymentId)) ?? [];
      if (grants.length === 0) return Response.json({ ignored: true });
      const sourceEventId = grants[0].source_stripe_event_id;
      if (!sourceEventId || grants.some((grant) => grant.source_stripe_event_id !== sourceEventId)) {
        throw new Error("manual_refund_source_ambiguous");
      }
      checked(await db.rpc("process_connected_stripe_event", {
        p_connection_id: manual.stripe_connection_id, p_event_id: event.id, p_customer_id: customer.id,
        p_refund_source_event_id: sourceEventId,
        p_refund_credits: grants.reduce((sum, grant) => sum + Number(grant.amount), 0),
      }));
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
