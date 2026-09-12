import Stripe from "npm:stripe@22.4.0";
import { admin, checked, env } from "../_shared/core.ts";
import { decryptCredential } from "../_shared/credentials.ts";

type CheckoutLine = { id: string; price?: { id?: string } | string | null };

function idOf(value: string | { id?: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}

async function connectedStripe(workspaceId: string) {
  const db = admin();
  const token = checked(await db.from("stripe_oauth_tokens")
    .select("refresh_token_ciphertext,install_mode").eq("workspace_id", workspaceId).single());
  if (!token) throw new Error("Stripe OAuth credentials missing");
  const refreshToken = await decryptCredential(
    token.refresh_token_ciphertext, env("APEX_CREDENTIAL_ENCRYPTION_KEY"), workspaceId,
  );
  const response = await fetch("https://api.stripe.com/v1/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // The refresh exchange uses the same mode-specific developer key that
      // accepted the authorization code. It never reaches the browser.
      Authorization: `Basic ${btoa(`${env(token.install_mode === "sandbox" ? "STRIPE_APP_SANDBOX_SECRET_KEY" : "STRIPE_APP_TEST_SECRET_KEY")}:`)}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  const body = await response.json().catch(() => ({})) as { access_token?: string };
  if (!response.ok || !body.access_token) throw new Error("Stripe OAuth refresh failed");
  return new Stripe(body.access_token, { apiVersion: "2026-07-29.dahlia" });
}

async function customerId(workspaceId: string, stripeCustomerId: string | null) {
  if (!stripeCustomerId) return null;
  const db = admin();
  return checked(await db.from("customers").select("id")
    .eq("workspace_id", workspaceId).eq("stripe_customer_id", stripeCustomerId).maybeSingle())?.id ?? null;
}

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
  await db.rpc("receive_connected_stripe_event", {
    p_connection_id: connection.id, p_event_id: event.id, p_event_type: event.type,
    p_payload: { account: event.account, object_id: (event.data.object as { id?: string }).id ?? null },
  }).then(checked);

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const incoming = event.data.object as Stripe.Checkout.Session;
      if (incoming.payment_status !== "paid") return Response.json({ pending: true });
      const stripe = await connectedStripe(connection.workspace_id);
      const session = await stripe.checkout.sessions.retrieve(incoming.id, { expand: ["line_items"] });
      const customer = await customerId(connection.workspace_id, idOf(session.customer));
      const grants = (session.line_items?.data ?? []).map((line: CheckoutLine) => ({
        line_item_id: line.id, price_id: idOf(line.price),
      })).filter((line) => line.price_id);
      if (!customer || !idOf(session.payment_intent) || grants.length === 0) throw new Error("Checkout mapping incomplete");
      checked(await db.rpc("process_connected_stripe_event", {
        p_connection_id: connection.id, p_event_id: event.id, p_customer_id: customer,
        p_payment_id: idOf(session.payment_intent), p_grants: grants,
      }));
    } else if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      if (!charge.refunded) return Response.json({ ignored: true });
      const paymentId = idOf(charge.payment_intent);
      const customer = await customerId(connection.workspace_id, idOf(charge.customer));
      if (!paymentId || !customer) throw new Error("Refund mapping incomplete");
      const grants = checked(await db.from("credit_grants").select("source_stripe_event_id,amount")
        .eq("workspace_id", connection.workspace_id).eq("customer_id", customer).eq("source_payment_id", paymentId)) ?? [];
      if (grants.length === 0) return Response.json({ ignored: true });
      const sourceEventId = grants[0].source_stripe_event_id;
      if (!sourceEventId || grants.some((grant) => grant.source_stripe_event_id !== sourceEventId)) throw new Error("Refund source ambiguous");
      const credits = grants.reduce((sum, grant) => sum + Number(grant.amount), 0);
      checked(await db.rpc("process_connected_stripe_event", {
        p_connection_id: connection.id, p_event_id: event.id, p_customer_id: customer,
        p_refund_source_event_id: sourceEventId, p_refund_credits: credits,
      }));
    } else {
      checked(await db.rpc("process_connected_stripe_event", { p_connection_id: connection.id, p_event_id: event.id }));
    }
    return Response.json({ received: true });
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
