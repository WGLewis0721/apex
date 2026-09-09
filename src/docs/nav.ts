// APEX Docs information architecture.
// This is the single source of truth for section/page order, titles and
// descriptions — the sidebar, search index, and prev/next controls all
// derive from this file instead of keeping their own copies.
//
// Production status is owned by ROADMAP.md. Descriptions below distinguish
// production-accepted, deployed-but-incomplete, and planned capabilities.

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
      { slug: 'what-is-apex', title: 'What is APEX?', description: 'The Stripe-complement layer that turns commercial events into usable product state.', keywords: ['payment gate', 'credits', 'tokens', 'access'] },
      { slug: 'stripe-apex-your-product', title: 'Stripe → APEX → Your product', description: 'Stripe moves money; APEX maps verified events to credits, balances, entitlements, and product behavior.' },
      { slug: 'payments-plans-access', title: 'Payments vs. plans vs. access', description: 'Separate money movement from product rights, balance, and authoritative spend.' },
      { slug: 'credits-and-usage', title: 'Credits and usage', description: 'Durable grants, FIFO consumption, non-negative balance, and replay-safe spend.', keywords: ['balance', 'metering', 'consumption', 'top-up', 'purchase pack', 'refund'] },
      { slug: 'entitlements', title: 'Entitlements', description: 'Read-only product rights/state today; local signed evaluation is a later option.' },
      { slug: 'customer-lifecycle', title: 'Customer lifecycle', description: 'Purchase, usage, refund, renewal, failure, and later access-state changes.', keywords: ['refund', 'renewal', 'reversal'] },
      { slug: 'glossary', title: 'Glossary', description: 'Every APEX term, defined in plain English.' },
    ],
  },
  {
    id: 'build',
    label: 'Build',
    tagline: 'Production design + roadmap implementation',
    pages: [
      { slug: 'quickstart', title: 'Quickstart', description: 'The intended production integration path with explicit acceptance status at every step.' },
      { slug: 'connect-payment-provider', title: 'Connect Stripe', description: 'Connect the SaaS company’s Stripe account; External-test OAuth acceptance is still pending.' },
      { slug: 'create-plans', title: 'Create plans', description: 'Model what end customers can buy and receive.' },
      { slug: 'define-entitlements', title: 'Define entitlements', description: 'Attach features and limits; the hosted entitlements read is deployed while broader evaluation is later.' },
      { slug: 'configure-credits', title: 'Configure credits & purchase packs', description: 'Source-attributed grants, balances, purchase packs, and source-aware refunds.', keywords: ['pack', 'top-up', 'refund', 'balance'] },
      { slug: 'record-usage', title: 'Record usage', description: 'Hosted atomic credit consume is deployed; reservations/finalization are not frozen v1.' },
      { slug: 'check-access', title: 'Product access', description: 'Entitlements is read-only; scarce-value authorization happens through consume. Local checks are v1.1+.' },
      { slug: 'handle-webhooks', title: 'Handle Stripe events', description: 'Next core step: verified connected payment/refund events → replay-safe grant/refund ledger writes.', keywords: ['webhook', 'refund', 'idempotency', 'grant'] },
      { slug: 'upgrades-downgrades', title: 'Upgrades and downgrades', description: 'Later product-right changes must preserve durable balance and usage history.' },
      { slug: 'testing', title: 'Testing', description: 'Hosted wallet concurrency has passed; connected Stripe payment/refund proof is still required.' },
      { slug: 'going-live', title: 'Going live', description: 'Acceptance gates from External-test Stripe Connect through the connected payment-to-product-value proof.' },
    ],
  },
  {
    id: 'explore',
    label: 'Explore',
    tagline: 'For researchers, architects, and evaluators',
    pages: [
      { slug: 'traditional-saas-subscriptions', title: 'Traditional SaaS subscriptions', description: 'Tiers, recurring rights, and later recurring allowances.' },
      { slug: 'ai-token-applications', title: 'AI / token applications', description: 'Credits/tokens as product units with authoritative consume and purchase-more flows.' },
      { slug: 'credit-based-products', title: 'Credit-based products', description: 'A spendable product balance backed by durable source-attributed grants and FIFO consumption.' },
      { slug: 'membership-platforms', title: 'Membership platforms', description: 'Recurring access to a community or content library.' },
      { slug: 'usage-based-services', title: 'Usage-based services', description: 'Meter product value without treating APEX as the payment processor or cached state as spend authority.' },
      { slug: 'add-ons', title: 'Add-ons & purchase packs', description: 'One-time extras/top-ups mapped from authoritative Stripe configuration to product value.', keywords: ['credits', 'packs', 'top-up'] },
      { slug: 'team-accounts', title: 'Team accounts', description: 'Multiple people and shared product rights under one customer/account model.' },
    ],
  },
  {
    id: 'operate',
    label: 'Operate',
    tagline: 'Core ledger exists; operator tooling grows after connected proof',
    pages: [
      { slug: 'customer-lookup', title: 'Customer lookup', description: 'Target operator view for customer plan, balance, ledger history, and integration state.' },
      { slug: 'payment-failures-and-cancellations', title: 'Payment failures & cancellations', description: 'Later rules for how verified Stripe state affects product rights.' },
      { slug: 'access-changes-and-credit-corrections', title: 'Access changes, refunds & credit corrections', description: 'Source-aware refunds preserve history, never steal another grant, and never create v1 debt.', keywords: ['refund', 'reversal', 'adjustment', 'unrecoverable'] },
      { slug: 'event-history', title: 'Event history', description: 'Durable credit ledger now; connected Stripe event/replay history is the next production step.' },
      { slug: 'support-workflows', title: 'Support workflows', description: 'Target workflows for explaining purchase, balance, refund, and denied-consume issues.' },
      { slug: 'debugging', title: 'Debugging', description: 'Trace connected Stripe event → grant → consume/refund → projected balance.' },
    ],
  },
  {
    id: 'reference',
    label: 'Reference',
    tagline: 'Ledger/API core is deployed; connected fulfillment is still being completed',
    pages: [
      { slug: 'api-overview', title: 'API overview & authentication', description: 'Current hosted APEX API, apex_sk_* server authentication, and v1 route boundaries.' },
      { slug: 'requests-and-responses', title: 'Requests, responses & errors', description: 'Current balance/entitlements/consume shapes plus clearly labeled future contracts.' },
      { slug: 'events-and-webhooks', title: 'Events & webhooks', description: 'APEX own-billing events are real; connected Stripe fulfillment ingress is next.' },
      { slug: 'data-model', title: 'Data model', description: 'Real tenancy plus credit_accounts, source-attributed grants, append-only ledger, and idempotent operations.' },
      { slug: 'limits', title: 'Limits', description: 'Do not invent scale limits or infrastructure thresholds before production evidence justifies them.' },
      { slug: 'terminology', title: 'Terminology', description: 'Field names, product units, operation semantics, and production-status terms precisely defined.' },
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
