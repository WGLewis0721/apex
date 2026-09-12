# Stripe webhook pilot: verified demo and operating lessons

## Purpose

This document records the smallest real APEX payment-to-credit demonstration. It is for controlled
test-mode pilots, not the final self-serve Stripe Apps integration.

## Verified flow

1. A paid APEX workspace receives a workspace-specific endpoint:
   `https://<project>.supabase.co/functions/v1/apex-manual-stripe-webhook/<endpoint-token>`.
2. A Stripe **test-mode Account webhook** sends `checkout.session.completed` and `charge.refunded` to it.
3. The Edge Function reads the unmodified request body and verifies `Stripe-Signature` against a secret kept
   server-side.
4. For a paid Checkout Session with a Stripe customer and bounded, server-created `apex_credits` metadata,
   APEX persists the event, creates/fetches the workspace customer, and grants credits idempotently.
5. The Stripe event ID and payment intent are retained on the grant, making repeat delivery safe and support
   investigation possible.

The September 12 sandbox run completed a $1.00 Checkout, received a processed
`checkout.session.completed` event, and produced exactly one open 1,000-credit grant.
It then consumed 750 credits, processed a full Stripe refund, clawed back the remaining 250, recorded the
750 already spent as unrecoverable, and replayed the refund event without adding a second adjustment.

## Do not confuse these paths

| Path | Use now | Limit |
| --- | --- | --- |
| APEX billing webhook | Charges the SaaS business for APEX | Never grants the SaaS business’s end-customer credits |
| Manual Stripe Dashboard webhook | Controlled test/pilot payment-to-credit proof | Merchant configures an endpoint; not scalable self-serve onboarding |
| Stripe Apps OAuth + connected events | Intended future customer connection product | Requires an eligible public app and External-test acceptance |

## Required safety rules

- Use test mode for this pilot. The webhook rejects live-mode events.
- Stripe signing secrets, Supabase PATs, service keys, and APEX secret keys never belong in Git, frontend
  environment variables, screenshots, or chat transcripts.
- An endpoint token is an opaque routing value, not authorization. Stripe’s signature is the authorization
  boundary for inbound events.
- The browser must not choose a grant amount. `apex_credits` is a temporary controlled-demo contract created
  by trusted server-side Checkout creation. Replace it with server-side product/price mappings before normal
  customer onboarding.
- Persist the event before ledger mutation, preserve failed rows for replay, and verify one Stripe event
  creates at most one grant.

## Before a second pilot or production use

1. Rotate all secrets exposed during the first demo, particularly the Supabase PAT and webhook signing secret.
2. Replace the first-demo deployment-secret fallback with an encrypted unique Dashboard signing secret for
   every workspace.
3. Resend the original successful Checkout event and verify it creates no second grant.
4. Add an automated isolated integration test and an operator runbook for failed event investigation/replay.
5. Do not call the full product lifecycle accepted until the scalable public Stripe App route has also passed
   External test and the full lifecycle on a connected customer Stripe account.
