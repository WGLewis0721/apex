// Adapter boundary for the real integrations the onboarding funnel will
// eventually call: billing APEX itself (purchase step), connecting the
// customer's own payment provider (connect-payments step), installing the
// SDK/CLI (install step), and the hosted APEX Cloud API (configure/verify
// steps). All four are simulated today behind these interfaces so the UI
// never talks to a concrete implementation directly, and each can be
// swapped for the real thing without touching the funnel components.
//
// None of these ever run APEX's own backend on the customer's machine.
// The real shape is always: customer app -> @apex/sdk or @apex/cli ->
// hosted APEX Cloud -> the customer's payment provider. What's simulated
// here stands in for network calls to APEX Cloud and to npm/PyPI, not for
// software that would otherwise install locally.

export type CheckoutRequest = { planId: string; setupFee: number; monthly: number };
export type CheckoutResult = { status: 'paid'; receiptId: string };

export interface BillingProvider {
  checkout(request: CheckoutRequest): Promise<CheckoutResult>;
}

// TODO(real integration):
// - Create a Stripe Checkout Session server-side for the selected price IDs.
// - Redirect the browser to session.url; never collect card data in this app.
// - Mark the plan active only after a verified `checkout.session.completed`
//   webhook, not on browser-side redirect return.
export function createSimulatedBillingProvider(): BillingProvider {
  return {
    async checkout() {
      await delay(900);
      return { status: 'paid', receiptId: `rcpt_${Math.random().toString(36).slice(2, 10)}` };
    },
  };
}

export interface PaymentConnectionProvider {
  connect(): Promise<'connected'>;
}

// TODO(real integration):
// - Redirect to Stripe Connect's OAuth authorize URL with the platform's
//   client ID and a signed state parameter.
// - Exchange the returned `code` for a connected account ID server-side.
// - Persist the connected account ID against the workspace server-side;
//   never trust a client-reported "connected" status.
export function createSimulatedPaymentConnection(): PaymentConnectionProvider {
  return {
    async connect() {
      await delay(900);
      return 'connected';
    },
  };
}

export type DetectedStack = { runtime: string; framework: string };
export type InstalledSdk = { pkg: string; version: string };
export type EnvConfig = { path: string; variables: string[] };
export type WebhookConfig = { endpoint: string };

export interface InstallerProvider {
  detectStack(): Promise<DetectedStack>;
  installSdk(): Promise<InstalledSdk>;
}

// TODO(real integration):
// - `npx @apex/cli init` is not a published command yet — this simulates
//   the network round trip it would make, not a local process spawn.
// - A real CLI would sign into the workspace with the demo/live secret
//   key, detect the project's package.json and framework, and write the
//   resolved SDK version back for `writeEnvConfig` to use.
// - `installSdk` stands in for `npm install @apex/sdk`; APEX Cloud itself
//   never runs on the customer's machine, only this thin client does.
export function createSimulatedInstaller(): InstallerProvider {
  return {
    async detectStack() {
      await delay(700);
      return { runtime: 'Node.js 20', framework: 'React' };
    },
    async installSdk() {
      await delay(900);
      return { pkg: '@apex/sdk', version: '0.1.0-preview' };
    },
  };
}

export interface EnvironmentProvider {
  writeEnvConfig(): Promise<EnvConfig>;
  configureWebhook(): Promise<WebhookConfig>;
}

// TODO(real integration):
// - Write real key material to the customer's own `.env.local`, never to
//   a server APEX controls, and never log the secret key value.
// - Register a real webhook endpoint with the connected Stripe account
//   (via APEX Cloud, using the Stripe Connect account id from
//   PaymentConnectionProvider) instead of returning a canned URL.
export function createSimulatedEnvironment(): EnvironmentProvider {
  return {
    async writeEnvConfig() {
      await delay(700);
      return { path: '.env.local', variables: ['APEX_PUBLISHABLE_KEY', 'APEX_SECRET_KEY'] };
    },
    async configureWebhook() {
      await delay(700);
      return { endpoint: 'https://api.apex.dev/v1/webhooks/stripe' };
    },
  };
}

export type AccessDecision = { outcome: 'allow'; allowance: number; remaining: number };

export interface VerificationProvider {
  sendTestCustomer(): Promise<{ customerId: string; plan: string }>;
  grantCredits(): Promise<{ amount: number }>;
  recordUsageEvent(): Promise<{ quantity: number }>;
  checkAccess(): Promise<AccessDecision>;
}

// TODO(real integration):
// - These four calls stand in for `apex.customers.identify`,
//   `apex.entitlements.grant`, `apex.usage.record`, and
//   `apex.access.check` against the hosted API once `@apex/sdk` is
//   published — see the Step 7 code sample.
// - A real check must run server-side with the secret key; never expose
//   an access decision that trusts client-reported state.
export function createSimulatedVerification(): VerificationProvider {
  return {
    async sendTestCustomer() {
      await delay(500);
      return { customerId: 'cus_demo_pro', plan: 'Pro' };
    },
    async grantCredits() {
      await delay(450);
      return { amount: 1000 };
    },
    async recordUsageEvent() {
      await delay(450);
      return { quantity: 250 };
    },
    async checkAccess() {
      await delay(550);
      return { outcome: 'allow', allowance: 1000, remaining: 750 };
    },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
