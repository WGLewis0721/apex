// APEX Docs information architecture.
// This is the single source of truth for section/page order, titles and
// descriptions — the sidebar, search index, and prev/next controls all
// derive from this file instead of keeping their own copies.
//
// Production status is owned by ROADMAP.md. Descriptions below must not
// imply that a planned API/SDK/ledger/dashboard capability is already live.

export type SectionId = 'learn' | 'build' | 'explore' | 'operate' | 'reference';

export interface DocPage {
  slug: string;
  title: string;
  /** One line shown in the sidebar, search results and section index. */
  description: string;
  /** Extra words the search should match beyond the title/description. */
  keywords?: string[];
}

export interface DocSection {
  id: SectionId;
  label: string;
  /** Short line under the section name in the sidebar. */
  tagline: string;
  pages: DocPage[];
}

export const SECTIONS: DocSection[] = [
  {
    id: 'learn',
    label: 'Learn',
    tagline: 'APEX from first principles',
    pages: [
      { slug: 'what-is-apex', title: 'What is APEX?', description: 'The Stripe-complement layer between a SaaS payment and what it unlocks.', keywords: ['payment gate', 'credits', 'tokens', 'access'] },
      { slug: 'stripe-apex-your-product', title: 'Stripe → APEX → Your product', description: 'Stripe moves money; APEX maps it to credits, usage, entitlements, and access.' },
      { slug: 'payments-plans-access', title: 'Payments vs. plans vs. access', description: 'Separate money movement from product rights and enforcement.' },
      { slug: 'credits-and-usage', title: 'Credits and usage', description: 'Jordan buys 10 credits, uses 3, has 7 left — the product model worked in full.', keywords: ['balance', 'metering', 'consumption', 'top-up', 'purchase pack', 'renewal', 'refund'] },
      { slug: 'entitlements', title: 'Entitlements', description: 'What a plan actually unlocks, feature by feature.' },
      { slug: 'customer-lifecycle', title: 'Customer lifecycle', description: 'Purchase, renewal, failure, refund, cancellation, and access-state changes.', keywords: ['refund', 'renewal', 'reversal'] },
      { slug: 'glossary', title: 'Glossary', description: 'Every APEX term, defined in plain English.' },
    ],
  },
  {
    id: 'build',
    label: 'Build',
    tagline: 'Production design + roadmap implementation',
    pages: [
      { slug: 'quickstart', title: 'Quickstart', description: 'The intended production integration path; check each step’s status before using it.' },
      { slug: 'connect-payment-provider', title: 'Connect Stripe', description: 'Connect the SaaS company’s Stripe account to APEX; Phase 5 acceptance is still in progress.' },
      { slug: 'create-plans', title: 'Create plans', description: 'Model what end customers can buy and receive.' },
      { slug: 'define-entitlements', title: 'Define entitlements', description: 'Attach features and limits to a plan; production enforcement is Phase 6.' },
      { slug: 'configure-credits', title: 'Configure credits & purchase packs', description: 'Plan grants, top-ups, balances, renewals, and refund-aware adjustments.', keywords: ['pack', 'top-up', 'refund', 'renewal', 'balance'] },
      { slug: 'record-usage', title: 'Record usage', description: 'Planned server-side metering, reservation, and finalization through APEX Cloud.' },
      { slug: 'check-access', title: 'Check access', description: 'Planned deterministic ALLOW/DENY using payment, plan, credits, usage, and features.' },
      { slug: 'handle-webhooks', title: 'Handle Stripe events', description: 'Verified, idempotent purchase/renewal/failure/refund fulfillment and reconciliation.', keywords: ['webhook', 'refund', 'renewal', 'idempotency'] },
      { slug: 'upgrades-downgrades', title: 'Upgrades and downgrades', description: 'Change customer product rights without corrupting usage or balance history.' },
      { slug: 'testing', title: 'Testing', description: 'Verify Stripe → ledger → usage → balance → access behavior before production.' },
      { slug: 'going-live', title: 'Going live', description: 'Roadmap acceptance gates from test-mode connection through real product proof.' },
    ],
  },
  {
    id: 'explore',
    label: 'Explore',
    tagline: 'For researchers, architects, and evaluators',
    pages: [
      { slug: 'traditional-saas-subscriptions', title: 'Traditional SaaS subscriptions', description: 'Tiers, recurring rights, and optional recurring allowances.' },
      { slug: 'ai-token-applications', title: 'AI / token applications', description: 'Credits/tokens as product units with purchase-more and usage controls.' },
      { slug: 'credit-based-products', title: 'Credit-based products', description: 'A spendable product balance backed by durable grants and consumption.' },
      { slug: 'membership-platforms', title: 'Membership platforms', description: 'Recurring access to a community or content library.' },
      { slug: 'usage-based-services', title: 'Usage-based services', description: 'Metered consumption and access decisions without treating APEX as the payment processor.' },
      { slug: 'add-ons', title: 'Add-ons & purchase packs', description: 'One-time extras/top-ups mapped from Stripe Prices to product value.', keywords: ['credits', 'packs', 'top-up'] },
      { slug: 'team-accounts', title: 'Team accounts', description: 'Multiple people and shared product rights under one customer/account model.' },
    ],
  },
  {
    id: 'operate',
    label: 'Operate',
    tagline: 'Planned operations after production launch',
    pages: [
      { slug: 'customer-lookup', title: 'Customer lookup', description: 'Target operator view for customer plan, balance, usage, and history.' },
      { slug: 'payment-failures-and-cancellations', title: 'Payment failures & cancellations', description: 'How connected Stripe state should affect product access.' },
      { slug: 'access-changes-and-credit-corrections', title: 'Access changes, refunds & credit corrections', description: 'Preserve history with auditable adjustments instead of deleting events.', keywords: ['refund', 'reversal', 'adjustment'] },
      { slug: 'event-history', title: 'Event history', description: 'The audit trail behind purchases, grants, usage, renewals, refunds, and access decisions.' },
      { slug: 'support-workflows', title: 'Support workflows', description: 'Target workflows for explaining and resolving customer product-state issues.' },
      { slug: 'debugging', title: 'Debugging', description: 'A customer says balance/access is wrong: trace Stripe → ledger → usage → decision.' },
    ],
  },
  {
    id: 'reference',
    label: 'Reference',
    tagline: 'Schema is real; future API contracts are labeled planned',
    pages: [
      { slug: 'api-overview', title: 'API overview & authentication', description: 'Planned APEX Cloud auth, environments, and integration responsibilities.' },
      { slug: 'requests-and-responses', title: 'Requests, responses & errors', description: 'Design-preview object shapes until the Phase 6 API is implemented.' },
      { slug: 'events-and-webhooks', title: 'Events & webhooks', description: 'Existing APEX-billing events versus planned connected-Stripe fulfillment events.' },
      { slug: 'data-model', title: 'Data model', description: 'The real schema foundation: tables, columns, relationships, and current limits.' },
      { slug: 'limits', title: 'Limits', description: 'Do not invent rate/sizing limits before production architecture selects them.' },
      { slug: 'terminology', title: 'Terminology', description: 'Field names, product units, and object types precisely defined.' },
    ],
  },
];

export function findPage(sectionId: string, slug: string): { section: DocSection; page: DocPage } | null {
  const section = SECTIONS.find((s) => s.id === sectionId);
  if (!section) return null;
  const page = section.pages.find((p) => p.slug === slug);
  if (!page) return null;
  return { section, page };
}

export interface FlatPage {
  section: DocSection;
  page: DocPage;
  index: number;
}

export const FLAT_PAGES: FlatPage[] = SECTIONS.flatMap((section) =>
  section.pages.map((page, i) => ({ section, page, index: i })),
);

export function pagePath(sectionId: string, slug: string): string {
  return `#docs/${sectionId}/${slug}`;
}

export function adjacentPages(sectionId: string, slug: string): { prev: FlatPage | null; next: FlatPage | null } {
  const i = FLAT_PAGES.findIndex((f) => f.section.id === sectionId && f.page.slug === slug);
  if (i === -1) return { prev: null, next: null };
  return { prev: i > 0 ? FLAT_PAGES[i - 1] : null, next: i < FLAT_PAGES.length - 1 ? FLAT_PAGES[i + 1] : null };
}
