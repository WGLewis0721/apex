import { Callout, CodeBlock, DangerNote, DataTable, H2, PageHeader, SeeAlso, Steps } from '../primitives';

const PLANNED = { kind: 'planned' as const, label: 'Design preview — this capability is not production-accepted yet' };
const PENDING_ACCEPTANCE = { kind: 'planned' as const, label: 'Implemented — acceptance pending' };

/* ================================================================ quickstart */

function Quickstart() {
  return (
    <>
      <PageHeader eyebrow="BUILD" title="Quickstart" lede="The shortest honest path through what APEX has actually built, what is deployed, and what still needs acceptance." />

      <Callout kind="note" title="What is real today">
        <p>
          Supabase account creation, APEX test Checkout, paid workspace provisioning, API credentials,
          the hosted credit ledger, balance/entitlements reads, and atomic consume are real. Stripe Connect
          is implemented but still needs one External-test OAuth acceptance run. Connected Stripe
          payment/refund events are not yet wired into the ledger.
        </p>
      </Callout>

      <H2>1. Create an account</H2>
      <p>Open <a href="#start">Start with APEX</a> and sign up. This uses real Supabase Auth.</p>

      <H2>2. Pay APEX and get a workspace</H2>
      <p>
        APEX's own Stripe test Checkout and verified webhook provision the paid workspace, owner membership,
        Sandbox environment, and APEX credentials. This is APEX billing — separate from the Stripe account
        your end customers use to pay your SaaS.
      </p>

      <H2>3. Connect your Stripe account</H2>
      <p>
        See <a href="#docs/build/connect-payment-provider">Connect Stripe</a>. The OAuth implementation is
        merged; External-test registration and one real onboarding authorization still have to pass before
        the customer funnel advances.
      </p>

      <H2>4. Understand the hosted v1 wallet</H2>
      <p>
        APEX now has a real hosted balance/ledger and an atomic <code>consume</code> operation. A fresh
        1,000-credit hosted wallet survived two parallel 750-credit spends: one succeeded, one returned
        <code>INSUFFICIENT_CREDITS</code>, and the remaining balance was 250.
      </p>

      <H2>5. What is still missing</H2>
      <p>
        The next core step is connected Stripe ingress: verified payment event → source-attributed grant,
        and verified refund event → source-aware clawback. Until that is wired and proven, APEX has a real
        wallet with a controlled grant faucet — not the complete payment-to-product-value lifecycle.
      </p>

      <SeeAlso items={[
        { href: '#docs/build/connect-payment-provider', title: 'Connect Stripe', description: 'Finish the remaining OAuth acceptance gate.' },
        { href: '#docs/build/record-usage', title: 'Consume credits', description: 'How the deployed authoritative spend path works.' },
        { href: '#docs/build/handle-webhooks', title: 'Handle Stripe events', description: 'The next payment/refund ingress milestone.' },
      ]} />
    </>
  );
}

/* ==================================================== connect-payment-provider */

function ConnectPaymentProvider() {
  return (
    <>
      <PageHeader eyebrow="BUILD" title="Connect Stripe" lede="Authorize the SaaS company's own Stripe account so APEX can later map verified customer payments into product state." status={PENDING_ACCEPTANCE} />

      <H2>Current state</H2>
      <p>
        The Stripe Apps OAuth implementation is merged: manifest, connect/status Edge Function, one-time OAuth
        state, callback, workspace-scoped <code>stripe_connections</code>, and encrypted refresh-token storage.
        The remaining gate is Stripe Apps External-test registration plus one real onboarding authorization.
      </p>

      <H2>Acceptance steps</H2>
      <Steps items={[
        { title: 'Upload the Stripe App', body: <><code>stripe apps upload</code> from <code>stripe-app/</code> using the APEX developer sandbox account.</> },
        { title: 'Register External test', body: 'Open the uploaded APEX app in Stripe and start External test.' },
        { title: 'Configure the OAuth client ID', body: <><code>STRIPE_APP_CLIENT_ID</code> must be set in Supabase Edge Function secrets.</> },
        { title: 'Authorize from live APEX onboarding', body: 'Complete the real Stripe-hosted OAuth flow from a paid workspace.' },
        { title: 'Verify persisted state', body: <><code>stripe_connections.status</code> must be <code>connected</code> with the expected Stripe account ID.</> },
      ]} />

      <H2>Expected result</H2>
      <p>
        A paid APEX workspace has a trusted connected Stripe account and a server-side encrypted OAuth refresh
        token. That connection becomes the event source for the next grant/refund ingress work.
      </p>

      <H2>Troubleshooting</H2>
      <DataTable
        head={['Symptom', 'Likely cause']}
        rows={[
          ['Connect cannot start', 'External-test app registration or STRIPE_APP_CLIENT_ID is incomplete.'],
          ['Callback returns but workspace is not connected', 'OAuth state/account persistence failed; inspect the server path, not the browser redirect alone.'],
          ['Stripe is connected but credits do not appear', 'Expected today: connected payment → grant ingress is the next Phase 6 step and is not wired yet.'],
        ]}
      />

      <SeeAlso items={[
        { href: '#docs/build/handle-webhooks', title: 'Handle Stripe events', description: 'What the connected account feeds next.' },
        { href: '#docs/reference/data-model', title: 'Data model', description: 'stripe_connections and the production wallet tables.' },
      ]} />
    </>
  );
}

/* ================================================================ create-plans */

function CreatePlans() {
  return (
    <>
      <PageHeader eyebrow="BUILD" title="Create plans" lede="A plan describes what a customer buys and the product rights APEX can later expose through entitlements." status={PLANNED} />

      <H2>Current boundary</H2>
      <p>
        The <code>plans</code>, <code>features</code>, and <code>plan_features</code> schema is real. The current
        v1 work is focused on the payment→credit ledger path; a polished public plan-management API is later.
      </p>

      <H2>Steps</H2>
      <Steps items={[
        { title: 'Choose a key and a name', body: <>e.g. <code>key: "pro"</code>, <code>name: "Pro"</code>.</> },
        { title: 'Set product pricing metadata', body: <>Use the existing plan fields; authoritative Stripe fulfillment mappings must remain server-side.</> },
        { title: 'Link Stripe references deliberately', body: <>A configured Stripe product/price can later map a verified commercial event to product value.</> },
        { title: 'Attach entitlements', body: <>Continue to <a href="#docs/build/define-entitlements">Define entitlements</a>.</> },
      ]} />

      <H2>Example (future SDK shape)</H2>
      <CodeBlock language="ts" code={`await apex.plans.create({
  key: "pro",
  name: "Pro",
  monthlyPriceCents: 2900,
  stripePriceId: "price_1P...",
});`} caption="Illustrative — this plan-management SDK surface is not published." />

      <Callout kind="warning" title="Do not trust client-supplied grant quantities">
        A future purchase-pack flow must map an authoritative Stripe product/price to a configured product
        grant on the server. The browser cannot decide that a $1 payment grants 1,000 credits.
      </Callout>

      <SeeAlso items={[{ href: '#docs/build/define-entitlements', title: 'Define entitlements', description: 'What the plan exposes as product state.' }]} />
    </>
  );
}

/* ============================================================ define-entitlements */

function DefineEntitlements() {
  return (
    <>
      <PageHeader eyebrow="BUILD" title="Define entitlements" lede="Attach product rights to a plan. The hosted read exists; broader/local evaluation is intentionally later." status={PLANNED} />

      <H2>What exists now</H2>
      <p>
        <code>GET /v1/customers/:id/entitlements</code> is deployed and returns current customer/plan/features
        where present plus <code>remaining</code>, <code>version</code>, and <code>as_of</code>.
      </p>

      <Callout kind="warning" title="Entitlements is not a wallet">
        The document is read-only. It may inform UI or feature/preflight behavior, but it does not authorize
        scarce-credit spend. The v1 spend authority is <code>POST /consume</code>.
      </Callout>

      <H2>Plan/feature modeling</H2>
      <Steps items={[
        { title: 'Define the feature once', body: <>Create a <code>features</code> row such as <code>report_generation</code>.</> },
        { title: 'Attach it to a plan', body: <>Use <code>plan_features</code> with an optional <code>limit_value</code>.</> },
        { title: 'Use null for a plain unlock', body: 'No numeric ceiling is required for a simple included/not-included right.' },
        { title: 'Keep spend separate', body: 'A feature being included does not mean cached entitlement state may debit credits.' },
      ]} />

      <H2>v1.1 direction</H2>
      <p>
        If customer latency needs justify it, the same entitlements document can later be signed and evaluated
        locally by the server SDK with explicit TTL/invalidation/failure policy. Scarce-value spend still stays authoritative.
      </p>

      <SeeAlso items={[{ href: '#docs/build/check-access', title: 'Product access', description: 'How v1 separates read-only rights from authoritative spend.' }]} />
    </>
  );
}

/* ============================================================ configure-credits */

function ConfigureCredits() {
  return (
    <>
      <PageHeader eyebrow="BUILD" title="Configure credits" lede="Model durable product grants that can be consumed safely and refunded back to their original source." />

      <H2>What the deployed wallet stores</H2>
      <Steps items={[
        { title: 'Create a source-attributed grant', body: <>A grant records original <code>amount</code>, <code>consumed_amount</code>, <code>remaining_amount</code>, status, and optional Stripe source references.</> },
        { title: 'Maintain the hot balance projection', body: <><code>credit_accounts.remaining</code> is the non-negative concurrency boundary, not the audit history.</> },
        { title: 'Append ledger history', body: <><code>credit_ledger</code> records grant, consume, refund, and unrecoverable entries.</> },
        { title: 'Replay operation outcomes', body: <><code>credit_operations</code> remembers idempotent ALLOW/DENY outcomes.</> },
      ]} />

      <H2>Grant example</H2>
      <CodeBlock language="ts" code={`// Internal/server-side concept; public grant API is not exposed.
grant_credits({
  customer: "cus_jordan",
  amount: 1000,
  stripeEventId: "evt_purchase_A",
  sourcePaymentId: "pi_purchase_A",
  idempotencyKey: "grant:evt_purchase_A",
});`} />

      <H2>Expiry is not production-supported yet</H2>
      <p>
        <code>credit_grants.expires_at</code> already exists and consume skips expired grants, but the projected
        account balance is not yet reconciled when a grant expires. Frozen v1 grants should therefore be
        non-expiring until expiry reconciliation is implemented and tested.
      </p>

      <SeeAlso items={[
        { href: '#docs/learn/credits-and-usage', title: 'Learn: Credits and usage', description: 'The product model behind the wallet.' },
        { href: '#docs/build/record-usage', title: 'Consume credits', description: 'The deployed authoritative spend path.' },
      ]} />
    </>
  );
}

/* ================================================================ record-usage */

function RecordUsage() {
  return (
    <>
      <PageHeader eyebrow="BUILD" title="Consume credits" lede="Spend scarce product value through the one v1 operation that is authoritative under concurrency." />

      <H2>Frozen v1 API</H2>
      <CodeBlock language="ts" code={`POST /v1/customers/:customerId/consume
{
  "amount": 250,
  "idempotency_key": "job_8f21ac"
}`} />

      <H2>What happens atomically</H2>
      <Steps items={[
        { title: 'Claim the idempotency key', body: 'The same workspace/key must replay the original outcome instead of spending again.' },
        { title: 'Try the balance decrement', body: <>Postgres updates <code>credit_accounts.remaining</code> only when enough credits exist.</> },
        { title: 'Burn source grants FIFO', body: <>A successful spend reduces the oldest open grant rows by <code>created_at</code>, then <code>id</code>.</> },
        { title: 'Append ledger entries', body: 'The per-grant consume history and projection change commit in the same transaction.' },
        { title: 'Return ALLOW or DENY', body: <>Success returns the new balance. Insufficient credits returns <code>INSUFFICIENT_CREDITS</code> without changing the wallet.</> },
      ]} />

      <DangerNote>
        Do not read the balance first and then perform work assuming it is still available. Two servers can read
        the same balance. The atomic <code>consume</code> call is the scarce-value authorization boundary.
      </DangerNote>

      <H2>Hosted proof</H2>
      <p>
        A fresh balance of 1,000 received two concurrent 750-credit consumes. One succeeded, one returned
        DENY, and the final balance was 250. Replaying both idempotency keys returned the same outcomes with
        no second spend.
      </p>

      <SeeAlso items={[{ href: '#docs/build/check-access', title: 'Product access', description: 'Why entitlements reads do not authorize credit spend.' }]} />
    </>
  );
}

/* ================================================================ check-access */

function CheckAccess() {
  return (
    <>
      <PageHeader eyebrow="BUILD" title="Product access" lede="v1 separates read-only product state from authoritative scarce-value spend instead of exposing a public /check call." />

      <H2>Read product state</H2>
      <CodeBlock language="ts" code={`GET /v1/customers/:customerId/entitlements

// returns plan/features when present plus:
{
  "remaining": 750,
  "version": 2,
  "as_of": "..."
}`} />

      <p>
        Use this document to render UI or understand current state. It is intentionally shaped so a future
        signed snapshot can use the same contract.
      </p>

      <H2>Authorize a scarce-credit action</H2>
      <CodeBlock language="ts" code={`const result = await apex.credits.consume({
  customerId: "cus_jordan",
  amount: 1,
  idempotencyKey: "generation_8f21ac",
});

if (!result.allowed) {
  return showTopUpPrompt(result.reason);
}

// scarce value was atomically consumed; perform the credit-gated work`} caption="Illustrative first-SDK shape; the hosted consume API exists, the public SDK does not yet." />

      <Callout kind="warning" title="No public /check in frozen v1">
        A separate check endpoint teaches clients to treat a read-time ALLOW as a spend right. Frozen v1 uses
        entitlements for read/preflight state and <code>consume</code> for authoritative scarce-value decisions.
      </Callout>

      <H2>Later feature gates</H2>
      <p>
        v1.1 may sign the same entitlements document and let the server SDK evaluate eligible feature gates
        locally. That optimization must not let cached state authorize credit spend.
      </p>

      <SeeAlso items={[
        { href: '#docs/reference/requests-and-responses', title: 'Requests & responses', description: 'Current and future response contracts.' },
        { href: '#docs/build/record-usage', title: 'Consume credits', description: 'The authoritative spend operation.' },
      ]} />
    </>
  );
}

/* ================================================================ handle-webhooks */

function HandleWebhooks() {
  return (
    <>
      <Callout kind="tip" title="Verified test-pilot path">
        APEX has now processed one real signed Stripe sandbox Checkout event into exactly one 1,000-credit
        grant through its workspace-scoped manual webhook pilot. Payment replay, consume, refund, and refund
        replay have also passed. The self-serve Stripe Apps OAuth path remains a later gate; see <code>docs/implementation/STRIPE_WEBHOOK_DEMO.md</code>.
      </Callout>
      <PageHeader eyebrow="BUILD" title="Handle Stripe events" lede="The next core milestone is turning verified connected-account payment/refund events into replay-safe ledger changes." status={PLANNED} />

      <H2>What already exists</H2>
      <p>
        APEX's own billing webhook is real, and <code>stripe_webhook_events</code> exists. The v1 wallet RPCs
        <code>grant_credits</code> and <code>refund_unspent_credits</code> are deployed. The missing link is the
        connected-customer event processor between them.
      </p>

      <H2>Frozen processing sequence</H2>
      <Steps items={[
        { title: 'Verify the Stripe signature', body: 'Verification happens outside Postgres before the event is trusted.' },
        { title: 'Persist the event uniquely', body: <>Connected event identity is scoped by <code>(stripe_connection_id, stripe_event_id)</code>.</> },
        { title: 'Map authoritative Stripe configuration', body: 'The server decides what product value the Stripe product/price represents — never the browser.' },
        { title: 'Apply the transactional ledger mutation', body: <>Successful purchase → <code>grant_credits</code>; refund → <code>refund_unspent_credits</code> for the original source.</> },
        { title: 'Keep failures replayable', body: 'Pending/failed rows can be retried; idempotency makes repeated processing safe.' },
      ]} />

      <DangerNote>
        A browser redirect or unverified webhook body is never proof that money moved. Stripe event verification
        and persisted idempotent processing are the trust boundary.
      </DangerNote>

      <H2>Do not add a queue product first</H2>
      <p>
        Frozen v1 starts with persisted event rows plus existing Supabase/Postgres replay scheduling. Add a new
        queue/worker system only after this simpler mechanism proves insufficient under real workload evidence.
      </p>

      <SeeAlso items={[{ href: '#docs/reference/events-and-webhooks', title: 'Events & webhooks', description: 'Money-event versus product-state responsibilities.' }]} />
    </>
  );
}

/* ============================================================ upgrades-downgrades */

function UpgradesDowngrades() {
  return (
    <>
      <PageHeader eyebrow="BUILD" title="Upgrades and downgrades" lede="Plan changes are a later entitlement lifecycle capability; they must never corrupt already-audited credit usage." status={PLANNED} />

      <H2>Invariant</H2>
      <p>
        A plan change can alter future product rights, but it must not rewrite past grants/consumes to make
        history look clean. Durable credit history remains durable.
      </p>

      <Callout kind="tip" title="Forma remains a product model">
        Forma demonstrates upgrade/downgrade behavior in local demo state. That behavior is useful design input,
        but it is not part of frozen v1 until a hosted entitlement lifecycle is deliberately implemented.
      </Callout>

      <SeeAlso items={[{ href: '#docs/learn/entitlements', title: 'Learn: Entitlements', description: 'The product-right concept behind later plan changes.' }]} />
    </>
  );
}

/* ================================================================ testing */

function Testing() {
  return (
    <>
      <PageHeader eyebrow="BUILD" title="Testing" lede="Separate isolated wallet proof from the connected payment-to-product-value acceptance proof." />

      <H2>Wallet proof — already passed</H2>
      <p>
        Hosted Postgres/Edge execution proved a 1,000-credit wallet cannot double-spend under parallel 750-credit consumes and that replay returns the original outcomes.
      </p>

      <H2>Connected Stripe proof — still required</H2>
      <Steps items={[
        { title: 'Finish External-test Stripe OAuth', body: 'The SaaS company’s test Stripe account must be connected through the real Phase 5 path.' },
        { title: 'Buy a configured 1,000-credit pack', body: 'Use the connected Stripe test account.' },
        { title: 'Verify one event → one grant', body: 'Persist the verified event and grant exactly once.' },
        { title: 'Spend to zero', body: 'Consume 250, then 750; the next consume must return insufficient credits.' },
        { title: 'Replay payment', body: 'No duplicate grant.' },
        { title: 'Refund the source purchase', body: 'Claw back only unspent source credits, record already-spent value as unrecoverable, never go negative.' },
        { title: 'Replay refund', body: 'No duplicate adjustment.' },
      ]} />

      <Callout kind="warning" title="SQL contract tests are not the whole acceptance test">
        Unit/SQL tests protect invariants, but the product is not accepted until the connected Stripe event path
        drives the hosted database and produces the expected ledger state.
      </Callout>

      <SeeAlso items={[{ href: '#docs/build/going-live', title: 'Going live', description: 'What must be true before a real customer advances.' }]} />
    </>
  );
}

/* ================================================================ going-live */

function GoingLive() {
  return (
    <>
      <PageHeader eyebrow="BUILD" title="Going live" lede="APEX goes live by evidence: connection accepted, connected events mapped correctly, spend safe, retries harmless, refunds explainable." status={PLANNED} />

      <H2>Required gates</H2>
      <Steps items={[
        { title: 'Accept Stripe Connect', body: 'Complete External-test OAuth and verify the connected account is persisted.' },
        { title: 'Accept connected payment ingress', body: 'Verified configured purchase creates exactly one source-attributed grant.' },
        { title: 'Accept spend behavior', body: 'Hosted consume remains concurrency-safe and replay-safe.' },
        { title: 'Accept refund ingress', body: 'Source-aware refund behavior matches the frozen non-negative policy and replays safely.' },
        { title: 'Publish the server SDK only after its underlying API contract is stable', body: 'The SDK is a client, not a second product-state system.' },
      ]} />

      <Callout kind="warning" title="Do not confuse deployment with acceptance">
        A migration, Edge Function, docs page, or UI can be deployed while the full connected lifecycle is still incomplete.
      </Callout>

      <SeeAlso items={[{ href: '#docs/operate/debugging', title: 'Debugging', description: 'How the eventual operator path should explain ledger state.' }]} />
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
