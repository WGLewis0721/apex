import { Callout, CodeBlock, DataTable, H2, H3, PageHeader, SeeAlso } from '../primitives';

const PLANNED = { kind: 'planned' as const, label: 'Planned — not production-accepted yet' };

/* ============================================================ api-overview */

function ApiOverview() {
  return (
    <>
      <PageHeader eyebrow="REFERENCE" title="API overview & authentication" lede="The hosted APEX v1 API is real; connected Stripe fulfillment around it is still being completed." />

      <H2>Authentication</H2>
      <p>
        The public server API expects an APEX secret credential in the form <code>apex_sk_*</code>. The Edge
        Function hashes the presented credential, resolves the active workspace/environment from
        <code>api_keys</code>, and rejects missing, revoked, or mismatched credentials.
      </p>
      <CodeBlock language="http" code={`Authorization: Bearer apex_sk_...`} caption="Server-side only. Do not expose APEX secret credentials in browser code." />

      <H2>Frozen v1 routes</H2>
      <DataTable
        head={['Method', 'Route', 'Purpose']}
        rows={[
          ['GET', <code>/v1/customers/:id/balance</code>, 'Read authoritative hosted remaining/version/as_of.'],
          ['GET', <code>/v1/customers/:id/entitlements</code>, 'Read customer/plan/features plus remaining/version/as_of.'],
          ['POST', <code>/v1/customers/:id/consume</code>, 'Atomically spend scarce credits with an idempotency key.'],
        ]}
      />

      <Callout kind="warning" title="No public /check in frozen v1">
        Entitlements is a read-only state document. Scarce-credit authorization happens through the atomic
        <code>consume</code> operation so concurrent callers cannot spend the same final credits twice.
      </Callout>

      <H2>Privilege boundary</H2>
      <p>
        Ledger mutation RPCs such as <code>grant_credits</code>, <code>consume_credits</code>, and
        <code>refund_unspent_credits</code> are server-role only. Browser <code>anon</code> and ordinary
        authenticated roles cannot call them directly.
      </p>

      <H2>What is not a public API yet</H2>
      <p>
        Grant/refund are currently internal server RPCs because their authoritative source will be verified
        connected Stripe events and server configuration. A public SDK is not published yet.
      </p>

      <SeeAlso items={[
        { href: '#docs/reference/requests-and-responses', title: 'Requests, responses & errors', description: 'Current v1 shapes and semantics.' },
        { href: '#docs/reference/data-model', title: 'Data model', description: 'The hosted ledger structures behind these routes.' },
      ]} />
    </>
  );
}

/* ================================================== requests-and-responses */

function RequestsAndResponses() {
  return (
    <>
      <PageHeader eyebrow="REFERENCE" title="Requests, responses & errors" lede="Current v1 object shapes with read-only state kept separate from authoritative spend." />

      <H2>Balance response</H2>
      <CodeBlock language="json" code={`{
  "remaining": 250,
  "version": 2,
  "as_of": "2026-09-09T22:44:33.203Z"
}`} />

      <H2>Entitlements response</H2>
      <CodeBlock language="json" code={`{
  "customer_id": "...",
  "customer_status": "active",
  "subscription_status": "active",
  "plan": { "key": "pro", "name": "Pro" },
  "features": [],
  "remaining": 250,
  "version": 2,
  "as_of": "2026-09-09T22:44:33.203Z"
}`} caption="Read-only product state. This document does not authorize credit spend." />

      <H2>Consume request</H2>
      <CodeBlock language="json" code={`{
  "amount": 750,
  "idempotency_key": "generation_8f21ac"
}`} />

      <H2>Consume success</H2>
      <CodeBlock language="json" code={`{
  "allowed": true,
  "consumed": 750,
  "remaining": 250,
  "version": 2,
  "replayed": false
}`} />

      <H2>Consume DENY</H2>
      <CodeBlock language="json" code={`{
  "allowed": false,
  "reason": "INSUFFICIENT_CREDITS",
  "remaining": 250,
  "version": 2,
  "replayed": false
}`} />

      <H2>Idempotent replay</H2>
      <p>
        Reusing the same workspace-scoped idempotency key with the same operation returns the original
        outcome with <code>replayed: true</code>. A DENY replays as DENY rather than trying again against a
        later balance.
      </p>

      <H2>Request errors</H2>
      <DataTable
        head={['Condition', 'Behavior']}
        rows={[
          ['Missing/invalid APEX secret', '401 Unauthorized.'],
          ['Invalid amount or missing idempotency key', '400 request error.'],
          ['Customer outside the credential workspace', 'Request fails without cross-tenant access.'],
          ['Same idempotency key reused for a different payload/operation', 'Rejected as idempotency key reuse.'],
          ['Insufficient credits', 'Normal 200-style operation result with allowed=false and reason=INSUFFICIENT_CREDITS.'],
        ]}
      />

      <SeeAlso items={[
        { href: '#docs/build/record-usage', title: 'Consume credits', description: 'Why consume is the scarce-value boundary.' },
        { href: '#docs/build/check-access', title: 'Product access', description: 'Why entitlements is not a spend authorization.' },
      ]} />
    </>
  );
}

/* ==================================================== events-and-webhooks */

function EventsAndWebhooks() {
  return (
    <>
      <PageHeader eyebrow="REFERENCE" title="Events & webhooks" lede="Separate APEX's own billing events from the connected Stripe events that will grant/refund product value." />

      <H2>APEX's own billing</H2>
      <p>
        This path is real in Stripe test mode. It verifies APEX Checkout/subscription events and provisions
        the SaaS company's APEX workspace/environment/credentials.
      </p>

      <H2>Connected customer Stripe</H2>
      <Callout kind="planned" title="Next core ingress milestone">
        Phase 5 OAuth connection is implemented but still awaits External-test acceptance. After that, verified
        connected payment/refund events must be persisted and mapped to the deployed grant/refund RPCs.
      </Callout>

      <H2>Frozen connected-event identity</H2>
      <p>
        Connected events are unique by <code>(stripe_connection_id, stripe_event_id)</code>. Platform APEX
        billing events remain in the null-connection partition.
      </p>

      <H2>Processing target</H2>
      <DataTable
        head={['Event outcome', 'APEX product-state action']}
        rows={[
          ['Verified configured payment succeeds', <><code>grant_credits</code> exactly once for the server-defined product value.</>],
          ['Same payment event is replayed', 'No second grant.'],
          ['Verified refund for purchase A', <><code>refund_unspent_credits</code> only against A’s source grant(s).</>],
          ['Same refund event is replayed', 'No second clawback/unrecoverable entry.'],
          ['Processing fails', 'Persisted event remains pending/failed and replayable.'],
        ]}
      />

      <H2>Queue boundary</H2>
      <p>
        Frozen v1 starts with persisted event rows plus existing Supabase/Postgres replay scheduling. A new
        queue or worker product is not justified until this mechanism proves insufficient under real workload.
      </p>

      <SeeAlso items={[{ href: '#docs/build/handle-webhooks', title: 'Build: Handle Stripe events', description: 'The exact next implementation sequence.' }]} />
    </>
  );
}

/* ============================================================= data-model */

interface Row { table: string; purpose: string; keyFields: string; status: string; }

const CORE_ROWS: Row[] = [
  { table: 'workspaces / workspace_members', purpose: 'APEX tenant and membership boundary.', keyFields: 'workspace_id, user_id, role', status: 'Real' },
  { table: 'environments / api_keys', purpose: 'Environment-scoped server credentials.', keyFields: 'environment_id, secret_key_hash, status', status: 'Real' },
  { table: 'stripe_connections', purpose: 'Workspace connection to the SaaS company’s Stripe account.', keyFields: 'workspace_id, connected account, status', status: 'Implemented; OAuth acceptance pending' },
  { table: 'customers / subscriptions', purpose: 'The SaaS company’s end-customer and plan state.', keyFields: 'workspace_id, external_id, plan_id, status', status: 'Real schema' },
  { table: 'plans / features / plan_features', purpose: 'Product catalog and plan rights.', keyFields: 'workspace_id, key, limit_value', status: 'Real schema; management/evaluation broader than v1' },
  { table: 'credit_accounts', purpose: 'Hot non-negative spendable projection and concurrency boundary.', keyFields: 'workspace_id, customer_id, remaining, version', status: 'Deployed' },
  { table: 'credit_grants', purpose: 'Source-attributed product value with consumed/remaining state.', keyFields: 'amount, consumed_amount, remaining_amount, source event/payment, status', status: 'Deployed' },
  { table: 'credit_ledger', purpose: 'Append-only grant/consume/refund/unrecoverable audit history.', keyFields: 'entry_type, amount, credit_grant_id, idempotency_key', status: 'Deployed' },
  { table: 'credit_operations', purpose: 'Idempotent request outcomes, including DENY replay.', keyFields: 'operation_type, idempotency_key, status, result', status: 'Deployed' },
  { table: 'stripe_webhook_events', purpose: 'Persisted Stripe event/replay state.', keyFields: 'stripe_connection_id, stripe_event_id, status, attempts', status: 'Real; connected fulfillment wiring pending' },
  { table: 'usage_events / usage_counters', purpose: 'Broader metering foundation beyond direct credit consume.', keyFields: 'event_id, quantity, period', status: 'Schema foundation; broader v1.1+ work' },
  { table: 'access_decisions', purpose: 'Future richer durable access-decision history.', keyFields: 'decision, reason, context', status: 'Schema foundation; no public /check v1' },
  { table: 'audit_logs', purpose: 'General operator/audit events.', keyFields: 'action, target, metadata', status: 'Real foundation' },
];

function DataModel() {
  return (
    <>
      <PageHeader eyebrow="REFERENCE" title="Data model" lede="The current hosted tenancy and ledger model, with schema existence kept separate from production capability acceptance." />

      <Callout kind="note" title="The wallet tables are deployed">
        <code>credit_accounts</code>, per-grant credit fields, <code>credit_ledger</code>, and
        <code>credit_operations</code> are live in hosted Supabase. The connected Stripe ingress that feeds
        them automatically is still the next production step.
      </Callout>

      <DataTable
        head={['Table / group', 'Purpose', 'Important fields', 'Product status']}
        rows={CORE_ROWS.map((r) => [<code>{r.table}</code>, r.purpose, r.keyFields, r.status])}
      />

      <H2>Credit invariants</H2>
      <DataTable
        head={['Invariant', 'Implementation']}
        rows={[
          ['Balance never negative', <><code>credit_accounts.remaining &gt;= 0</code> plus conditional atomic update.</>],
          ['Purchase attribution survives spend/refund', 'Consumes mutate exact grant rows FIFO; refunds load only the original source grant(s).'],
          ['Ledger is audit history', 'Grant/consume/refund/unrecoverable entries are append-only.'],
          ['DENY is replayable', <><code>credit_operations</code> stores final denied outcomes even though no spend ledger row exists.</>],
          ['Cross-workspace access is blocked', 'Workspace-scoped API authentication, RLS, and server-only privileged RPCs.'],
        ]}
      />

      <H2>Expiry limitation</H2>
      <p>
        <code>credit_grants.expires_at</code> exists and consume skips expired grants, but expiry is not
        production-supported because expired remainder is not yet reconciled out of the account projection.
        Frozen v1 grants should be non-expiring.
      </p>

      <SeeAlso items={[
        { href: '#docs/learn/credits-and-usage', title: 'Credits and usage', description: 'Why projection + grants + ledger are separate.' },
        { href: '#docs/reference/terminology', title: 'Terminology', description: 'Precise v1 operation terms.' },
      ]} />
    </>
  );
}

/* ================================================================= limits */

function Limits() {
  return (
    <>
      <PageHeader eyebrow="REFERENCE" title="Limits" lede="Do not invent scale numbers or infrastructure thresholds before workload evidence exists." />

      <H2>Published rate limits</H2>
      <Callout kind="planned" title="Not yet defined">
        The hosted core exists, but APEX has not established a customer-facing rate-limit contract. Do not
        invent one from Supabase plan limits or internal test behavior.
      </Callout>

      <H2>Current architectural thresholds</H2>
      <DataTable
        head={['Add this', 'Only when']}
        rows={[
          ['Dedicated worker/service', 'Edge execution limits or recurring processing loops are a measured constraint.'],
          ['Redis', 'Hot entitlements/snapshot reads measurably overload Postgres and caching solves the proven bottleneck.'],
          ['Real queue product', 'Persisted event row + replay/backoff cannot reliably handle observed ingress behavior.'],
          ['Kafka', 'Usage ingest becomes large, ordered, multi-consumer streaming — not merely Stripe webhooks.'],
          ['ClickHouse', 'High-cardinality raw usage analytics/metering needs a columnar store; wallet spend still stays transactional.'],
          ['AWS migration', 'Compliance/region/control-plane requirements justify leaving the current stack — not simply because webhooks exist.'],
        ]}
      />

      <SeeAlso items={[{ href: '#docs/reference/data-model', title: 'Data model', description: 'The current transactional foundation these thresholds protect.' }]} />
    </>
  );
}

/* ============================================================= terminology */

const TERMS = [
  { term: 'workspace', definition: 'The SaaS/software company that pays APEX.' },
  { term: 'customer', definition: 'That workspace’s own end customer.' },
  { term: 'connected Stripe account', definition: 'The SaaS company’s Stripe account where its end customers pay.' },
  { term: 'APEX billing', definition: 'The separate Stripe path where the SaaS company pays APEX.' },
  { term: 'grant', definition: 'A durable source-attributed amount of product value.' },
  { term: 'credit account / projection', definition: 'The hot-path non-negative spendable remaining balance.' },
  { term: 'ledger', definition: 'Append-only product-value history: grant, consume, refund, unrecoverable.' },
  { term: 'operation', definition: 'Idempotent request/outcome state used to replay both success and DENY.' },
  { term: 'consume', definition: 'Frozen v1 authoritative scarce-credit spend operation.' },
  { term: 'entitlements', definition: 'Read-only snapshot-shaped plan/features/balance/version/as_of document.' },
  { term: 'unrecoverable_spent', definition: 'Refunded source value that was already consumed and cannot be clawed back from the wallet.' },
  { term: 'reservation', definition: 'Future hold primitive for start-now/finish-later work; not frozen v1.' },
  { term: 'production-accepted', definition: 'A capability that passed its defined hosted/end-to-end acceptance gate.' },
];

function Terminology() {
  return (
    <>
      <PageHeader eyebrow="REFERENCE" title="Terminology" lede="Precise terms for the frozen v1 product-state contract." />
      <DataTable head={['Term', 'Definition']} rows={TERMS.map((t) => [<code>{t.term}</code>, t.definition])} />
      <SeeAlso items={[{ href: '#docs/learn/glossary', title: 'Learn → Glossary', description: 'The same concepts in plain English.' }]} />
    </>
  );
}

export const REFERENCE_PAGES: Record<string, React.ComponentType> = {
  'api-overview': ApiOverview,
  'requests-and-responses': RequestsAndResponses,
  'events-and-webhooks': EventsAndWebhooks,
  'data-model': DataModel,
  limits: Limits,
  terminology: Terminology,
};