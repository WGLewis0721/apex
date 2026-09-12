# Public Stripe App acceptance handoff

The public OAuth implementation is built and deployed. The repository manifest targets the eligible public
app `com.graymatter.apex-dev`, requests only the read/event permissions needed by APEX, supports sandbox
installs, returns successful installs to APEX onboarding, and points OAuth at the deployed Supabase callback.

## Current external blocker

`stripe apps upload . --app-version 0.2.0 --non-interactive --wait` validates and packages the app, then
Stripe returns `Forbidden`. The Apps plugin reports the upload target as the main **Apex** account even when
the core CLI context is the separate **apex test dev** sandbox. Version `0.1.0` of `com.graymatter.apex-dev`
already exists, so app ownership exists; account authorization for a new version is the unresolved gate.

## Finish in Stripe

1. In Stripe Dashboard, switch to the account that owns `com.graymatter.apex-dev` and confirm it is not a
   Connect platform account and that the signed-in administrator can manage Stripe Apps.
2. Start a fresh CLI authorization with `stripe login --new-session`, approve that owner account, then run:

   ```powershell
   cd stripe-app
   stripe apps upload . --app-version 0.2.0 --non-interactive --wait
   ```

3. Open **Dashboard → Apps → APEX → Version history**, select `0.2.0`, and set it as the External-test
   version for a sandbox.
4. Copy the generated sandbox OAuth client ID and configure `STRIPE_APP_SANDBOX_CLIENT_ID`,
   `STRIPE_APP_SANDBOX_SECRET_KEY`, and `STRIPE_APP_OAUTH_MODE=sandbox` as Supabase function secrets.
5. In Workbench, create a connected-account event destination for `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, and `charge.refunded`, pointing at:

   ```text
   https://fnmxlmjrkgojowpzrcwa.supabase.co/functions/v1/apex-connected-stripe-webhook
   ```

6. Store that destination's signing secret as `APEX_CONNECTED_STRIPE_WEBHOOK_SECRET`, install through APEX,
   configure one Stripe Price mapping, and repeat the lifecycle proof through the connected account.

Never commit or paste the developer key, webhook signing secret, OAuth refresh token, Supabase PAT, or APEX
secret API key. External-test selection and account authorization are Stripe Dashboard controls and cannot
be honestly replaced with the manual-pilot webhook.
