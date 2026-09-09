# APEX Stripe App — Phase 5

This directory contains the Stripe App manifest used by APEX to authorize an existing merchant Stripe account through Stripe Apps OAuth.

## External test setup

1. Install/login to the Stripe CLI using the APEX Stripe developer account.
2. From this directory run `stripe apps upload`.
3. In Stripe Dashboard, open the uploaded **APEX** app → **External test** → **Get started**.
4. Use the **Test OAuth** link. Its `client_id` is the value APEX needs as `STRIPE_APP_CLIENT_ID`.

Callback URI (must match exactly):

`https://fnmxlmjrkgojowpzrcwa.supabase.co/functions/v1/apex-stripe-connect-callback`

The OAuth client ID is not a secret. The APEX developer Stripe secret key and OAuth refresh tokens are secrets and must never be committed or exposed in browser code.

Phase 5 is complete only after the live APEX onboarding redirects through the Test OAuth install link, returns to APEX, and `stripe_connections.status` is `connected` for the paid workspace. Do not advance the production funnel into Install until that acceptance test passes.
