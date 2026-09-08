import { Callout, DataTable, ExampleWalkthrough, H2, PageHeader, SeeAlso, Steps } from '../primitives';

const CONSOLE_NOTE = (
  <Callout kind="simulated" title="Try this today">
    The <a href="#console">behind-the-scenes console</a> is a real, working sandbox for this — its data
    lives in your browser's local storage rather than a production database, but the panels (Customers,
    Plans, Entitlements, Access Lab, Usage, Billing, Audit) are the closest thing APEX has today to a live
    operator dashboard.
  </Callout>
);

/* ============================================================ customer-lookup */

function CustomerLookup() {
  return (
    <>
      <PageHeader eyebrow="OPERATE" title="Customer lookup" lede="Find a customer and see their plan, credits, and history in one place." />

      <H2>What you're looking for</H2>
      <p>Given a customer, you typically need to answer four questions at a glance: What plan are they on? What's their payment status? How much of their allowance is left? What happened recently on their account?</p>

      <H2>Where this lives</H2>
      <DataTable
        head={['Question', 'Backed by']}
        rows={[
          ['Plan', <><code>subscriptions.plan_id</code> → <code>plans</code></>],
          ['Payment status', <code>subscriptions.status</code>],
          ['Balance', <><code>credit_grants.remaining_amount</code>, summed across active grants</>],
          ['Recent activity', <><code>audit_logs</code> and <code>usage_events</code></>],
        ]}
      />

      {CONSOLE_NOTE}

      <SeeAlso items={[{ href: '#docs/operate/event-history', title: 'Event history', description: 'The full activity trail behind a customer.' }]} />
    </>
  );
}

/* ================================================ payment-failures-and-cancellations */

function PaymentFailuresAndCancellations() {
  return (
    <>
      <PageHeader eyebrow="OPERATE" title="Payment failures & cancellations" lede="What happens when a card declines, and what happens when a customer leaves." />

      <H2>Payment failures</H2>
      <ExampleWalkthrough
        title="A renewal fails"
        stages={[
          { label: 'Stripe reports a failed charge', detail: 'The subscription moves toward past_due.' },
          { label: 'Access continues, deliberately', detail: 'A grace period is a product decision, not something that happens automatically.' },
          { label: 'Payment is retried', detail: 'Either automatically by the payment provider, or after the customer updates their card.' },
          { label: 'Resolved one of two ways', detail: <>Recovered → back to <code>active</code>. Exhausted → <code>unpaid</code>, and access changes.</> },
        ]}
      />
      <p>This exact loop is what Forma's "Simulate failed renewal" and "Recover payment" buttons walk through, using <code>failFormaPayment()</code> and <code>recoverFormaPayment()</code>.</p>

      <H2>Cancellations</H2>
      <Steps items={[
        { title: 'Customer or workspace cancels', body: <>Subscription status moves to <code>canceled</code>.</> },
        { title: 'Decide the access cutoff', body: 'Immediately, or through the end of the already-paid period — this needs to be a documented product decision, applied consistently.' },
        { title: 'Credits and history are preserved', body: 'Cancellation doesn\'t delete a customer\'s past usage or credit records — only future access.' },
      ]} />

      {CONSOLE_NOTE}

      <SeeAlso items={[{ href: '#docs/learn/customer-lifecycle', title: 'Learn: Customer lifecycle', description: 'Every state a subscription passes through.' }]} />
    </>
  );
}

/* ================================================ access-changes-and-credit-corrections */

function AccessChangesAndCreditCorrections() {
  return (
    <>
      <PageHeader eyebrow="OPERATE" title="Access changes & credit corrections" lede="Manually adjust what a customer can do — and leave a clear record of why." />

      <H2>When this comes up</H2>
      <ul>
        <li>A customer was wrongly denied access due to a bug, and needs a corrective grant.</li>
        <li>A support issue warrants a goodwill credit.</li>
        <li>A billing mistake needs a manual balance correction rather than waiting for the next period.</li>
      </ul>

      <H2>How it should work</H2>
      <Steps items={[
        { title: 'Make the correction as a new record, not an edit', body: <>A manual adjustment is its own <code>credit_grants</code> row with <code>reason: "manual_correction"</code> — never edit a past grant or consumption in place.</> },
        { title: 'Require a reason', body: 'Every manual change should carry a human-readable reason, because someone will ask about it later.' },
        { title: 'Log it', body: <>Recorded in <code>audit_logs</code> so the correction shows up in the customer's history alongside everything else.</> },
      ]} />

      <Callout kind="warning" title="Never edit history to fix a mistake">
        Correct forward, not backward. A wrong balance gets fixed with a new grant or consumption record —
        editing an old row destroys the audit trail that explains what actually happened.
      </Callout>

      {CONSOLE_NOTE}

      <SeeAlso items={[{ href: '#docs/operate/event-history', title: 'Event history', description: 'Where corrections show up.' }]} />
    </>
  );
}

/* ============================================================ event-history */

function EventHistory() {
  return (
    <>
      <PageHeader eyebrow="OPERATE" title="Event history" lede="The audit trail behind every access decision — what changed, when, and why." />

      <H2>Why this exists</H2>
      <p>
        Support, finance, and product should all be able to look at the same customer and see the same
        story — not reconstruct it from three different systems. That's what <code>audit_logs</code> is
        for: one append-only record of what changed and why.
      </p>

      <H2>What's in it</H2>
      <DataTable
        head={['Column', 'Meaning']}
        rows={[
          [<code>action</code>, 'What happened — e.g. "subscription.upgraded".'],
          [<code>actor_user_id</code>, 'Who or what caused it, when known.'],
          [<><code>target_type</code> + <code>target_id</code></>, 'What it happened to.'],
          [<code>metadata</code>, 'Structured detail specific to that action.'],
        ]}
      />

      <Callout kind="simulated" title="Real, running example">
        Forma's activity feed (under "For developers: billing events &amp; activity log") is exactly this
        idea, implemented client-side. Every generation, upgrade, top-up, and payment simulation appends a
        readable entry with a result — allow, deny, or info.
      </Callout>

      <SeeAlso items={[{ href: '#docs/reference/data-model', title: 'Reference: Data model', description: 'audit_logs, exactly as defined.' }]} />
    </>
  );
}

/* ============================================================ support-workflows */

const WORKFLOWS = [
  { situation: '"I paid but don\'t have access."', check: 'Check subscriptions.status — often incomplete (payment hasn\'t confirmed yet) rather than active.' },
  { situation: '"My credits disappeared."', check: 'Check for a plan change or period renewal — an allowance resetting isn\'t the same as credits vanishing.' },
  { situation: '"I was charged twice."', check: 'Check the payment provider directly first — APEX mirrors subscription state, it doesn\'t process charges.' },
  { situation: '"A feature I should have is locked."', check: 'Check plan_features for that plan/feature pair — a missing row means never granted, not a bug.' },
];

function SupportWorkflows() {
  return (
    <>
      <PageHeader eyebrow="OPERATE" title="Support workflows" lede="Common support requests, and where to look first." />

      <H2>Common situations</H2>
      <DataTable head={['Customer says…', 'Check first']} rows={WORKFLOWS.map((w) => [<b>{w.situation}</b>, w.check])} />

      <H2>General approach</H2>
      <Steps items={[
        { title: 'Look up the customer', body: <>See <a href="#docs/operate/customer-lookup">Customer lookup</a>.</> },
        { title: 'Read the event history before asking them to repeat themselves', body: <>Most questions are answerable from <a href="#docs/operate/event-history">event history</a> alone.</> },
        { title: 'If something is genuinely wrong, correct forward', body: <>See <a href="#docs/operate/access-changes-and-credit-corrections">Access changes &amp; credit corrections</a>.</> },
      ]} />

      {CONSOLE_NOTE}
    </>
  );
}

/* ============================================================== debugging */

function Debugging() {
  return (
    <>
      <PageHeader eyebrow="OPERATE" title="Debugging" lede="A customer says access is wrong. Here's how to actually find out why." />

      <H2>Start with the decision, not the symptom</H2>
      <p>
        "Access is wrong" isn't a starting point — "the access check for feature X returned deny with
        reason Y" is. If access decisions are being recorded, that reason is the fastest path to root
        cause; if not, reconstruct it from the same inputs a decision would use.
      </p>

      <H2>Checklist</H2>
      <Steps items={[
        { title: 'Confirm the subscription status', body: <>Is it actually <code>active</code>? A subtle <code>past_due</code> or <code>canceled</code> state is the most common cause.</> },
        { title: 'Confirm the plan has the entitlement at all', body: <>Check <code>plan_features</code> for that plan/feature pair — no row means the plan never included it.</> },
        { title: 'Confirm the balance', body: <>Sum <code>remaining_amount</code> across the customer's active <code>credit_grants</code> for that feature.</> },
        { title: 'Check for a very recent change', body: 'An upgrade, downgrade, or correction that happened seconds ago can look like a bug if the UI hasn\'t refreshed.' },
        { title: 'Reproduce it, don\'t just read about it', body: 'Where possible, walk the same steps yourself in a sandbox environment rather than reasoning about it secondhand.' },
      ]} />

      <Callout kind="tip" title="Practice this today">
        Every one of these steps has a direct equivalent in Forma: plan and status live on the account
        object, the balance is <code>formaRemaining(account)</code>, and the activity log shows exactly
        which decision was made and why for every single generation attempt.
      </Callout>

      <SeeAlso items={[
        { href: '#docs/operate/event-history', title: 'Event history', description: 'The record you\'re debugging against.' },
        { href: '#docs/reference/data-model', title: 'Data model', description: 'Every table referenced above.' },
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
