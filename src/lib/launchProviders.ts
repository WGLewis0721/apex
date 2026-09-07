// Adapter boundary for the two real integrations the onboarding funnel will
// eventually call: billing APEX itself (purchase step) and connecting the
// customer's own payment provider (connect-payments step). Both are
// simulated today behind these interfaces so the UI never talks to a
// concrete payment implementation directly, and a real implementation can
// replace the simulated one without touching the funnel components.

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
