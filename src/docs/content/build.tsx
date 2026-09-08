import { Callout, CodeBlock, DangerNote, DataTable, H2, PageHeader, SeeAlso, Steps } from '../primitives';

const PLANNED = { kind: 'planned' as const, label: 'Design preview — this API does not exist yet' };

/* ================================================================ quickstart */

function Quickstart() {
  return (
    <>
      <PageHeader eyebrow="BUILD" title="Quickstart" lede="The shortest real path from zero to a working setup — using what's actually built today, with the rest clearly marked as design preview." />

      <Callout kind="note" title="What you can actually do right now">
        <p>
          Account sign-up runs on real Supabase Auth. Workspace creation, payment, and API keys in the{' '}
          <a href="#start">onboarding flow</a> are simulated — they demonstrate the intended shape of the
          flow without a real backend behind them yet. This page walks through both halves honestly.
        </p>
      </Callout>

      <H2>1. Create an account</H2>
      <p>Open <a href="#start">Start with APEX</a> and sign up. This creates a real row in Supabase's <code>auth.users</code> table and a matching <code>profiles</code> row via a database trigger.</p>

      <H2>2. Create a workspace</H2>
      <p>
        The onboarding flow shows a workspace being created and assigned an ID. This step is simulated —
        no row is written to the real <code>workspaces</code> table yet, because workspace provisioning is
        explicitly deferred (see <a href="#docs/reference/data-model">Reference → Data model</a>).
      </p>

      <H2>3. Connect a payment provider</H2>
      <p>See <a href="#docs/build/connect-payment-provider">Connect a payment provider</a> for the intended flow. No real Stripe Connect integration exists yet.</p>

      <H2>4. Define plans and entitlements</H2>
      <p>See <a href="#docs/build/create-plans">Create plans</a> and <a href="#docs/build/define-entitlements">Define entitlements</a>. The tables these write to are real and live; there's no API to write them through yet.</p>

      <H2>5. Try the real thing</H2>
      <p>
        For hands-on logic you can actually run today, open the <a href="#forma">Forma demo app</a>. It's a
        complete, working example of exactly what a finished APEX integration would feel like — plan
        limits, credits, upgrades, grace periods, and an audit trail — built with the same rules this
        documentation describes, running entirely client-side.
      </p>

      <SeeAlso items={[
        { href: '#docs/build/connect-payment-provider', title: 'Connect a payment provider', description: 'Step two, in depth.' },
        { href: '#forma', title: 'Open the Forma demo', description: 'Real, runnable commercial logic.' },
      ]} />
    </>
  );
}

/* ==================================================== connect-payment-provider */

function ConnectPaymentProvider() {
  return (
    <>
      <PageHeader eyebrow="BUILD" title="Connect a payment provider" lede="Give APEX visibility into a customer's payments so it can keep plans, credits, and access in sync." status={PLANNED} />

      <H2>Before you start</H2>
      <p>
        This page describes the intended flow. The real, applied piece today is the schema:{' '}
        <code>stripe_connections</code> holds a workspace's connected account and status (
        <code>not_connected</code>, <code>pending</code>, <code>connected</code>, <code>disconnected</code>),
        but no OAuth flow writes to it yet.
      </p>

      <H2>Steps</H2>
      <Steps items={[
        { title: 'Start the connection', body: <>From your workspace settings, choose "Connect Stripe." This would begin a Stripe Connect OAuth flow.</> },
        { title: 'Authorize on Stripe', body: 'You approve the connection on Stripe\'s own hosted page — APEX never sees your Stripe credentials directly.' },
        { title: 'APEX records the connection', body: <>APEX stores the returned account ID and flips <code>stripe_connections.status</code> to <code>connected</code>.</> },
        { title: 'Confirm webhooks are live', body: 'APEX would register for the Stripe events it needs — see Handle webhooks.' },
      ]} />

      <H2>Expected result</H2>
      <p>A <code>connected</code> status and a Stripe account ID visible in your workspace settings, with no further action needed for future payments to flow through.</p>

      <H2>Troubleshooting</H2>
      <DataTable
        head={['Symptom', 'Likely cause']}
        rows={[
          ['Connection stuck at pending', 'The OAuth authorization was never completed on Stripe\'s side.'],
          ['Payments succeed in Stripe but APEX shows nothing', 'Webhooks aren\'t configured — see Handle webhooks.'],
        ]}
      />

      <SeeAlso items={[
        { href: '#docs/build/handle-webhooks', title: 'Handle webhooks', description: 'The other half of this connection.' },
        { href: '#docs/reference/data-model', title: 'Data model', description: 'stripe_connections, exactly as defined.' },
      ]} />
    </>
  );
}

/* ================================================================ create-plans */

function CreatePlans() {
  return (
    <>
      <PageHeader eyebrow="BUILD" title="Create plans" lede="A plan is what a customer subscribes to — a name, a price, and (via entitlements) a set of things it unlocks." status={PLANNED} />

      <H2>Before you start</H2>
      <p>The <code>plans</code> table is real and live. A plan with <code>workspace_id</code> set belongs to your workspace's own catalog; there's no write API for it yet.</p>

      <H2>Steps</H2>
      <Steps items={[
        { title: 'Choose a key and a name', body: <>e.g. <code>key: "pro"</code>, <code>name: "Pro"</code>. The key is what your code refers to; the name is what customers see.</> },
        { title: 'Set a price', body: <>Stored as <code>monthly_price_cents</code> — always an integer, never a float, to avoid rounding errors.</> },
        { title: 'Link a Stripe price', body: <>Set <code>stripe_price_id_recurring</code> so a subscription created in Stripe maps back to this plan.</> },
        { title: 'Attach entitlements', body: <>Continue to <a href="#docs/build/define-entitlements">Define entitlements</a> to say what the plan actually includes.</> },
      ]} />

      <H2>Example (design preview)</H2>
      <CodeBlock language="ts" code={`await apex.plans.create({
  key: "pro",
  name: "Pro",
  monthlyPriceCents: 2900,
  stripePriceId: "price_1P...",
});`} caption="Illustrative — this SDK is not published." />

      <H2>Expected result</H2>
      <p>A row in <code>plans</code> scoped to your workspace, ready to have entitlements attached to it.</p>

      <Callout kind="warning" title="Plan keys are unique per workspace">
        The schema enforces a unique <code>(workspace_id, key)</code> pair — two plans in the same
        workspace can't share a key, but two different workspaces can each have their own <code>"pro"</code>.
      </Callout>

      <SeeAlso items={[{ href: '#docs/build/define-entitlements', title: 'Define entitlements', description: 'What a plan actually unlocks.' }]} />
    </>
  );
}

/* ============================================================ define-entitlements */

function DefineEntitlements() {
  return (
    <>
      <PageHeader eyebrow="BUILD" title="Define entitlements" lede="Attach features and limits to a plan so 'Pro' means something specific and checkable." status={PLANNED} />

      <H2>Steps</H2>
      <Steps items={[
        { title: 'Define the feature once', body: <>Create a row in <code>features</code> — e.g. <code>key: "report_generation"</code>. Define each feature once, then reuse it across every plan that includes it.</> },
        { title: 'Attach it to a plan', body: <>Create a <code>plan_features</code> row linking the plan and feature, with an optional <code>limit_value</code>.</> },
        { title: 'Leave limit_value null for a plain unlock', body: 'Use null when a feature is either fully available or not — no numeric ceiling.' },
        { title: 'Repeat per plan', body: 'The same feature can carry a different limit on each plan — e.g. 50 on Pro, 3 on Free.' },
      ]} />

      <H2>Example (design preview)</H2>
      <CodeBlock language="ts" code={`await apex.entitlements.set({
  plan: "pro",
  feature: "report_generation",
  limit: 50, // per billing period
});

await apex.entitlements.set({
  plan: "free",
  feature: "report_generation",
  limit: 3,
});`} />

      <H2>Expected result</H2>
      <p>Checking access for a Pro customer on <code>report_generation</code> returns an allowance of 50; a Free customer, 3 — exactly how Forma's <code>FORMA_PLANS</code> models the same idea today, just hard-coded instead of read from these tables.</p>

      <H2>Troubleshooting</H2>
      <p>A customer reports they can't access something their plan should include? Check that a <code>plan_features</code> row actually exists for that plan/feature pair — a missing row means "not included," not an error.</p>

      <SeeAlso items={[{ href: '#docs/learn/entitlements', title: 'Learn: Entitlements', description: 'The concept behind this page.' }]} />
    </>
  );
}

/* ============================================================ configure-credits */

function ConfigureCredits() {
  return (
    <>
      <PageHeader eyebrow="BUILD" title="Configure credits" lede="Set up how many credits a plan grants, and how top-ups add to that balance." status={PLANNED} />

      <H2>Steps</H2>
      <Steps items={[
        { title: 'Decide what a credit represents', body: 'One unit of the metered thing your product cares about — a generation, an API call, a minute of processing.' },
        { title: 'Grant credits on subscribe or renew', body: <>Create a <code>credit_grants</code> row with an <code>amount</code> and matching <code>remaining_amount</code> when a billing period starts.</> },
        { title: 'Allow top-ups', body: <>A top-up is just another grant — a separate <code>credit_grants</code> row with its own <code>reason</code> (e.g. <code>"top_up"</code>).</> },
        { title: 'Set expiry if needed', body: <><code>credit_grants.expires_at</code> is optional — leave it null for credits that roll over indefinitely.</> },
      ]} />

      <H2>Example (design preview)</H2>
      <CodeBlock language="ts" code={`await apex.credits.grant({
  customer: "cus_jordan",
  feature: "report_generation",
  amount: 10,
  reason: "plan_renewal",
});`} />

      <Callout kind="tip" title="See it running today">
        Forma's top-up button calls <code>topUpForma(store, 10)</code>, which is the same idea implemented
        directly against local demo state instead of these tables. Open the <a href="#forma">Forma demo</a>{' '}
        and buy a top-up to watch the balance change.
      </Callout>

      <SeeAlso items={[
        { href: '#docs/learn/credits-and-usage', title: 'Learn: Credits and usage', description: 'The full worked example.' },
        { href: '#docs/build/record-usage', title: 'Record usage', description: 'How credits actually get spent.' },
      ]} />
    </>
  );
}

/* ================================================================ record-usage */

function RecordUsage() {
  return (
    <>
      <PageHeader eyebrow="BUILD" title="Record usage" lede="Tell APEX what a customer actually did, so credits and limits stay accurate." status={PLANNED} />

      <H2>Steps</H2>
      <Steps items={[
        { title: 'Perform the action in your product', body: 'Generate the report, run the job, serve the API call — the actual work.' },
        { title: 'Report the usage event', body: <>Send a <code>usage_events</code> record with a unique <code>event_id</code> so retries don't double-count.</> },
        { title: 'APEX consumes a matching grant', body: <>A <code>credit_consumptions</code> row is created against the customer's oldest active <code>credit_grants</code> row, reducing its <code>remaining_amount</code>.</> },
      ]} />

      <H2>Example (design preview)</H2>
      <CodeBlock language="ts" code={`await apex.usage.record({
  customer: "cus_jordan",
  feature: "report_generation",
  quantity: 1,
  eventId: "gen_8f21ac", // idempotency key
});`} />

      <DangerNote>
        Always send a unique <code>eventId</code> per action. The schema enforces a unique{' '}
        <code>(workspace_id, event_id)</code> pair specifically so a retried request can't be double-billed
        against a customer's balance.
      </DangerNote>

      <H2>Expected result</H2>
      <p>The customer's remaining balance for that feature drops by the reported quantity, and a matching event is available in <a href="#docs/operate/event-history">event history</a>.</p>

      <SeeAlso items={[{ href: '#docs/build/check-access', title: 'Check access', description: 'Ask before you record — not after.' }]} />
    </>
  );
}

/* ================================================================ check-access */

function CheckAccess() {
  return (
    <>
      <PageHeader eyebrow="BUILD" title="Check access" lede="Ask APEX whether an action is allowed before it happens — this is the one call every gated feature should make." status={PLANNED} />

      <H2>Steps</H2>
      <Steps items={[
        { title: 'Call the access check before the action', body: 'Not after — the whole point is to prevent the action from happening if it isn\'t allowed.' },
        { title: 'Read the decision', body: <>An <code>allow</code> or <code>deny</code>, plus a human-readable <code>reason</code> your product can show directly to the customer.</> },
        { title: 'Act on it', body: 'If allowed, proceed and then record usage. If denied, show the reason and, where relevant, an upgrade or top-up path.' },
      ]} />

      <H2>Example (design preview)</H2>
      <CodeBlock language="ts" code={`const decision = await apex.access.check({
  customer: "cus_jordan",
  feature: "report_generation",
});

if (!decision.allow) {
  return showUpgradePrompt(decision.reason);
}
// proceed, then record usage`} />

      <Callout kind="tip" title="This is real logic, just not this API">
        Forma's <code>canGenerate(account)</code> is this exact check, implemented directly against local
        demo state. Its shape — <code>{'{ allow, reason }'}</code> — is what this design-preview API is
        modeled on.
      </Callout>

      <H2>Expected result</H2>
      <p>A fast, synchronous-feeling answer your UI can act on immediately — never a silent failure.</p>

      <SeeAlso items={[
        { href: '#docs/reference/requests-and-responses', title: 'Requests & responses', description: 'The exact response shape.' },
        { href: '#docs/build/record-usage', title: 'Record usage', description: 'What happens right after an allow.' },
      ]} />
    </>
  );
}

/* ================================================================ handle-webhooks */

function HandleWebhooks() {
  return (
    <>
      <PageHeader eyebrow="BUILD" title="Handle webhooks" lede="React to payment and subscription events from your payment provider as they happen." status={PLANNED} />

      <H2>Steps</H2>
      <Steps items={[
        { title: 'Register an endpoint', body: 'A URL your payment provider can POST events to.' },
        { title: 'Verify the signature', body: 'Every incoming event must be verified before it\'s trusted — never process an unverified webhook body.' },
        { title: 'Check for duplicates', body: <>Look up the event's ID in <code>stripe_webhook_events</code> before processing — webhooks can and do arrive more than once.</> },
        { title: 'Apply the change', body: 'Update the subscription status, grant credits, or record the failure, depending on the event type.' },
        { title: 'Record that you handled it', body: <>Mark the <code>stripe_webhook_events</code> row <code>processed</code> so a duplicate delivery is a safe no-op.</> },
      ]} />

      <H2>Expected result</H2>
      <p>APEX's view of a customer's subscription stays correct within moments of anything changing in the payment provider — without your product polling for changes.</p>

      <DangerNote>
        Never trust an unverified webhook body as-is. Signature verification is what stops someone from
        POSTing a fake "payment succeeded" event to grant themselves access.
      </DangerNote>

      <SeeAlso items={[{ href: '#docs/reference/events-and-webhooks', title: 'Events & webhooks', description: 'Every event type and payload shape.' }]} />
    </>
  );
}

/* ============================================================ upgrades-downgrades */

function UpgradesDowngrades() {
  return (
    <>
      <PageHeader eyebrow="BUILD" title="Upgrades and downgrades" lede="Change a customer's plan without breaking access they already have, or silently granting access they haven't paid for." status={PLANNED} />

      <H2>Steps</H2>
      <Steps items={[
        { title: 'Change the subscription\'s plan', body: <>Update <code>subscriptions.plan_id</code> — this alone doesn't move any credits or usage counters.</> },
        { title: 'Decide how existing usage carries over', body: 'A common default: keep usage already recorded this period, but apply the new plan\'s limit going forward.' },
        { title: 'Grant or adjust credits if the new plan changes them', body: 'An upgrade typically grants the difference immediately rather than waiting for the next period.' },
        { title: 'Re-check access', body: 'The next access check reflects the new plan automatically — nothing else in your product needs to change.' },
      ]} />

      <Callout kind="tip" title="This is real logic, just not this API">
        Forma's <code>upgradeForma()</code> preserves <code>generationsUsed</code> across the upgrade and
        raises the allowance from 3 to 50 — the same "keep usage, raise the ceiling" pattern described
        above, running today against local demo state.
      </Callout>

      <H2>Edge cases</H2>
      <p>A downgrade can leave a customer already over the new, lower limit. APEX doesn't retroactively revoke anything they've already used — it just means their next access check for that feature returns deny until the next period.</p>

      <SeeAlso items={[{ href: '#docs/learn/entitlements', title: 'Learn: Entitlements', description: 'What actually changes on a plan switch.' }]} />
    </>
  );
}

/* ================================================================ testing */

function Testing() {
  return (
    <>
      <PageHeader eyebrow="BUILD" title="Testing" lede="Verify billing and access logic before it ever touches a real customer." status={PLANNED} />

      <H2>Steps</H2>
      <Steps items={[
        { title: 'Use a sandbox environment', body: <>Each workspace has separate <code>environments</code> rows (e.g. sandbox and live) with their own API keys, so test traffic never touches live customer data.</> },
        { title: 'Use your payment provider\'s test mode', body: 'Stripe\'s test cards let you simulate successful charges, declines, and disputes without moving real money.' },
        { title: 'Walk every state, not just the happy path', body: 'Subscribe, use up the allowance, fail a payment, recover it, upgrade, downgrade, cancel — each one is a real, distinct state your product needs to handle correctly.' },
        { title: 'Check the audit trail', body: 'Every state change should leave a readable record — if you can\'t explain why access changed, the test isn\'t done.' },
      ]} />

      <Callout kind="tip" title="Practice this today">
        The Forma demo's "Reset demo" button and its billing-simulation buttons (fail renewal, recover
        payment, start next period) exist specifically so you can walk this exact set of states by hand —
        it's the closest thing to a sandbox APEX has right now.
      </Callout>

      <SeeAlso items={[{ href: '#docs/build/going-live', title: 'Going live', description: 'What changes once testing is done.' }]} />
    </>
  );
}

/* ================================================================ going-live */

function GoingLive() {
  return (
    <>
      <PageHeader eyebrow="BUILD" title="Going live" lede="What actually changes between a test setup and production." status={PLANNED} />

      <H2>Steps</H2>
      <Steps items={[
        { title: 'Switch environments', body: <>Move from your sandbox <code>environments</code> row to a live one, with its own API keys.</> },
        { title: 'Switch your payment provider out of test mode', body: 'Confirm live webhook endpoints are registered and verified separately from test ones.' },
        { title: 'Re-check your plans and entitlements', body: 'Confirm prices, limits, and Stripe price IDs in the live environment match what you tested in sandbox — nothing carries over automatically.' },
        { title: 'Watch the first real customers closely', body: <>Use <a href="#docs/operate/event-history">event history</a> and <a href="#docs/operate/debugging">debugging</a> to confirm the first few real subscriptions behave exactly as tested.</> },
      ]} />

      <Callout kind="warning" title="Sandbox and live data never mix">
        Environments exist specifically to keep test data from ever touching real customer records —
        there's no step that migrates sandbox data into a live environment, by design.
      </Callout>

      <SeeAlso items={[{ href: '#docs/operate/debugging', title: 'Debugging', description: 'What to check once real customers are in the system.' }]} />
    </>
  );
}

export const BUILD_PAGES: Record<string, React.ComponentType> = {
  quickstart: Quickstart,
  'connect-payment-provider': ConnectPaymentProvider,
  'create-plans': CreatePlans,
  'define-entitlements': DefineEntitlements,
  'configure-credits': ConfigureCredits,
  'record-usage': RecordUsage,
  'check-access': CheckAccess,
  'handle-webhooks': HandleWebhooks,
  'upgrades-downgrades': UpgradesDowngrades,
  testing: Testing,
  'going-live': GoingLive,
};
