import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { DocsShell } from './DocsShell';
import { SECTIONS, pagePath } from './nav';
import { LEARN_PAGES } from './content/learn';
import { BUILD_PAGES } from './content/build';
import { EXPLORE_PAGES } from './content/explore';
import { OPERATE_PAGES } from './content/operate';
import { REFERENCE_PAGES } from './content/reference';

const REGISTRY: Record<string, Record<string, React.ComponentType>> = {
  learn: LEARN_PAGES,
  build: BUILD_PAGES,
  explore: EXPLORE_PAGES,
  operate: OPERATE_PAGES,
  reference: REFERENCE_PAGES,
};

function parseRoute(hash: string) {
  const [path, query] = hash.replace(/^#/, '').split('?');
  const segments = path.split('/').filter(Boolean); // ['docs', section?, slug?]
  const sectionId = segments[1] ?? null;
  const slug = segments[2] ?? null;
  const anchor = query ? new URLSearchParams(query).get('h') : null;
  return { sectionId, slug, anchor };
}

export default function DocsApp() {
  const [{ sectionId, slug, anchor }, setRoute] = useState(() => parseRoute(window.location.hash));

  useEffect(() => {
    const sync = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  let content: React.ReactNode;
  if (!sectionId) {
    content = <DocsHome />;
  } else if (!slug) {
    content = <SectionIndex sectionId={sectionId} />;
  } else {
    const Page = REGISTRY[sectionId]?.[slug];
    content = Page ? <Page /> : <NotFound sectionId={sectionId} />;
  }

  return (
    <DocsShell sectionId={sectionId ?? ''} slug={slug} anchor={anchor}>
      {content}
    </DocsShell>
  );
}

const STAGES = [
  { q: 'What is this?', a: 'Learn' },
  { q: 'Does it fit?', a: 'Explore' },
  { q: 'How will it work?', a: 'Build' },
  { q: 'How will I run it?', a: 'Operate' },
] as const;

function DocsHome() {
  return (
    <div className="docs-home">
      <p className="ap-eyebrow docs-home-eyebrow">APEX DOCS</p>
      <h1 className="docs-home-title">Stripe moves the money.<br />APEX knows what it unlocks.</h1>
      <p className="docs-home-lede">
        APEX is the payment-and-access layer for SaaS products that sell subscriptions, credits,
        tokens, coins, usage allowance, paid features, or add-ons. These docs explain the product
        from first principles, show the intended implementation, and clearly separate what is real
        today from what is still on the production roadmap.
      </p>

      <div className="docs-home-note">
        <b>Current production status · September 9, 2026</b><br />
        Real today: Supabase accounts, the multi-tenant schema, APEX's own Stripe test Checkout /
        verified webhook path, and paid workspace provisioning. Phase 5 customer Stripe connection
        is implemented in PR #16 but still needs Stripe App External-test registration and one real
        OAuth acceptance run. Hosted API, production credit ledger/usage, purchase packs, renewals,
        refunds, entitlement enforcement, SDK, customer balance UI, and live operator data remain
        planned phases.
      </div>

      <p className="docs-home-lede">
        The production promise is one coherent subsystem: <b>Stripe integration + credit ledger +
        usage metering + entitlements + purchase packs + renewals + refunds + audit history + API/SDK
        + customer balance UI.</b> The repository <code>ROADMAP.md</code> is the implementation source
        of truth and owns every acceptance gate.
      </p>

      <ol className="docs-home-stages">
        {STAGES.map((s, i) => (
          <li key={s.q}>
            <span>{i + 1}</span>
            <div><b>{s.q}</b><small>{s.a}</small></div>
          </li>
        ))}
      </ol>

      <div className="docs-home-grid">
        {SECTIONS.map((section) => (
          <a className="docs-home-card" key={section.id} href={`#docs/${section.id}`}>
            <b>{section.label}</b>
            <span>{section.tagline}</span>
            <small>{section.pages.length} pages</small>
            <ArrowRight size={15} />
          </a>
        ))}
      </div>

      <p className="docs-home-note">
        <b>Status language matters.</b> Schema/demo/UI existence does not prove production behavior.
        Anything beyond the current accepted phases should be read as <em>planned</em>, <em>design preview</em>,
        or <em>implemented but not yet accepted</em>. See <a href="#docs/reference/data-model">the data model</a>
        for the real schema foundation and the Build section for the planned Stripe → ledger → usage →
        balance → access path.
      </p>
    </div>
  );
}

function SectionIndex({ sectionId }: { sectionId: string }) {
  const section = SECTIONS.find((s) => s.id === sectionId);
  if (!section) return <NotFound sectionId={sectionId} />;
  return (
    <div className="docs-section-index">
      <p className="ap-eyebrow">{section.label.toUpperCase()}</p>
      <h1>{section.tagline}</h1>
      <ul className="docs-section-list">
        {section.pages.map((p) => (
          <li key={p.slug}>
            <a href={pagePath(section.id, p.slug)}>
              <b>{p.title}</b>
              <span>{p.description}</span>
              <ArrowRight size={15} />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NotFound({ sectionId }: { sectionId: string }) {
  return (
    <div className="docs-home">
      <h1>Page not found</h1>
      <p>There's no page at <code>#docs/{sectionId}</code>. <a href="#docs">Back to Docs home</a>.</p>
    </div>
  );
}
