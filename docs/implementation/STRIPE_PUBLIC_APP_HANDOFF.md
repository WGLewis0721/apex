# Public Stripe App acceptance handoff

The public OAuth implementation is built and deployed. The repository manifest targets the eligible public
app `com.graymatter.apex-dev`, requests only the read/event permissions needed by APEX, supports sandbox
installs, returns successful installs to APEX onboarding, and points OAuth at the deployed Supabase callback.

## Uploaded version

Version `0.2.0` uploaded successfully from the **apex test dev** sandbox after completing a fresh Stripe CLI
device authorization for that account. Stripe reports the version as ready. External-test selection and the
first install remain Dashboard-driven acceptance steps.

## Finish in Stripe

1. Open **Dashboard → Apps → APEX → Version history**, select `0.2.0`, and set it as the External-test
   version for a sandbox.
2. Copy the generated sandbox OAuth client ID and configure `STRIPE_APP_SANDBOX_CLIENT_ID`,
   `STRIPE_APP_SANDBOX_SECRET_KEY`, and `STRIPE_APP_OAUTH_MODE=sandbox` as Supabase function secrets.
3. In Workbench, create a connected-account event destination for `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, and `charge.refunded`, pointing at:

   ```text
   https://fnmxlmjrkgojowpzrcwa.supabase.co/functions/v1/apex-connected-stripe-webhook
   ```

4. Store that destination's signing secret as `APEX_CONNECTED_STRIPE_WEBHOOK_SECRET`, install through APEX,
   configure one Stripe Price mapping, and repeat the lifecycle proof through the connected account.

Never commit or paste the developer key, webhook signing secret, OAuth refresh token, Supabase PAT, or APEX
secret API key. External-test selection and account authorization are Stripe Dashboard controls and cannot
be honestly replaced with the manual-pilot webhook.
