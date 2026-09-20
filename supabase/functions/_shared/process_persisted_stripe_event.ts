import Stripe from "npm:stripe@22.4.0";
import { admin, checked, env, stripeClient } from "./core.ts";
import { decryptCredential } from "./credentials.ts";

type CheckoutLine = { id: string; price?: { id?: string } | string | null };
type PersistedPayload = {
  account?: string | null;
  object_id?: string | null;
  mode?: string | null;
  // The whole Stripe-signature-verified event, stored so a retry can reprocess
  // from APEX's own record. Absent on receipts written before this was added.
  event?: Record<string, unknown> | null;
};

export type PersistedStripeReceipt = {
  id: string;
  workspace_id: string;
  stripe_connection_id: string;
  stripe_event_id: string;
  event_type: string;
  payload: PersistedPayload;
};

export type ProcessorOutcome =
  // Split per kind so callers narrow to the failure members after excluding
  // the settled ones.
  | { kind: "processed" }
  | { kind: "replayed" }
  | { kind: "ignored" }
  | { kind: "pending_settlement"; reason: string }
  | { kind: "failed"; reason: string; failureClass: "retryable" | "needs_configuration" | "needs_operator" };

function idOf(value: string | { id?: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}

function credits(value: string | undefined) {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 100000 ? amount : null;
}

function isManual(payload: PersistedPayload) {
  return payload.mode === "manual_webhook";
}

export function classifyProcessorFailure(message: string): ProcessorOutcome {
  const token = message
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "processing_failed";

  const configuration = [
    "unconfigured_stripe_price",
    "unknown_connected_stripe_account",
    "payment_mapping_incomplete",
    "refund_mapping_incomplete",
    "checkout_mapping_incomplete",
    "manual_checkout_metadata_incomplete",
    "manual_payment_metadata_incomplete",
    "manual_refund_customer_missing",
    "payment_has_no_mapped_lines",
    "customer_not_in_workspace",
  ];
  const operator = [
    "refund_source_ambiguous",
    "manual_refund_source_ambiguous",
    "live_mode_event_blocked",
    "stripe_account_mismatch",
    "event_workspace_mismatch",
    "refund_credit_amount_invalid",
    "unsupported_ingress_action",
  ];
  if (configuration.some((code) => token.includes(code))) {
    return { kind: "failed", reason: token, failureClass: "needs_configuration" };
  }
  if (operator.some((code) => token.includes(code))) {
    return { kind: "failed", reason: token, failureClass: "needs_operator" };
  }
  return { kind: "failed", reason: token, failureClass: "retryable" };
}

async function connectedStripe(workspaceId: string) {
  const db = admin();
  const token = checked(await db.from("stripe_oauth_tokens")
    .select("refresh_token_ciphertext,install_mode").eq("workspace_id", workspaceId).single());
  if (!token) throw new Error("unknown_connected_stripe_account");
  const refreshToken = await decryptCredential(
    token.refresh_token_ciphertext, env("APEX_CREDENTIAL_ENCRYPTION_KEY"), workspaceId,
  );
  const response = await fetch("https://api.stripe.com/v1/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${env(token.install_mode === "sandbox" ? "STRIPE_APP_SANDBOX_SECRET_KEY" : "STRIPE_APP_TEST_SECRET_KEY")}:`)}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  const body = await response.json().catch(() => ({})) as { access_token?: string };
  if (!response.ok || !body.access_token) throw new Error("stripe_oauth_refresh_failed");
  return new Stripe(body.access_token, { apiVersion: "2026-07-29.dahlia" });
}

async function customerId(workspaceId: string, stripeCustomerId: string | null) {
  if (!stripeCustomerId) return null;
  const db = admin();
  return checked(await db.from("customers").select("id")
    .eq("workspace_id", workspaceId).eq("stripe_customer_id", stripeCustomerId).maybeSingle())?.id ?? null;
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

async function assertReceiptBinding(receipt: PersistedStripeReceipt) {
  const db = admin();
  const connection = checked(await db.from("stripe_connections")
    .select("id,workspace_id,stripe_account_id,status")
    .eq("id", receipt.stripe_connection_id).maybeSingle());
  if (!connection || connection.status !== "connected") throw new Error("unknown_connected_stripe_account");
  if (connection.workspace_id !== receipt.workspace_id) throw new Error("event_workspace_mismatch");
  const account = receipt.payload.account;
  if (account && connection.stripe_account_id && account !== connection.stripe_account_id) {
    throw new Error("stripe_account_mismatch");
  }
  return connection;
}

async function loadStripeObject(
  receipt: PersistedStripeReceipt,
  liveEvent: Stripe.Event | undefined,
) {
  if (liveEvent) {
    if (liveEvent.livemode) throw new Error("live_mode_event_blocked");
    return liveEvent.data.object as unknown as Record<string, unknown>;
  }
  const objectId = receipt.payload.object_id;
  if (!objectId) throw new Error("payment_mapping_incomplete");
  const stripe = isManual(receipt.payload)
    ? stripeClient()
    : await connectedStripe(receipt.workspace_id);
  if (receipt.event_type.startsWith("checkout.session.")) {
    return await stripe.checkout.sessions.retrieve(objectId, { expand: ["line_items"] }) as unknown as Record<string, unknown>;
  }
  if (receipt.event_type === "payment_intent.succeeded") {
    return await stripe.paymentIntents.retrieve(objectId) as unknown as Record<string, unknown>;
  }
  if (receipt.event_type === "charge.refunded") {
    return await stripe.charges.retrieve(objectId, { expand: ["refunds"] }) as unknown as Record<string, unknown>;
  }
  return { id: objectId };
}

async function processConnectedPayment(receipt: PersistedStripeReceipt, session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") {
    return { kind: "pending_settlement", reason: "payment_not_settled" } satisfies ProcessorOutcome;
  }
  const customer = await customerId(receipt.workspace_id, idOf(session.customer));
  const grants = (session.line_items?.data ?? []).map((line: CheckoutLine) => ({
    line_item_id: line.id, price_id: idOf(line.price),
  })).filter((line) => line.price_id);
  if (!customer || !idOf(session.payment_intent) || grants.length === 0) {
    throw new Error("checkout_mapping_incomplete");
  }
  // Business-action scoped: several Stripe event ids describing this one
  // purchase produce exactly one ledger effect. Credit amounts come only from
  // the workspace's server-owned price mappings.
  const result = checked(await admin().rpc("process_connected_stripe_ingress", {
    p_connection_id: receipt.stripe_connection_id,
    p_event_id: receipt.stripe_event_id,
    p_action: {
      kind: "payment",
      customer_id: customer,
      payment_id: idOf(session.payment_intent),
      lines: (session.line_items?.data ?? [])
        .map((line: CheckoutLine & { quantity?: number | null }) => ({
          line_id: line.id,
          price_id: idOf(line.price),
          quantity: Number(line.quantity ?? 1),
        }))
        .filter((line) => line.price_id),
    },
  })) as { replayed?: boolean } | null;
  return { kind: result?.replayed ? "replayed" : "processed" } satisfies ProcessorOutcome;
}

/**
 * A connected purchase described by `payment_intent.succeeded` rather than a
 * checkout session. It resolves to the same business action, so it can never
 * add a second grant for a purchase a checkout event already granted.
 */
async function processConnectedPaymentIntent(receipt: PersistedStripeReceipt, payment: Stripe.PaymentIntent) {
  if (payment.status !== "succeeded" || (payment.amount_received ?? 0) <= 0) {
    return { kind: "pending_settlement", reason: "payment_not_settled" } satisfies ProcessorOutcome;
  }
  const stripe = await connectedStripe(receipt.workspace_id);
  const sessions = await stripe.checkout.sessions.list({
    payment_intent: payment.id,
    limit: 1,
    expand: ["data.line_items"],
  });
  const session = sessions.data[0];
  if (!session) throw new Error("payment_mapping_incomplete");
  return await processConnectedPayment(receipt, session);
}

/**
 * Connected refunds reverse credits in proportion to the money actually
 * refunded, so a partial refund cannot claw back a full purchase. The credit
 * quantity itself is derived in Postgres from the originating payment's own
 * grants, never from this caller.
 */
async function processConnectedRefundAction(receipt: PersistedStripeReceipt, charge: Stripe.Charge) {
  if (!charge.refunded && Number(charge.amount_refunded ?? 0) <= 0) {
    return { kind: "ignored" } satisfies ProcessorOutcome;
  }
  const paymentId = idOf(charge.payment_intent);
  const refund = (charge.refunds?.data ?? []).find((item) => item.status === "succeeded");
  if (!paymentId) throw new Error("refund_mapping_incomplete");
  if (!refund) return { kind: "pending_settlement", reason: "refund_not_settled" } satisfies ProcessorOutcome;

  const result = checked(await admin().rpc("process_connected_stripe_ingress", {
    p_connection_id: receipt.stripe_connection_id,
    p_event_id: receipt.stripe_event_id,
    p_action: {
      kind: "refund",
      refund_id: refund.id,
      payment_id: paymentId,
      refunded_minor: Number(charge.amount_refunded ?? refund.amount),
      paid_minor: Number(charge.amount_captured || charge.amount),
    },
  })) as { replayed?: boolean } | null;
  return { kind: result?.replayed ? "replayed" : "processed" } satisfies ProcessorOutcome;
}

async function processConnectedRefund(receipt: PersistedStripeReceipt, charge: Stripe.Charge) {
  if (!charge.refunded) return { kind: "ignored" } satisfies ProcessorOutcome;
  const paymentId = idOf(charge.payment_intent);
  const customer = await customerId(receipt.workspace_id, idOf(charge.customer));
  if (!paymentId || !customer) throw new Error("refund_mapping_incomplete");
  const grants = checked(await admin().from("credit_grants").select("source_stripe_event_id,amount")
    .eq("workspace_id", receipt.workspace_id).eq("customer_id", customer).eq("source_payment_id", paymentId)) ?? [];
  if (grants.length === 0) return { kind: "ignored" } satisfies ProcessorOutcome;
  const sourceEventId = grants[0].source_stripe_event_id;
  if (!sourceEventId || grants.some((grant) => grant.source_stripe_event_id !== sourceEventId)) {
    throw new Error("refund_source_ambiguous");
  }
  const result = checked(await admin().rpc("process_connected_stripe_event", {
    p_connection_id: receipt.stripe_connection_id,
    p_event_id: receipt.stripe_event_id,
    p_customer_id: customer,
    p_refund_source_event_id: sourceEventId,
    p_refund_credits: grants.reduce((sum, grant) => sum + Number(grant.amount), 0),
  })) as { replayed?: boolean } | null;
  return { kind: result?.replayed ? "replayed" : "processed" } satisfies ProcessorOutcome;
}

async function processManualPayment(
  receipt: PersistedStripeReceipt,
  object: Stripe.Checkout.Session | Stripe.PaymentIntent,
  source: "checkout" | "payment_intent",
) {
  const stripeCustomerId = idOf("customer" in object ? object.customer : null);
  const metadataCredits = credits(object.metadata?.apex_credits);
  const paymentId = source === "checkout"
    ? idOf((object as Stripe.Checkout.Session).payment_intent)
    : object.id;
  if (source === "checkout") {
    const session = object as Stripe.Checkout.Session;
    if (session.payment_status !== "paid" || !stripeCustomerId || !metadataCredits || !paymentId) {
      if (session.payment_status !== "paid") {
        return { kind: "pending_settlement", reason: "payment_not_settled" } satisfies ProcessorOutcome;
      }
      throw new Error("manual_checkout_metadata_incomplete");
    }
  } else {
    const payment = object as Stripe.PaymentIntent;
    if (payment.status !== "succeeded" || !stripeCustomerId || !metadataCredits || !paymentId) {
      throw new Error("manual_payment_metadata_incomplete");
    }
  }
  const customerIdValue = await ensureCustomer(receipt.workspace_id, stripeCustomerId!);
  const result = checked(await admin().rpc("process_manual_stripe_payment", {
    p_connection_id: receipt.stripe_connection_id,
    p_event_id: receipt.stripe_event_id,
    p_customer_id: customerIdValue,
    p_payment_id: paymentId,
    p_credits: metadataCredits,
  })) as { replayed?: boolean } | null;
  return { kind: result?.replayed ? "replayed" : "processed" } satisfies ProcessorOutcome;
}

export async function processPersistedStripeReceipt(
  receipt: PersistedStripeReceipt,
  liveEvent?: Stripe.Event,
): Promise<ProcessorOutcome> {
  try {
    await assertReceiptBinding(receipt);
    const object = await loadStripeObject(receipt, liveEvent);

    if (isManual(receipt.payload)) {
      if (
        receipt.event_type === "checkout.session.completed" ||
        receipt.event_type === "checkout.session.async_payment_succeeded"
      ) {
        return await processManualPayment(receipt, object as unknown as Stripe.Checkout.Session, "checkout");
      }
      if (receipt.event_type === "payment_intent.succeeded") {
        return await processManualPayment(receipt, object as unknown as Stripe.PaymentIntent, "payment_intent");
      }
      if (receipt.event_type === "charge.refunded") {
        return await processConnectedRefund(receipt, object as unknown as Stripe.Charge);
      }
      checked(await admin().rpc("process_connected_stripe_event", {
        p_connection_id: receipt.stripe_connection_id,
        p_event_id: receipt.stripe_event_id,
      }));
      return { kind: "processed" };
    }

    if (
      receipt.event_type === "checkout.session.completed" ||
      receipt.event_type === "checkout.session.async_payment_succeeded"
    ) {
      return await processConnectedPayment(receipt, object as unknown as Stripe.Checkout.Session);
    }
    if (receipt.event_type === "payment_intent.succeeded") {
      return await processConnectedPaymentIntent(receipt, object as unknown as Stripe.PaymentIntent);
    }
    if (receipt.event_type === "charge.refunded") {
      return await processConnectedRefundAction(receipt, object as unknown as Stripe.Charge);
    }
    checked(await admin().rpc("process_connected_stripe_event", {
      p_connection_id: receipt.stripe_connection_id,
      p_event_id: receipt.stripe_event_id,
    }));
    return { kind: "processed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "processing_failed";
    return classifyProcessorFailure(message);
  }
}
