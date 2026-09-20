// Phase 6.2 — direct Stripe-to-APEX connected-account webhook ingress.
//
// This function only does ingress: verify the raw body signature, isolate
// test/live, bind the event to a workspace through its connected Stripe
// account, and persist the verified event durably. Every decision that touches
// the ledger lives in the shared server-only entry point
// `processConnectedStripeEvent`, which initial delivery and retry both call.
//
// The same entry point is reachable at POST <function-url>/retry for the retry
// scheduler, guarded by an APEX-owned internal key. A retry never carries a
// grant, a credit amount, or a customer id — only a connection id and an event
// id that APEX already verified and stored.

import Stripe from "npm:stripe@22.4.0";
import { env } from "../_shared/core.ts";
import {
  persistConnectedStripeEvent,
  processConnectedStripeEvent,
  resolveConnection,
} from "../_shared/connected_stripe_ingress.ts";

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Server-only retry surface for the retry scheduler. It is not a grant API: the
 * body names a persisted receipt, nothing else, and the processor re-derives
 * everything from that verified receipt.
 */
async function handleRetry(req: Request): Promise<Response> {
  const presented = req.headers.get("x-apex-internal-key") ?? "";
  let expected: string;
  try {
    expected = env("APEX_INTERNAL_RETRY_KEY");
  } catch {
    return json({ error: "Retry entry point is not configured" }, 503);
  }
  if (!presented || !timingSafeEqual(presented, expected)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => null) as
    | { connection_id?: string; stripe_event_id?: string }
    | null;
  const connectionId = body?.connection_id?.trim();
  const stripeEventId = body?.stripe_event_id?.trim();
  if (!connectionId || !stripeEventId) {
    return json({ error: "connection_id and stripe_event_id are required" }, 400);
  }

  const outcome = await processConnectedStripeEvent({ connectionId, stripeEventId });
  // 200 for a settled outcome, 503 only where another attempt could still help.
  return json(outcome, outcome.status === "failed" && !outcome.permanent ? 503 : 200);
}

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (new URL(req.url).pathname.replace(/\/+$/, "").endsWith("/retry")) {
    return await handleRetry(req);
  }

  // 1. Raw-body signature verification BEFORE the payload is interpreted at all.
  let event: Stripe.Event;
  try {
    event = await Stripe.webhooks.constructEventAsync(
      await req.text(),
      req.headers.get("stripe-signature") ?? "",
      env("STRIPE_CONNECTED_WEBHOOK_SECRET"),
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  // 2. Workspace-bound connected-account attribution with explicit mode isolation.
  const stripeAccountId = typeof event.account === "string" ? event.account : null;
  if (!stripeAccountId) return json({ error: "Connected Stripe account missing" }, 400);

  let connection;
  try {
    connection = await resolveConnection(stripeAccountId, event.livemode === true);
  } catch (error) {
    const permanent = error instanceof Error && "permanent" in error;
    // Acknowledge events APEX will never own so Stripe stops retrying them.
    if (permanent) return json({ accepted: true, ignored: true });
    return json({ error: "Could not resolve Stripe connection" }, 503);
  }

  // 3. Durable receipt BEFORE any ledger processing.
  let receipt;
  try {
    receipt = await persistConnectedStripeEvent(connection, event);
  } catch {
    return json({ error: "Could not persist Stripe event" }, 503);
  }
  if (receipt.row.status === "processed") return json({ received: true, replayed: true });

  // 4. One shared processing entry point, identical to what a retry runs.
  const outcome = await processConnectedStripeEvent({
    connectionId: connection.id,
    stripeEventId: event.id,
  });

  if (outcome.status === "failed") {
    if (outcome.permanent) {
      // Recorded, replayable, and not worth another Stripe delivery.
      return json({ received: true, failed: true, error: outcome.error });
    }
    console.error("APEX connected Stripe ingress failed", event.id, outcome.error);
    return json({ error: "Processing failed; retry required" }, 503);
  }

  return json({ received: true, ...outcome });
}

if (import.meta.main) Deno.serve(handler);
