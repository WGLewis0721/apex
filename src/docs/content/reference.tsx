import { Callout, CodeBlock, DataTable, H2, H3, PageHeader, SeeAlso } from '../primitives';

const PLANNED = { kind: 'planned' as const, label: 'Design preview — not a published, hosted API' };

/* ============================================================ api-overview */

function ApiOverview() {
  return (
    <>
      <PageHeader eyebrow="REFERENCE" title="API overview & authentication" lede="Base URL, authentication, environments, and request shape — as currently designed, not as currently running." status={PLANNED} />

      <Callout kind="planned" title="Status">
        There is no hosted APEX API today. Everything on this page describes the intended shape of one,
        modeled directly on the schema in <a href="#docs/reference/data-model">Data model</a> and the
        logic already running in the Forma demo. Treat code on this page as illustrative, not callable.
      </Callout>

      <H2>Authentication</H2>
      <p>
        Each workspace has one or more <code>environments</code> (e.g. sandbox, live), and each environment
        has its own <code>api_keys</code>: a <code>publishable_key</code> safe to use client-side, and a
        secret key intended for server-side requests only. The secret key's hash is stored in{' '}
        <code>secret_key_hash</code>; the plaintext value is only ever readable once, at creation
        (<code>secret_key_once</code>), and both columns are already locked down at the database level —
        revoked from normal client access via column-level <code>GRANT</code>/<code>REVOKE</code>.
      </p>
      <CodeBlock language="http" code={`Authorization: Bearer sk_live_...`} caption="Illustrative request header — no server validates this today." />

      <H2>Environments</H2>
      <p>
        Sandbox and live are fully separate: separate API keys, separate data, no path that migrates one
        into the other. Requests are always scoped to exactly one environment by which key was used.
      </p>

      <H2>Request shape</H2>
      <p>JSON in, JSON out. Every request is scoped implicitly to the workspace that owns the API key used to make it — there is no separate workspace ID parameter to pass.</p>

      <H2>Versioning</H2>
      <Callout kind="note">Not yet decided. No API exists to version — this will be defined once the first real endpoint ships, per the project's own rule against inventing unapproved technical decisions.</Callout>

      <SeeAlso items={[
        { href: '#docs/reference/requests-and-responses', title: 'Requests, responses & errors', description: 'Object shapes and error format.' },
        { href: '#docs/reference/data-model', title: 'Data model', description: 'The real schema this API would sit on top of.' },
      ]} />
    </>
  );
}

/* ================================================== requests-and-responses */

function RequestsAndResponses() {
  return (
    <>
      <PageHeader eyebrow="REFERENCE" title="Requests, responses & errors" lede="Object shapes, status codes, and the error format a real integration would rely on." status={PLANNED} />

      <H2>Access decision response</H2>
      <CodeBlock language="json" code={`{
  "allow": true,
  "reason": "Allowed under the Pro plan.",
  "feature": "report_generation",
  "remaining": 47
}`} caption="Modeled directly on Forma's FormaDecision shape: { allow, reason }." />

      <H2>Credit grant object</H2>
      <CodeBlock language="json" code={`{
  "id": "cgr_...",
  "customer": "cus_jordan",
  "feature": "report_generation",
  "amount": 10,
  "remaining_amount": 7,
  "expires_at": null,
  "reason": "plan_renewal",
  "created_at": "2026-09-08T00:00:00Z"
}`} caption="Field names match the real credit_grants table exactly." />

      <H2>Subscription object</H2>
      <CodeBlock language="json" code={`{
  "id": "sub_...",
  "customer": "cus_jordan",
  "plan": "pro",
  "status": "active",
  "current_period_end": "2026-10-08T00:00:00Z"
}`} />

      <H2>Status codes</H2>
      <DataTable
        head={['Code', 'Meaning']}
        rows={[
          ['200', 'Request succeeded.'],
          ['400', 'The request body is malformed or missing a required field.'],
          ['401', 'Missing or invalid API key.'],
          ['404', 'The referenced customer, plan, or feature doesn\'t exist in this workspace.'],
          ['409', 'A duplicate event_id was reused — the request was rejected to avoid double-counting.'],
          ['429', 'Rate limit exceeded — see Reference → Limits.'],
        ]}
      />

      <H2>Error format</H2>
      <CodeBlock language="json" code={`{
  "error": {
    "code": "insufficient_credits",
    "message": "This customer has 0 of 10 credits remaining for report_generation."
  }
}`} caption="Illustrative — errors are always specific and actionable, matching the { allow, reason } style already used in Forma." />

      <SeeAlso items={[{ href: '#docs/reference/events-and-webhooks', title: 'Events & webhooks', description: 'The asynchronous half of this API.' }]} />
    </>
  );
}

/* ==================================================== events-and-webhooks */

const EVENT_TYPES = [
  { type: 'subscription.created', when: 'A new subscription starts (any status).' },
  { type: 'subscription.updated', when: 'Plan, status, or period changes.' },
  { type: 'subscription.canceled', when: 'A subscription is canceled.' },
  { type: 'invoice.paid', when: 'A payment succeeds.' },
  { type: 'invoice.payment_failed', when: 'A payment fails.' },
  { type: 'credit.granted', when: 'A new credit_grants row is created (plan renewal, top-up, correction).' },
  { type: 'credit.consumed', when: 'A usage event draws down a grant.' },
  { type: 'access.denied', when: 'An access check returns deny — useful for alerting on customers hitting limits.' },
];

function EventsAndWebhooks() {
  return (
    <>
      <PageHeader eyebrow="REFERENCE" title="Events & webhooks" lede="Every event type APEX would emit, and how a receiving webhook should be handled." status={PLANNED} />

      <H2>Event types</H2>
      <DataTable head={['Event', 'Fires when']} rows={EVENT_TYPES.map((e) => [<code>{e.type}</code>, e.when])} />

      <H2>Payload shape</H2>
      <CodeBlock language="json" code={`{
  "id": "evt_...",
  "type": "credit.consumed",
  "workspace_id": "...",
  "created_at": "2026-09-08T00:00:00Z",
  "data": {
    "customer": "cus_jordan",
    "feature": "report_generation",
    "amount": 1,
    "remaining_amount": 7
  }
}`} />

      <H2>Idempotency</H2>
      <p>
        This is the one piece of this page with a real table behind it today: <code>stripe_webhook_events</code>{' '}
        is a live idempotency ledger, keyed on a unique <code>stripe_event_id</code>, with a{' '}
        <code>status</code> of <code>received</code>, <code>processed</code>, or <code>failed</code>. It has
        row-level security enabled with zero policies granted to normal clients — only trusted server-side
        code (service role) can read or write it, by design.
      </p>

      <SeeAlso items={[{ href: '#docs/build/handle-webhooks', title: 'Build: Handle webhooks', description: 'How to receive and verify these safely.' }]} />
    </>
  );
}

/* ============================================================= data-model */

interface Column { name: string; type: string; notes?: string; }
interface TableDef { name: string; summary: string; columns: Column[]; }
interface Group { heading: string; tables: TableDef[]; }

const GROUPS: Group[] = [
  {
    heading: 'Accounts & workspaces',
    tables: [
      {
        name: 'profiles',
        summary: 'One row per Supabase Auth user, kept in sync by a trigger on auth.users.',
        columns: [
          { name: 'id', type: 'uuid, PK', notes: 'References auth.users(id).' },
          { name: 'email', type: 'text' },
          { name: 'full_name', type: 'text, nullable', notes: 'Display only — never read by RLS or any auth check.' },
          { name: 'company_name', type: 'text, nullable' },
          { name: 'created_at / updated_at', type: 'timestamptz' },
        ],
      },
      {
        name: 'workspaces',
        summary: 'A company or team using APEX — APEX\'s own paying customer.',
        columns: [
          { name: 'id', type: 'uuid, PK' },
          { name: 'name', type: 'text' },
          { name: 'slug', type: 'text, unique' },
          { name: 'status', type: "text, check: 'active' | 'suspended' | 'closed'" },
          { name: 'created_by', type: 'uuid', notes: 'References auth.users(id).' },
          { name: 'created_at / updated_at', type: 'timestamptz' },
        ],
      },
      {
        name: 'workspace_members',
        summary: 'Membership linking a user to a workspace, with a role.',
        columns: [
          { name: 'workspace_id', type: 'uuid → workspaces' },
          { name: 'user_id', type: 'uuid → auth.users' },
          { name: 'role', type: "text, check: 'owner' | 'admin' | 'member'" },
          { name: '(unique)', type: '(workspace_id, user_id)' },
        ],
      },
    ],
  },
  {
    heading: 'Commercial catalog',
    tables: [
      {
        name: 'plans',
        summary: 'workspace_id = null is APEX\'s own platform catalog; set = a plan a workspace defines for its own customers.',
        columns: [
          { name: 'workspace_id', type: 'uuid, nullable → workspaces' },
          { name: 'key / name', type: 'text' },
          { name: 'monthly_price_cents', type: 'integer, default 0' },
          { name: 'setup_fee_cents', type: 'integer, default 0' },
          { name: 'currency', type: "text, default 'usd'" },
          { name: 'stripe_price_id_recurring / _setup', type: 'text, nullable' },
          { name: 'is_active', type: 'boolean, default true' },
          { name: '(unique)', type: 'key, scoped separately for platform (workspace_id is null) vs. workspace plans' },
        ],
      },
      {
        name: 'features',
        summary: 'A workspace\'s catalog of things that can be gated or metered.',
        columns: [
          { name: 'workspace_id', type: 'uuid → workspaces' },
          { name: 'key / name / description', type: 'text' },
          { name: 'is_active', type: 'boolean, default true' },
          { name: '(unique)', type: '(workspace_id, key)' },
        ],
      },
      {
        name: 'plan_features',
        summary: 'Join table: what a plan includes, and any numeric limit.',
        columns: [
          { name: 'plan_id', type: 'uuid → plans' },
          { name: 'feature_id', type: 'uuid → features' },
          { name: 'limit_value', type: 'bigint, nullable', notes: 'Null = unlimited or a plain unlock, not a numeric ceiling.' },
          { name: '(unique)', type: '(plan_id, feature_id)' },
        ],
      },
    ],
  },
  {
    heading: 'Customers & subscriptions',
    tables: [
      {
        name: 'customers',
        summary: 'A workspace\'s own end customers — distinct from the workspace itself.',
        columns: [
          { name: 'workspace_id', type: 'uuid → workspaces' },
          { name: 'external_id', type: 'text', notes: 'The workspace\'s own identifier for this customer.' },
          { name: 'email / name', type: 'text, nullable' },
          { name: 'status', type: "text, check: 'active' | 'inactive'" },
          { name: '(unique)', type: '(workspace_id, external_id)' },
        ],
      },
      {
        name: 'subscriptions',
        summary: 'customer_id = null is the workspace\'s own APEX subscription; set = one of the workspace\'s customers subscribed to one of its plans.',
        columns: [
          { name: 'workspace_id', type: 'uuid → workspaces' },
          { name: 'customer_id', type: 'uuid, nullable → customers' },
          { name: 'plan_id', type: 'uuid → plans' },
          { name: 'status', type: "text, check: 'incomplete' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid'" },
          { name: 'stripe_subscription_id', type: 'text, unique, nullable' },
          { name: 'current_period_end', type: 'timestamptz, nullable' },
        ],
      },
    ],
  },
  {
    heading: 'Environments & API keys',
    tables: [
      {
        name: 'environments',
        summary: 'A sandbox or live context a workspace operates in.',
        columns: [
          { name: 'workspace_id', type: 'uuid → workspaces' },
          { name: 'name', type: "text, default 'sandbox'" },
          { name: 'status', type: "text, check: 'pending' | 'active' | 'disabled'" },
          { name: '(unique)', type: '(workspace_id, name)' },
        ],
      },
      {
        name: 'api_keys',
        summary: 'Publishable + secret key pair per environment. Secret columns are locked at the database level.',
        columns: [
          { name: 'workspace_id / environment_id', type: 'uuid →' },
          { name: 'publishable_key', type: 'text, unique' },
          { name: 'secret_key_hash', type: 'text', notes: 'Never granted to authenticated/anon clients.' },
          { name: 'secret_key_once', type: 'text, nullable', notes: 'Readable once, at creation, by trusted server code only.' },
          { name: 'status', type: "text, check: 'active' | 'revoked'" },
          { name: 'revoked_at', type: 'timestamptz, nullable' },
        ],
      },
    ],
  },
  {
    heading: 'Usage, credits & access',
    tables: [
      {
        name: 'usage_events',
        summary: 'One record per reported unit of usage, deduplicated by event_id.',
        columns: [
          { name: 'workspace_id / customer_id', type: 'uuid →' },
          { name: 'feature_id', type: 'uuid, nullable → features' },
          { name: 'event_id', type: 'text', notes: 'Idempotency key — unique per workspace.' },
          { name: 'quantity', type: 'numeric, default 1' },
          { name: 'metadata', type: 'jsonb, default {}' },
          { name: 'occurred_at', type: 'timestamptz' },
          { name: '(unique)', type: '(workspace_id, event_id)' },
        ],
      },
      {
        name: 'usage_counters',
        summary: 'A running total of usage per customer, feature, and period.',
        columns: [
          { name: 'workspace_id / customer_id / feature_id', type: 'uuid →' },
          { name: 'period_start / period_end', type: 'timestamptz' },
          { name: 'total_quantity', type: 'numeric, default 0' },
          { name: '(unique)', type: '(customer_id, feature_id, period_start)' },
        ],
      },
      {
        name: 'credit_grants',
        summary: 'A specific allocation of credits — from a plan, a top-up, or a correction.',
        columns: [
          { name: 'workspace_id / customer_id', type: 'uuid →' },
          { name: 'feature_id', type: 'uuid, nullable → features' },
          { name: 'amount', type: 'numeric', notes: 'The original grant amount.' },
          { name: 'remaining_amount', type: 'numeric', notes: 'Drawn down by consumptions.' },
          { name: 'expires_at', type: 'timestamptz, nullable' },
          { name: 'reason', type: 'text, nullable' },
        ],
      },
      {
        name: 'credit_consumptions',
        summary: 'One record per spend against a grant, optionally linked to the usage event that caused it.',
        columns: [
          { name: 'credit_grant_id', type: 'uuid → credit_grants' },
          { name: 'usage_event_id', type: 'uuid, nullable → usage_events' },
          { name: 'amount', type: 'numeric' },
        ],
      },
      {
        name: 'access_decisions',
        summary: 'A record of an allow/deny answer. No evaluation logic writes to this table yet.',
        columns: [
          { name: 'customer_id / feature_id', type: 'uuid, nullable →' },
          { name: 'decision', type: "text, check: 'allow' | 'deny'" },
          { name: 'reason', type: 'text, nullable' },
          { name: 'context', type: 'jsonb, default {}' },
        ],
      },
    ],
  },
  {
    heading: 'Webhooks & audit',
    tables: [
      {
        name: 'stripe_webhook_events',
        summary: 'Idempotency ledger for incoming webhooks. RLS enabled with zero policies — service-role only.',
        columns: [
          { name: 'stripe_event_id', type: 'text, unique' },
          { name: 'event_type', type: 'text' },
          { name: 'workspace_id', type: 'uuid, nullable → workspaces' },
          { name: 'payload', type: 'jsonb' },
          { name: 'status', type: "text, check: 'received' | 'processed' | 'failed'" },
          { name: 'processed_at', type: 'timestamptz, nullable' },
        ],
      },
      {
        name: 'audit_logs',
        summary: 'Append-only record of what changed, for whom, and why.',
        columns: [
          { name: 'workspace_id', type: 'uuid, nullable → workspaces' },
          { name: 'actor_user_id', type: 'uuid, nullable → auth.users' },
          { name: 'action', type: 'text', notes: 'e.g. "subscription.upgraded".' },
          { name: 'target_type / target_id', type: 'text, nullable' },
          { name: 'metadata', type: 'jsonb, default {}' },
        ],
      },
    ],
  },
];

function DataModel() {
  return (
    <>
      <PageHeader eyebrow="REFERENCE" title="Data model" lede="The real, applied Postgres schema — every table and column, taken directly from the live migration." />

      <Callout kind="note" title="This page is real">
        Unlike most of Reference, this schema is live: it's the exact table set applied to the project's
        Supabase database, with workspace-scoped row-level security already enforced. Nothing on this page
        is aspirational.
      </Callout>

      <H2>Row-level security</H2>
      <p>
        Every table above (except <code>stripe_webhook_events</code>, which grants nothing to normal
        clients) is scoped by a single SQL helper: <code>current_workspace_ids()</code> returns the set of
        workspace IDs the current authenticated user belongs to, read from <code>workspace_members</code>{' '}
        — never from user-editable metadata. Every select policy filters on{' '}
        <code>workspace_id in (select current_workspace_ids())</code>.
      </p>

      {GROUPS.map((g) => (
        <div key={g.heading}>
          <H2>{g.heading}</H2>
          {g.tables.map((t) => (
            <div key={t.name}>
              <H3>{t.name}</H3>
              <p>{t.summary}</p>
              <DataTable head={['Column', 'Type', 'Notes']} rows={t.columns.map((c) => [<code>{c.name}</code>, c.type, c.notes ?? ''])} />
            </div>
          ))}
        </div>
      ))}

      <SeeAlso items={[
        { href: '#docs/reference/terminology', title: 'Terminology', description: 'Precise definitions for the terms used above.' },
        { href: '#docs/learn/entitlements', title: 'Learn: Entitlements', description: 'The plain-English version of plan_features.' },
      ]} />
    </>
  );
}

/* ================================================================= limits */

function Limits() {
  return (
    <>
      <PageHeader eyebrow="REFERENCE" title="Limits" lede="Rate limits, sizing limits, and plan boundaries." />

      <H2>Rate limits</H2>
      <Callout kind="planned" title="Not yet decided">
        There is no live API to rate-limit yet, so no specific numbers are official — this documentation
        won't invent them. When an API ships, its limits will be documented here as real, decided values,
        not before.
      </Callout>

      <H2>Sizing limits (real, from the schema)</H2>
      <DataTable
        head={['Constraint', 'Detail']}
        rows={[
          [<code>plan_features.limit_value</code>, 'bigint — supports very large numeric limits, not capped by application logic.'],
          [<><code>credit_grants.amount</code> / <code>remaining_amount</code></>, 'numeric — supports fractional amounts, e.g. metered seconds.'],
          [<><code>usage_events.metadata</code> / <code>access_decisions.context</code></>, 'jsonb — structurally unbounded; Postgres\'s own row and TOAST limits apply, not a smaller application-level cap.'],
          ['Uniqueness', 'Enforced at the database level everywhere it matters — e.g. one usage_events.event_id per workspace, one plan key per workspace.'],
        ]}
      />

      <H2>Plan boundaries</H2>
      <p>
        A plan's entitlement limits are exactly what's configured in <code>plan_features.limit_value</code>{' '}
        — APEX doesn't impose a separate platform-level ceiling on top of what a workspace defines for its
        own plans.
      </p>

      <SeeAlso items={[{ href: '#docs/reference/data-model', title: 'Data model', description: 'The tables these limits come from.' }]} />
    </>
  );
}

/* ============================================================= terminology */

const TERMS = [
  { term: 'workspace', definition: 'APEX\'s own paying customer — a company or team. Table: workspaces.' },
  { term: 'customer', definition: 'A workspace\'s own end user. Table: customers. Never confused with workspace in the schema.' },
  { term: 'key', definition: 'A stable, human-chosen identifier (e.g. plans.key = "pro"), distinct from id (a generated uuid).' },
  { term: 'limit_value', definition: 'A nullable bigint on plan_features. Null means the feature is unlocked with no numeric ceiling, not "zero" or "unset."' },
  { term: 'remaining_amount', definition: 'The live, spendable balance of a credit_grants row — starts equal to amount and is drawn down by credit_consumptions.' },
  { term: 'event_id', definition: 'The idempotency key on usage_events, unique per workspace — resending the same event_id must be a safe no-op, not a double charge.' },
  { term: 'decision', definition: 'The enum on access_decisions: "allow" or "deny" — always paired with a reason.' },
  { term: 'status', definition: 'A constrained text enum present on several tables (subscriptions, workspaces, customers, environments, api_keys, stripe_connections, stripe_webhook_events) — always check the specific table\'s allowed values, they differ per table.' },
];

function Terminology() {
  return (
    <>
      <PageHeader eyebrow="REFERENCE" title="Terminology" lede="Field names and object types, precisely defined — the technical companion to Learn's plain-English glossary." />
      <H2>Terms</H2>
      <DataTable head={['Term', 'Definition']} rows={TERMS.map((t) => [<code>{t.term}</code>, t.definition])} />
      <Callout kind="tip">
        Looking for the plain-English version instead? See <a href="#docs/learn/glossary">Learn → Glossary</a>.
      </Callout>
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
