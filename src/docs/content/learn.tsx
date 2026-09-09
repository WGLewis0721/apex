import { Callout, DataTable, ExampleWalkthrough, FlowDiagram, H2, PageHeader, SeeAlso, Steps } from '../primitives';

/* ============================================================ what-is-apex */

function WhatIsApex() {
  return (
    <>
      <PageHeader
        eyebrow="LEARN"
        title="What is APEX?"
        lede="APEX is the hosted layer that turns verified commercial events into product state your SaaS can actually use."
      />

      <H2>Plain-English explanation</H2>
      <p>
        Stripe answers questions about money: did a payment succeed, fail, renew, or get refunded? Your
        product still needs a different set of answers: what did that payment unlock, how much remains, what
        has already been used, and can scarce product value be spent right now?
      </p>
      <p>
        APEX exists to own that second layer. It maps verified commercial events into durable product state
        such as credits, balances, plan rights, feature entitlements, refunds, and usage history.
      </p>

      <H2>Visual model</H2>
      <FlowDiagram
        label="Stripe moves money; APEX maps it to durable product state"
        nodes={[
          { title: 'Customer pays', detail: 'Stripe verifies money movement' },
          { title: 'APEX maps value', detail: 'grant / plan / entitlement' },
          { title: 'Customer uses value', detail: 'authoritative consume' },
          { title: 'APEX explains state', detail: 'balance + durable history' },
        ]}
      />

      <H2>What is real today</H2>
      <Callout kind="note" title="Hosted wallet core is deployed">
        <p>
          APEX now has real hosted balance and entitlements reads, source-attributed grants, an append-only
          credit ledger, idempotent operation outcomes, and an atomic <code>consume</code> API. A hosted
          concurrency proof showed two parallel 750-credit spends against 1,000 credits produce one success,
          one DENY, and a remaining balance of 250.
        </p>
        <p>
          The missing commercial link is connected Stripe ingress: verified customer payment/refund events
          still need to call the deployed grant/refund ledger functions automatically.
        </p>
      </Callout>

      <H2>What APEX is not</H2>
      <p>
        APEX is not a payment processor, bank account, cryptocurrency system, or a new cloud platform the
        customer must adopt. It complements Stripe by maintaining what money unlocks inside the SaaS product.
      </p>

      <SeeAlso items={[
        { href: '#docs/learn/stripe-apex-your-product', title: 'Stripe → APEX → Your product', description: 'The responsibility boundary in order.' },
        { href: '#docs/learn/credits-and-usage', title: 'Credits and usage', description: 'How the deployed wallet thinks about product value.' },
        { href: '#docs/build/quickstart', title: 'Quickstart', description: 'Current implementation and remaining gates.' },
      ]} />
    </>
  );
}

/* ================================================ stripe-apex-your-product */

function StripeApexProduct() {
  return (
    <>
      <PageHeader
        eyebrow="LEARN"
        title="Stripe → APEX → Your product"
        lede="Three layers with separate jobs: money truth, product-state truth, and the customer experience."
      />

      <H2>Stripe</H2>
      <p>
        Stripe moves money and reports commercial events. It knows a charge succeeded or a refund happened.
        It does not need to know that a specific Stripe Price means 1,000 AI credits inside your product.
      </p>

      <H2>APEX</H2>
      <p>
        APEX verifies/persists the commercial event and maps it to product state: source-attributed grants,
        spendable balance, entitlements, usage, and refund adjustments.
      </p>

      <H2>Your product</H2>
      <p>
        Your application delivers the actual feature. For scarce credit value, it does not trust a cached
        balance and then spend later; it calls APEX's authoritative <code>consume</code> boundary.
      </p>

      <FlowDiagram
        label="Commercial event becomes product value"
        nodes={[
          { title: 'Stripe', detail: 'money truth' },
          { title: 'APEX', detail: 'product-state truth' },
          { title: 'Your product', detail: 'customer experience' },
        ]}
      />

      <H2>Current implementation boundary</H2>
      <p>
        The hosted ledger/API side exists. Stripe Apps OAuth connection is implemented but still awaiting
        External-test acceptance, and connected payment/refund events are not yet wired into the ledger.
      </p>

      <SeeAlso items={[
        { href: '#docs/build/connect-payment-provider', title: 'Connect Stripe', description: 'Finish the current Stripe connection gate.' },
        { href: '#docs/build/handle-webhooks', title: 'Handle Stripe events', description: 'Wire money events into grant/refund state.' },
      ]} />
    </>
  );
}

/* ================================================== payments-plans-access */

function PaymentsPlansAccess() {
  return (
    <>
      <PageHeader
        eyebrow="LEARN"
        title="Payments vs. plans vs. access"
        lede="Money movement, product rights, and scarce-value authorization are related but not interchangeable."
      />

      <DataTable
        head={['Concept', 'Question', 'Current authority']}
        rows={[
          ['Payment', ['Did money move?'], ['Stripe']],
          ['Product state', ['What did the customer buy / what remains?'], ['APEX hosted state']],
          ['Entitlements read', ['What plan/features/balance are visible right now?'], ['GET /entitlements']],
          ['Scarce-value spend', ['Can these credits actually be consumed now?'], ['POST /consume']],
        ]}
      />

      <H2>Why the distinction matters</H2>
      <p>
        A successful payment is not itself a product grant. An entitlements document showing 250 credits is
        not a promise that 250 will still be available a millisecond later. Two servers may read the same
        balance at once. The authoritative consume transaction is what prevents double-spend.
      </p>

      <ExampleWalkthrough
        title="Two workers see the same wallet"
        stages={[
          { label: 'Balance is 1,000', detail: 'Both workers may observe the same current state.' },
          { label: 'Both request consume(750)', detail: 'The requests race in hosted Postgres.' },
          { label: 'One succeeds', detail: 'Projection becomes 250 and grant rows are burned FIFO.' },
          { label: 'One is denied', detail: 'It cannot decrement remaining below zero.' },
        ]}
      />

      <SeeAlso items={[
        { href: '#docs/build/check-access', title: 'Product access', description: 'Read-only entitlements versus authoritative spend.' },
        { href: '#docs/build/record-usage', title: 'Consume credits', description: 'The deployed spend boundary.' },
      ]} />
    </>
  );
}

/* ===================================================== credits-and-usage */

function CreditsAndUsage() {
  return (
    <>
      <PageHeader
        eyebrow="LEARN"
        title="Credits and usage"
        lede="Credits are product units backed by source-attributed grants and a non-negative spendable projection."
      />

      <H2>Three pieces</H2>
      <Steps items={[
        { title: 'Grant', body: 'Adds product value and remembers which purchase/source created it.' },
        { title: 'Projection', body: <>Stores current spendable <code>remaining</code> for the hot concurrency path.</> },
        { title: 'Ledger', body: 'Preserves append-only grant/consume/refund/unrecoverable history.' },
      ]} />

      <H2>FIFO consumption</H2>
      <p>
        v1 consumes the oldest open grants first by <code>created_at</code>, then <code>id</code>. The account
        projection, affected grant rows, consume ledger entries, and operation result all commit together.
      </p>

      <H2>Refund example</H2>
      <ExampleWalkthrough
        title="Purchase A is partly spent before a full refund"
        stages={[
          { label: 'Grant A +1,000', detail: 'Purchase A created the grant.' },
          { label: 'Consume 750', detail: 'A now has 250 unspent.' },
          { label: 'Refund A for 1,000', detail: 'APEX claws back only A’s unspent 250.' },
          { label: 'Result', detail: 'remaining 0; unrecoverable_spent 750; no negative balance or debt.' },
        ]}
      />

      <Callout kind="warning" title="Refund A cannot steal from grant B">
        Per-grant remaining is part of the data model specifically so source-aware refunds remain real
        implementation behavior rather than a comment or policy note.
      </Callout>

      <H2>Expiry boundary</H2>
      <p>
        The schema has <code>expires_at</code>, but production expiry is not complete because expired grant
        remainder is not yet reconciled out of the account projection. Frozen v1 should use non-expiring grants.
      </p>

      <SeeAlso items={[
        { href: '#docs/build/configure-credits', title: 'Configure credits', description: 'The deployed wallet data model.' },
        { href: '#docs/build/record-usage', title: 'Consume credits', description: 'Atomic spend and idempotency.' },
      ]} />
    </>
  );
}

/* ========================================================== entitlements */

function Entitlements() {
  return (
    <>
      <PageHeader
        eyebrow="LEARN"
        title="Entitlements"
        lede="Entitlements describe product rights and current state; frozen v1 does not treat the document as a wallet authorization."
      />

      <H2>Current hosted document</H2>
      <p>
        <code>GET /v1/customers/:id/entitlements</code> can return customer status, current subscription/plan,
        plan features, <code>remaining</code>, <code>version</code>, and <code>as_of</code>.
      </p>

      <H2>What it is for</H2>
      <p>
        Use the document to render UI, understand current product state, and eventually evaluate eligible
        feature gates. It is deliberately shaped so v1.1 can sign the same kind of document later.
      </p>

      <H2>What it is not for</H2>
      <Callout kind="warning" title="A snapshot is not a spend right">
        Cached state can become stale under concurrent use. Scarce credits remain authoritative through
        <code>consume</code> (or a future reservation system if a real long-running workload requires one).
      </Callout>

      <H2>v1.1 direction</H2>
      <p>
        If customer latency needs justify it, APEX can sign entitlements and let the server SDK evaluate
        eligible feature/preflight checks locally with explicit TTL, invalidation, and outage policy.
      </p>

      <SeeAlso items={[
        { href: '#docs/build/define-entitlements', title: 'Define entitlements', description: 'Current read shape and later evaluation direction.' },
        { href: '#docs/build/check-access', title: 'Product access', description: 'How state reads differ from scarce-value authorization.' },
      ]} />
    </>
  );
}

/* ===================================================== customer-lifecycle */

function CustomerLifecycle() {
  return (
    <>
      <PageHeader
        eyebrow="LEARN"
        title="Customer lifecycle"
        lede="APEX earns recurring value by keeping commercial-to-product-state changes correct over time, not by performing one payment webhook once."
      />

      <H2>Frozen v1 lifecycle</H2>
      <FlowDiagram
        label="The first production lifecycle APEX is proving"
        nodes={[
          { title: 'Payment', detail: 'verified connected Stripe event' },
          { title: 'Grant', detail: 'source-attributed product value' },
          { title: 'Consume', detail: 'atomic spend + replay-safe outcome' },
          { title: 'Refund', detail: 'source-aware clawback/unrecoverable' },
        ]}
      />

      <H2>Later lifecycle capabilities</H2>
      <p>
        Renewals, recurring allowance reset/rollover policy, payment-failure access behavior, signed/local
        feature evaluation, expiry processing, reservations, and richer reconciliation are legitimate product
        directions — but they are later work, not hidden v1 requirements.
      </p>

      <H2>Why that sequencing matters</H2>
      <p>
        APEX's business model rewards removing repeated engineering. The first customer value comes from a
        dependable reusable wallet/payment-state core. Extra distributed systems or lifecycle branches only
        add value when an actual buyer needs them.
      </p>

      <SeeAlso items={[
        { href: '#docs/build/testing', title: 'Testing', description: 'What the hosted proof already covers and what remains.' },
        { href: '#docs/operate/event-history', title: 'Event history', description: 'How the eventual operator story stays explainable.' },
      ]} />
    </>
  );
}

/* ================================================================ glossary */

function Glossary() {
  const rows = [
    ['APEX customer', 'The SaaS/software company that pays APEX.'],
    ['End customer', 'The SaaS company’s own customer who buys/uses product value.'],
    ['Connected Stripe account', 'The SaaS company’s Stripe account where its end customers pay.'],
    ['APEX billing', 'The separate Stripe path where the SaaS company pays APEX.'],
    ['Grant', 'A durable source-attributed amount of product value.'],
    ['Credit account / projection', 'The hot-path non-negative spendable remaining balance.'],
    ['Ledger', 'Append-only history of grant, consume, refund, and unrecoverable entries.'],
    ['Operation', 'Idempotent request/outcome record, including DENY results that have no spend ledger row.'],
    ['Consume', 'The frozen v1 authoritative scarce-credit spend operation.'],
    ['Entitlements', 'Read-only product-state document: plan/features/balance/version/as_of.'],
    ['DENY', 'A failed authoritative spend or later access decision with a machine-readable reason.'],
    ['unrecoverable_spent', 'Refunded source value that had already been consumed and cannot be clawed back from the wallet.'],
    ['Reservation', 'Future hold primitive for start-now/finish-later work; not frozen v1.'],
    ['Signed snapshot', 'Future signed entitlements document for local evaluation; not frozen v1.'],
    ['Production-accepted', 'A capability that has passed its defined hosted/end-to-end acceptance gate.'],
  ];

  return (
    <>
      <PageHeader eyebrow="LEARN" title="Glossary" lede="The terms APEX uses, with v1 boundaries made explicit." />
      <DataTable head={['Term', 'Meaning']} rows={rows} />
    </>
  );
}

export const LEARN_PAGES: Record<string, React.ComponentType> = {
  'what-is-apex': WhatIsApex,
  'stripe-apex-your-product': StripeApexProduct,
  'payments-plans-access': PaymentsPlansAccess,
  'credits-and-usage': CreditsAndUsage,
  entitlements: Entitlements,
  'customer-lifecycle': CustomerLifecycle,
  glossary: Glossary,
};