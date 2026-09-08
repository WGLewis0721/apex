import { ReactNode, useState } from 'react';
import { AlertTriangle, Check, Copy, FlaskConical, Info, Lightbulb, ShieldAlert, Sparkles } from 'lucide-react';

/* ---------------------------------------------------------------------- *
 * Headings — plain <h2>/<h3> with a stable, deep-linkable id. The docs
 * shell scans the rendered page for these ids to build the on-page TOC,
 * so every heading that should appear there must go through H2/H3.
 * ---------------------------------------------------------------------- */

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function PageHeader({ eyebrow, title, lede, status }: { eyebrow: string; title: ReactNode; lede: ReactNode; status?: { kind: CalloutKind; label: string } }) {
  return (
    <header>
      <p className="ap-eyebrow docs-home-eyebrow">{eyebrow}</p>
      <h1 className="docs-h1">{title}</h1>
      {status && <p><StatusPill kind={status.kind}>{status.label}</StatusPill></p>}
      <p className="docs-kicker">{lede}</p>
    </header>
  );
}

/** Builds a same-page deep link for a heading/TOC anchor, e.g. #docs/learn/credits-and-usage?h=example. */
export function anchorHref(id: string): string {
  const path = window.location.hash.split('?')[0].replace(/^#/, '');
  return `#${path}?h=${id}`;
}

/** Jumps to an in-page anchor without losing the current section/page route. */
export function jumpToAnchor(id: string, e: { preventDefault: () => void }) {
  e.preventDefault();
  window.location.hash = anchorHref(id).slice(1);
  document.getElementById(id)?.scrollIntoView({ block: 'start' });
}

export function H2({ children, id }: { children: ReactNode; id?: string }) {
  const anchor = id ?? slugify(String(children));
  return (
    <h2 id={anchor} className="docs-h2" data-toc="2">
      <a href={anchorHref(anchor)} onClick={(e) => jumpToAnchor(anchor, e)} className="docs-anchor" aria-hidden="true" tabIndex={-1}>#</a>
      {children}
    </h2>
  );
}

export function H3({ children, id }: { children: ReactNode; id?: string }) {
  const anchor = id ?? slugify(String(children));
  return (
    <h3 id={anchor} className="docs-h3" data-toc="3">
      <a href={anchorHref(anchor)} onClick={(e) => jumpToAnchor(anchor, e)} className="docs-anchor" aria-hidden="true" tabIndex={-1}>#</a>
      {children}
    </h3>
  );
}

/* ---------------------------------------------------------------------- *
 * Callouts / status badges — matches the existing "SIMULATED DATA" /
 * "API design preview" badge language already used across the product.
 * ---------------------------------------------------------------------- */

export type CalloutKind = 'note' | 'tip' | 'warning' | 'planned' | 'simulated';

const CALLOUT_META: Record<CalloutKind, { icon: typeof Info; label: string }> = {
  note: { icon: Info, label: 'Note' },
  tip: { icon: Lightbulb, label: 'Tip' },
  warning: { icon: AlertTriangle, label: 'Warning' },
  planned: { icon: FlaskConical, label: 'Planned — not yet built' },
  simulated: { icon: Sparkles, label: 'Simulated in this demo' },
};

export function Callout({ kind = 'note', title, children }: { kind?: CalloutKind; title?: string; children: ReactNode }) {
  const meta = CALLOUT_META[kind];
  const Icon = meta.icon;
  return (
    <div className={`docs-callout is-${kind}`} role={kind === 'warning' ? 'alert' : 'note'}>
      <Icon size={16} aria-hidden="true" />
      <div>
        <b>{title ?? meta.label}</b>
        <div>{children}</div>
      </div>
    </div>
  );
}

/** Small inline pill for use in prose or page headers, e.g. "Design preview". */
export function StatusPill({ kind = 'planned', children }: { kind?: CalloutKind; children: ReactNode }) {
  return <span className={`docs-pill is-${kind}`}>{children}</span>;
}

/* ---------------------------------------------------------------------- *
 * Numbered procedures.
 * ---------------------------------------------------------------------- */

export interface Step {
  title: string;
  body: ReactNode;
}

export function Steps({ items }: { items: Step[] }) {
  return (
    <ol className="docs-steps">
      {items.map((step, i) => (
        <li key={i}>
          <span className="docs-step-num">{i + 1}</span>
          <div>
            <b>{step.title}</b>
            <div>{step.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ---------------------------------------------------------------------- *
 * Code blocks with a copy button.
 * ---------------------------------------------------------------------- */

export function CodeBlock({ code, language, caption }: { code: string; language?: string; caption?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setFailed(false);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="docs-code">
      <div className="docs-code-top">
        <span>{language ?? 'text'}</span>
        <button type="button" onClick={copy} aria-label="Copy code">
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre><code>{code}</code></pre>
      {(caption || failed) && (
        <p className="docs-code-caption">{failed ? 'Clipboard unavailable — select the code to copy it.' : caption}</p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- *
 * Responsive data tables — wrapped in a scroll container so wide tables
 * never force the page to scroll horizontally.
 * ---------------------------------------------------------------------- */

export function DataTable({ head, rows, caption }: { head: string[]; rows: (ReactNode[])[]; caption?: string }) {
  return (
    <div className="docs-table-wrap">
      {caption && <p className="docs-table-caption">{caption}</p>}
      <table className="docs-table">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------------------- *
 * "What just happened?" example walkthrough — the shared component behind
 * every worked example (Jordan buys credits, a webhook fires, etc).
 * ---------------------------------------------------------------------- */

export interface WalkthroughStage {
  label: string;
  detail: ReactNode;
}

export function ExampleWalkthrough({ title, stages, footer }: { title: string; stages: WalkthroughStage[]; footer?: ReactNode }) {
  return (
    <figure className="docs-walkthrough" aria-label={title}>
      <figcaption>{title}</figcaption>
      <ol>
        {stages.map((s, i) => (
          <li key={i}>
            <span className="docs-walk-num">{i + 1}</span>
            <div><b>{s.label}</b><div>{s.detail}</div></div>
          </li>
        ))}
      </ol>
      {footer && <div className="docs-walk-footer">{footer}</div>}
    </figure>
  );
}

/* ---------------------------------------------------------------------- *
 * A minimal boxes-and-arrows diagram, built from CSS rather than an image,
 * so it stays crisp, themeable, and accessible at any width.
 * ---------------------------------------------------------------------- */

export function FlowDiagram({ nodes, label }: { nodes: { title: string; detail?: string }[]; label: string }) {
  return (
    <div className="docs-flow" role="img" aria-label={label}>
      {nodes.map((n, i) => (
        <div className="docs-flow-item" key={i}>
          <div className="docs-flow-box">
            <b>{n.title}</b>
            {n.detail && <span>{n.detail}</span>}
          </div>
          {i < nodes.length - 1 && <span className="docs-flow-arrow" aria-hidden="true">→</span>}
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------- *
 * Warning / caution banner for destructive or easy-to-misuse behavior.
 * ---------------------------------------------------------------------- */

export function DangerNote({ children }: { children: ReactNode }) {
  return (
    <div className="docs-callout is-danger" role="alert">
      <ShieldAlert size={16} aria-hidden="true" />
      <div><b>Careful</b><div>{children}</div></div>
    </div>
  );
}

/* ---------------------------------------------------------------------- *
 * Cross-link card, used for "see also" links between Learn and Reference.
 * ---------------------------------------------------------------------- */

export function SeeAlso({ items }: { items: { href: string; title: string; description: string }[] }) {
  return (
    <div className="docs-seealso">
      <b>See also</b>
      <div>
        {items.map((it) => (
          <a href={it.href} key={it.href}>
            <span>{it.title}</span>
            <small>{it.description}</small>
          </a>
        ))}
      </div>
    </div>
  );
}
