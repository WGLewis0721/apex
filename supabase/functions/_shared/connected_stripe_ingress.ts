// Phase 6.2 — connected Stripe ingress: the single server-only processing entry
// point shared by initial webhook delivery and by later retries.
//
// Provenance rule for everything in this file: the only inputs that may decide
// a ledger effect are (a) the Stripe-signature-verified event that APEX itself
// persisted, and (b) data retrieved directly from Stripe with APEX's own
// credentials. A customer application can never hand APEX a normalized grant.
//
// Credit quantities are never taken from any request or payload field; they are
// resolved from the workspace's server-owned price mappings inside
// `process_connected_stripe_ingress`.

import Stripe from "npm:stripe@22.4.0";
import { admin, idOf } from "./core.ts";
import { connectedStripe } from "./connected_event.ts";

export type Connection = {
  id: string;
  workspace_id: string;
  stripe_account_id: string;
};

export type IngressOutcome = {
  status: "processed" | "already_processed" | "failed";
  kind?: string;
  replayed?: boolean;
  error?: string;
  permanent?: boolean;
  result?: unknown;
};

/** Stripe event types this ingress interprets. Anything else is a recorded no-op. */
export const SUPPORTED_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "payment_intent.succeeded",
  "charge.refunded",
  "refund.created",
  "refund.updated",
  "account.application.deauthorized",
]);

const API_VERSION = "2026-07-29.dahlia" as const;

class PermanentError extends Error {
  readonly permanent = true;
}
const permanent = (code: string) => new PermanentError(code);

function code(error: unknown) {
  return (error instanceof Error ? error.message : "PROCESSING_FAILED").slice(0, 160);
}

/**
 * Workspace-bound account attribution plus explicit test/live isolation.
 * A live event may never be attributed to a test connection, or the reverse.
 */
export async function resolveConnection(
  stripeAccountId: string,
  livemode: boolean,
): Promise<Connection> {
  const { data, error } = await admin()
    .from("stripe_connections")
    .select("id,workspace_id,stripe_account_id,livemode,status")
    .eq("stripe_account_id", stripeAccountId)
    .eq("status", "connected")
    .maybeSingle();
  if (error) throw new Error("CONNECTION_LOOKUP_FAILED");
  if (!data) throw permanent("UNKNOWN_STRIPE_ACCOUNT");
  // `livemode` may be absent on older connection rows; v1 is test-mode only, so
  // an unset column is treated as test and a live event is refused.
  const connectionLive = (data as { livemode?: boolean | null }).livemode === true;
  if (connectionLive !== livemode) throw permanent("STRIPE_MODE_MISMATCH");
  return data as Connection;
}

/**
 * Durable receipt BEFORE any ledger work. The whole verified event is stored so
 * a later retry can reprocess from APEX's own record instead of re-trusting the
 * network. Event identity is (stripe_account_id via connection) + stripe_event_id.
 */
export async function persistConnectedStripeEvent(connection: Connection, event: Stripe.Event) {
  const db = admin();
  const now = new Date().toISOString();
  const inserted = await db.from("stripe_webhook_events").insert({
    stripe_event_id: event.id,
    event_type: event.type,
    workspace_id: connection.workspace_id,
    stripe_connection_id: connection.id,
    payload: event as unknown as Record<string, unknown>,
    status: "received",
    attempt_count: 1,
    updated_at: now,
  }).select("id,status,attempt_count").maybeSingle();

  if (!inserted.error && inserted.data) return { row: inserted.data, replay: false };
  if (inserted.error?.code !== "23505") throw new Error("EVENT_PERSIST_FAILED");

  const existing = await db.from("stripe_webhook_events")
    .select("id,status,attempt_count")
    .eq("stripe_connection_id", connection.id)
    .eq("stripe_event_id", event.id)
    .maybeSingle();
  if (existing.error || !existing.data) throw new Error("EVENT_REPLAY_LOOKUP_FAILED");

  if (existing.data.status !== "processed") {
    const updated = await db.from("stripe_webhook_events")
      .update({ attempt_count: existing.data.attempt_count + 1, updated_at: now })
      .eq("id", existing.data.id)
      .select("id,status,attempt_count")
      .maybeSingle();
    if (updated.error || !updated.data) throw new Error("EVENT_REPLAY_UPDATE_FAILED");
    return { row: updated.data, replay: true };
  }
  return { row: existing.data, replay: true };
}

type NormalizedLine = { line_id: string; price_id: string; quantity: number };
type NormalizedAction =
  | { kind: "payment"; customer_id: string; payment_id: string; lines: NormalizedLine[] }
  | { kind: "refund"; refund_id: string; payment_id: string; refunded_minor: number; paid_minor: number }
  | { kind: "deauthorize" }
  | { kind: "noop"; reason: string };

/** Map a Stripe customer to an APEX customer inside this workspace only. */
async function apexCustomerId(connection: Connection, session: {
  customer?: unknown;
  metadata?: Record<string, string> | null;
}): Promise<string> {
  const db = admin();
  const stripeCustomerId = idOf(session.customer as string | { id: string } | null | undefined);
  if (stripeCustomerId) {
    const { data, error } = await db.from("customers").select("id")
      .eq("workspace_id", connection.workspace_id)
      .eq("stripe_customer_id", stripeCustomerId)
      .maybeSingle();
    if (error) throw new Error("CUSTOMER_LOOKUP_FAILED");
    if (data?.id) return data.id as string;
  }

  // Stripe-carried linkage. This identifies WHO the purchase belongs to; it can
  // never set how many credits are granted, and it must resolve to a customer
  // that already exists in this workspace.
  const declared = session.metadata?.apex_customer_id?.trim();
  if (declared) {
    const { data, error } = await db.from("customers").select("id")
      .eq("workspace_id", connection.workspace_id)
      .eq("id", declared)
      .maybeSingle();
    if (error) throw new Error("CUSTOMER_LOOKUP_FAILED");
    if (data?.id) return data.id as string;
  }
  throw permanent("APEX_CUSTOMER_NOT_FOUND");
}

/** Authoritative price lines for a purchase, from Stripe itself. */
async function paymentLines(stripe: Stripe, paymentIntentId: string): Promise<NormalizedLine[]> {
  const sessions = await stripe.checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 1,
    expand: ["data.line_items"],
  });
  const session = sessions.data[0];
  const items = session?.line_items?.data ?? [];
  const lines = items
    .map((item) => ({
      line_id: item.id,
      price_id: idOf(item.price as unknown as string | { id: string } | null),
      quantity: Number(item.quantity ?? 1),
    }))
    .filter((line): line is NormalizedLine => !!line.price_id);
  return lines;
}

/**
 * Canonical normalization. Every payment-shaped event collapses to the same
 * business action (its payment intent), and every refund-shaped event collapses
 * to the same refund id, so different event ids describing one business action
 * cannot produce two ledger effects.
 */
/**
 * Canonical normalization: every payment-shaped event collapses to its payment
 * intent and every refund-shaped event to its refund id, so different event ids
 * describing one business action cannot produce two ledger effects.
 */
export async function normalizeConnectedAction(
  connection: Connection,
  event: Stripe.Event,
  client?: Stripe,
): Promise<NormalizedAction> {
  if (!SUPPORTED_EVENT_TYPES.has(event.type)) {
    return { kind: "noop", reason: "UNSUPPORTED_EVENT_TYPE" };
  }
  if (event.type === "account.application.deauthorized") return { kind: "deauthorize" };

  const stripe = client ?? await connectedStripe(connection.workspace_id);

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const incoming = event.data.object as Stripe.Checkout.Session;
    const session = await stripe.checkout.sessions.retrieve(incoming.id, { expand: ["line_items"] });
    if (session.payment_status !== "paid") return { kind: "noop", reason: "PAYMENT_NOT_SETTLED" };
    const paymentId = idOf(session.payment_intent as string | { id: string } | null);
    if (!paymentId) throw permanent("PAYMENT_INTENT_MISSING");
    const lines = (session.line_items?.data ?? [])
      .map((item) => ({
        line_id: item.id,
        price_id: idOf(item.price as unknown as string | { id: string } | null),
        quantity: Number(item.quantity ?? 1),
      }))
      .filter((line): line is NormalizedLine => !!line.price_id);
    if (lines.length === 0) throw permanent("NO_MAPPABLE_PRICE_LINES");
    return {
      kind: "payment",
      customer_id: await apexCustomerId(connection, session),
      payment_id: paymentId,
      lines,
    };
  }

  if (event.type === "payment_intent.succeeded") {
    const incoming = event.data.object as Stripe.PaymentIntent;
    const payment = await stripe.paymentIntents.retrieve(incoming.id);
    if (payment.status !== "succeeded" || (payment.amount_received ?? 0) <= 0) {
      return { kind: "noop", reason: "PAYMENT_NOT_SETTLED" };
    }
    const lines = await paymentLines(stripe, payment.id);
    if (lines.length === 0) throw permanent("NO_MAPPABLE_PRICE_LINES");
    return {
      kind: "payment",
      customer_id: await apexCustomerId(connection, payment as unknown as {
        customer?: unknown;
        metadata?: Record<string, string> | null;
      }),
      payment_id: payment.id,
      lines,
    };
  }

  if (event.type === "charge.refunded") {
    const incoming = event.data.object as Stripe.Charge;
    const charge = await stripe.charges.retrieve(incoming.id, { expand: ["refunds"] });
    const paymentId = idOf(charge.payment_intent as string | { id: string } | null);
    const refund = (charge.refunds?.data ?? []).find((item) => item.status === "succeeded");
    if (!paymentId || !refund) return { kind: "noop", reason: "REFUND_NOT_SETTLED" };
    return {
      kind: "refund",
      refund_id: refund.id,
      payment_id: paymentId,
      refunded_minor: Number(charge.amount_refunded ?? refund.amount),
      paid_minor: Number(charge.amount_captured || charge.amount),
    };
  }

  // refund.created / refund.updated
  const incoming = event.data.object as Stripe.Refund;
  const refund = await stripe.refunds.retrieve(incoming.id);
  if (refund.status !== "succeeded") return { kind: "noop", reason: "REFUND_NOT_SETTLED" };
  const paymentId = idOf(
    (refund as Stripe.Refund & { payment_intent?: string | { id: string } | null }).payment_intent,
  );
  if (!paymentId) throw permanent("REFUND_SOURCE_PAYMENT_REQUIRED");
  const payment = await stripe.paymentIntents.retrieve(paymentId);
  const paidMinor = Number(payment.amount_received || payment.amount);
  if (!(paidMinor > 0)) throw new Error("PAYMENT_AMOUNT_UNAVAILABLE");
  return {
    kind: "refund",
    refund_id: refund.id,
    payment_id: paymentId,
    refunded_minor: Number(refund.amount),
    paid_minor: paidMinor,
  };
}

/**
 * THE reusable server-only processing entry point.
 *
 * Used by initial webhook delivery and by any later retry (SuperGrok's
 * scheduler owns WHEN it is called; this owns WHAT happens). It reads the
 * verified receipt APEX already persisted, re-derives the canonical action from
 * that receipt plus trusted Stripe retrieval, and performs the ledger effect in
 * one database transaction.
 *
 * It never accepts a normalized grant, a credit amount, or a customer id from a
 * caller: the only inputs are the connection and the persisted event id.
 */
export type IngressRpc = (args: {
  p_connection_id: string;
  p_event_id: string;
  p_action: NormalizedAction;
}) => Promise<unknown>;

export async function processConnectedStripeEvent(input: {
  connectionId: string;
  stripeEventId: string;
  /** Verified by Stripe signature (delivery) or retrieved from Stripe (retry). */
  event?: Stripe.Event;
  /** An already-built connected client whose binding the caller verified. */
  stripe?: Stripe;
  /**
   * How the transactional processor is invoked. The default calls
   * `process_connected_stripe_ingress` directly; the scheduled retry worker
   * passes a lease-fenced wrapper so stale workers cannot write.
   */
  rpc?: IngressRpc;
}): Promise<IngressOutcome> {
  const db = admin();
  const { data: receipt, error: receiptError } = await db.from("stripe_webhook_events")
    .select("id,status,payload,workspace_id,stripe_connection_id")
    .eq("stripe_connection_id", input.connectionId)
    .eq("stripe_event_id", input.stripeEventId)
    .maybeSingle();
  if (receiptError) return { status: "failed", error: "EVENT_LOOKUP_FAILED" };
  if (!receipt) return { status: "failed", error: "EVENT_NOT_RECEIVED", permanent: true };
  if (receipt.status === "processed") return { status: "already_processed", replayed: true };

  const { data: connectionRow, error: connectionError } = await db.from("stripe_connections")
    .select("id,workspace_id,stripe_account_id")
    .eq("id", input.connectionId)
    .maybeSingle();
  if (connectionError || !connectionRow) {
    return { status: "failed", error: "CONNECTION_LOOKUP_FAILED" };
  }
  const connection = connectionRow as Connection;

  try {
    const stripe = input.stripe ?? await connectedStripe(connection.workspace_id);
    // The event comes from the caller only when Stripe itself vouched for it:
    // a verified webhook signature, or a retrieval by persisted event id.
    const event = input.event ?? await stripe.events.retrieve(input.stripeEventId);
    if (event.id !== input.stripeEventId) throw permanent("EVENT_IDENTITY_MISMATCH");
    if (event.livemode) throw permanent("LIVE_MODE_EVENT_BLOCKED");

    const action = await normalizeConnectedAction(connection, event, stripe);
    const call: IngressRpc = input.rpc ?? (async (args) => {
      const { data, error } = await db.rpc("process_connected_stripe_ingress", args);
      if (error) throw new Error(error.message ?? "INGRESS_PROCESSING_FAILED");
      return data;
    });

    const data = await call({
      p_connection_id: connection.id,
      p_event_id: input.stripeEventId,
      p_action: action,
    });
    const result = data as { replayed?: boolean; kind?: string } | null;
    return {
      status: "processed",
      kind: result?.kind ?? action.kind,
      replayed: result?.replayed === true,
      result,
    };
  } catch (error) {
    const failure = code(error);
    // The receipt stays durable and replayable; only its status changes.
    await db.from("stripe_webhook_events").update({
      status: "failed",
      last_error: failure,
      updated_at: new Date().toISOString(),
    }).eq("id", receipt.id);
    return {
      status: "failed",
      error: failure,
      permanent: error instanceof PermanentError,
    };
  }
}
