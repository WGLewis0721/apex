import { CSSProperties, lazy, Suspense, useEffect, useReducer, useRef, useState } from 'react';
import { ArrowRight, Check, CheckCircle2, ChevronRight, CirclePlay, Code2, Copy, CreditCard, ExternalLink, Gauge, Layers, Maximize2, Pause, Play, Plus, RotateCcw, Sparkles, X } from 'lucide-react';
import { allowance, embeddedReducer, initialEmbedded, plans } from './lib/embeddedDemo';
import './product.css';

const Console = lazy(() => import('./App'));
const asset = (name: string) => `/apex/assets/${name}`;
const themes = [ { name: 'Indigo', color: '#635bff' }, { name: 'Forest', color: '#087f64' }, { name: 'Cobalt', color: '#006fe8' }, { name: 'Graphite', color: '#252529' } ];
const chapters = [ ['Connect', 0], ['Subscribe', 6], ['Track usage', 12], ['Upgrade', 21], ['Make it yours', 28] ] as const;

export default function ProductSite() {
  const [consoleOpen, setConsoleOpen] = useState(() => window.location.hash === '#console');
  const [filmOpen, setFilmOpen] = useState(false);
  const film = useRef<HTMLDialogElement>(null);
  const fullVideo = useRef<HTMLVideoElement>(null);
  const preview = useRef<HTMLVideoElement>(null);
  const watchButton = useRef<HTMLButtonElement>(null);
  const manuallyPaused = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [chapter, setChapter] = useState(0);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => { const sync = () => setConsoleOpen(window.location.hash === '#console'); window.addEventListener('hashchange', sync); return () => window.removeEventListener('hashchange', sync); }, []);
  useEffect(() => {
    if (consoleOpen || filmOpen) return;
    const el = preview.current; if (!el) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || motion.matches || manuallyPaused.current) el.pause();
      else void el.play().catch(() => setPlaying(false));
    }, { threshold: 0.2 });
    observer.observe(el);
    const reduce = () => { if (motion.matches) el.pause(); };
    motion.addEventListener('change', reduce);
    return () => { observer.disconnect(); motion.removeEventListener('change', reduce); };
  }, [consoleOpen, filmOpen]);
  useEffect(() => {
    if (filmOpen) { film.current?.showModal(); preview.current?.pause(); if (fullVideo.current) { fullVideo.current.currentTime = 0; void fullVideo.current.play().catch(() => {}); } document.body.style.overflow = 'hidden'; }
    else { film.current?.close(); fullVideo.current?.pause(); document.body.style.overflow = ''; }
    return () => { document.body.style.overflow = ''; };
  }, [filmOpen]);
  function closeFilm() { setFilmOpen(false); watchButton.current?.focus(); }
  if (consoleOpen) return <><div className="ap-console-return"><a href="#">← APEX home</a><span>Advanced sandbox · simulated data</span></div><Suspense fallback={<p className="ap-loading">Opening the sandbox…</p>}><Console /></Suspense></>;
  return <div className="ap-site">
    <a className="ap-skip" href="#main">Skip to content</a>
    <header className="ap-nav"><a className="ap-logo" href="#" aria-label="APEX home">APEX</a><nav aria-label="Main navigation"><a href="#product">Product</a><a href="#how-it-works">How it works</a><a href="#developers">Developers</a></nav><a className="ap-nav-cta" href="#playground">Try the demo <ArrowRight size={14}/></a></header>
    <main id="main">
      <section className="ap-hero">
        <p className="ap-eyebrow"><span/> PAYMENTS. SUBSCRIPTIONS. USAGE.</p>
        <h1>Your product.<br/><span>Ready for business.</span></h1>
        <p className="ap-hero-copy">Payments, credits, and token tracking.<br className="ap-desktop-break"/> One service. Built right into your app.</p>
        <div className="ap-hero-actions"><a className="ap-button" href="#playground">Make it yours <ArrowRight size={17}/></a><button ref={watchButton} className="ap-text-button" onClick={() => setFilmOpen(true)}>Watch the film <CirclePlay size={21}/></button></div>
        <div className="ap-film-wrap">
          <div className="ap-film-frame">
            <video ref={preview} muted loop playsInline preload="metadata" poster={asset('apex-film-poster.jpg')} aria-label="APEX product film: connect payments, track tokens, upgrade and customize your app" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setVideoFailed(true)} onTimeUpdate={e => { const t = e.currentTarget.currentTime; setChapter(chapters.reduce((n, c, i) => t >= c[1] ? i : n, 0)); }}><source src={asset('apex-product-film.mp4')} type="video/mp4"/><track kind="captions" src={asset('apex-film.vtt')} srcLang="en" label="English"/>Your browser does not support embedded video.</video>
            <div className="ap-film-top"><span><span className="ap-small-dot"/> THE APEX EXPERIENCE</span><span>SIMULATED DATA</span></div>
            <div className="ap-film-bottom"><span>Less plumbing. More product.</span><div><button aria-label={playing ? 'Pause hero video' : 'Play hero video'} onClick={() => { const el = preview.current; if (el) { if (el.paused) { manuallyPaused.current = false; void el.play().catch(() => setVideoFailed(true)); } else { manuallyPaused.current = true; el.pause(); } } }}>{playing ? <Pause size={17}/> : <Play size={17}/>}</button><button aria-label="Open full product film" onClick={() => setFilmOpen(true)}><Maximize2 size={17}/></button></div></div>
          </div>
          {videoFailed && <p className="ap-video-fallback">Video unavailable in this browser. <a href={asset('apex-product-film.mp4')}>Open the MP4 film</a> or try the interactive demo below.</p>}
          <div className="ap-chapters" aria-label="Video chapters">{chapters.map(([name, time], i) => <button key={name} aria-current={chapter === i ? 'step' : undefined} className={chapter === i ? 'is-active' : ''} onClick={() => { if (preview.current) { manuallyPaused.current = false; preview.current.currentTime = time; void preview.current.play().catch(() => {}); } }}><span>0{i + 1}</span>{name}</button>)}</div>
        </div>
        <p className="ap-underfilm">Your payment provider processes the money. APEX keeps the product in sync.</p>
      </section>
      <section className="ap-product ap-container" id="product"><div className="ap-section-heading"><p className="ap-eyebrow">THE BORING PART. BEAUTIFULLY HANDLED.</p><h2>Everything that happens<br/>after “subscribe.”</h2><p>One place to manage what customers pay for,<br className="ap-desktop-break"/> what they use, and what they can do next.</p></div>
        <div className="ap-feature-grid">
          <article className="ap-feature-card"><div className="ap-feature-icon"><CreditCard/></div><h3>Payments, in view.</h3><p>Subscriptions, renewals, and payment status. Connected to the customer behind every transaction.</p><div className="ap-payment-example"><span className="ap-avatar-small">AC</span><div><b>Acme Studio</b><small>Pro subscription</small></div><div><b>$79.00</b><small className="ap-green">● Paid</small></div></div><div className="ap-mini-note"><CheckCircle2 size={14}/> Plan access updated</div></article>
          <article className="ap-feature-card"><div className="ap-feature-icon"><Gauge/></div><h3>Every token counts.</h3><p>Meter tokens, API calls, or your own credits. Give customers a clear balance and a way to get more.</p><div className="ap-mini-meter"><div><span>AI tokens</span><b>750 <small>/ 1,000</small></b></div><div className="ap-track"><span style={{ width: '75%' }}/></div><small>250 tokens ready for your next idea.</small></div></article>
          <article className="ap-feature-card"><div className="ap-feature-icon"><Layers/></div><h3>Entirely your look.</h3><p>Embedded billing, usage meters, and upgrade prompts. Your developers make every detail feel native.</p><div className="ap-mini-themes"><div style={{ '--embed-accent': '#635bff' } as CSSProperties}>Forma<span>Upgrade plan <ArrowRight size={12}/></span></div><div style={{ '--embed-accent': '#087f64' } as CSSProperties}>studio<span>Upgrade plan <ArrowRight size={12}/></span></div></div></article>
        </div>
      </section>
      <Playground/>
      <section className="ap-how ap-container" id="how-it-works"><p className="ap-eyebrow">A SHORTER PATH TO PAID.</p><h2>You build the product.<br/><span>We handle the moving parts.</span></h2><div className="ap-steps"><article><span>01</span><h3>Connect payments.</h3><p>Link your payment provider so subscriptions and payment events have a home.</p></article><article><span>02</span><h3>Set the rules.</h3><p>Define plans, included usage, credits, and what happens at the limit.</p></article><article><span>03</span><h3>Make it feel native.</h3><p>Embed the customer experience. Match your brand. Send usage from your backend.</p></article></div></section>
      <DeveloperSection/>
      <section className="ap-final-cta"><p className="ap-eyebrow">YOUR APP. YOUR BRAND. APEX UNDERNEATH.</p><h2>Build what makes<br/>your product yours.</h2><a href="#playground" className="ap-button">Explore the experience <ArrowRight size={17}/></a></section>
    </main>
    <footer className="ap-footer ap-container"><a href="#" className="ap-logo">APEX</a><p>Embedded payments & usage infrastructure.</p><a href="#console">Advanced sandbox <ExternalLink size={13}/></a><small>Product preview. All transactions are simulated.</small></footer>
    <dialog ref={film} className="ap-film-dialog" aria-label="APEX product walkthrough" onCancel={closeFilm} onClick={e => { if (e.target === e.currentTarget) closeFilm(); }}><button autoFocus className="ap-close-film" aria-label="Close film" onClick={closeFilm}><X/></button>{filmOpen && <video ref={fullVideo} controls playsInline preload="metadata" poster={asset('apex-film-poster.jpg')}><source src={asset('apex-product-film.mp4')} type="video/mp4"/><track kind="captions" src={asset('apex-film.vtt')} srcLang="en" label="English" default/></video>}<p>APEX product walkthrough · 36 seconds · simulated data · silent film</p></dialog>
  </div>;
}

function Playground() {
  const [state, dispatch] = useReducer(embeddedReducer, undefined, initialEmbedded);
  const [brand, setBrand] = useState('Forma');
  const [theme, setTheme] = useState(themes[0]);
  const [dark, setDark] = useState(false);
  const [rounded, setRounded] = useState(true);
  const [tab, setTab] = useState<'appearance' | 'activity'>('appearance');
  const [appTab, setAppTab] = useState<'workspace' | 'billing'>('workspace');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const limit = allowance(state), remaining = Math.max(0, limit - state.used);
  const pct = limit ? Math.min(100, state.used / limit * 100) : 0;
  const latest = state.events[0];
  const successful = state.events.find(e => e.type === 'usage.recorded');
  const total = state.events.reduce((n, e) => n + (e.amount ?? 0), 0);
  async function copyTheme() { try { await navigator.clipboard.writeText(JSON.stringify({ brand: brand.trim() || 'Your app', accent: theme.color, mode: dark ? 'dark' : 'light', borderRadius: rounded ? 20 : 6 }, null, 2)); setCopied(true); setCopyError(false); window.setTimeout(() => setCopied(false), 2200); } catch { setCopyError(true); } }
  return <section className="ap-playground-section" id="playground"><div className="ap-container"><div className="ap-playground-heading"><div><p className="ap-eyebrow">DON’T JUST WATCH. TRY IT.</p><h2>Meet your new<br/><span>billing experience.</span></h2></div><p>Change the look. Buy a plan. Use some tokens.<br/>It all stays connected.</p></div>
    <div className="ap-playground">
      <aside className="ap-config"><div className="ap-config-title"><b>Make it yours</b><span className="ap-preview-badge">SANDBOX</span></div><div className="ap-config-tabs" role="tablist" aria-label="Demo configuration" onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const next = e.key === 'Home' ? 'appearance' : e.key === 'End' ? 'activity' : tab === 'appearance' ? 'activity' : 'appearance'; setTab(next); document.getElementById(`ap-tab-${next}`)?.focus(); } }}><button role="tab" tabIndex={tab === 'appearance' ? 0 : -1} aria-selected={tab === 'appearance'} aria-controls="ap-appearance" id="ap-tab-appearance" onClick={() => setTab('appearance')}>Appearance</button><button role="tab" tabIndex={tab === 'activity' ? 0 : -1} aria-selected={tab === 'activity'} aria-controls="ap-activity" id="ap-tab-activity" onClick={() => setTab('activity')}>Activity {state.events.length > 0 && <span>{state.events.length}</span>}</button></div>
        {tab === 'appearance' ? <div className="ap-config-body" id="ap-appearance" role="tabpanel" aria-labelledby="ap-tab-appearance"><label className="ap-label">App name<input maxLength={22} value={brand} onChange={e => setBrand(e.target.value)} placeholder="Your app"/></label><fieldset className="ap-fieldset"><legend>Accent color <span>{theme.name}</span></legend><div className="ap-swatches">{themes.map(t => <button key={t.name} style={{ background: t.color }} aria-label={`${t.name} accent`} aria-pressed={theme.name === t.name} onClick={() => setTheme(t)}>{theme.name === t.name && <Check size={18}/>}</button>)}</div></fieldset><div className="ap-label">Appearance<div className="ap-segments"><button aria-pressed={!dark} onClick={() => setDark(false)}>Light</button><button aria-pressed={dark} onClick={() => setDark(true)}>Dark</button></div></div><div className="ap-label">Corners<div className="ap-segments"><button aria-pressed={rounded} onClick={() => setRounded(true)}>Rounded</button><button aria-pressed={!rounded} onClick={() => setRounded(false)}>Sharp</button></div></div><button className="ap-export-theme" onClick={copyTheme}>{copied ? <Check size={15}/> : <Copy size={15}/>} {copied ? 'Theme copied' : 'Copy theme config'}</button><p className="ap-config-note" role="status">{copyError ? 'Clipboard unavailable in this browser. Your selected theme remains visible in the preview.' : 'Your colors. Your name. One connected service underneath.'}</p></div> : <div className="ap-config-body ap-event-feed" id="ap-activity" role="tabpanel" aria-labelledby="ap-tab-activity"><div className="ap-feed-summary"><span>Demo payments received</span><strong>${total.toFixed(2)}</strong></div>{state.events.length ? state.events.map(e => <div className="ap-feed-event" key={e.id}><span className={e.type.includes('blocked') || e.type.includes('failed') ? 'ap-event-dot is-warning' : 'ap-event-dot'}/><div><code>{e.type}</code><p>{e.detail}</p></div></div>) : <p className="ap-empty-events">Choose a plan in the preview to see payment and usage events arrive here.</p>}</div>}
        <div className="ap-config-bottom"><button onClick={() => dispatch('reset')}><RotateCcw size={14}/> Reset transactions</button><span>Changes stay in this session.</span></div>
      </aside>
      <div className="ap-preview-area"><div className="ap-preview-browser"><div><i/><i/><i/></div><span>{(brand.trim() || 'yourapp').toLowerCase().replace(/[^a-z0-9]/g, '') || 'yourapp'}.app / workspace</span><span className="ap-browser-label">LIVE PREVIEW</span></div>
        <div className={`ap-embedded ${dark ? 'ap-embedded-dark' : ''}`} style={{ '--embed-accent': theme.color, '--embed-radius': rounded ? '18px' : '5px' } as CSSProperties}>
          <header className="ap-embed-nav"><strong><span className="ap-embed-logomark"><Layers size={18}/></span>{brand.trim() || 'Your app'}</strong><div><button aria-pressed={appTab === 'workspace'} onClick={() => setAppTab('workspace')}>Workspace</button><button aria-pressed={appTab === 'billing'} onClick={() => setAppTab('billing')}>Billing</button></div><span className="ap-user-avatar">JL</span></header>
          <div className="ap-embed-content"><div className="ap-embed-heading"><div><p>ACME STUDIO</p><h3>{appTab === 'workspace' ? 'A little more possibility.' : 'Your plan. Perfectly clear.'}</h3><span>{appTab === 'workspace' ? 'Turn your next idea into something great.' : 'Your subscription, payments, and usage in one place.'}</span></div></div>
            <div className="ap-embed-grid"><div className="ap-creation-card">{appTab === 'workspace' ? <><div className="ap-ai-icon"><Sparkles size={23}/></div><h4>What will you create?</h4><p>Write a launch announcement for our new design studio.</p><div className="ap-prompt-footer"><span>250 tokens / generation</span><Sparkles size={14}/></div><button className="ap-embed-button" disabled={!state.subscribed} onClick={() => dispatch('generate')}><Sparkles size={15}/>{state.subscribed && remaining < 250 ? 'Try at the limit' : 'Generate content'}</button>{successful && <div className="ap-generated-result"><CheckCircle2 size={15}/><p>Meet a studio built for your next big idea. Thoughtful design. Fresh perspectives. Let’s create something worth sharing.</p></div>}{!state.subscribed && <small>Choose a plan to start creating.</small>}</> : <><CreditCard className="ap-ai-icon" size={28}/><h4>Payment history</h4><p>Demo transactions for your workspace.</p><div className="ap-invoice-list">{state.events.filter(e => e.amount !== undefined).length ? state.events.filter(e => e.amount !== undefined).map(e => <div key={e.id}><span>{e.type === 'credits.purchased' ? 'Token top-up' : e.type === 'plan.upgraded' ? 'Plan upgrade' : 'Subscription'}<small>Demo receipt #{String(e.id).padStart(4, '0')}</small></span><b>${e.amount?.toFixed(2)}</b><CheckCircle2 size={14}/></div>) : <p>No payments yet.</p>}</div></>}</div>
              <div className="ap-wallet"><div className="ap-wallet-top"><span>{plans[state.plan].name} plan</span><span className={`ap-status-pill ${state.payment === 'past_due' ? 'is-warning' : ''}`}>{!state.subscribed ? 'Not subscribed' : state.payment === 'past_due' ? 'Grace period' : 'Active'}</span></div><div className="ap-wallet-price">${plans[state.plan].price}<small>/ month</small></div><p>{plans[state.plan].tokens.toLocaleString()} tokens included</p><div className="ap-wallet-divider"/><div className="ap-balance"><span>Tokens remaining</span><strong>{remaining.toLocaleString()}</strong></div><div className="ap-track"><span style={{ width: `${pct}%` }}/></div><div className="ap-usage-label"><span>{state.used.toLocaleString()} used</span><span>{limit.toLocaleString()} total</span></div>
              {!state.subscribed ? <button className="ap-embed-button" onClick={() => dispatch('subscribe')}>Subscribe · $29 / mo <ArrowRight size={15}/></button> : <>{state.plan === 'starter' ? <button className="ap-embed-button" onClick={() => dispatch('upgrade')}>Upgrade to Pro <ArrowRight size={15}/></button> : <div className="ap-pro-note"><CheckCircle2 size={15}/> You’re on Pro</div>}<button className="ap-topup" onClick={() => dispatch('topup')}><Plus size={14}/> Add 1,000 tokens · $10</button></>}
              <div className="ap-powered"><span>Powered by</span><b>APEX</b></div></div></div>
            <div className={`ap-demo-notice ${latest?.type.includes('blocked') || latest?.type.includes('failed') ? 'ap-notice-warning' : ''}`} role="status" aria-live="polite">{latest ? <><span className="ap-event-dot"/><span>{latest.detail}</span></> : <><CreditCard size={14}/><span>Start with a subscription. Watch your balance and access update together.</span></>}</div>
          </div>
        </div>
        <div className="ap-preview-footer"><span><span className="ap-small-dot"/> Interactive demo · no real charges</span><button disabled={!state.subscribed} onClick={() => dispatch(state.payment === 'past_due' ? 'recover' : 'fail')}>{state.payment === 'past_due' ? 'Simulate payment recovery' : 'Simulate failed payment'} <ChevronRight size={13}/></button></div>
      </div>
    </div><p className="ap-demo-disclosure">This preview runs locally with sample data. Production payment connections and SDKs are in development.</p>
  </div></section>;
}

function DeveloperSection() {
  const [tab, setTab] = useState<'embed' | 'usage'>('embed');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const snippets = { embed: `// Proposed React integration\n<ApexProvider customer={workspace.id}>\n  <BillingPortal\n    theme={{\n      accent: "#635bff",\n      radius: "18px",\n      appearance: "light"\n    }}\n  />\n</ApexProvider>`, usage: `// Proposed server-side integration\nawait apex.usage.record({\n  customer: "acme_studio",\n  metric: "ai_tokens",\n  quantity: response.usage.total_tokens,\n  idempotencyKey: request.id\n});\n\n// Your customer's meter updates.\n// Your application enforces the limit.` };
  return <section className="ap-developers" id="developers"><div className="ap-container ap-developer-grid"><div><p className="ap-eyebrow">DEVELOPER FIRST. CUSTOMER READY.</p><h2>Your interface.<br/><span>Our infrastructure.</span></h2><p>Keep control of your product. Embed the billing experience, or build your own UI on the API.</p><ul><li><Check size={17}/> Brandable customer components</li><li><Check size={17}/> Backend usage tracking</li><li><Check size={17}/> Subscription and credit events</li></ul><a href="#playground">Explore the component preview <ArrowRight size={16}/></a></div><div className="ap-code-card"><div className="ap-code-toolbar"><div><button aria-pressed={tab === 'embed'} onClick={() => { setTab('embed'); setCopied(false); }}>Embed UI</button><button aria-pressed={tab === 'usage'} onClick={() => { setTab('usage'); setCopied(false); }}>Track usage</button></div><button aria-label="Copy illustrative integration code" onClick={async () => { try { await navigator.clipboard.writeText(snippets[tab]); setCopied(true); setError(false); window.setTimeout(() => setCopied(false), 2000); } catch { setError(true); } }}>{copied ? <Check size={15}/> : <Copy size={15}/>}</button></div><pre><code>{snippets[tab]}</code></pre><div className="ap-code-foot" role="status"><Code2 size={14}/>{error ? 'Clipboard unavailable. Select the code to copy it.' : copied ? 'Illustrative code copied' : 'API design preview · not a published SDK'}</div></div></div></section>;
}
