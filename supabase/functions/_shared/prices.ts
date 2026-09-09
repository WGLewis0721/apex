import type Stripe from "npm:stripe@22.4.0";
export const PRODUCT = "prod_VDxrCjWDnperBL";
export const SETUP = "price_1UDVvQCsDEFORFLNZRqlVSYU";
export const MONTHLY = "price_1UDVvWCsDEFORFLNbwjiwxmI";
export async function foundingPrices(stripe: Stripe) {
  const { data } = await stripe.prices.list({
    lookup_keys: ["apex_founding_setup", "apex_founding_monthly"],
    active: true,
    limit: 2,
  });
  const setup = data.find((p) => p.lookup_key === "apex_founding_setup");
  const monthly = data.find((p) => p.lookup_key === "apex_founding_monthly");
  if (
    !setup || !monthly || setup.id !== SETUP || monthly.id !== MONTHLY ||
    setup.product !== PRODUCT || monthly.product !== PRODUCT ||
    setup.livemode || monthly.livemode ||
    setup.currency !== "usd" || monthly.currency !== "usd" ||
    setup.unit_amount !== 200000 || monthly.unit_amount !== 29900 ||
    setup.recurring || monthly.recurring?.interval !== "month" ||
    monthly.recurring.interval_count !== 1
  ) {
    throw new Error(
      "APEX price configuration does not match the approved offer",
    );
  }
  return [{ price: setup.id, quantity: 1 }, { price: monthly.id, quantity: 1 }];
}
