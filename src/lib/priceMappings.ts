export type PriceMapping = {
  id: string;
  stripe_price_id: string;
  credit_amount: number;
  is_active: boolean;
  updated_at: string;
};

export const PRICE_ID_PATTERN = /^price_[A-Za-z0-9_]+$/;

export function normalizePriceId(value: string): string {
  return value.trim();
}

export function validateStripePriceId(value: string): string | null {
  const priceId = normalizePriceId(value);
  if (!priceId) return "Enter a Stripe Price ID.";
  if (!PRICE_ID_PATTERN.test(priceId)) return "Use a Stripe Price ID such as price_test_example.";
  if (priceId.length > 255) return "That Stripe Price ID is too long.";
  return null;
}

export function validateCreditAmount(value: unknown): string | null {
  if (value === "" || value === null || value === undefined) return "Enter how many credits this price unlocks.";
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || Number.isNaN(amount)) return "Credit amount must be a number.";
  if (!Number.isSafeInteger(amount) || amount <= 0) return "Credit amount must be a whole number greater than zero.";
  return null;
}

export function eventNeedsMapping(event: {
  last_error?: string | null;
  retry_operator_action?: string | null;
}): boolean {
  const error = event.last_error ?? "";
  const action = event.retry_operator_action ?? "";
  return error.includes("unconfigured_stripe_price")
    || error.includes("mapping_required")
    || action === "mapping_required";
}

export function mappingNeeded(events: Array<{
  last_error?: string | null;
  retry_operator_action?: string | null;
}>): boolean {
  return events.some(eventNeedsMapping);
}

export function applyMappingChange(
  mappings: PriceMapping[],
  next: PriceMapping,
): PriceMapping[] {
  const others = mappings.filter((row) => row.id !== next.id && row.stripe_price_id !== next.stripe_price_id);
  return [next, ...others].sort((a, b) => a.stripe_price_id.localeCompare(b.stripe_price_id));
}
