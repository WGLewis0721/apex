import { Callout, DataTable, ExampleWalkthrough, H2, PageHeader, SeeAlso, Steps } from '../primitives';

const CONSOLE_NOTE = (
  <Callout kind="simulated" title="Operator UI is still a preview">
    The <a href="#console">behind-the-scenes console</a> remains browser-local demo state. The production
    ledger/API is hosted now, but the live operator dashboard that reads it is still a later phase.
  </Callout>
);

/* ============================================================ customer-lookup */

function CustomerLookup() {
  return (
    <>
      <PageHeader eyebrow="OPERATE" title="Customer lookup" lede="The eventual operator view should answer current state from the projection and explain it from durable source history." />

      <H2>What an operator needs</H2>
      <DataTable
        head={['Question', 'Authoritative source']}
        rows={[
          ['Who is this customer?', <><code>customers</code> scoped to the workspace.</>],
          ['What product rights are visible?', <><code>GET /entitlements</code> + plan/feature state.</>],
          ['What is spendable right now?', <><code>credit_accounts.remaining</code> / balance API — not a hot-path SUM of ledger rows.</>],
          ['Where did the value come from?', <><code>credit_grants</code> source Stripe event/payment references.</>],
          ['What was spent/refunded?', <><code>credit_ledger</code> + <code>credit_operations</code>.</>],
          ['What Stripe event caused it?', <><code>stripe_webhook_events</code> once connected ingress is wired.</>],
        ]}
      />

      <Callout kind="warning" title="Projection is the current balance">
        The ledger is the audit history. The current spendable value is the transactionally maintained
        <code>credit_accounts.remaining</code> projection.
      </Callout>

      {CONSOLE_NOTE}

      <SeeAlso items={[{ href: '#docs/operate/event-history', title: 'Event history', description: 'How to explain the current projection from durable history.' }]} />
    </>
  );
}

/* ================================================ payment-failures-and-cancellations */

function PaymentFailuresAndCancellations() {
  return (
    <>
      <PageHeader eyebrow="OPERATE" title="Payment failures & cancellations" lede="Subscription failure/access policy is legitimate later work, but it is not part of the frozen credit-wallet acceptance gate." />

      <H2>Current v1 boundary</H2>
      <p>
        Frozen v1 proves payment → grant → consume → refund for configured product value. Rich subscription
        grace-period/cancellation enforcement is a later entitlement lifecycle capability.
      </p>

      <ExampleWalkthrough
        title="Future renewal-failure lifecycle"
        stages={[
          { label: 'Stripe reports a failed renewal', detail: 'Money state changes in Stripe.' },
          { label: 'APEX persists verified state', detail: 'Commercial state remains auditable.' },
          { label: 'Workspace policy determines product rights', detail: 'Grace period versus immediate restriction must be explicit.' },
          { label: 'Recovery/cancellation updates later entitlement behavior', detail: 'Do not silently infer policy from a payment event.' },
        ]}
      />

      {CONSOLE_NOTE}

      <SeeAlso items={[{ href: '#docs/learn/customer-lifecycle', title: 'Learn: Customer lifecycle', description: 'Frozen v1 versus later lifecycle scope.' }]} />
    </>
  );
}

/* ================================================ access-changes-and-credit-corrections */

function AccessChangesAndCreditCorrections() {
  return (
    <>
      <PageHeader eyebrow="OPERATE" title="Access changes, refunds & credit corrections" lede="Correct forward with durable entries; never rewrite history to make a balance look clean." />

      <H2>Refunds are already defined</H2>
      <p>
        A refund is source-aware: APEX claws back only unspent value from the original purchase grant(s),
        records already-consumed value as <code>unrecoverable_spent</code>, and never makes the v1 balance negative.
      </p>

      <ExampleWalkthrough
        title="Full refund after partial use"
        stages={[
          { label: 'Purchase A grants 1,000', detail: 'Source attribution is preserved.' },
          { label: 'Customer consumes 750', detail: 'A has 250 unspent.' },
          { label: 'Stripe refunds the full purchase', detail: 'APEX claws back only the remaining 250 from A.' },
          { label: 'Operator result', detail: 'remaining 0, clawed_back 250, unrecoverable_spent 750.' },
        ]}
      />

      <H2>Manual corrections are later</H2>
      <p>
        A future operator correction should be a new auditable grant/adjustment with a reason, never an edit
        to an old ledger entry. Manual correction UI/API is not part of frozen v1.
      </p>

      <Callout kind="warning" title="Never steal from another purchase">
        Refunding source A cannot reduce source B's grant. Per-grant remaining exists to enforce this in data,
        not merely as a support policy.
      </Callout>

      {CONSOLE_NOTE}

      <SeeAlso items={[{ href: '#docs/learn/credits-and-usage', title: 'Credits and usage', description: 'The per-grant refund model.' }]} />
    </>
  );
}

/* ============================================================ event-history */

function EventHistory() {
  return (
    <>
      <PageHeader eyebrow="OPERATE" title="Event history" lede="The credit ledger already explains wallet changes; the full operator timeline will join that with Stripe event/replay state." />

      <H2>What exists now</H2>
      <DataTable
        head={['Source', 'What it explains']}
        rows={[
          [<code>credit_ledger</code>, 'Grant, consume, refund, and unrecoverable product-value history.'],
          [<code>credit_operations</code>, 'Original idempotent outcomes, including denied consumes and replays.'],
          [<code>credit_grants</code>, 'Which source purchase created value and how much remains/was consumed.'],
          [<code>credit_accounts</code>, 'Current projected spendable balance/version.'],
          [<code>stripe_webhook_events</code>, 'Persisted Stripe receipt/processing state; connected fulfillment wiring is next.'],
          [<code>audit_logs</code>, 'General audit foundation for broader operator events.'],
        ]}
      />

      <H2>Operator principle</H2>
      <p>
        Support should be able to start from the current projection and walk backward through ledger/grant
        source references to the commercial event that caused the state. The dashboard should not force them
        to reconstruct balance from raw tables manually.
      </p>

      {CONSOLE_NOTE}

      <SeeAlso items={[{ href: '#docs/reference/data-model', title: 'Reference: Data model', description: 'The tables behind that explanation.' }]} />
    </>
  );
}

/* ============================================================ support-workflows */

const WORKFLOWS = [
  { situation: '"I paid but did not receive credits."', check: 'Find the verified connected Stripe event, then confirm it persisted and produced exactly one source-attributed grant. This ingress is the next implementation milestone.' },
  { situation: '"My balance is wrong."', check: 'Read credit_accounts.remaining first, then reconcile the customer’s source grants and credit_ledger history.' },
  { situation: '"My spend was denied."', check: 'Read the credit_operations result/reason and current projection. A DENY replay should return the same original outcome.' },
  { situation: '"I was refunded but credits remain."', check: 'Confirm the refund targets the original source grant(s); already-consumed value is unrecoverable, other purchases are untouched.' },
];

function SupportWorkflows() {
  return (
    <>
      <PageHeader eyebrow="OPERATE" title="Support workflows" lede="Start from the authoritative product state, then trace the durable history that explains it." />

      <H2>Common situations</H2>
      <DataTable head={['Customer says…', 'Check first']} rows={WORKFLOWS.map((w) => [<b>{w.situation}</b>, w.check])} />

      <H2>General approach</H2>
      <Steps items={[
        { title: 'Resolve the workspace/customer', body: 'Never investigate outside the authenticated tenant boundary.' },
        { title: 'Read the current projection/state', body: <>Start with <code>balance</code>/<code>entitlements</code>, not a guessed SUM from history.</> },
        { title: 'Trace durable history', body: <>Use source grants, ledger entries, operation outcomes, then the originating Stripe event.</> },
        { title: 'Correct forward if later operator correction is required', body: 'Never mutate historical ledger rows to hide a mistake.' },
      ]} />

      {CONSOLE_NOTE}
    </>
  );
}

/* ============================================================== debugging */

function Debugging() {
  return (
    <>
      <PageHeader eyebrow="OPERATE" title="Debugging" lede="Trace the product-state chain in the same order APEX owns it: event → source grant → operation → projection." />

      <H2>Credit/balance checklist</H2>
      <Steps items={[
        { title: 'Confirm the customer/workspace', body: 'Tenant mismatch is a hard boundary, not something to work around.' },
        { title: 'Read the projection', body: <>Check <code>credit_accounts.remaining</code> and <code>version</code> through the API.</> },
        { title: 'Inspect the operation outcome', body: <>For a spend, find the matching <code>credit_operations</code> idempotency key and ALLOW/DENY result.</> },
        { title: 'Trace the grant burn/refund', body: <>Use <code>credit_ledger</code> and <code>credit_grants</code> to see exactly which source grants changed.</> },
        { title: 'Trace the commercial source', body: 'Once connected ingress is wired, follow the Stripe event/payment reference back to the verified event row.' },
      ]} />

      <Callout kind="warning" title="Do not debug by summing the ledger on the hot path">
        The ledger explains history. The projection is the current spendable state. A reconciliation job/test
        may compare them, but application spend decisions use the transactionally maintained projection.
      </Callout>

      <H2>Feature/access debugging later</H2>
      <p>
        Broader plan/feature access decisions remain later work. Frozen v1 does not expose a public
        <code>/check</code> endpoint, so operator tooling should not imply that such an engine is currently authoritative.
      </p>

      <SeeAlso items={[
        { href: '#docs/operate/event-history', title: 'Event history', description: 'The durable records you are debugging against.' },
        { href: '#docs/reference/data-model', title: 'Data model', description: 'Current projection/ledger structures.' },
      ]} />
    </>
  );
}

export const OPERATE_PAGES: Record<string, React.ComponentType> = {
  'customer-lookup': CustomerLookup,
  'payment-failures-and-cancellations': PaymentFailuresAndCancellations,
  'access-changes-and-credit-corrections': AccessChangesAndCreditCorrections,
  'event-history': EventHistory,
  'support-workflows': SupportWorkflows,
  debugging: Debugging,
};