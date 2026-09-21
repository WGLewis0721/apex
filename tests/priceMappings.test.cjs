const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  validateStripePriceId,
  validateCreditAmount,
  applyMappingChange,
  mappingNeeded,
} = require("../.test-build/priceMappings.js");

describe("price mapping validation", () => {
  it("accepts a Stripe Price ID and rejects junk", () => {
    assert.equal(validateStripePriceId("price_test_example"), null);
    assert.equal(validateStripePriceId(" price_1ABC "), null);
    assert.match(validateStripePriceId(""), /Enter a Stripe Price ID/);
    assert.match(validateStripePriceId("prod_123"), /Stripe Price ID/);
    assert.match(validateStripePriceId("price_"), /Stripe Price ID/);
  });

  it("rejects zero, negative, fractional, and NaN credit amounts", () => {
    assert.equal(validateCreditAmount(1000), null);
    assert.match(validateCreditAmount(0), /greater than zero/);
    assert.match(validateCreditAmount(-5), /greater than zero/);
    assert.match(validateCreditAmount(1.5), /whole number/);
    assert.match(validateCreditAmount(Number.NaN), /number/);
    assert.match(validateCreditAmount(""), /how many credits/);
  });

  it("upserts the same price without duplicating the list", () => {
    const first = applyMappingChange([], {
      id: "map_1",
      stripe_price_id: "price_test_example",
      credit_amount: 1000,
      is_active: true,
      updated_at: "2026-09-20T00:00:00.000Z",
    });
    const updated = applyMappingChange(first, {
      id: "map_1",
      stripe_price_id: "price_test_example",
      credit_amount: 2000,
      is_active: true,
      updated_at: "2026-09-20T00:01:00.000Z",
    });
    assert.equal(updated.length, 1);
    assert.equal(updated[0].credit_amount, 2000);
  });

  it("deactivate and reactivate keep the same mapping row", () => {
    const active = {
      id: "map_1",
      stripe_price_id: "price_test_example",
      credit_amount: 2000,
      is_active: true,
      updated_at: "2026-09-20T00:01:00.000Z",
    };
    const off = applyMappingChange([active], { ...active, is_active: false });
    const on = applyMappingChange(off, { ...active, is_active: true });
    assert.equal(off[0].is_active, false);
    assert.equal(on[0].is_active, true);
    assert.equal(on.length, 1);
  });

  it("treats unconfigured_stripe_price and mapping_required as operator-action-needed", () => {
    assert.equal(mappingNeeded([{ last_error: null }]), false);
    assert.equal(mappingNeeded([{ last_error: "unconfigured_stripe_price" }]), true);
    assert.equal(mappingNeeded([{ last_error: "mapping_required", retry_operator_action: "mapping_required" }]), true);
    assert.equal(mappingNeeded([{ last_error: "transient", retry_operator_action: "mapping_required" }]), true);
  });

  it("does not impose an arbitrary credit cap", () => {
    assert.equal(validateCreditAmount(100001), null);
  });
});
