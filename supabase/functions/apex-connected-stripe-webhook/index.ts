import Stripe from "npm:stripe@22.4.0";
import { admin, env, idOf, stripeClient } from "../_shared/core.ts";

type Connection = {
  id: string;
  workspace_id: string;
  stripe_account_id: string;
};

type PersistedEvent = {
  id: string;
  status: "received" | "processed" | "failed";
  attempt_count: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CREDIT_AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;
const SUPPORTED = new Set([
  "payment_intent.succeeded",
  "refund.created",
  "refund.updated",
  "account.application.deauthorized",
]);

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function permanentFailure(message: string) {
  return new Error(`PERMANENT:${message}`);
}

function failureCode(error: unknown) {
  const message = error instanceof Error ? error.message : "PROCESSING_FAILED";
  return message.replace(/^PERMANENT:/, "").slice(0, 160);
}

function isPermanent(error: unknown) {
  return error instanceof Error && error.message.startsWith("PERMANENT:");
}

async function connectionFor(stripeAccountId: string): Promise<Connection> {
  const { data, error } = await admin()
    .from("stripe_connections")
    .select("id,workspace_id,stripe_account_id")
    .eq("stripe_account_id", stripeAccountId)
    .eq("status", "connected")
    .maybeSingle();
  if (error) throw new Error("CONNECTION_LOOKUP_FAILED");
  if (!data) throw permanentFailure("UNKNOWN_STRIPE_ACCOUNT");
  return data as Connection;
}

async function persistEvent(connection: Connection, event: Stripe.Event): Promise<{ row: PersistedEvent; replay: boolean }> {
  const db = admin();
  const now = new Date().toISOString();
  const inserted = await db.from("stripe_webhook_events").insert({
    stripe_event_id: event.id,
    event_type: event.type,
    workspace_id: connection.workspace_id,
    stripe_connection_id: connection.id,
    payload: event,
    status: "received",
    attempt_count: 1,
    updated_at: now,
  }).select("id,status,attempt_count").maybeSingle();

  if (!inserted.error && inserted.data) {
    return { row: inserted.data as PersistedEvent, replay: false };
  }
  if (inserted.error?.code !== "23505") throw new Error("EVENT_PERSIST_FAILED");

  const existing = await db.from("stripe_webhook_events")
    .select("id,status,attempt_count")
    .eq("stripe_connection_id", connection.id)
    .eq("stripe_event_id", event.id)
    .maybeSingle();
  if (existing.error || !existing.data) throw new Error("EVENT_REPLAY_LOOKUP_FAILED");

  const row = existing.data as PersistedEvent;
  if (row.status !== "processed") {
    const nextCount = row.attempt_count + 1;
    const updated = await db.from("stripe_webhook_events")
      .update({ status: "received", attempt_count: nextCount, updated_at: now })
      .eq("id", row.id)
      .select("id,status,attempt_count")
      .maybeSingle();
    if (updated.error || !updated.data) throw new Error("EVENT_REPLAY_UPDATE_FAILED");
    return { row: updated.data as PersistedEvent, replay: true };
  }
  return { row, replay: true };
}

async function markEvent(id: string, status: "processed" | "failed", lastError: string | null) {
  const now = new Date().toISOString();
  const { error } = await admin().from("stripe_webhook_events").update({
    status,
    last_error: lastError,
    processed_at: status === "processed" ? now : null,
    updated_at: now,
  }).eq("id", id);
  if (error) throw new Error("EVENT_STATUS_UPDATE_FAILED");
}

async function grantFromPayment(connection: Connection, event: Stripe.Event) {
  const payment = event.data.object as Stripe.PaymentIntent;
  if (payment.status !== "succeeded" || payment.amount_received <= 0) {
    throw permanentFailure("PAYMENT_NOT_SETTLED");
  }

  const customerId = payment.metadata?.apex_customer_id?.trim();
  const rawCredits = payment.metadata?.apex_credits?.trim();
  if (!customerId || !UUID.test(customerId) || !rawCredits || !CREDIT_AMOUNT.test(rawCredits)) {
    throw permanentFailure("APEX_PAYMENT_METADATA_REQUIRED");
  }
  const credits = Number(rawCredits);
  if (!Number.isFinite(credits) || credits <= 0 || credits > 1_000_000_000) {
    throw permanentFailure("INVALID_APEX_CREDIT_AMOUNT");
  }

  const db = admin();
  const customer = await db.from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("workspace_id", connection.workspace_id)
    .maybeSingle();
  if (customer.error) throw new Error("CUSTOMER_LOOKUP_FAILED");
  if (!customer.data) throw permanentFailure("APEX_CUSTOMER_NOT_FOUND");

  const result = await db.rpc("grant_credits", {
    p_workspace_id: connection.workspace_id,
    p_customer_id: customerId,
    p_amount: credits,
    p_idempotency_key: `stripe:${connection.id}:${event.id}:grant`,
    p_stripe_event_id: event.id,
    p_source_payment_id: payment.id,
    p_feature_id: null,
    p_reason: "stripe_payment_intent_succeeded",
  });
  if (result.error) throw new Error("GRANT_FAILED");
  return result.data;
}

async function refundFromStripe(connection: Connection, event: Stripe.Event) {
  const refund = event.data.object as Stripe.Refund;
  if (refund.status !== "succeeded") return { pending: true };

  const paymentIntentId = idOf(
    (refund as Stripe.Refund & { payment_intent?: string | { id: string } | null }).payment_intent,
  );
  if (!paymentIntentId || refund.amount <= 0) {
    throw permanentFailure("REFUND_SOURCE_PAYMENT_REQUIRED");
  }

  const db = admin();
  const grant = await db.from("credit_grants")
    .select("customer_id,amount,source_stripe_event_id")
    .eq("workspace_id", connection.workspace_id)
    .eq("source_payment_id", paymentIntentId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (grant.error) throw new Error("SOURCE_GRANT_LOOKUP_FAILED");
  if (!grant.data?.source_stripe_event_id) throw new Error("SOURCE_GRANT_NOT_READY");

  const sourceEvent = await db.from("stripe_webhook_events")
    .select("payload")
    .eq("stripe_connection_id", connection.id)
    .eq("stripe_event_id", grant.data.source_stripe_event_id)
    .maybeSingle();
  if (sourceEvent.error) throw new Error("SOURCE_EVENT_LOOKUP_FAILED");

  const payload = sourceEvent.data?.payload as {
    data?: { object?: { amount_received?: number; amount?: number } };
  } | null;
  const paidAmount = Number(payload?.data?.object?.amount_received ?? payload?.data?.object?.amount ?? 0);
  const grantedCredits = Number(grant.data.amount);
  if (!Number.isFinite(paidAmount) || paidAmount <= 0 || !Number.isFinite(grantedCredits) || grantedCredits <= 0) {
    throw new Error("SOURCE_EVENT_INVALID");
  }

  const creditsToReverse = Number(((grantedCredits * refund.amount) / paidAmount).toFixed(6));
  if (!Number.isFinite(creditsToReverse) || creditsToReverse <= 0) {
    throw permanentFailure("REFUND_CREDIT_AMOUNT_INVALID");
  }

  const result = await db.rpc("refund_unspent_credits", {
    p_workspace_id: connection.workspace_id,
    p_customer_id: grant.data.customer_id,
    p_source_stripe_event_id: grant.data.source_stripe_event_id,
    p_refund_amount: creditsToReverse,
    p_idempotency_key: `stripe:${connection.id}:${event.id}:refund`,
    p_refund_stripe_event_id: event.id,
  });
  if (result.error) throw new Error("REFUND_ADJUSTMENT_FAILED");
  return result.data;
}

async function disconnect(connection: Connection) {
  const now = new Date().toISOString();
  const { error } = await admin().from("stripe_connections").update({
    status: "disconnected",
    updated_at: now,
  }).eq("id", connection.id);
  if (error) throw new Error("DISCONNECT_UPDATE_FAILED");
  return { disconnected: true };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let event: Stripe.Event;
  try {
    const stripe = stripeClient();
    event = await stripe.webhooks.constructEventAsync(
      await req.text(),
      req.headers.get("stripe-signature") ?? "",
      env("STRIPE_CONNECTED_WEBHOOK_SECRET"),
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.livemode) return new Response("Test/sandbox events only", { status: 400 });
  if (!SUPPORTED.has(event.type)) return json({ ignored: true });

  const stripeAccountId = typeof event.account === "string" ? event.account : null;
  if (!stripeAccountId) return json({ error: "Connected Stripe account missing" }, 400);

  let connection: Connection;
  try {
    connection = await connectionFor(stripeAccountId);
  } catch (error) {
    if (isPermanent(error)) return json({ accepted: true, ignored: failureCode(error) });
    return json({ error: "Could not resolve Stripe connection" }, 503);
  }

  let persisted: { row: PersistedEvent; replay: boolean };
  try {
    persisted = await persistEvent(connection, event);
    if (persisted.row.status === "processed") {
      return json({ received: true, replayed: true });
    }
  } catch {
    return json({ error: "Could not persist Stripe event" }, 503);
  }

  try {
    const result = event.type === "payment_intent.succeeded"
      ? await grantFromPayment(connection, event)
      : event.type === "account.application.deauthorized"
      ? await disconnect(connection)
      : await refundFromStripe(connection, event);

    await markEvent(persisted.row.id, "processed", null);
    return json({ received: true, replayed: persisted.replay, result });
  } catch (error) {
    const code = failureCode(error);
    try { await markEvent(persisted.row.id, "failed", code); } catch { /* Stripe retry will re-persist/reprocess. */ }
    if (isPermanent(error)) {
      return json({ received: true, failed: true, error: code });
    }
    console.error("APEX connected Stripe event failed", event.id, code);
    return json({ error: "Processing failed; retry required" }, 503);
  }
}

if (import.meta.main) Deno.serve(handler);
