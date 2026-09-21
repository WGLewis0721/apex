# Public Stripe App acceptance handoff

The public OAuth implementation is built and deployed. The repository manifest targets the eligible public
app `com.graymatter.apex-dev`, requests only the read/event permissions needed by APEX, supports sandbox
installs, returns successful installs to APEX onboarding, and points OAuth at the deployed Supabase callback.

## Uploaded version

`0.2.0` was uploaded previously, but a later merge conflict regressed the repository manifest back to `com.graymatter.apex` and dropped permissions required by the connected processor. Version `0.2.1` restores the uploaded public app id `com.graymatter.apex-dev`, sandbox compatibility, post-install return, and the full read permissions used by connected ingress.

Stripe's current sandbox-support guidance requires new public-app versions to be uploaded from the **main/live developer account**, not from the managed sandbox. The managed sandbox is used for sandbox API keys and sandbox event destinations. External-test selection and installation remain Dashboard-driven controls.

## Finish in Stripe

1. From the **main/live APEX developer account**, upload `0.2.1` from `stripe-app/` with `stripe apps upload`.
2. Open **Developers → Apps → APEX → External test**, click **Get Started** (or **Edit**), and select `0.2.1`. If the External test tab is missing, use **Create a release** and confirm **public** distribution first.
3. For OAuth, use the generated **sandbox** install link. If a published/private version is already installed in the tester environment, uninstall it first from **Settings → Installed Apps**.
4. Copy the generated sandbox OAuth client ID and configure `STRIPE_APP_SANDBOX_CLIENT_ID`,
   `STRIPE_APP_SANDBOX_SECRET_KEY`, and `STRIPE_APP_OAUTH_MODE=sandbox` as Supabase function secrets. The sandbox secret key must come from the app's **managed sandbox**.
5. In the managed sandbox Workbench, create a connected-account event destination for `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, and `charge.refunded`, pointing at:

   ```text
   https://fnmxlmjrkgojowpzrcwa.supabase.co/functions/v1/apex-connected-stripe-webhook
   ```

6. Store that destination's signing secret as `APEX_CONNECTED_STRIPE_WEBHOOK_SECRET`.
7. Install the External-test app into a **separate tester sandbox/account** using the generated invite/OAuth link. Do not use the managed sandbox as the customer install target.
8. Return to APEX, complete the OAuth connection, configure one Stripe Price mapping, and repeat the lifecycle proof through the connected account.

Never commit or paste the developer key, webhook signing secret, OAuth refresh token, Supabase PAT, or APEX
secret API key. External-test selection and account authorization are Stripe Dashboard controls and cannot
be honestly replaced with the manual-pilot webhook.

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
