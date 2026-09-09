import Stripe from "npm:stripe@22.4.0";
import { admin, checked, env, idOf, stripeClient } from "../_shared/core.ts";
import { generateCredentials } from "../_shared/credentials.ts";
import { MONTHLY, SETUP } from "../_shared/prices.ts";

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  let event: Stripe.Event;
  const stripe = stripeClient();
  try {
    event = await stripe.webhooks.constructEventAsync(
      await req.text(),
      req.headers.get("stripe-signature") ?? "",
      env("STRIPE_WEBHOOK_SECRET"),
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  if (event.livemode) {
    return new Response("Test mode required", { status: 400 });
  }
  try {
    const db = admin();
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const incoming = event.data.object as Stripe.Checkout.Session;
      if (incoming.metadata?.apex_offer !== "founding") {
        return Response.json({ ignored: true });
      }
      const session = await stripe.checkout.sessions.retrieve(incoming.id, {
        expand: ["line_items", "subscription"],
      });
      if (session.payment_status !== "paid") {
        return Response.json({ pending: true });
      }
      const userId = session.metadata?.apex_user_id;
      const attemptId = session.metadata?.apex_attempt_id;
      const items = session.line_items?.data ?? [];
      if (
        session.livemode || session.mode !== "subscription" ||
        session.status !== "complete" ||
        !userId || !attemptId || session.client_reference_id !== userId ||
        session.amount_total !== 229900 ||
        session.currency !== "usd" || items.length !== 2 ||
        ![SETUP, MONTHLY].every((id) =>
          items.some((i) => i.price?.id === id && i.quantity === 1)
        )
      ) {
        throw new Error("Unexpected checkout");
      }
      const subscription = session.subscription as Stripe.Subscription;
      const credentials = await generateCredentials(
        env("APEX_CREDENTIAL_ENCRYPTION_KEY"),
        userId,
      );
      checked(
        await db.rpc("apex_activate_purchase", {
          p_event_id: event.id,
          p_event_type: event.type,
          p_user_id: userId,
          p_attempt_id: attemptId,
          p_session_id: session.id,
          p_customer_id: idOf(session.customer),
          p_subscription_id: subscription.id,
          p_invoice_id: idOf(session.invoice),
          p_amount: session.amount_total,
          p_status: subscription.status,
          p_period_end: new Date(
            subscription.items.data[0].current_period_end * 1000,
          ).toISOString(),
          p_publishable: credentials.publishable,
          p_secret_hash: credentials.hash,
          p_ciphertext: credentials.ciphertext,
        }),
      );
    } else if (
      [
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "invoice.paid",
        "invoice.payment_failed",
      ].includes(event.type)
    ) {
      const obj = event.data.object;
      const subscriptionId = event.type.startsWith("invoice.")
        ? idOf(
          (obj as Stripe.Invoice).parent?.subscription_details?.subscription,
        )
        : (obj as Stripe.Subscription).id;
      if (!subscriptionId) return Response.json({ ignored: true });
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      if (subscription.metadata.apex_offer !== "founding") {
        return Response.json({ ignored: true });
      }
      // Fetch current Stripe state so late invoice failures cannot undo recovery.
      checked(
        await db.rpc("apex_sync_subscription", {
          p_event_id: event.id,
          p_event_type: event.type,
          p_created: event.created,
          p_subscription_id: subscription.id,
          p_status: subscription.status,
          p_period_end: subscription.items.data[0]?.current_period_end
            ? new Date(subscription.items.data[0].current_period_end * 1000)
              .toISOString()
            : null,
        }),
      );
    }
    return Response.json({ received: true });
  } catch {
    // Non-2xx makes Stripe retry. The transaction rolls back both the ledger and
    // provisioning on failure. Log an event ID only, never payment/secret data.
    console.error("APEX webhook processing failed", event.id);
    return new Response("Processing failed; retry required", { status: 500 });
  }
}

if (import.meta.main) Deno.serve(handler);
