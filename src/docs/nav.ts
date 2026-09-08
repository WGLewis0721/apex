// APEX Docs information architecture.
// This is the single source of truth for section/page order, titles and
// descriptions — the sidebar, search index, and prev/next controls all
// derive from this file instead of keeping their own copies.

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
      { slug: 'what-is-apex', title: 'What is APEX?', description: 'The commercial layer between payments and product access.' },
      { slug: 'stripe-apex-your-product', title: 'Stripe → APEX → Your product', description: 'Who does what, and why the split exists.' },
      { slug: 'payments-plans-access', title: 'Payments vs. plans vs. access', description: 'Three related ideas people mix up constantly.' },
      { slug: 'credits-and-usage', title: 'Credits and usage', description: 'Jordan buys 10 credits, uses 3, has 7 left — worked in full.', keywords: ['balance', 'metering', 'consumption', 'top-up'] },
      { slug: 'entitlements', title: 'Entitlements', description: 'What a plan actually unlocks, feature by feature.' },
      { slug: 'customer-lifecycle', title: 'Customer lifecycle', description: 'From first purchase to cancellation, and every state between.' },
      { slug: 'glossary', title: 'Glossary', description: 'Every APEX term, defined in plain English.' },
    ],
  },
  {
    id: 'build',
    label: 'Build',
    tagline: 'Turn understanding into implementation',
    pages: [
      { slug: 'quickstart', title: 'Quickstart', description: 'The shortest real path from zero to a working setup.' },
      { slug: 'connect-payment-provider', title: 'Connect a payment provider', description: 'Wire Stripe (or another provider) to APEX.' },
      { slug: 'create-plans', title: 'Create plans', description: 'Model what customers can buy.' },
      { slug: 'define-entitlements', title: 'Define entitlements', description: 'Attach features and limits to a plan.' },
      { slug: 'configure-credits', title: 'Configure credits', description: 'Set up grants, consumption, and top-ups.' },
      { slug: 'record-usage', title: 'Record usage', description: 'Tell APEX what a customer actually did.' },
      { slug: 'check-access', title: 'Check access', description: 'Ask APEX whether an action is allowed before it happens.' },
      { slug: 'handle-webhooks', title: 'Handle webhooks', description: 'React to payment and subscription events in real time.' },
      { slug: 'upgrades-downgrades', title: 'Upgrades and downgrades', description: 'Change a customer’s plan without breaking their access.' },
      { slug: 'testing', title: 'Testing', description: 'Verify billing logic before it touches real customers.' },
      { slug: 'going-live', title: 'Going live', description: 'What changes between a test setup and production.' },
    ],
  },
  {
    id: 'explore',
    label: 'Explore',
    tagline: 'For researchers, architects, and evaluators',
    pages: [
      { slug: 'traditional-saas-subscriptions', title: 'Traditional SaaS subscriptions', description: 'Seats, tiers, and monthly recurring revenue.' },
      { slug: 'ai-token-applications', title: 'AI / token applications', description: 'Metering model inference and usage-based cost.' },
      { slug: 'credit-based-products', title: 'Credit-based products', description: 'A single spendable balance across many actions.' },
      { slug: 'membership-platforms', title: 'Membership platforms', description: 'Recurring access to a community or content library.' },
      { slug: 'usage-based-services', title: 'Usage-based services', description: 'Pay-as-you-go pricing tied to metered consumption.' },
      { slug: 'add-ons', title: 'Add-ons', description: 'Optional extras layered on top of a base plan.' },
      { slug: 'team-accounts', title: 'Team accounts', description: 'Multiple people, one workspace, shared billing.' },
    ],
  },
  {
    id: 'operate',
    label: 'Operate',
    tagline: 'Running APEX after launch',
    pages: [
      { slug: 'customer-lookup', title: 'Customer lookup', description: 'Find a customer and see their plan, credits, and history.' },
      { slug: 'payment-failures-and-cancellations', title: 'Payment failures & cancellations', description: 'What happens when a card declines or a customer leaves.' },
      { slug: 'access-changes-and-credit-corrections', title: 'Access changes & credit corrections', description: 'Manually adjust what a customer can do, and why.' },
      { slug: 'event-history', title: 'Event history', description: 'The audit trail behind every access decision.' },
      { slug: 'support-workflows', title: 'Support workflows', description: 'Common support requests and how to resolve them.' },
      { slug: 'debugging', title: 'Debugging', description: 'A customer says access is wrong. Find out why.' },
    ],
  },
  {
    id: 'reference',
    label: 'Reference',
    tagline: 'Precise technical detail',
    pages: [
      { slug: 'api-overview', title: 'API overview & authentication', description: 'Base URL, auth, environments, and request shape.' },
      { slug: 'requests-and-responses', title: 'Requests, responses & errors', description: 'Object shapes, status codes, and error formats.' },
      { slug: 'events-and-webhooks', title: 'Events & webhooks', description: 'Every event type APEX would emit, and their payloads.' },
      { slug: 'data-model', title: 'Data model', description: 'The real schema: every table, column, and relationship.' },
      { slug: 'limits', title: 'Limits', description: 'Rate limits, sizing limits, and plan boundaries.' },
      { slug: 'terminology', title: 'Terminology', description: 'Field names and object types, precisely defined.' },
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
