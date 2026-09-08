import {
  admin,
  appUrl,
  authenticated,
  checked,
  failure,
  response,
  stripeClient,
} from "../_shared/core.ts";
import { foundingPrices } from "../_shared/prices.ts";

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return response({});
  if (req.method !== "POST") {
    return response({ error: "Method not allowed" }, 405);
  }
  try {
    const user = await authenticated(req);
    const body = await req.json();
    if (body.planId !== "founding") {
      return response({
        error:
          "The free sandbox remains a demo. Choose Founding Partner for a provisioned workspace.",
      }, 400);
    }
    const db = admin();
    const stripe = stripeClient();
    let billing = checked(
      await db.rpc("apex_reserve_checkout", {
        p_user_id: user.id,
        p_email: user.email!,
      }),
    );
    if (billing.payment_status === "paid") {
      return response({ provisioned: true });
    }
    if (billing.checkout_session_id) {
      const existing = await stripe.checkout.sessions.retrieve(
        billing.checkout_session_id,
      );
      if (existing.status === "open") return response({ url: existing.url });
      if (existing.status === "complete") return response({ pending: true });
      billing = checked(
        await db.rpc("apex_reserve_checkout", {
          p_user_id: user.id,
          p_email: user.email!,
          p_expired_session: existing.id,
        }),
      );
    }
    // Never silently retry a lost response with a fresh idempotency key. After
    // Stripe's retention window, an operator must reconcile the original attempt.
    if (
      Date.now() - Date.parse(billing.attempt_created_at) > 23 * 60 * 60 * 1000
    ) {
      return response({
        error:
          "This checkout attempt needs recovery. Contact APEX support before starting another payment.",
      }, 409);
    }
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: billing.checkout_email,
      client_reference_id: user.id,
      line_items: await foundingPrices(stripe),
      metadata: {
        apex_user_id: user.id,
        apex_attempt_id: billing.attempt_id,
        apex_offer: "founding",
      },
      subscription_data: {
        metadata: { apex_user_id: user.id, apex_offer: "founding" },
      },
      success_url: appUrl() + "?checkout=success#start",
      cancel_url: appUrl() + "?checkout=cancelled#start",
      integration_identifier: "apex_founding_nvjstqha",
    }, { idempotencyKey: `apex-checkout-${billing.attempt_id}` });
    checked(
      await db.from("apex_billing_accounts").update({
        checkout_session_id: session.id,
      })
        .eq("user_id", user.id).eq("attempt_id", billing.attempt_id),
    );
    return response({ url: session.url });
  } catch (error) {
    return failure(error);
  }
}

if (import.meta.main) Deno.serve(handler);
