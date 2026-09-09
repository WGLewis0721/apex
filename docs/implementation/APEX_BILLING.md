# APEX billing and workspace activation

This is APEX's own Stripe billing, in **test mode**. Customer Stripe Connect,
APEX Cloud, SDK installation, usage, credits, and the live dashboard remain future phases.

## Deployment state — September 8, 2026

- Database migration `20260908212241_apex_billing_provisioning.sql` applied to
  Supabase project `fnmxlmjrkgojowpzrcwa`.
- `apex-checkout`, `apex-workspace`, and `apex-stripe-webhook` deployed.
- Stripe sandbox `acct_1UDVhTCsDEFORFLN` webhook registered:
  `we_1UDWXzCsDEFORFLNoLJpBW59`.
- Frontend implementation is on the implementation branch, not deployed to Pages.
- **Blocked:** function secrets have not been configured through this session.
  No real Checkout payment or browser end-to-end run has been completed.
  The connected tool cannot set function secrets; the Supabase CLI is not logged in.

## Required function secrets

Set these in the existing project's Edge Function Secrets. Never commit them or
put them in `VITE_` variables. Supabase provides its service-role key to functions;
that key must never be sent to the browser.

| Name | Value |
| --- | --- |
| `STRIPE_SECRET_KEY` | An APEX sandbox test key. Prefer a restricted test key with the permissions needed for Checkout creation, price lookup, and subscription/session reads. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret from endpoint `we_1UDWXzCsDEFORFLNoLJpBW59` in the APEX sandbox. |
| `APEX_CREDENTIAL_ENCRYPTION_KEY` | Base64-encoded 32 cryptographically random bytes. Generate with `openssl rand -base64 32`. Keep a secure backup; changing it without re-encrypting stored credentials prevents secret retrieval. |
| `APEX_APP_URL` (optional) | Defaults to `https://wglewis0721.github.io/apex/`. Sets both the allowed browser origin and Checkout return URLs; never comes from a client request. |

Frontend uses the existing `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`. After secrets are set, verify the functions and
merge/deploy the frontend via the existing GitHub Pages workflow.

## Existing Stripe catalog — do not duplicate

- Product: `prod_VDxrCjWDnperBL`.
- Setup: `apex_founding_setup` → `price_1UDVvQCsDEFORFLNZRqlVSYU` ($2,000).
- Monthly: `apex_founding_monthly` → `price_1UDVvWCsDEFORFLNbwjiwxmI` ($299/month).

The server resolves lookup keys and checks IDs, product, currency, amount, mode,
and interval. Checkout uses subscription mode with the one-time setup price on
its first invoice. No client-provided amounts, price IDs, or user IDs are trusted.
The free option links to the existing Forma demo; it does not claim to provision
an unpaid workspace. Live Stripe keys are rejected intentionally.

Webhook URL:
`https://fnmxlmjrkgojowpzrcwa.supabase.co/functions/v1/apex-stripe-webhook`

Endpoint API version: `2026-07-29.dahlia`; events:
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`,
`invoice.payment_failed`. This is an account endpoint, **not a Connect endpoint**.

## Activation and secrets

Only a verified webhook invokes the service-role activation RPC. It retrieves
Checkout from Stripe, validates the paid session and its two line items, then
commits the event ledger, APEX payment/subscription state, workspace, owner
membership, Sandbox environment, and credentials in one transaction. A failure
rolls back everything and returns 500 so Stripe retries. Account-row locking and
unique constraints prevent concurrent retries from provisioning twice.

Credentials use 192 random bits for the publishable key and 256 random bits for
the secret. The database stores SHA-256 plus AES-256-GCM ciphertext with the
owner ID as authenticated associated data. Authenticated owners may reveal the
secret again; this deliberately avoids an unrecoverable one-time response.
Normal Data API access cannot read the hash or ciphertext. Plaintext appears
only in an authenticated, `no-store` response and React memory. Sign-out clears
it. No real onboarding/payment/credential state is loaded from localStorage.

Subscription events retrieve current Stripe status, ignore older event timestamps,
and preserve canceled as terminal. They update the existing APEX subscription;
no downstream access engine or customer billing is involved.

Checkout retries reuse the persisted attempt ID as Stripe's idempotency key.
An expired, known session permits a fresh attempt. An unresolved attempt older
than 23 hours fails closed: an operator must look up the original Stripe session
by `metadata.apex_attempt_id` and persist its ID before retrying. Do not reset the
attempt blindly: Stripe may already have accepted payment.

## Verification

Completed:

- Existing frontend tests: 36 passed; production build passed.
- Edge tests: unsigned webhook rejection, auth requirements, unpaid and wrong-price
  rejection, retryable database failure, owner-only reveal, encryption/hash checks.
- SQL tests run against Supabase inside a rollback transaction: duplicate delivery,
  duplicate event types for one session, failed activation rollback, subscription
  ordering/recovery, membership visibility, cross-account isolation, protected
  secret columns and restricted RPCs. No test workspaces remain.
- Supabase advisors: the webhook ledger intentionally has no client RLS policy.
  Two warnings concern the pre-existing platform `rls_auto_enable()` function,
  outside this milestone. See the [Supabase advisory explanation](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

Repeat locally:

```sh
npm ci
npm test
npm run build
npm ci --prefix supabase/functions
npx deno test --allow-env --node-modules-dir=manual --config supabase/functions/deno.json supabase/functions/billing_test.ts supabase/functions/_shared/credentials_test.ts
```

Run `supabase/tests/apex_billing.sql` on a migrated database; it rolls back its fixtures.
The Edge tests use signed synthetic events and mocked external HTTP, not a real
Stripe payment. The browser could not open this environment's localhost preview.
An attempted API signup using a reserved example email was rejected by Supabase;
no signup/login success is claimed.

Still required after secrets are configured:

1. Create/confirm an account or log in; select Founding Partner.
2. Enter Stripe test Checkout and verify $2,299 today / $299 monthly. Complete
   with Stripe's documented test card, never a real card.
3. Confirm webhook delivery is 2xx and Workspace appears with a persisted ID,
   Sandbox environment, and revealable `apex_pk_test_` / `apex_sk_test_` keys.
4. Refresh, sign out/in, and resend the same Stripe event. Workspace/environment/
   key counts must stay one. A second account must see none of the first's data.
5. Visit `?checkout=success#start` on an unpaid account: it must stay pending.
   Check canceled checkout and a delayed-payment success too.

Tax collection is not enabled in this test milestone. Before real-money launch,
review Stripe Tax and registrations separately; do not assume tax is collected.

Official references used:
[Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create),
[fulfillment](https://docs.stripe.com/checkout/fulfillment),
[Supabase Stripe webhooks](https://supabase.com/docs/guides/functions/examples/stripe-webhooks),
[function secrets](https://supabase.com/docs/guides/functions/secrets),
[function authorization](https://supabase.com/docs/guides/functions/auth).
