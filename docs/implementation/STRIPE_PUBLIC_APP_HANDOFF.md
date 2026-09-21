# Public Stripe App acceptance handoff

## September 20, 2026 blocker: Connect-enabled live account

Attempting to upload the canonical public app from `Apex · live` (`acct_1UDVhGCpWLixBiNT`) fails with Stripe's explicit error:

`Because your account is a Connect platform, you cannot choose the public distribution at this time.`

Stripe's current OAuth Stripe Apps documentation states that a Connect-enabled Stripe account cannot publish a Stripe App and that developers in this situation must create/use a **separate Stripe account** for the public app. Therefore:

- `Apex · live` cannot own the public APEX Stripe App while Connect remains enabled.
- `apex test dev` is only a sandbox development artifact and cannot substitute for the required live public-app owner.
- The supported next step is a new/other **verified live Stripe account with Connect not enabled**, then upload `com.graymattertechllc.apex` version `0.3.0` there.
- Do not enable Stripe Connect on that dedicated app-publisher account.

## Correct External-test ownership model

Stripe's current sandbox-support documentation requires the public app version used for External testing to be uploaded from the **live/main developer account**, not from a sandbox-created app.

The prior sandbox app `com.graymattertechllc.apex-dev` version `0.2.1` remains a development artifact. Its Dashboard correctly shows that External testing is unavailable there until business verification, and Stripe does not promote that globally unique app ID into the live account.

The canonical live External-test app now uses:

- app id: `com.graymattertechllc.apex`
- version: `0.3.0`
- distribution: public
- auth: OAuth
- sandbox installs: enabled
- callback: `https://fnmxlmjrkgojowpzrcwa.supabase.co/functions/v1/apex-stripe-connect-callback`

Upload this manifest from the verified **Apex · live** developer account. The app ID becomes permanent after its first successful upload. The prior `com.graymatter.apex` identifier was rejected as globally taken when uploading from the dedicated `Apex-Public` live account, so `com.graymattertechllc.apex` is the canonical publisher ID going forward.

## Finish in Stripe

1. Switch Stripe CLI to **Apex · live**.
2. From `stripe-app/`, upload with `stripe apps upload --live`.
3. In the live Dashboard, open **Developers → Apps / Created apps → APEX → External test** and select `0.3.0`.
4. If External test is not visible, use **Create a release** and confirm **Public** distribution.
5. Use the generated sandbox OAuth link to install into a separate tester sandbox.
6. For general sandbox installs, use the public app's **managed sandbox** API key for the OAuth code exchange and create the connected-account event destination in that managed sandbox.
7. Point the destination at:
   `https://fnmxlmjrkgojowpzrcwa.supabase.co/functions/v1/apex-connected-stripe-webhook`
8. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `charge.refunded`.
9. Store the managed-sandbox OAuth client/key and destination signing secret in Supabase as the existing mode-specific secrets.
10. Install through APEX onboarding and confirm the OAuth-connected account persists before running Phase 8.

Do not commit or paste Stripe secret keys, webhook signing secrets, OAuth refresh tokens, Supabase PATs, or APEX secret keys.

---



## Connected ingress processor contract (Phase 6.2)

This is the single server-only entry point for connected-account event processing. Initial webhook
delivery and any later retry run exactly the same code path.

**Signature**

```ts
// supabase/functions/_shared/connected_stripe_ingress.ts
processConnectedStripeEvent(input: {
  connectionId: string;    // stripe_connections.id (workspace-bound)
  stripeEventId: string;   // stripe_webhook_events.stripe_event_id
}): Promise<{
  status: "processed" | "already_processed" | "failed";
  kind?: "payment" | "refund" | "deauthorize" | "noop";
  replayed?: boolean;
  error?: string;          // short machine-readable code
  permanent?: boolean;     // true = another attempt cannot help
  result?: unknown;
}>
```

**Input provenance.** The only accepted inputs are a connection id and an event id APEX has already
persisted. Credit amounts, customer ids, and grant documents are never accepted from a caller. The
processor re-reads the Stripe-signature-verified event APEX stored, and re-retrieves canonical
payment/refund data from Stripe with APEX's own credentials (stored OAuth grant, else platform key
with the connected-account header). Credits come only from `stripe_credit_price_mappings`.

**Transaction boundary.** All ledger work happens inside one call to
`public.process_connected_stripe_ingress(p_connection_id, p_event_id, p_action)`. That function locks
the receipt row, resolves server-owned price mappings, calls the existing `grant_credits` /
`refund_unspent_credits`, and marks the event `processed` — all in one transaction. Any failure rolls
the whole thing back and leaves the receipt replayable.

**Idempotency / one effect per business action.** Ledger idempotency keys are scoped to the business
action, not the event id:

- payment: `stripe:<connection_id>:payment:<payment_intent_id>:line:<line_item_id>`
- refund:  `stripe:<connection_id>:refund:<refund_id>`

So `checkout.session.completed` and `payment_intent.succeeded` for one purchase produce one grant, and
`charge.refunded` / `refund.created` / `refund.updated` for one refund produce one adjustment. When a
second event describes an action already recorded, the processor returns the original outcome from
`credit_operations` instead of calling the ledger function again (the ledger function would otherwise
reject the reused key, because its stored request document carries the first event's id).

**Retry semantics for the scheduler (SuperGrok owns *when*, this owns *what*).**

- Retry candidates: `stripe_webhook_events` rows with `stripe_connection_id is not null` and
  `status = 'failed'` (also `'received'` rows older than a delivery window).
- Invoke either in-process (`processConnectedStripeEvent`) or over HTTP:
  `POST <apex-connected-stripe-webhook-url>/retry`, header `x-apex-internal-key: $APEX_INTERNAL_RETRY_KEY`,
  body `{"connection_id": "...", "stripe_event_id": "..."}`. There is no unsigned grant request.
- `status: "already_processed"` or `permanent: true` → stop retrying. `status: "failed"` with
  `permanent` unset → retry later; `attempt_count` and `last_error` are already maintained.
- The processor is safe to call concurrently and repeatedly; it never double-grants.
