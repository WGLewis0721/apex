import { DataTable, FlowDiagram, H2, PageHeader, SeeAlso } from '../primitives';

interface UseCase {
  slug: string;
  title: string;
  lede: string;
  journey: { title: string; detail: string }[];
  configuration: { label: string; value: string }[];
  architecture: string;
  advantages: string[];
  limitations: string[];
  considerations: string[];
  seeAlso?: { href: string; title: string; description: string }[];
}

function UseCasePage({ uc }: { uc: UseCase }) {
  return (
    <>
      <PageHeader eyebrow="EXPLORE" title={uc.title} lede={uc.lede} />

      <H2>Customer journey</H2>
      <FlowDiagram label={`${uc.title} customer journey`} nodes={uc.journey.map((j) => ({ title: j.title, detail: j.detail }))} />

      <H2>APEX configuration</H2>
      <DataTable head={['Concept', 'How it’s configured']} rows={uc.configuration.map((c) => [<b>{c.label}</b>, c.value])} />

      <H2>Architecture</H2>
      <p>{uc.architecture}</p>

      <H2>Advantages</H2>
      <ul>{uc.advantages.map((a) => <li key={a}>{a}</li>)}</ul>

      <H2>Limitations</H2>
      <ul>{uc.limitations.map((a) => <li key={a}>{a}</li>)}</ul>

      <H2>Implementation considerations</H2>
      <ul>{uc.considerations.map((a) => <li key={a}>{a}</li>)}</ul>

      {uc.seeAlso && <SeeAlso items={uc.seeAlso} />}
    </>
  );
}

const USE_CASES: UseCase[] = [
  {
    slug: 'traditional-saas-subscriptions',
    title: 'Traditional SaaS subscriptions',
    lede: 'Seats, tiers, and monthly recurring revenue — the model most B2B software still runs on.',
    journey: [
      { title: 'Picks a tier', detail: 'e.g. Team, $49/seat' },
      { title: 'Adds teammates', detail: 'seat count grows' },
      { title: 'Renews monthly', detail: 'Stripe charges automatically' },
      { title: 'Upgrades tier', detail: 'unlocks more features' },
    ],
    configuration: [
      { label: 'Plans', value: 'One plan per tier (Starter, Team, Enterprise), each with its own price.' },
      { label: 'Entitlements', value: 'Feature flags per tier (SSO on Enterprise only) and numeric limits (seat count, projects).' },
      { label: 'Credits', value: 'Usually not needed — access is tier-based, not consumption-based.' },
    ],
    architecture: 'Nearly the whole model lives in plans and plan_features. Access checks are mostly boolean ("does this plan include SSO?") rather than balance checks, which makes this the simplest use case to reason about.',
    advantages: [
      'Predictable revenue and predictable customer cost — easy for both sides to plan around.',
      'Simple access checks: mostly feature flags, not running balances.',
      'Upgrades and downgrades map directly onto entitlement changes.',
    ],
    limitations: [
      'Doesn\'t naturally handle highly variable usage — a light user and a heavy user on the same tier pay the same.',
      'Seat-based pricing can undercount value for products where usage varies more than headcount.',
    ],
    considerations: [
      'Decide early whether seat count is enforced at signup time or checked continuously — the schema supports either via plan_features limits.',
      'Plan changes usually take effect immediately for upgrades and at the next period for downgrades — decide and document which.',
    ],
    seeAlso: [{ href: '#docs/learn/entitlements', title: 'Learn: Entitlements', description: 'The mechanism tiers are built from.' }],
  },
  {
    slug: 'ai-token-applications',
    title: 'AI / token applications',
    lede: 'Metering model inference, where cost tracks usage far more directly than in traditional software.',
    journey: [
      { title: 'Subscribes or pays as they go', detail: 'plan grants a token/credit allowance' },
      { title: 'Sends a request', detail: 'a prompt, an inference call' },
      { title: 'Usage is metered', detail: 'often per input+output token' },
      { title: 'Balance drops', detail: 'until topped up or renewed' },
    ],
    configuration: [
      { label: 'Plans', value: 'A base allowance per period (e.g. 100,000 tokens/month on Pro).' },
      { label: 'Credits', value: 'The primary mechanism — usage is metered per request via usage_events, drawn down against credit_grants.' },
      { label: 'Entitlements', value: 'Often just "which models are available," layered on top of the token balance.' },
    ],
    architecture: 'This is the use case credits and usage_events were designed for most directly — high request volume, fine-grained metering, and a balance that needs to be checked before every single request, not just at signup.',
    advantages: [
      'Cost and price can track each other closely, since both scale with actual usage.',
      'A single credit balance can span multiple models or features with different per-unit costs.',
      'Fine-grained usage_events give precise cost attribution after the fact.',
    ],
    limitations: [
      'Customers can find token-based pricing hard to predict compared to a flat monthly fee.',
      'High request volume means the access-check path needs to be fast — this is the use case most sensitive to access-check latency.',
    ],
    considerations: [
      'Decide the "cost" of different actions up front (an image generation might cost 10x a short text completion) — this maps to quantity on the usage event, not a separate feature.',
      'Consider whether to deny or degrade when a customer runs out mid-session, rather than failing a request outright.',
    ],
    seeAlso: [{ href: '#docs/learn/credits-and-usage', title: 'Learn: Credits and usage', description: 'The Jordan example this use case is closest to.' }],
  },
  {
    slug: 'credit-based-products',
    title: 'Credit-based products',
    lede: 'A single spendable balance that covers several different actions, each at its own cost.',
    journey: [
      { title: 'Buys a credit pack', detail: 'or gets credits with a plan' },
      { title: 'Spends across features', detail: 'exports, generations, downloads' },
      { title: 'Balance runs low', detail: 'product warns before zero' },
      { title: 'Tops up', detail: 'buys more without changing plan' },
    ],
    configuration: [
      { label: 'Credits', value: 'One shared credit_grants balance, consumed by usage_events tagged with different feature_ids at different quantities.' },
      { label: 'Plans', value: 'Often just "how many credits you start with" — the interesting logic is in what things cost, not the plan itself.' },
    ],
    architecture: 'Multiple features draw from the same balance. credit_consumptions links each spend back to both the grant it came from and the usage event that caused it, so a single balance can be fully explained after the fact.',
    advantages: [
      'One number for the customer to track, no matter how many different actions exist.',
      'New features can be priced in credits without introducing a new billing concept.',
      'Top-ups are a simple, well-understood purchase — Forma\'s "buy 10 more" button is exactly this.',
    ],
    limitations: [
      'A single balance can obscure which specific feature is driving cost or usage without good reporting.',
      'Pricing different actions in credits requires ongoing calibration as costs change.',
    ],
    considerations: [
      'Decide a draw-down order when a customer has multiple active grants (e.g. plan allowance before purchased top-ups, or oldest-expiring first).',
      'Show customers a breakdown, not just a total — event_history exists for exactly this.',
    ],
    seeAlso: [{ href: '#docs/build/configure-credits', title: 'Build: Configure credits', description: 'How grants and top-ups are set up.' }],
  },
  {
    slug: 'membership-platforms',
    title: 'Membership platforms',
    lede: 'Recurring access to a community, a content library, or a set of ongoing benefits — access is the product, not a metered action.',
    journey: [
      { title: 'Joins a tier', detail: 'e.g. Member, Founding Member' },
      { title: 'Gets ongoing access', detail: 'content, community, events' },
      { title: 'Renews or lapses', detail: 'access follows payment status directly' },
    ],
    configuration: [
      { label: 'Plans', value: 'Membership tiers, often with a single price and no usage dimension at all.' },
      { label: 'Entitlements', value: 'Mostly boolean unlocks — access to a space, a library, an event tier.' },
      { label: 'Credits', value: 'Rarely needed; occasionally used for something like "2 guest passes per month."' },
    ],
    architecture: 'The simplest architecture of any use case here: subscription status essentially is access. The main thing to get right is how quickly access should follow a status change — immediately on cancellation, or through to the end of the paid period.',
    advantages: [
      'Very simple access checks — often just "is the subscription active."',
      'Easy for members to understand what they\'re paying for.',
    ],
    limitations: [
      'Doesn\'t differentiate engagement — a member who logs in daily and one who never returns pay the same.',
      'Less natural fit if the platform later wants to add metered or premium add-on features.',
    ],
    considerations: [
      'Decide explicitly whether cancellation ends access immediately or at the end of the paid period — this is a product decision APEX doesn\'t make for you.',
      'If guest passes or occasional perks are added later, they fit naturally as a small credit grant layered on top.',
    ],
    seeAlso: [{ href: '#docs/learn/customer-lifecycle', title: 'Learn: Customer lifecycle', description: 'Exactly the states that drive access here.' }],
  },
  {
    slug: 'usage-based-services',
    title: 'Usage-based services',
    lede: 'Pay-as-you-go pricing tied directly to metered consumption — no plan tier at all in the simplest version.',
    journey: [
      { title: 'Connects, no upfront plan', detail: 'or a minimal base plan' },
      { title: 'Uses the service', detail: 'API calls, storage, compute time' },
      { title: 'Usage accumulates', detail: 'tracked per period' },
      { title: 'Billed for what was used', detail: 'at the end of the period' },
    ],
    configuration: [
      { label: 'Usage counters', value: 'usage_counters aggregates usage_events per customer, per feature, per period — the natural fit for "how much did they use this month."' },
      { label: 'Credits', value: 'Optional — some usage-based products also offer a prepaid credit option instead of postpaid billing.' },
    ],
    architecture: 'Unlike credit-based products, this model often bills after the fact rather than gating in real time. usage_counters exists specifically to support that: a running total per period, separate from any prepaid balance.',
    advantages: [
      'No friction from plan selection — customers pay for exactly what they use.',
      'Scales naturally from a hobby user to a heavy one without a plan change.',
    ],
    limitations: [
      'Harder for customers to predict their bill in advance compared to a flat plan.',
      'Needs careful handling of runaway usage — a bug in a customer\'s integration can generate a large, unexpected bill.',
    ],
    considerations: [
      'Decide whether to gate in real time (check access before every action) or only aggregate and bill afterward — usage_counters supports the latter; access_decisions the former.',
      'Consider spend caps or alerts as a safeguard against runaway usage, even in a postpaid model.',
    ],
    seeAlso: [{ href: '#docs/reference/data-model', title: 'Reference: Data model', description: 'usage_counters, exactly as defined.' }],
  },
  {
    slug: 'add-ons',
    title: 'Add-ons',
    lede: 'Optional extras a customer can attach to a base plan without changing their core subscription.',
    journey: [
      { title: 'Subscribes to a base plan', detail: 'e.g. Starter' },
      { title: 'Adds an optional extra', detail: 'e.g. extra storage, priority support' },
      { title: 'Both are billed together', detail: 'base + add-on' },
      { title: 'Removes the add-on anytime', detail: 'without affecting the base plan' },
    ],
    configuration: [
      { label: 'Features', value: 'An add-on is modeled as a feature that isn\'t tied to any single plan — it can be attached independently.' },
      { label: 'Entitlements', value: 'A plan_features-style row associates the add-on with the customer\'s subscription directly rather than through their base plan.' },
    ],
    architecture: 'The base plan and each add-on are conceptually independent entitlement sources that both feed into the same access decision for a customer — access checks don\'t care which source unlocked a feature, only that one did.',
    advantages: [
      'Lets customers customize spend without forcing a full plan change.',
      'New add-ons can be introduced without restructuring existing plan tiers.',
    ],
    limitations: [
      'More combinations to test — base plan × add-on state multiplies the number of access scenarios.',
      'Pricing and entitlement logic need to clearly define what happens if an add-on and a plan both grant the same feature.',
    ],
    considerations: [
      'Decide whether removing an add-on takes effect immediately or at the next billing period — same question as a downgrade.',
      'Keep add-on entitlements additive, not overriding, to avoid one add-on accidentally reducing what the base plan already grants.',
    ],
  },
  {
    slug: 'team-accounts',
    title: 'Team accounts',
    lede: 'Multiple people share one workspace, one subscription, and often one pooled usage balance.',
    journey: [
      { title: 'One person subscribes', detail: 'creates the team\'s subscription' },
      { title: 'Invites teammates', detail: 'each becomes a member' },
      { title: 'Usage is shared', detail: 'one balance, many contributors' },
      { title: 'Owner manages billing', detail: 'seats, plan, payment method' },
    ],
    configuration: [
      { label: 'Workspace', value: 'Maps closely onto APEX\'s own workspace/workspace_members model — a team account is a workspace, one level down, for a workspace\'s own customer.' },
      { label: 'Entitlements', value: 'A seat-count limit_value on plan_features, checked against workspace_members-equivalent rows.' },
      { label: 'Credits', value: 'Usually pooled — a single credit_grants balance shared by every member of the team.' },
    ],
    architecture: 'The access check is for "this team," not "this individual" — an individual\'s permission to act still needs a separate, simpler check (are they a member), but the underlying credits or limits belong to the team as a whole.',
    advantages: [
      'Matches how most B2B buyers think about billing — one invoice, one account, several users.',
      'Pooled usage means light and heavy users on the same team balance each other out.',
    ],
    limitations: [
      'Needs a separate membership/role model on top of billing — who can invite, remove, or change the plan.',
      'Pooled balances can make individual usage attribution harder without good per-member reporting.',
    ],
    considerations: [
      'Decide who can spend from the shared balance and who can only view it — this is a permissions question layered on top of, not replacing, the access decision.',
      'If seats are billed per member, seat count changes need the same "when does it take effect" decision as any other entitlement change.',
    ],
    seeAlso: [{ href: '#docs/reference/data-model', title: 'Reference: Data model', description: 'workspaces and workspace_members, the closest real analog.' }],
  },
];

export const EXPLORE_PAGES: Record<string, React.ComponentType> = Object.fromEntries(
  USE_CASES.map((uc) => [uc.slug, () => <UseCasePage uc={uc} />]),
);
