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
  { q: 'I understand it.', a: 'Explore' },
  { q: 'I can build with it.', a: 'Build' },
  { q: 'I can troubleshoot it.', a: 'Operate' },
] as const;

function DocsHome() {
  return (
    <div className="docs-home">
      <p className="ap-eyebrow docs-home-eyebrow">APEX DOCS</p>
      <h1 className="docs-home-title">Go from “what is this?”<br />to a working implementation.</h1>
      <p className="docs-home-lede">
        These docs are built to be read in order or dipped into directly. <b>Learn</b> teaches APEX
        from first principles with worked examples. <b>Build</b> turns that understanding into
        implementation steps. <b>Explore</b> is for evaluating whether APEX fits your product.{' '}
        <b>Operate</b> covers what happens after launch. <b>Reference</b> is precise technical detail
        for when you already know what you're looking for.
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
        Written against the real APEX schema and demo code. Anything not yet built is labeled
        <em> planned</em> or <em> design preview</em> — see <a href="#docs/reference/data-model">the data model</a> for
        what's actually live today.
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
