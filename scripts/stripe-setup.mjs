#!/usr/bin/env node
// One-time operator script: creates the real Stripe Product + Prices for
// the APEX Founding Partner plan (a recurring monthly price plus a
// one-time setup fee), matching the amounts seeded into the `plans`
// table by supabase/migrations/20260908120000_init_backend_schema.sql.
//
// The Developer sandbox plan is free and intentionally never touches
// Stripe (see create-checkout-session, which provisions it directly).
//
// Usage:
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs
//
// This is idempotent-ish: it always creates new Price objects (Stripe
// Prices are immutable), but reuses an existing Product named "APEX
// Founding Partner" if one is found, so re-running does not duplicate
// the product itself.
import Stripe from 'stripe';

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error('Set STRIPE_SECRET_KEY before running this script.');
  process.exit(1);
}

const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });

const PRODUCT_NAME = 'APEX Founding Partner';
const MONTHLY_PRICE_CENTS = 29900;
const SETUP_FEE_CENTS = 200000;

async function findOrCreateProduct() {
  const existing = await stripe.products.search({ query: `name:"${PRODUCT_NAME}"`, limit: 1 });
  if (existing.data[0]) {
    console.log(`Reusing existing product ${existing.data[0].id}`);
    return existing.data[0];
  }
  const product = await stripe.products.create({
    name: PRODUCT_NAME,
    description: 'Guided implementation and early-access APEX infrastructure.',
  });
  console.log(`Created product ${product.id}`);
  return product;
}

async function main() {
  const product = await findOrCreateProduct();

  const recurringPrice = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: MONTHLY_PRICE_CENTS,
    recurring: { interval: 'month' },
    nickname: 'Founding Partner — monthly',
  });
  console.log(`Created recurring price ${recurringPrice.id} ($${MONTHLY_PRICE_CENTS / 100}/mo)`);

  const setupPrice = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: SETUP_FEE_CENTS,
    nickname: 'Founding Partner — one-time setup fee',
  });
  console.log(`Created one-time price ${setupPrice.id} ($${SETUP_FEE_CENTS / 100})`);

  console.log('\nNext step — run this against your Supabase project (SQL editor or `supabase db execute`):\n');
  console.log(
    `update public.plans set stripe_price_id_recurring = '${recurringPrice.id}', stripe_price_id_setup = '${setupPrice.id}' where id = 'founding';`,
  );
  console.log('\nAlso set these Edge Function secrets (see README for the full list):');
  console.log('  supabase secrets set STRIPE_SECRET_KEY=sk_... STRIPE_WEBHOOK_SECRET=whsec_...');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
