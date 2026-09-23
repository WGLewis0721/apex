# Future Feature: Payment Paradigm

## Concept

Apex should help a SaaS founder determine **how their product should charge**, not only enforce billing after the model already exists.

The feature asks one core question:

> **What quantity naturally increases as the customer receives more value from my product?**

Then Apex evaluates three decisions:

1. **What do you meter?**
   - Seats
   - Projects
   - Usage
   - Credits
   - Transactions
   - Outcomes
   - Capacity
   - Other product-specific value metrics

2. **How do you package it?**
   - Flat rate
   - Tiered
   - Bundled allowance
   - Credits
   - Per-seat
   - Add-ons/modules
   - Hybrid base + usage

3. **When/how does the customer pay?**
   - Monthly
   - Annual
   - Prepaid
   - Postpaid
   - Committed spend
   - Overage
   - Transaction/revenue share

## Output: Payment Paradigm

Apex returns a recommended **Payment Paradigm** containing:

- Recommended value metric
- Metering unit
- Packaging structure
- Billing cadence
- Included allowances
- Overage behavior
- Upgrade/expansion triggers
- Rationale tying price to customer value
- Key risks or mismatches

Example:

> **Meter:** Projects protected  
> **Package:** 5 / 25 / 100 projects  
> **Payment:** Monthly subscription + usage overage  
> **Why:** Customer value scales with coverage while infrastructure cost scales with activity.

## Apex Advantage

The recommendation should not end as a pricing report.

Apex should be able to convert the selected Payment Paradigm into enforceable commercial infrastructure:

**Payment Paradigm → Stripe products/prices → entitlements → credits/limits → usage meters → enforcement rules → refund/reversal behavior**

This moves Apex upstream from:

> “Enforce the billing model.”

to:

> **“Design the commercial model, then turn it into enforceable infrastructure.”**

## Status

Future feature. Do not treat as current product capability.
