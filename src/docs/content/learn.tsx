import { useState } from 'react';
import { RotateCcw, Sparkles } from 'lucide-react';
import { Callout, DataTable, ExampleWalkthrough, FlowDiagram, H2, PageHeader, SeeAlso, Steps } from '../primitives';

/* ============================================================ what-is-apex */

function WhatIsApex() {
  return (
    <>
      <PageHeader
        eyebrow="LEARN"
        title="What is APEX?"
        lede="APEX is the layer that sits between a payment and the moment your product decides what a customer is allowed to do. It is not a payment processor — it's what happens after the payment."
      />

      <H2>Plain-English explanation</H2>
      <p>
        Stripe (or another payment provider) is very good at one job: moving money and tracking whether
        a charge succeeded. It is not designed to know that "the Pro plan" means 5,000 credits, 10 seats,
        and access to the premium report generator — and it has no opinion about what your product should
        do the moment a payment fails.
      </p>
      <p>
        APEX is the commercial logic layer that fills that gap. It holds the plans customers can buy, the
        entitlements each plan unlocks, how much of something a customer has used, and the credit balance
        they have left. Your product asks APEX one question — <em>is this customer allowed to do this right
        now?</em> — instead of re-deriving the answer from scattered billing state every time.
      </p>

      <H2>Visual model</H2>
      <FlowDiagram
        label="A payment flows through Stripe, into APEX, and becomes a product decision"
        nodes={[
          { title: 'Customer pays', detail: 'via Stripe' },
          { title: 'APEX records it', detail: 'plan, credits, status' },
          { title: 'Product asks APEX', detail: 'is this allowed?' },
          { title: 'Access responds', detail: 'continues or changes' },
        ]}
      />

      <H2>Example</H2>
      <ExampleWalkthrough
        title="Jordan subscribes to Pro"
        stages={[
          { label: 'Jordan pays $29/month', detail: 'Stripe processes the charge and confirms it succeeded.' },
          { label: 'APEX records the subscription', detail: 'Plan = Pro, status = active, 10 credits granted for the period.' },
          { label: 'Jordan opens the product', detail: 'The product asks APEX: does Jordan have access, and how many credits are left?' },
          { label: 'Access continues', detail: 'No code in the product had to know Pro means 10 credits — APEX already knew.' },
        ]}
      />
      <p>
        This exact sequence — buy, record, use, check — is the one idea this whole documentation set
        keeps coming back to. See it worked through in full on the{' '}
        <a href="#docs/learn/credits-and-usage">credits and usage</a> page.
      </p>

      <H2>Use case</H2>
      <p>
        APEX fits anywhere a product sells something and then has to keep enforcing what was sold:
        subscription SaaS, credit-based AI tools, membership platforms, usage-based APIs, and team
        accounts. The <a href="#docs/explore">Explore section</a> walks through each of these in depth,
        including where APEX's model fits well and where it doesn't.
      </p>

      <H2>How APEX handles it</H2>
      <p>
        Four ideas do almost all of the work: <b>plans</b> (what a customer can buy), <b>entitlements</b>{' '}
        (what a plan unlocks), <b>usage &amp; credits</b> (how much of something has been consumed), and{' '}
        <b>access decisions</b> (the allow/deny answer your product actually asks for). Every other page in
        Learn is one of these four ideas explained in depth.
      </p>

      <H2>Implementation</H2>
      <p>
        In a real build, you'd connect a payment provider, define plans and entitlements, configure
        credits, and then call APEX before gating any action in your product. The{' '}
        <a href="#docs/build/quickstart">Build → Quickstart</a> page walks through that path end to end.
      </p>

      <H2>Technical details</H2>
      <Callout kind="note" title="What's real today">
        <p>
          The APEX schema this documentation describes — <code>plans</code>, <code>features</code>,{' '}
          <code>plan_features</code>, <code>customers</code>, <code>subscriptions</code>,{' '}
          <code>usage_events</code>, <code>credit_grants</code>, <code>access_decisions</code>, and more —
          is a real, applied Postgres schema with workspace-scoped row-level security. See{' '}
          <a href="#docs/reference/data-model">Reference → Data model</a> for the exact tables and columns.
        </p>
        <p>
          What is <em>not</em> real yet: a running API, an SDK, and the evaluation logic that turns those
          tables into an actual allow/deny answer. Where this documentation shows that logic, it is
          labeled as a <b>design preview</b>. The one place you can run real commercial logic today is the{' '}
          <a href="#forma">Forma demo app</a>, which simulates plan limits, credits, and grace periods
          client-side using the same rules this documentation describes.
        </p>
      </Callout>

      <H2>Edge cases</H2>
      <p>
        What happens when a payment fails mid-cycle? When a customer downgrades with unused credits? When
        two different features share one usage counter? These are exactly the kind of questions APEX
        exists to answer consistently — covered as each concept comes up, and collected for quick lookup
        in the <a href="#docs/learn/glossary">glossary</a>.
      </p>

      <SeeAlso items={[
        { href: '#docs/learn/stripe-apex-your-product', title: 'Stripe → APEX → Your product', description: 'Who does what, in order.' },
        { href: '#docs/build/quickstart', title: 'Quickstart', description: 'The shortest real path to a working setup.' },
        { href: '#docs/reference/data-model', title: 'Data model', description: 'The real schema behind everything on this page.' },
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
        lede="Three layers, three jobs. Confusing them is the most common way billing logic ends up scattered across a codebase."
      />

      <H2>Plain-English explanation</H2>
      <p>
        <b>Stripe</b> moves money. It charges a card, runs a subscription's billing cycle, and tells you
        whether a payment succeeded, failed, or was refunded. It has no concept of "credits" or "seats" —
        those are business ideas you define, not something a payment processor knows about.
      </p>
      <p>
        <b>APEX</b> is the commercial layer above that. It listens for what Stripe reports, translates it
        into "this customer is on the Pro plan, has 7 credits left, and 3 seats," and answers the one
        question your product actually needs answered: is this allowed right now?
      </p>
      <p>
        <b>Your product</b> is where the customer actually does something — generate a report, invite a
        teammate, call an API. Your product doesn't re-implement billing rules; it asks APEX.
      </p>

      <H2>Visual model</H2>
      <FlowDiagram
        label="Stripe handles payment, APEX handles commercial state, your product handles the experience"
        nodes={[
          { title: 'Stripe', detail: 'charges, renewals, refunds' },
          { title: 'APEX', detail: 'plans, credits, entitlements, access' },
          { title: 'Your product', detail: 'the feature the customer uses' },
        ]}
      />

      <H2>Example</H2>
      <p>
        When Jordan's card is charged $29 for Pro, Stripe fires a <code>invoice.paid</code> webhook. APEX
        receives it, updates Jordan's subscription to <code>active</code>, and grants the credits Pro
        includes. The next time Jordan's product loads the dashboard, it asks APEX for Jordan's current
        plan and balance — it never talks to Stripe directly.
      </p>

      <H2>Use case</H2>
      <p>
        This separation matters most once a product has more than one place that needs to know "is this
        customer allowed to do this" — a web app, a background job, a mobile app, a support tool. Without
        a layer like APEX, each of those ends up with its own copy of the billing rules, and they drift.
      </p>

      <H2>How APEX handles it</H2>
      <Steps items={[
        { title: 'A payment event happens in Stripe', body: 'a charge, renewal, upgrade, cancellation, or failed payment.' },
        { title: 'APEX receives it via webhook', body: <>APEX updates the customer's <code>subscriptions</code> row and, where relevant, grants or adjusts credits.</> },
        { title: 'Your product asks APEX for a decision', body: <>before gating a feature, your product calls APEX instead of inspecting Stripe state or its own copy of the plan rules.</> },
      ]} />

      <H2>Implementation</H2>
      <p>
        See <a href="#docs/build/connect-payment-provider">Build → Connect a payment provider</a> for how
        this wiring works, and <a href="#docs/build/handle-webhooks">Build → Handle webhooks</a> for the
        Stripe → APEX half of the flow specifically.
      </p>

      <H2>Technical details</H2>
      <Callout kind="planned" title="Design preview">
        <p>
          The webhook receiver and the code that turns a Stripe event into an APEX state change are not
          built yet — <code>stripe_webhook_events</code> exists in the schema as an idempotency ledger, but
          nothing writes to it today. See <a href="#docs/reference/events-and-webhooks">Reference → Events
          &amp; webhooks</a> for the planned event shapes.
        </p>
      </Callout>

      <H2>Edge cases</H2>
      <p>
        What if Stripe reports a payment before your product has finished creating the customer record in
        APEX? What if a webhook arrives twice? These are exactly why <code>stripe_webhook_events</code>{' '}
        exists as an idempotency ledger in the schema, and why webhook handling is its own dedicated Build
        page rather than a footnote.
      </p>

      <SeeAlso items={[
        { href: '#docs/build/handle-webhooks', title: 'Handle webhooks', description: 'React to Stripe events safely.' },
        { href: '#docs/learn/payments-plans-access', title: 'Payments vs. plans vs. access', description: 'Three ideas people conflate.' },
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
        lede="A payment, a plan, and access sound related — and they are — but they're three separate ideas that can each be true or false independently of the others."
      />

      <H2>Plain-English explanation</H2>
      <p>
        A <b>payment</b> is a single event: a charge succeeded or it didn't. A <b>plan</b> is what a
        customer is subscribed to — a description of what they're supposed to get. <b>Access</b> is the
        real-time answer to "can this customer do this specific thing right now." A successful payment
        doesn't automatically mean unlimited access forever, and a plan existing doesn't mean every feature
        under it is currently unlocked — usage limits, grace periods, and cancellations all sit between
        "paid" and "allowed."
      </p>

      <H2>Visual model</H2>
      <DataTable
        head={['', 'Payment', 'Plan', 'Access']}
        rows={[
          ['Answers', ['Did money move?'], ['What did they buy?'], ['Can they do this, right now?']],
          ['Changes when', ['A charge runs'], ['Customer upgrades/downgrades'], ['Usage, payment status, or plan changes']],
          ['Owned by', ['Stripe'], ['APEX'], ['APEX, checked by your product']],
          ['Example', ['$29 charge succeeded'], ['Pro plan, 10 credits/mo'], ['7 of 10 credits left → allowed']],
        ]}
      />

      <H2>Example</H2>
      <ExampleWalkthrough
        title="A payment fails, but access doesn't stop immediately"
        stages={[
          { label: 'Jordan\'s renewal fails', detail: 'Stripe reports a failed charge — the payment is now false.' },
          { label: 'The plan doesn\'t change', detail: 'Jordan is still subscribed to Pro; nothing about the plan itself changed.' },
          { label: 'Access enters a grace period', detail: 'APEX marks the account status as grace_period — access continues while Jordan has a chance to update payment.' },
          { label: 'If payment isn\'t recovered', detail: 'access changes — but as a deliberate decision APEX made, not an automatic side effect of the failed charge.' },
        ]}
      />
      <p>
        This is exactly how the Forma demo app models it: <code>failFormaPayment()</code> sets status to{' '}
        <code>grace_period</code> without touching the plan or the credit balance, and{' '}
        <code>canGenerate()</code> keeps returning <code>allow: true</code> during that window.
      </p>

      <H2>Use case</H2>
      <p>
        Every use case in <a href="#docs/explore">Explore</a> depends on keeping these three concepts
        separate — it's what lets a subscription business offer a grace period, a credit-based product
        keep old credits usable after a downgrade, or a team account revoke one seat without touching the
        rest of the workspace's access.
      </p>

      <H2>How APEX handles it</H2>
      <p>
        Payments live in Stripe and are mirrored into APEX's <code>subscriptions</code> table (status:{' '}
        <code>incomplete</code>, <code>trialing</code>, <code>active</code>, <code>past_due</code>,{' '}
        <code>canceled</code>, or <code>unpaid</code>). Plans live in APEX's <code>plans</code> and{' '}
        <code>plan_features</code> tables. Access is meant to be a real-time decision made by the (not yet
        built) access decision engine, recorded in <code>access_decisions</code>.
      </p>

      <H2>Implementation</H2>
      <p>
        See <a href="#docs/build/check-access">Build → Check access</a> for how a product is meant to ask
        this question, and <a href="#docs/learn/customer-lifecycle">Learn → Customer lifecycle</a> for the
        full set of states a subscription moves through.
      </p>

      <H2>Technical details</H2>
      <Callout kind="note">
        The <code>subscriptions.status</code> values above are the real check constraint in the live
        schema. The logic that turns a status change into an access decision — the access decision engine
        — is not built yet; see <a href="#docs/reference/data-model">Reference → Data model</a>.
      </Callout>

      <H2>Edge cases</H2>
      <p>
        A customer can have a valid payment and a valid plan, but still be denied access to one specific
        feature because they've used up its credits. Access is always the most specific of the three —
        never assume payment or plan status alone answers "can they do this."
      </p>

      <SeeAlso items={[
        { href: '#docs/learn/customer-lifecycle', title: 'Customer lifecycle', description: 'Every state a subscription moves through.' },
        { href: '#docs/build/check-access', title: 'Check access', description: 'How a product asks the access question.' },
      ]} />
    </>
  );
}

/* ======================================================= credits-and-usage */

const CREDITS_SEQUENCE = [
  { label: 'Starting balance', total: 10 },
  { label: 'Generated "Q1 launch report"', total: 9 },
  { label: 'Generated "Customer follow-up"', total: 8 },
  { label: 'Generated "Release notes draft"', total: 7 },
];

function CreditsDemo() {
  const [step, setStep] = useState(0);
  const balance = CREDITS_SEQUENCE[step].total;
  const atStart = step === 0;
  const atEnd = step === CREDITS_SEQUENCE.length - 1;

  return (
    <div className="docs-walkthrough" aria-label="Interactive: Jordan spends credits">
      <figcaption>Try it: Jordan generates reports</figcaption>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-6)', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--brand-display)', fontSize: 56, fontWeight: 700, color: 'var(--brand-ink)', lineHeight: 1 }}>
            {balance}
          </div>
          <small style={{ color: 'var(--ap-muted)' }}>credits left</small>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <p style={{ margin: '0 0 8px', color: 'var(--brand-ink)', fontWeight: 600 }}>{CREDITS_SEQUENCE[step].label}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="ap-button"
              disabled={atEnd}
              onClick={() => setStep((s) => Math.min(CREDITS_SEQUENCE.length - 1, s + 1))}
            >
              <Sparkles size={14} /> Generate a report
            </button>
            <button type="button" className="ap-text-button" disabled={atStart} onClick={() => setStep(0)}>
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </div>
      </div>
      <div className="docs-walk-footer">
        {atEnd
          ? 'Jordan has spent 3 of 10 credits. 7 remain — the product keeps working normally.'
          : `Each generation costs 1 credit. ${CREDITS_SEQUENCE.length - 1 - step} more to try.`}
      </div>
    </div>
  );
}

function CreditsAndUsage() {
  return (
    <>
      <PageHeader
        eyebrow="LEARN"
        title="Credits and usage"
        lede="Jordan buys 10 credits, generates three reports, and has 7 left. Nothing about this concept is more complicated than that sentence — everything below is that sentence, explained in full."
      />

      <H2>Plain-English explanation</H2>
      <p>
        A credit is a unit of "something a customer can spend." What it represents is entirely up to the
        product — a report generation, an API call, a minute of processing. What matters is that it's a
        single number that goes down as it's used and can be topped up, and a plan defines how many a
        customer starts each period with.
      </p>

      <H2>Visual model</H2>
      <CreditsDemo />

      <H2>Example</H2>
      <p>
        Jordan subscribes to Forma's Pro plan and starts a new billing period with an allowance. Each time
        Jordan generates a draft, <b>one credit is spent</b>. The interactive example above plays out
        exactly what happens as Jordan writes three drafts in a row.
      </p>

      <H2>Use case</H2>
      <p>
        Credits are the right model whenever different actions should cost different amounts, or when a
        single number needs to represent usage across several distinct features (AI generations, API
        calls, exports). See <a href="#docs/explore/credit-based-products">Explore → Credit-based
        products</a> and <a href="#docs/explore/ai-token-applications">Explore → AI / token
        applications</a> for when this model fits and when a simpler per-seat plan is a better choice.
      </p>

      <H2>How APEX handles it</H2>
      <p>
        Three questions, asked in order, every time a customer tries to spend a credit:
      </p>
      <Steps items={[
        { title: 'What is the customer\'s allowance?', body: <>The plan's included amount, plus any bonus credits from a top-up. In Forma: <code>formaAllowance(account) = planLimit(account) + account.bonusGenerations</code>.</> },
        { title: 'How much have they already used?', body: <>Tracked as a running total for the current period. In Forma: <code>account.generationsUsed</code>.</> },
        { title: 'Is there anything left?', body: <>If used ≥ allowance, the action is denied with a specific reason — not a generic error. In Forma: <code>canGenerate(account)</code> returns <code>{'{ allow, reason }'}</code>.</> },
      ]} />
      <p>
        This is real, runnable logic — <a href="#forma">open the Forma demo</a> and watch the balance,
        the allow/deny decision, and the audit log update together as you generate drafts, upgrade, and
        buy top-ups.
      </p>

      <H2>Where the balance lives</H2>
      <p>
        In Forma's demo, the balance is derived state kept in the browser's local storage — there is no
        server involved. In a full APEX build, the intended home for this data is the{' '}
        <code>credit_grants</code> and <code>credit_consumptions</code> tables: a grant records an amount
        and a <code>remaining_amount</code>; each consumption reduces that remaining amount and links back
        to the <code>usage_event</code> that caused it.
      </p>
      <Callout kind="planned" title="Not yet built">
        <p>
          <code>credit_grants</code> and <code>credit_consumptions</code> exist in the live schema with
          workspace-scoped row-level security, but no code writes to or reads from them yet — this is
          exactly the logic Forma simulates client-side today. See{' '}
          <a href="#docs/reference/data-model">Reference → Data model</a> for the real table definitions.
        </p>
      </Callout>

      <H2>What happens at zero</H2>
      <p>
        Reaching zero credits doesn't mean the account is broken — it means the next spend is denied with
        a specific, actionable reason (upgrade, buy a top-up, or wait for the next period), while
        everything else about the account keeps working. In Forma, <code>canGenerate()</code> returning{' '}
        <code>allow: false</code> doesn't change the plan or reset usage; it's purely an answer to "can
        this one action happen right now."
      </p>

      <H2>Implementation</H2>
      <p>
        See <a href="#docs/build/configure-credits">Build → Configure credits</a> for how grants and
        top-ups are meant to be set up, and{' '}
        <a href="#docs/build/record-usage">Build → Record usage</a> for how consumption is meant to be
        reported.
      </p>

      <H2>Technical details</H2>
      <p>The calls a real integration would make once this is built:</p>
      <ExampleWalkthrough
        title="API calls behind &quot;Jordan generates a report&quot; (design preview)"
        stages={[
          { label: 'Check access', detail: <code>POST /v1/access/check {'{ customer, feature: "report_generation" }'}</code> },
          { label: 'Perform the action', detail: 'Your product actually generates the report.' },
          { label: 'Record usage', detail: <code>POST /v1/usage {'{ customer, feature: "report_generation", quantity: 1 }'}</code> },
          { label: 'APEX emits an event', detail: <code>credit.consumed</code> },
        ]}
        footer="These endpoints are a design preview — see Reference → API overview for status."
      />

      <H2>Edge cases</H2>
      <ul>
        <li><b>Expiring credits.</b> <code>credit_grants.expires_at</code> exists in the schema for grants that shouldn't roll over forever.</li>
        <li><b>Partial spends.</b> The schema uses <code>numeric</code> for amounts, not integers, so fractional consumption (e.g. metered seconds) is representable.</li>
        <li><b>Multiple grants.</b> A customer can have more than one active grant (a plan allowance plus a top-up); consumption needs an order to draw down in — first-expiring-first is the common default.</li>
      </ul>

      <SeeAlso items={[
        { href: '#docs/build/configure-credits', title: 'Configure credits', description: 'Set up grants, consumption, and top-ups.' },
        { href: '#docs/reference/data-model', title: 'Data model', description: 'credit_grants and credit_consumptions, exactly as defined.' },
        { href: '#forma', title: 'Open the Forma demo', description: 'Real, runnable credit logic — not a mockup.' },
      ]} />
    </>
  );
}

/* ============================================================ entitlements */

function Entitlements() {
  return (
    <>
      <PageHeader
        eyebrow="LEARN"
        title="Entitlements"
        lede="A plan is a name. An entitlement is what that name actually unlocks — feature by feature, limit by limit."
      />

      <H2>Plain-English explanation</H2>
      <p>
        "Pro" doesn't mean anything on its own. It means something because it's attached to a specific
        list of entitlements: access to premium report templates, a limit of 50 generations per month, 10
        team seats. Entitlements are the layer that turns a plan name into concrete, checkable rules.
      </p>

      <H2>Visual model</H2>
      <FlowDiagram
        label="A plan is made of features, and each feature can carry a limit"
        nodes={[
          { title: 'Plan: Pro' },
          { title: 'Feature: reports', detail: 'unlocked' },
          { title: 'Feature: generations', detail: 'limit: 50 / month' },
          { title: 'Feature: seats', detail: 'limit: 10' },
        ]}
      />

      <H2>Example</H2>
      <p>
        Forma models this with a single number per plan — <code>FORMA_PLANS.pro.limit = 50</code> — because
        Forma only has one feature to gate. A product with several distinct features (reports, exports,
        API access) would attach a separate entitlement to each one, some with numeric limits and some
        as simple on/off flags.
      </p>

      <H2>Use case</H2>
      <p>
        Entitlements matter most once a product has more than one thing to gate, or more than one plan
        tier. See <a href="#docs/explore/traditional-saas-subscriptions">Explore → Traditional SaaS
        subscriptions</a> for a worked multi-feature example.
      </p>

      <H2>How APEX handles it</H2>
      <p>
        Two real tables model this today: <code>features</code> (a workspace's catalog of things that can
        be gated — a key, a name, a description) and <code>plan_features</code> (the join between a plan
        and a feature, carrying an optional <code>limit_value</code>). A feature with no row in{' '}
        <code>plan_features</code> for a given plan is simply not included in that plan.
      </p>
      <DataTable
        caption="plan_features — the real schema"
        head={['Column', 'Type', 'Meaning']}
        rows={[
          [<code>plan_id</code>, 'uuid', 'Which plan this entitlement belongs to.'],
          [<code>feature_id</code>, 'uuid', 'Which feature is being granted.'],
          [<code>limit_value</code>, 'bigint (nullable)', 'A numeric limit (e.g. 50 generations). Null means unlimited or not applicable — a plain unlock.'],
        ]}
      />

      <H2>Implementation</H2>
      <p>
        See <a href="#docs/build/define-entitlements">Build → Define entitlements</a> for how to attach
        features and limits to a plan, and <a href="#docs/build/check-access">Build → Check access</a> for
        how a product is meant to read them back.
      </p>

      <H2>Technical details</H2>
      <Callout kind="planned" title="Not yet built">
        The schema for entitlements is real and applied. What's missing is the evaluation logic that
        combines a customer's plan, their <code>plan_features</code> rows, and their current usage into a
        single allow/deny answer — that's the access decision engine, and it hasn't been started. Forma's{' '}
        <code>canGenerate()</code> is a working, simplified version of exactly this idea for one feature.
      </Callout>

      <H2>Edge cases</H2>
      <p>
        What happens when a customer downgrades and loses an entitlement they were using? APEX's model
        doesn't retroactively delete anything the customer already has — it changes what future access
        decisions return. See <a href="#docs/build/upgrades-downgrades">Build → Upgrades and
        downgrades</a>.
      </p>

      <SeeAlso items={[
        { href: '#docs/build/define-entitlements', title: 'Define entitlements', description: 'Attach features and limits to a plan.' },
        { href: '#docs/reference/data-model', title: 'Data model', description: 'features and plan_features, exactly as defined.' },
      ]} />
    </>
  );
}

/* ======================================================= customer-lifecycle */

const LIFECYCLE_STATUSES = [
  { status: 'incomplete', meaning: 'Subscription created, but the first payment hasn\'t succeeded yet.' },
  { status: 'trialing', meaning: 'In a trial period — access is on, no payment has been charged yet.' },
  { status: 'active', meaning: 'Paid and in good standing. The default healthy state.' },
  { status: 'past_due', meaning: 'A renewal failed. Access typically continues during a grace period while payment is retried.' },
  { status: 'canceled', meaning: 'The customer or workspace ended the subscription.' },
  { status: 'unpaid', meaning: 'Payment retries were exhausted without success.' },
];

function CustomerLifecycle() {
  return (
    <>
      <PageHeader
        eyebrow="LEARN"
        title="Customer lifecycle"
        lede="Every customer moves through a small, well-defined set of states — from the first payment to, eventually, cancellation."
      />

      <H2>Plain-English explanation</H2>
      <p>
        A subscription isn't just "on" or "off." It moves through named states, and the state it's in
        determines whether access continues, whether billing is retrying, and what your product should
        tell the customer. Knowing the exact set of states — and not inventing your own — is what keeps
        this logic consistent everywhere it's checked.
      </p>

      <H2>Visual model</H2>
      <FlowDiagram
        label="The common path through a subscription's lifecycle"
        nodes={[
          { title: 'incomplete', detail: 'first payment pending' },
          { title: 'active', detail: 'paid, healthy' },
          { title: 'past_due', detail: 'renewal failed' },
          { title: 'active', detail: 'payment recovered' },
        ]}
      />
      <p>Or, if payment is never recovered: <code>past_due → unpaid</code>. Either side can also move directly to <code>canceled</code>.</p>

      <H2>Example</H2>
      <p>
        This is the exact path Forma's demo lets you play through: subscribe (→ <code>active</code>),
        simulate a failed renewal (→ <code>grace_period</code>, Forma's simplified stand-in for{' '}
        <code>past_due</code>), then recover payment (→ <code>active</code> again) — with an audit entry
        recorded at each step.
      </p>

      <H2>Use case</H2>
      <p>
        Every business model in <a href="#docs/explore">Explore</a> shares this same underlying lifecycle;
        what differs is what each product chooses to do at each state (block access immediately at{' '}
        <code>past_due</code>, or give a grace period — a product decision, not something APEX mandates).
      </p>

      <H2>How APEX handles it</H2>
      <DataTable
        caption="subscriptions.status — the real check constraint"
        head={['Status', 'Meaning']}
        rows={LIFECYCLE_STATUSES.map((s) => [<code>{s.status}</code>, s.meaning])}
      />

      <H2>Implementation</H2>
      <p>
        See <a href="#docs/build/handle-webhooks">Build → Handle webhooks</a> for how status changes are
        meant to arrive from Stripe, and{' '}
        <a href="#docs/operate/payment-failures-and-cancellations">Operate → Payment failures &amp;
        cancellations</a> for what to do when a customer lands in <code>past_due</code> or cancels.
      </p>

      <H2>Technical details</H2>
      <p>
        <code>subscriptions.customer_id</code> is nullable by design: a row with <code>customer_id = null</code>{' '}
        represents a workspace's own APEX subscription, and a row with <code>customer_id</code> set
        represents one of that workspace's customers subscribed to one of the workspace's own plans. Both
        share the same status model.
      </p>

      <H2>Edge cases</H2>
      <p>
        A subscription can skip states — a customer can cancel directly from <code>trialing</code> without
        ever becoming <code>active</code>. Never assume a subscription passed through every earlier state
        on its way to its current one.
      </p>

      <SeeAlso items={[
        { href: '#docs/operate/payment-failures-and-cancellations', title: 'Payment failures & cancellations', description: 'Operating this lifecycle day to day.' },
        { href: '#docs/reference/data-model', title: 'Data model', description: 'The subscriptions table, exactly as defined.' },
      ]} />
    </>
  );
}

/* ================================================================ glossary */

const GLOSSARY: { term: string; definition: string }[] = [
  { term: 'Access decision', definition: 'The allow/deny answer APEX gives when a product asks whether a customer can do something right now.' },
  { term: 'Credit', definition: 'A spendable unit representing an amount of a metered feature a customer can use before running out.' },
  { term: 'Credit grant', definition: 'A specific allocation of credits given to a customer — from a plan, a top-up, or a manual correction — with its own remaining balance.' },
  { term: 'Customer', definition: 'An end user of a workspace\'s product. Distinct from a "workspace," which is the company using APEX itself.' },
  { term: 'Entitlement', definition: 'What a plan unlocks for a customer — a feature being available, and optionally a numeric limit on it.' },
  { term: 'Environment', definition: 'A sandbox or live context a workspace operates in, each with its own API keys.' },
  { term: 'Feature', definition: 'Something in a workspace\'s product that can be gated or metered — the unit an entitlement attaches to.' },
  { term: 'Grace period', definition: 'A window after a failed payment where access continues while the customer has a chance to fix billing.' },
  { term: 'Plan', definition: 'What a customer subscribes to — a named bundle of entitlements and a price.' },
  { term: 'Usage event', definition: 'A single record of a customer doing something metered, reported to APEX.' },
  { term: 'Workspace', definition: 'A company or team using APEX to run their own product\'s billing and access logic.' },
];

function Glossary() {
  return (
    <>
      <PageHeader eyebrow="LEARN" title="Glossary" lede="Every APEX term used across this documentation, defined once, in plain English." />
      <H2>Terms</H2>
      <DataTable head={['Term', 'Definition']} rows={GLOSSARY.map((g) => [<b>{g.term}</b>, g.definition])} />
      <Callout kind="tip">
        Looking for exact field names and types instead of plain-English definitions? See{' '}
        <a href="#docs/reference/terminology">Reference → Terminology</a>.
      </Callout>
    </>
  );
}

export const LEARN_PAGES: Record<string, React.ComponentType> = {
  'what-is-apex': WhatIsApex,
  'stripe-apex-your-product': StripeApexProduct,
  'payments-plans-access': PaymentsPlansAccess,
  'credits-and-usage': CreditsAndUsage,
  'entitlements': Entitlements,
  'customer-lifecycle': CustomerLifecycle,
  'glossary': Glossary,
};
