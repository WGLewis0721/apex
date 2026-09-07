// Stub for a future real payment-provider integration (e.g. Stripe).
// Nothing in this file is wired up. Forma's simulated flows in `forma.ts`
// mutate local Store state directly and never call this interface.
//
// TODO(real integration):
// - Implement `StripePaymentProvider` (or equivalent) against this interface.
// - Replace direct calls to `subscribeForma` / `upgradeForma` / `topUpForma`
//   in the UI with calls into this provider; only apply the resulting
//   FormaAccount change once the provider confirms success.
// - Verify and handle provider webhooks (e.g. `invoice.payment_failed`,
//   `invoice.paid`, `customer.subscription.updated`) instead of the
//   `failFormaPayment` / `recoverFormaPayment` simulation buttons.
// - Add idempotency keys to checkout/top-up calls so retries can't double-charge.
// - Store the provider's customer/subscription IDs on FormaAccount once real
//   accounts exist; this stub intentionally has no persistence.

import type { FormaPlanId } from './forma';

export type CheckoutResult = { providerCustomerId: string; providerSubscriptionId: string };
export type ChargeResult = { providerChargeId: string };

export interface PaymentProvider {
  /** Start a subscription checkout for the given plan. */
  createSubscription(planId: FormaPlanId): Promise<CheckoutResult>;

  /** Change an existing subscription's plan (e.g. free -> pro). */
  changeSubscriptionPlan(subscriptionId: string, planId: FormaPlanId): Promise<void>;

  /** Charge for a one-off top-up of extra generations. */
  chargeTopUp(customerId: string, generationCount: number): Promise<ChargeResult>;

  /** Cancel a subscription (not exposed in the current simulated UI). */
  cancelSubscription(subscriptionId: string): Promise<void>;
}

export function createPaymentProvider(): PaymentProvider {
  throw new Error('No real PaymentProvider is configured. Forma currently only simulates payment events.');
}
