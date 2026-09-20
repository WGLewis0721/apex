import Stripe from "npm:stripe@22.4.0";
import { admin, checked, env } from "./core.ts";
import { decryptCredential } from "./credentials.ts";

type CheckoutLine = { id: string; price?: { id?: string } | string | null };

function idOf(value: string | { id?: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}

export async function connectedStripe(workspaceId: string) {
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
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json().catch(() => ({})) as { access_token?: string };
  if (!response.ok || !body.access_token) throw new Error("Stripe OAuth refresh failed");
  return new Stripe(body.access_token, { apiVersion: "2026-07-29.dahlia", timeout: 10000, maxNetworkRetries: 0 });
}

async function customerId(workspaceId: string, stripeCustomerId: string | null) {
  if (!stripeCustomerId) return null;
  const db = admin();
  return checked(await db.from("customers").select("id")
    .eq("workspace_id", workspaceId).eq("stripe_customer_id", stripeCustomerId).maybeSingle())?.id ?? null;
}


export async function processConnectedEvent(
  event: Stripe.Event, connection: { id: string; workspace_id: string },
  process: (args: Record<string, unknown>) => Promise<unknown>,
  verifiedClient?: Stripe,
): Promise<Response> {
  const db = admin();
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const incoming = event.data.object as Stripe.Checkout.Session;
      if (incoming.payment_status !== "paid") return Response.json({ pending: true });
      const stripe = verifiedClient ?? await connectedStripe(connection.workspace_id);
      const session = await stripe.checkout.sessions.retrieve(incoming.id, { expand: ["line_items"] });
      const customer = await customerId(connection.workspace_id, idOf(session.customer));
      const grants = (session.line_items?.data ?? []).map((line: CheckoutLine) => ({
        line_item_id: line.id, price_id: idOf(line.price),
      })).filter((line) => line.price_id);
      if (!customer || !idOf(session.payment_intent) || grants.length === 0) throw new Error("Checkout mapping incomplete");
      await process({
        p_connection_id: connection.id, p_event_id: event.id, p_customer_id: customer,
        p_payment_id: idOf(session.payment_intent), p_grants: grants,
      });
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
      await process({
        p_connection_id: connection.id, p_event_id: event.id, p_customer_id: customer,
        p_refund_source_event_id: sourceEventId, p_refund_credits: credits,
      });
    } else {
      await process({ p_connection_id: connection.id, p_event_id: event.id });
    }
  return Response.json({ received: true });
}
