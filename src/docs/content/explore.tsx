import { Callout, DataTable, FlowDiagram, H2, PageHeader, SeeAlso } from '../primitives';

interface UseCase {
  slug: string;
  title: string;
  lede: string;
  journey: { title: string; detail: string }[];
  fit: 'Direct v1 fit' | 'Partial v1 fit' | 'Later extension';
  v1: string[];
  later: string[];
  value: string[];
  caution: string[];
  seeAlso?: { href: string; title: string; description: string }[];
}

function UseCasePage({ uc }: { uc: UseCase }) {
  return (
    <>
      <PageHeader eyebrow="EXPLORE" title={uc.title} lede={uc.lede} />

      <H2>Customer journey</H2>
      <FlowDiagram label={`${uc.title} customer journey`} nodes={uc.journey.map((j) => ({ title: j.title, detail: j.detail }))} />

      <H2>Fit with APEX today</H2>
      <DataTable head={['Stage', 'What applies']} rows={[
        ['Fit', <b>{uc.fit}</b>],
        ['Frozen v1', <ul>{uc.v1.map((x) => <li key={x}>{x}</li>)}</ul>],
        ['Later extension', <ul>{uc.later.map((x) => <li key={x}>{x}</li>)}</ul>],
      ]} />

      <H2>Why APEX adds value</H2>
      <ul>{uc.value.map((x) => <li key={x}>{x}</li>)}</ul>

      <H2>Watch-outs</H2>
      <ul>{uc.caution.map((x) => <li key={x}>{x}</li>)}</ul>

      {uc.fit !== 'Direct v1 fit' && (
        <Callout kind="note" title="Do not enlarge v1 for this use case">
          This use case is useful product direction, but it does not change the frozen implementation sequence.
          A later capability should be added only when a real customer needs it and it strengthens a clear
          buyer-value outcome.
        </Callout>
      )}

      {uc.seeAlso && <SeeAlso items={uc.seeAlso} />}
    </>
  );
}

const USE_CASES: UseCase[] = [
  {
    slug: 'traditional-saas-subscriptions',
    title: 'Traditional SaaS subscriptions',
    lede: 'Plan tiers and feature rights are a natural APEX direction, while the current frozen core is proving the reusable product-value ledger first.',
    fit: 'Partial v1 fit',
    journey: [
      { title: 'Customer subscribes', detail: 'Stripe owns the payment/subscription event' },
      { title: 'APEX maps plan state', detail: 'plan/features become product state' },
      { title: 'Product reads entitlements', detail: 'UI and server understand current rights' },
      { title: 'Lifecycle changes', detail: 'renewal/cancel/upgrade later update rights' },
    ],
    v1: [
      'Hosted entitlements document can expose current plan/features where present.',
      'The same customer/product-state model can coexist with credits.',
    ],
    later: [
      'Full subscription lifecycle mapping from connected Stripe.',
      'Signed/local feature evaluation and explicit grace/cancellation policy.',
      'Operator tooling for plan-right changes.',
    ],
    value: [
      'Centralizes plan rights instead of duplicating billing logic across services.',
      'Lets product teams separate money state from product rights.',
    ],
    caution: [
      'Do not treat a future feature ALLOW response as permission to spend scarce credits.',
      'Cancellation/grace behavior is product policy, not something Stripe or APEX should silently invent.',
    ],
    seeAlso: [{ href: '#docs/learn/entitlements', title: 'Learn: Entitlements', description: 'Current read-only state and later evaluation direction.' }],
  },
  {
    slug: 'ai-token-applications',
    title: 'AI / token applications',
    lede: 'Prepaid AI credits are one of the clearest direct fits for the frozen v1 ledger and authoritative consume model.',
    fit: 'Direct v1 fit',
    journey: [
      { title: 'Buys credits', detail: 'connected Stripe payment' },
      { title: 'APEX grants units', detail: 'source-attributed balance' },
      { title: 'AI action consumes units', detail: 'authoritative consume' },
      { title: 'Runs low', detail: 'balance/entitlements informs top-up UX' },
    ],
    v1: [
      'Verified payment → configured credit grant (ingress still to be wired).',
      'Atomic consume protects against concurrent overspend.',
      'Balance and entitlements provide current state.',
      'Refunds claw back only the unspent part of the source purchase.',
    ],
    later: [
      'Reservations for streaming/unknown final cost only if a real workload requires them.',
      'High-volume raw token analytics only when direct transactional metering stops being sufficient.',
      'Signed local feature gates if latency evidence justifies them.',
    ],
    value: [
      'Launch a credit economy without engineering the wallet from scratch.',
      'Protect costly inference from double-spend.',
      'Make support/refund questions explainable from source history.',
    ],
    caution: [
      'A cached “750 remaining” read cannot authorize an AI job if multiple workers may spend concurrently.',
      'Do not add reservation complexity unless work truly begins before final cost is known.',
    ],
    seeAlso: [{ href: '#docs/build/record-usage', title: 'Build: Consume credits', description: 'The current scarce-value boundary.' }],
  },
  {
    slug: 'credit-based-products',
    title: 'Credit-based products',
    lede: 'A reusable prepaid balance is the strongest immediate APEX v1 product shape.',
    fit: 'Direct v1 fit',
    journey: [
      { title: 'Buys a pack', detail: '1,000 credits, generations, exports, etc.' },
      { title: 'APEX grants it', detail: 'purchase source is preserved' },
      { title: 'Spends credits', detail: 'FIFO grant burn + atomic projection' },
      { title: 'Refund or top up', detail: 'history remains source-aware' },
    ],
    v1: [
      'Per-purchase source-attributed grants.',
      'Non-negative projected balance.',
      'FIFO consume across open grants.',
      'Append-only ledger and replay-safe operations.',
      'Source-scoped refund with unrecoverable_spent.',
    ],
    later: [
      'Expiring credits after projection reconciliation exists.',
      'Customer-facing reference balance component.',
      'Richer per-feature pricing/metering if customer demand needs it.',
    ],
    value: [
      'One reusable wallet system across many digital products.',
      'New purchase packs do not require another custom balance implementation.',
      'Refund A cannot accidentally consume purchase B.',
    ],
    caution: [
      'Frozen v1 grants should be non-expiring.',
      'The browser cannot choose its own grant amount from a payment amount.',
    ],
    seeAlso: [{ href: '#docs/learn/credits-and-usage', title: 'Learn: Credits and usage', description: 'The current wallet model.' }],
  },
  {
    slug: 'membership-platforms',
    title: 'Membership platforms',
    lede: 'Membership is mostly an entitlement/status problem rather than a scarce-credit wallet problem.',
    fit: 'Later extension',
    journey: [
      { title: 'Joins a tier', detail: 'Stripe subscription starts' },
      { title: 'Gets ongoing rights', detail: 'content/community/features' },
      { title: 'Renews or lapses', detail: 'commercial state changes' },
      { title: 'Product rights update', detail: 'explicit access policy' },
    ],
    v1: [
      'Customer, subscription, plan, and feature schema foundations exist.',
      'Entitlements read can expose current modeled rights.',
    ],
    later: [
      'Connected subscription lifecycle processing.',
      'Deterministic feature-access policy and local/server evaluation.',
      'Grace/cancellation timing and operator support views.',
    ],
    value: [
      'Keeps subscription state and product rights from drifting across services.',
      'Makes “why did access change?” explainable once lifecycle handling is accepted.',
    ],
    caution: [
      'Do not force the credit-ledger model onto a use case that does not need scarce units.',
    ],
  },
  {
    slug: 'usage-based-services',
    title: 'Usage-based services',
    lede: 'Postpaid high-volume usage is adjacent to APEX, but it is not the reason to expand frozen v1 before the prepaid core is proven.',
    fit: 'Later extension',
    journey: [
      { title: 'Customer uses service', detail: 'API/storage/compute activity' },
      { title: 'Usage is recorded', detail: 'high-volume raw events or counters' },
      { title: 'Period is rated/billed', detail: 'postpaid commercial workflow' },
      { title: 'Product/support reviews state', detail: 'limits, alerts, invoice context' },
    ],
    v1: [
      'Direct prepaid credit consume can model usage where the product sells prepaid units.',
      'Existing usage tables are schema foundation, not accepted high-volume metering infrastructure.',
    ],
    later: [
      'Raw event ingest/counters for postpaid metering.',
      'Streaming/columnar storage only at proven scale.',
      'Spend caps/alerts and postpaid reconciliation policy.',
    ],
    value: [
      'Could later unify product usage and commercial context for SaaS operators.',
      'Prepaid mode already gives a controlled path for products that want hard spend limits.',
    ],
    caution: [
      'Do not introduce Kafka/ClickHouse simply because “usage-based billing” sounds high scale.',
      'Wallet spend remains transactional Postgres even if analytics later moves elsewhere.',
    ],
  },
  {
    slug: 'add-ons',
    title: 'Add-ons & purchase packs',
    lede: 'One-time credit/value packs are a direct v1 fit; arbitrary non-credit add-on entitlements are a later product-right extension.',
    fit: 'Direct v1 fit',
    journey: [
      { title: 'Chooses an extra', detail: 'credit pack / reports / generations' },
      { title: 'Pays in Stripe', detail: 'server-authoritative product/price mapping' },
      { title: 'APEX grants value', detail: 'one source-attributed grant' },
      { title: 'Uses/refunds it', detail: 'consume/refund stay auditable' },
    ],
    v1: [
      'Configured Stripe product/price → fixed credit grant is the next connected ingress target.',
      'Top-up creates another source-attributed grant; it does not mutate an old purchase.',
    ],
    later: [
      'Non-credit add-on entitlement composition.',
      'Customer balance/purchase reference UI.',
    ],
    value: [
      'Lets SaaS teams add monetizable extras without another wallet implementation.',
      'Keeps each purchase independently refundable/auditable.',
    ],
    caution: [
      'Never accept browser-supplied grant quantity as fulfillment truth.',
    ],
    seeAlso: [{ href: '#docs/build/configure-credits', title: 'Build: Configure credits', description: 'Source-attributed grants and refund behavior.' }],
  },
  {
    slug: 'team-accounts',
    title: 'Team accounts',
    lede: 'Shared balances and seats are useful later, but they require an explicit end-customer account/membership model beyond APEX’s own tenant membership.',
    fit: 'Later extension',
    journey: [
      { title: 'Company buys product', detail: 'one commercial customer' },
      { title: 'Invites members', detail: 'product-specific membership' },
      { title: 'Members share rights/value', detail: 'pooled credits or seats' },
      { title: 'Owner manages billing', detail: 'subscription/packs/limits' },
    ],
    v1: [
      'A single APEX customer record can own a credit account and balance.',
      'The wallet can safely consume from that account if the SaaS maps team activity to it server-side.',
    ],
    later: [
      'First-class end-customer team/member roles.',
      'Per-member attribution and seat management.',
      'Shared balance/operator reporting semantics.',
    ],
    value: [
      'Could let B2B SaaS products reuse one product-state system for team-level monetization.',
    ],
    caution: [
      'Do not confuse APEX workspace_members (APEX tenant users) with the SaaS customer’s own team membership.',
    ],
  },
];

export const EXPLORE_PAGES: Record<string, React.ComponentType> = Object.fromEntries(
  USE_CASES.map((uc) => [uc.slug, () => <UseCasePage uc={uc} />]),
);