import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronRight, Menu, Search, X } from 'lucide-react';
import { DocSection, FLAT_PAGES, SECTIONS, adjacentPages, pagePath } from './nav';
import { anchorHref, jumpToAnchor } from './primitives';
import '../docs.css';

interface TocItem { id: string; text: string; level: 2 | 3; }

export function DocsShell({
  sectionId,
  slug,
  anchor,
  children,
}: {
  sectionId: string;
  slug: string | null;
  anchor: string | null;
  children: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [progress, setProgress] = useState(0);
  const [activeHeading, setActiveHeading] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const section = SECTIONS.find((s) => s.id === sectionId) ?? null;
  const page = section?.pages.find((p) => p.slug === slug) ?? null;
  const { prev, next } = slug ? adjacentPages(sectionId, slug) : { prev: null, next: null };

  // Scroll to top (or to the deep-linked anchor) whenever the page changes.
  useEffect(() => {
    setSidebarOpen(false);
    const raf = requestAnimationFrame(() => {
      if (anchor) {
        const el = document.getElementById(anchor);
        if (el) { el.scrollIntoView({ block: 'start' }); return; }
      }
      window.scrollTo(0, 0);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId, slug]);

  // Scan the rendered content for headings to build the on-page TOC.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) { setToc([]); return; }
    const headings = Array.from(el.querySelectorAll<HTMLElement>('h2[id][data-toc], h3[id][data-toc]'));
    setToc(headings.map((h) => ({ id: h.id, text: h.textContent?.replace(/^#/, '').trim() ?? '', level: h.dataset.toc === '3' ? 3 : 2 })));
  }, [sectionId, slug, children]);

  // Reading progress + scrollspy for the active TOC entry.
  useEffect(() => {
    function onScroll() {
      const el = contentRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const scrolled = Math.min(1, Math.max(0, (0 - rect.top) / Math.max(1, total)));
      setProgress(scrolled);

      const headings = Array.from(el.querySelectorAll<HTMLElement>('h2[id][data-toc], h3[id][data-toc]'));
      let current: string | null = null;
      for (const h of headings) {
        if (h.getBoundingClientRect().top < 140) current = h.id;
      }
      setActiveHeading(current);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [sectionId, slug]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return FLAT_PAGES.filter((f) =>
      f.page.title.toLowerCase().includes(q) ||
      f.page.description.toLowerCase().includes(q) ||
      f.section.label.toLowerCase().includes(q) ||
      f.page.keywords?.some((k) => k.toLowerCase().includes(q)),
    ).slice(0, 8);
  }, [query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') { setQuery(''); searchRef.current?.blur(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="ap-site docs-root">
      <a className="ap-skip" href="#docs-main">Skip to content</a>
      <div className="docs-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />

      <header className="ap-nav docs-nav">
        <button className="docs-menu-btn" aria-label="Toggle navigation" onClick={() => setSidebarOpen((v) => !v)}>
          {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <a className="ap-logo docs-logo" href="#" aria-label="APEX home">APEX<span className="docs-logo-tag">Docs</span></a>
        <div className="docs-search">
          <Search size={15} aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search docs… (press /)"
            aria-label="Search documentation"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <div className="docs-search-results" role="listbox">
              {results.length ? results.map((r) => (
                <a
                  key={`${r.section.id}/${r.page.slug}`}
                  href={pagePath(r.section.id, r.page.slug)}
                  onClick={() => setQuery('')}
                >
                  <span>{r.page.title}</span>
                  <small>{r.section.label} · {r.page.description}</small>
                </a>
              )) : <p className="docs-search-empty">No pages match “{query}”.</p>}
            </div>
          )}
        </div>
        <a className="ap-text-button docs-exit" href="#"><ArrowLeft size={14} /> APEX home</a>
      </header>

      <div className="docs-layout">
        <nav className={`docs-sidebar ${sidebarOpen ? 'is-open' : ''}`} aria-label="Documentation sections">
          {SECTIONS.map((s) => <SidebarSection key={s.id} section={s} activeSectionId={sectionId} activeSlug={slug} />)}
        </nav>

        <main id="docs-main" className="docs-content-col">
          {page && (
            <p className="docs-breadcrumb">
              <a href="#docs">Docs</a>
              <ChevronRight size={12} />
              <a href={`#docs/${sectionId}`}>{section?.label}</a>
              <ChevronRight size={12} />
              <span>{page.title}</span>
            </p>
          )}

          <div className="docs-article" ref={contentRef}>
            {children}
          </div>

          {page && (
            <nav className="docs-prevnext" aria-label="Page navigation">
              {prev ? (
                <a href={pagePath(prev.section.id, prev.page.slug)} className="docs-prevnext-link is-prev">
                  <span><ArrowLeft size={13} /> Previous</span>
                  <b>{prev.page.title}</b>
                </a>
              ) : <span />}
              {next ? (
                <a href={pagePath(next.section.id, next.page.slug)} className="docs-prevnext-link is-next">
                  <span>Next <ArrowRight size={13} /></span>
                  <b>{next.page.title}</b>
                </a>
              ) : <span />}
            </nav>
          )}
        </main>

        {page && toc.length > 1 && (
          <aside className="docs-toc" aria-label="On this page">
            <b>On this page</b>
            <ul>
              {toc.map((t) => (
                <li key={t.id} className={t.level === 3 ? 'is-sub' : ''}>
                  <a href={anchorHref(t.id)} onClick={(e) => jumpToAnchor(t.id, e)} aria-current={activeHeading === t.id ? 'location' : undefined}>{t.text}</a>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
      {sidebarOpen && <button className="docs-sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    </div>
  );
}

function SidebarSection({ section, activeSectionId, activeSlug }: { section: DocSection; activeSectionId: string; activeSlug: string | null }) {
  const isActiveSection = section.id === activeSectionId;
  return (
    <div className={`docs-sidebar-section ${isActiveSection ? 'is-active' : ''}`}>
      <a href={`#docs/${section.id}`} className="docs-sidebar-heading">{section.label}</a>
      <ul>
        {section.pages.map((p) => (
          <li key={p.slug}>
            <a href={pagePath(section.id, p.slug)} aria-current={isActiveSection && p.slug === activeSlug ? 'page' : undefined}>
              {p.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
