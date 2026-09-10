import { CSSProperties, lazy, Suspense, useEffect, useReducer, useRef, useState } from 'react';
import { ArrowRight, Check, CheckCircle2, ChevronRight, Code2, Copy, CreditCard, ExternalLink, Layers, Maximize2, Pause, Play, Plus, Receipt, RotateCcw, Sparkles, Unlock, X } from 'lucide-react';
import { allowance, embeddedReducer, initialEmbedded, plans } from './lib/embeddedDemo';
import './product.css';
import './plain-language.css';

const Console = lazy(() => import('./App'));
const Forma = lazy(() => import('./components/FormaPage'));
const Onboarding = lazy(() => import('./components/Onboarding'));
const Docs = lazy(() => import('./docs/DocsApp'));
const asset = (name: string) => `/apex/assets/${name}`;
const themes = [
  { name: 'Indigo', color: '#635bff' },
  { name: 'Forest', color: '#087f64' },
  { name: 'Cobalt', color: '#006fe8' },
  { name: 'Rust', color: '#a94f38' },
];
const chapters = [ ['Connect', 0], ['Subscribe', 6], ['Track usage', 12], ['Upgrade', 21], ['Make it yours', 28] ] as const;

export default function ProductSite() {
  const [route, setRoute] = useState(() => window.location.hash);
  const consoleOpen = route === '#console';
  const formaOpen = route === '#forma';
  const recoveryOpen = new URLSearchParams(window.location.search).get('recovery') === '1';
  const startOpen = route === '#start' || recoveryOpen;
  const docsOpen = route === '#docs' || route.startsWith('#docs/') || route.startsWith('#docs?');
  const [filmOpen, setFilmOpen] = useState(false);
  const film = useRef<HTMLDialogElement>(null);
  const fullVideo = useRef<HTMLVideoElement>(null);
  const preview = useRef<HTMLVideoElement>(null);
  const watchButton = useRef<HTMLButtonElement>(null);
  const manuallyPaused = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [chapter, setChapter] = useState(0);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    const sync = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  useEffect(() => {
    if (consoleOpen || formaOpen || startOpen || docsOpen || filmOpen) return;
    const el = preview.current;
    if (!el) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || motion.matches || manuallyPaused.current) el.pause();
      else void el.play().catch(() => setPlaying(false));
    }, { threshold: 0.2 });
    observer.observe(el);
    const reduce = () => { if (motion.matches) el.pause(); };
    motion.addEventListener('change', reduce);
    return () => { observer.disconnect(); motion.removeEventListener('change', reduce); };
  }, [consoleOpen, formaOpen, startOpen, docsOpen, filmOpen]);

  useEffect(() => {
    if (filmOpen) {
      film.current?.showModal();
      preview.current?.pause();
      if (fullVideo.current) {
        fullVideo.current.currentTime = 0;
        void fullVideo.current.play().catch(() => {});
      }
      document.body.style.overflow = 'hidden';
    } else {
      film.current?.close();
      fullVideo.current?.pause();
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [filmOpen]);

  function closeFilm() {
    setFilmOpen(false);
    watchButton.current?.focus();
  }

  if (startOpen) return <Suspense fallback={<p className="ap-loading">Opening onboarding…</p>}><Onboarding/></Suspense>;

  if (formaOpen) return <Suspense fallback={<p className="ap-loading">Opening Forma…</p>}><Forma/></Suspense>;

  if (docsOpen) return <Suspense fallback={<p className="ap-loading">Opening APEX Docs…</p>}><Docs/></Suspense>;

  if (consoleOpen) return <div className="ap-console-page">
    <div className="ap-console-return">
      <a href="#">← APEX home</a>
      <span>Behind-the-scenes controls · simulated data</span>
      <span className="ap-console-guide"><b>Plain English:</b> Plans = what people buy · Entitlements = what they get · Usage = how much they used · Billing Sync = what changes when payment changes.</span>
    </div>
    <Suspense fallback={<p className="ap-loading">Opening the sandbox…</p>}><Console /></Suspense>
  </div>;

  return <div className="ap-site">
    <a className="ap-skip" href="#main">Skip to content</a>
    <header className="ap-nav">
      <a className="ap-logo" href="#" aria-label="APEX home">APEX</a>
      <nav aria-label="Main navigation"><a href="#what-it-does">What it does</a><a href="#playground">Try it</a><a href="#forma">Forma demo</a><a href="#developers">Under the hood</a><a href="#docs">Docs</a></nav>
      <a className="ap-nav-cta" href="#start">Start with APEX <ArrowRight size={14}/></a>
    </header>

    <main id="main">
      <section className="ap-hero">
        <p className="ap-eyebrow"><span/> SELL IT. DELIVER IT. KEEP THEM IN SYNC.</p>
        <div className="ap-hero-grid">
          <div className="ap-hero-copy-col">
            <h1>They pay.<br/>Your product follows.</h1>
            <p className="ap-hero-copy">Keep subscriptions, credits, and customer access in sync—inside your app.</p>
            <div className="ap-hero-actions">
              <a className="ap-button" href="#forma">Try the demo <ArrowRight size={17}/></a>
              <a className="ap-text-button" href="#start">Explore setup <ArrowRight size={15}/></a>
            </div>
            <p className="ap-plain-cta">Choose your plan. Create your workspace. Connect Stripe. Install APEX. Go live.</p>
          </div>
          <div className="ap-hero-art-col">
            <img className="ap-hero-art" src={asset('brand-v1/apex-access-sculpture.png')} alt="A sculptural still life: a cobalt ribbon threading an ivory arch, tangerine credit discs, a lilac sphere, and a checked access pass." width={1536} height={1024} loading="eager"/>
            <FlowBadge/>
          </div>
        </div>

        <div className="ap-film-wrap">
          <div className="ap-film-frame">
            <video ref={preview} muted loop playsInline preload="metadata" poster={asset('apex-film-poster.jpg')} aria-label="APEX product film: connect payments, track tokens, upgrade and customize your app" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setVideoFailed(true)} onTimeUpdate={e => { const t = e.currentTarget.currentTime; setChapter(chapters.reduce((n, c, i) => t >= c[1] ? i : n, 0)); }}>
              <source src={asset('apex-product-film.mp4')} type="video/mp4"/>
              <track kind="captions" src={asset('apex-film.vtt')} srcLang="en" label="English"/>
              Your browser does not support embedded video.
            </video>
            <div className="ap-film-top"><span><span className="ap-small-dot"/> THE APEX EXPERIENCE</span><span>SIMULATED DATA</span></div>
            <div className="ap-film-bottom"><span>They buy. Their access stays correct.</span><div><button aria-label={playing ? 'Pause hero video' : 'Play hero video'} onClick={() => {
              const el = preview.current;
              if (!el) return;
              if (el.paused) { manuallyPaused.current = false; void el.play().catch(() => setVideoFailed(true)); }
              else { manuallyPaused.current = true; el.pause(); }
            }}>{playing ? <Pause size={17}/> : <Play size={17}/>}</button><button ref={watchButton} aria-label="Open full product film" onClick={() => setFilmOpen(true)}><Maximize2 size={17}/></button></div></div>
          </div>
          {videoFailed && <p className="ap-video-fallback">Video unavailable in this browser. <a href={asset('apex-product-film.mp4')}>Open the MP4 film</a> or try the interactive demo below.</p>}
          <div className="ap-chapters" aria-label="Video chapters">{chapters.map(([name, time], i) => <button key={name} aria-current={chapter === i ? 'step' : undefined} className={chapter === i ? 'is-active' : ''} onClick={() => {
            if (preview.current) { manuallyPaused.current = false; preview.current.currentTime = time; void preview.current.play().catch(() => {}); }
          }}><span>0{i + 1}</span>{name}</button>)}</div>
        </div>
        <p className="ap-underfilm"><strong>Stripe handles the payment.</strong> <span className="ap-rust">APEX helps make sure your product responds correctly.</span></p>
      </section>

      <JordanStory/>

      <Playground/>

      <section className="ap-yourlook" aria-label="Your app. Your look.">
        <div className="ap-yourlook-head">
          <p className="ap-eyebrow">MAKE IT YOURS.</p>
          <h2>Your app.<br/><span>Your look.</span></h2>
          <p>The same billing interface, restyled to match different products. Illustrative examples — not separate apps.</p>
        </div>
        <div className="ap-yourlook-row">
          {[
            { name: 'Studio', label: 'Creator tool · illustrative example', accent: 'var(--brand-tangerine)', text: 'var(--brand-ink)', plan: 'Creator plan', credits: 620, total: 1000, shape: 'is-round' },
            { name: 'Northwind', label: 'Reporting app · illustrative example', accent: 'var(--brand-cobalt)', text: '#fff', plan: 'Team plan', credits: 340, total: 500, shape: 'is-sharp' },
            { name: 'Circle', label: 'Membership product · illustrative example', accent: 'var(--brand-lilac)', text: 'var(--brand-ink)', plan: 'Member plan', credits: 90, total: 250, shape: 'is-soft' },
          ].map((ex) => (
            <article className={`ap-yourlook-card ${ex.shape}`} key={ex.name} style={{ '--ap-yl-accent': ex.accent, '--ap-yl-text': ex.text } as CSSProperties}>
              <div className="ap-yourlook-top"><span className="ap-yourlook-dot"/><b>{ex.name}</b></div>
              <div className="ap-yourlook-plan"><span>{ex.plan}</span><b>{ex.credits.toLocaleString()} <small>/ {ex.total.toLocaleString()} credits</small></b></div>
              <div className="ap-track"><span style={{ width: `${(ex.credits / ex.total) * 100}%`, background: 'var(--ap-yl-accent)' }}/></div>
              <button className="ap-yourlook-btn">Manage plan <ArrowRight size={13}/></button>
              <small>{ex.label}</small>
            </article>
          ))}
        </div>
      </section>

      <Payoff/>

      <DeveloperSection/>

      <section className="ap-final-cta"><p className="ap-eyebrow">THE SIMPLE VERSION.</p><h2>Make sure what you sell<br/>is what customers get.</h2><div className="ap-final-actions"><a href="#start" className="ap-button">Start with APEX <ArrowRight size={17}/></a><a href="#playground" className="ap-text-button">Try it yourself <ArrowRight size={17}/></a><a href="#forma" className="ap-text-button">Open the Forma demo app <ArrowRight size={17}/></a></div></section>
    </main>

    <footer className="ap-footer ap-container"><a href="#" className="ap-logo">APEX</a><p>APEX keeps plans, payments, usage limits, credits, and product access in sync.</p><a href="#start">Start with APEX <ExternalLink size={13}/></a><a href="#forma">Open the Forma demo app <ExternalLink size={13}/></a><a href="#console">Open behind-the-scenes controls <ExternalLink size={13}/></a><a href="#docs">Read the docs <ExternalLink size={13}/></a><small>Product preview. All transactions are simulated.</small></footer>

    <dialog ref={film} className="ap-film-dialog" aria-label="APEX product walkthrough" onCancel={closeFilm} onClick={e => { if (e.target === e.currentTarget) closeFilm(); }}>
      <button autoFocus className="ap-close-film" aria-label="Close film" onClick={closeFilm}><X/></button>
      {filmOpen && <video ref={fullVideo} controls playsInline preload="metadata" poster={asset('apex-film-poster.jpg')}><source src={asset('apex-product-film.mp4')} type="video/mp4"/><track kind="captions" src={asset('apex-film.vtt')} srcLang="en" label="English" default/></video>}
      <p>APEX product walkthrough · 36 seconds · simulated data · silent film</p>
    </dialog>
  </div>;
}

const FLOW_STEPS = [
  { icon: Receipt, text: 'Payment confirmed' },
  { icon: Sparkles, text: '10 credits added' },
  { icon: Unlock, text: 'Access unlocked' },
] as const;

// A small ambient badge over the hero art, cycling through the same
// payment -> credits -> access sequence the rest of the page tells in full.
// Purely illustrative text, no motion, when prefers-reduced-motion is set.
function FlowBadge() {
  const [step, setStep] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(motion.matches);
    const onChange = () => setReduced(motion.matches);
    motion.addEventListener('change', onChange);
    return () => motion.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const timer = window.setInterval(() => setStep(s => (s + 1) % FLOW_STEPS.length), 1900);
    return () => window.clearInterval(timer);
  }, [reduced]);

  if (reduced) {
    return (
      <ul className="ap-flow-badge is-static" aria-label="Payment becomes product access">
        {FLOW_STEPS.map(({ icon: Icon, text }) => <li key={text}><Icon size={13}/> {text}</li>)}
      </ul>
    );
  }

  const Icon = FLOW_STEPS[step].icon;
  return (
    <p className="ap-flow-badge" role="status" aria-live="polite">
      <Icon size={13}/> {FLOW_STEPS[step].text}
    </p>
  );
}

const JORDAN_CREDITS = [10, 9, 8, 7];

// The canonical APEX story, told once, start to finish, with one customer:
// Jordan buys Pro, spends three credits, keeps working the whole time.
function JordanStory() {
  const [tick, setTick] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [played, setPlayed] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(motion.matches);
  }, []);

  useEffect(() => {
    if (reduced || played) return;
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setPlayed(true);
      let n = 0;
      const timer = window.setInterval(() => {
        n += 1;
        setTick(n);
        if (n >= JORDAN_CREDITS.length - 1) window.clearInterval(timer);
      }, 650);
    }, { threshold: 0.5 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduced, played]);

  function replay() {
    setTick(0);
    window.setTimeout(() => {
      let n = 0;
      const timer = window.setInterval(() => {
        n += 1;
        setTick(n);
        if (n >= JORDAN_CREDITS.length - 1) window.clearInterval(timer);
      }, 650);
    }, 150);
  }

  const credits = reduced ? JORDAN_CREDITS[JORDAN_CREDITS.length - 1] : JORDAN_CREDITS[tick];

  return (
    <section className="ap-jordan" id="what-it-does" aria-label="One customer, start to finish" ref={sectionRef}>
      <div className="ap-jordan-inner">
        <p className="ap-eyebrow ap-jordan-eyebrow">ONE CUSTOMER, START TO FINISH.</p>
        <div className="ap-jordan-receipt"><Receipt size={14}/> Jordan chooses Pro <span>· $29/mo</span></div>

        <div className="ap-jordan-number" aria-live="polite">
          <span className="ap-jordan-disc ap-jordan-disc-a" aria-hidden="true"/>
          <span className="ap-jordan-disc ap-jordan-disc-b" aria-hidden="true"/>
          <span className="ap-jordan-disc ap-jordan-disc-c" aria-hidden="true"/>
          <b>{credits}</b>
        </div>
        <p className="ap-jordan-caption">
          {reduced
            ? 'Jordan bought 10 credits, used 3, and has 7 credits left.'
            : tick === 0 ? '10 credits, just activated.' : `Jordan has ${credits} credits left.`}
        </p>

        <div className="ap-jordan-unlocked">
          <Unlock size={14}/> Product access stays on the whole time <span>— no manual step, no lockout.</span>
        </div>

        {!reduced && played && tick === JORDAN_CREDITS.length - 1 && (
          <button type="button" className="ap-jordan-replay" onClick={replay}><RotateCcw size={13}/> Watch it again</button>
        )}

        <a className="ap-jordan-cta" href="#forma">See it live in Forma <ArrowRight size={15}/></a>
      </div>
    </section>
  );
}

const PAYOFF_EVENTS = ['Payment confirmed', 'Pro activated', '10 credits added', 'Access changed'];

// The one business-value idea worth making, made once, as a product
// close-up instead of three more "here's why we're great" cards.
function Payoff() {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="ap-payoff-band" aria-label="Why every access change has a reason">
      <div className="ap-payoff">
        <div className="ap-payoff-visual">
          <div className="ap-payoff-window">
            <div className="ap-payoff-window-top"><i/><i/><i/><span>Audit log</span></div>
            <ul className="ap-payoff-log">
              {PAYOFF_EVENTS.map(e => <li key={e}><CheckCircle2 size={14}/> {e}</li>)}
            </ul>
          </div>
        </div>
        <div className="ap-payoff-copy">
          <p className="ap-eyebrow">KNOW WHY ACCESS CHANGED.</p>
          <h2>Every change has a reason.</h2>
          <p>Support, finance, and product see the same story — not a guess.</p>
          <button type="button" className="ap-payoff-toggle" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>
            See what happened <ChevronRight size={14} className={expanded ? 'is-open' : ''}/>
          </button>
          {expanded && (
            <div className="ap-payoff-detail">
              <div><span>What they bought</span><b>Plan, limits, credits</b></div>
              <div><span>What changed</span><b>Payment, upgrade, cancellation, usage</b></div>
              <div><span>What happened next</span><b>Access allowed or stopped</b></div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
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
  const limit = allowance(state);
  const remaining = Math.max(0, limit - state.used);
  const pct = limit ? Math.min(100, state.used / limit * 100) : 0;
  const latest = state.events[0];
  const successful = state.events.find(e => e.type === 'usage.recorded');
  const total = state.events.reduce((n, e) => n + (e.amount ?? 0), 0);

  async function copyTheme() {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ brand: brand.trim() || 'Your app', accent: theme.color, mode: dark ? 'dark' : 'light', borderRadius: rounded ? 20 : 6 }, null, 2));
      setCopied(true);
      setCopyError(false);
      window.setTimeout(() => setCopied(false), 2200);
    } catch { setCopyError(true); }
  }

  return <section className="ap-playground-section" id="playground"><div className="ap-container">
    <div className="ap-playground-heading"><div><p className="ap-eyebrow">TRY THE IDEA, NOT JUST THE UI.</p><h2>Pay. Use. Run out.<br/><span>Upgrade. Keep going.</span></h2></div><p>Use this fake SaaS app to watch payment, credits, and access change together.</p></div>
    <div className="ap-playground">
      <aside className="ap-config">
        <div className="ap-config-title"><b>Make it look like your app</b><span className="ap-preview-badge">SANDBOX</span></div>
        <div className="ap-config-tabs" role="tablist" aria-label="Demo configuration"><button role="tab" aria-selected={tab === 'appearance'} onClick={() => setTab('appearance')}>Appearance</button><button role="tab" aria-selected={tab === 'activity'} onClick={() => setTab('activity')}>What happened {state.events.length > 0 && <span>{state.events.length}</span>}</button></div>
        {tab === 'appearance' ? <div className="ap-config-body" role="tabpanel">
          <label className="ap-label">App name<input maxLength={22} value={brand} onChange={e => setBrand(e.target.value)} placeholder="Your app"/></label>
          <fieldset className="ap-fieldset"><legend>Accent color <span>{theme.name}</span></legend><div className="ap-swatches">{themes.map(t => <button key={t.name} style={{ background: t.color }} aria-label={`${t.name} accent`} aria-pressed={theme.name === t.name} onClick={() => setTheme(t)}>{theme.name === t.name && <Check size={18}/>}</button>)}</div></fieldset>
          <div className="ap-label">Appearance<div className="ap-segments"><button aria-pressed={!dark} onClick={() => setDark(false)}>Light</button><button aria-pressed={dark} onClick={() => setDark(true)}>Dark</button></div></div>
          <div className="ap-label">Corners<div className="ap-segments"><button aria-pressed={rounded} onClick={() => setRounded(true)}>Rounded</button><button aria-pressed={!rounded} onClick={() => setRounded(false)}>Sharp</button></div></div>
          <button className="ap-export-theme" onClick={copyTheme}>{copied ? <Check size={15}/> : <Copy size={15}/>} {copied ? 'Theme copied' : 'Copy theme config'}</button>
          <p className="ap-config-note" role="status">{copyError ? 'Clipboard unavailable in this browser.' : 'This is the part your customer would see inside your app.'}</p>
        </div> : <div className="ap-config-body ap-event-feed" role="tabpanel">
          <div className="ap-feed-summary"><span>Fake payments received</span><strong>${total.toFixed(2)}</strong></div>
          {state.events.length ? state.events.map(e => <div className="ap-feed-event" key={e.id}><span className={e.type.includes('blocked') || e.type.includes('failed') ? 'ap-event-dot is-warning' : 'ap-event-dot'}/><div><code>{e.type}</code><p>{e.detail}</p></div></div>) : <p className="ap-empty-events">Subscribe in the preview. Every payment and usage change will show up here.</p>}
        </div>}
        <div className="ap-config-bottom"><button onClick={() => dispatch('reset')}><RotateCcw size={14}/> Reset demo</button><span>Nothing here charges real money.</span></div>
      </aside>

      <div className="ap-preview-area">
        <div className="ap-preview-browser"><div><i/><i/><i/></div><span>{(brand.trim() || 'yourapp').toLowerCase().replace(/[^a-z0-9]/g, '') || 'yourapp'}.app / workspace</span><span className="ap-browser-label">LIVE PREVIEW</span></div>
        <div className={`ap-embedded ${dark ? 'ap-embedded-dark' : ''}`} style={{ '--embed-accent': theme.color, '--embed-radius': rounded ? '18px' : '5px' } as CSSProperties}>
          <header className="ap-embed-nav"><strong><span className="ap-embed-logomark"><Layers size={18}/></span>{brand.trim() || 'Your app'}</strong><div><button aria-pressed={appTab === 'workspace'} onClick={() => setAppTab('workspace')}>Use product</button><button aria-pressed={appTab === 'billing'} onClick={() => setAppTab('billing')}>My plan</button></div><span className="ap-user-avatar">JL</span></header>
          <div className="ap-embed-content">
            <div className="ap-embed-heading"><div><p>ACME STUDIO</p><h3>{appTab === 'workspace' ? 'Use the product.' : 'What did I buy?'}</h3><span>{appTab === 'workspace' ? 'Each generation uses 250 credits.' : 'See your plan, payments, and remaining credits.'}</span></div></div>
            <div className="ap-embed-grid">
              <div className="ap-creation-card">{appTab === 'workspace' ? <>
                <div className="ap-ai-icon"><Sparkles size={23}/></div><h4>Create something</h4><p>Write a launch announcement for our new design studio.</p><div className="ap-prompt-footer"><span>Costs 250 credits</span><Sparkles size={14}/></div>
                <button className="ap-embed-button" disabled={!state.subscribed} onClick={() => dispatch('generate')}><Sparkles size={15}/>{state.subscribed && remaining < 250 ? 'Try with no credits left' : 'Generate content'}</button>
                {successful && <div className="ap-generated-result"><CheckCircle2 size={15}/><p>Meet a studio built for your next big idea. Thoughtful design. Fresh perspectives.</p></div>}
                {!state.subscribed && <small>Pick a plan first. APEX will activate the credits.</small>}
              </> : <>
                <CreditCard className="ap-ai-icon" size={28}/><h4>Payment history</h4><p>Fake transactions for this demo account.</p>
                <div className="ap-invoice-list">{state.events.filter(e => e.amount !== undefined).length ? state.events.filter(e => e.amount !== undefined).map(e => <div key={e.id}><span>{e.type === 'credits.purchased' ? 'Credit refill' : e.type === 'plan.upgraded' ? 'Plan upgrade' : 'Subscription'}<small>Demo receipt #{String(e.id).padStart(4, '0')}</small></span><b>${e.amount?.toFixed(2)}</b><CheckCircle2 size={14}/></div>) : <p>No payments yet.</p>}</div>
              </>}</div>

              <div className="ap-wallet">
                <div className="ap-wallet-top"><span>{plans[state.plan].name} plan</span><span className={`ap-status-pill ${state.payment === 'past_due' ? 'is-warning' : ''}`}>{!state.subscribed ? 'Not active' : state.payment === 'past_due' ? 'Payment issue' : 'Active'}</span></div>
                <div className="ap-wallet-price">${plans[state.plan].price}<small>/ month</small></div>
                <p>{plans[state.plan].tokens.toLocaleString()} credits included</p>
                <div className="ap-wallet-divider"/>
                <div className="ap-balance"><span>Credits left</span><strong>{remaining.toLocaleString()}</strong></div>
                <div className="ap-track"><span style={{ width: `${pct}%` }}/></div>
                <div className="ap-usage-label"><span>{state.used.toLocaleString()} used</span><span>{limit.toLocaleString()} available</span></div>
                {!state.subscribed ? <button className="ap-embed-button" onClick={() => dispatch('subscribe')}>Buy Starter · $29 / mo <ArrowRight size={15}/></button> : <>{state.plan === 'starter' ? <button className="ap-embed-button" onClick={() => dispatch('upgrade')}>Upgrade to Pro <ArrowRight size={15}/></button> : <div className="ap-pro-note"><CheckCircle2 size={15}/> Pro is active</div>}<button className="ap-topup" onClick={() => dispatch('topup')}><Plus size={14}/> Buy 1,000 more credits · $10</button></>}
                <div className="ap-powered"><span>Commercial logic by</span><b>APEX</b></div>
              </div>
            </div>
            <div className={`ap-demo-notice ${latest?.type.includes('blocked') || latest?.type.includes('failed') ? 'ap-notice-warning' : ''}`} role="status" aria-live="polite">{latest ? <><span className="ap-event-dot"/><span>{latest.detail}</span></> : <><CreditCard size={14}/><span>Start by buying Starter. Watch APEX activate credits and keep the account in sync.</span></>}</div>
          </div>
        </div>
        <div className="ap-preview-footer"><span><span className="ap-small-dot"/> Interactive demo · no real charges</span><button disabled={!state.subscribed} onClick={() => dispatch(state.payment === 'past_due' ? 'recover' : 'fail')}>{state.payment === 'past_due' ? 'Fix fake payment' : 'Simulate failed renewal'} <ChevronRight size={13}/></button></div>
      </div>
    </div>
    <p className="ap-demo-disclosure">This preview uses sample data. The point is the flow: <strong>payment changes the customer’s plan, balance, and access without the app rebuilding that logic itself.</strong></p>
  </div></section>;
}

function DeveloperSection() {
  const [tab, setTab] = useState<'embed' | 'usage'>('embed');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const snippets = {
    embed: `// Proposed React integration\n<ApexProvider customer={workspace.id}>\n  <BillingPortal theme={{ accent: "#006fe8" }} />\n</ApexProvider>`,
    usage: `// Your backend tells APEX what was used.\nawait apex.usage.record({\n  customer: "acme_studio",\n  metric: "ai_tokens",\n  quantity: 250\n});\n\n// APEX keeps the balance and access state in sync.`
  };

  return <section className="ap-developers" id="developers"><div className="ap-container ap-developer-grid">
    <div><p className="ap-eyebrow">HOW IT ACTUALLY WORKS.</p><h2>Built to keep your product<br/><span>and pricing connected.</span></h2><p><strong>Stripe → APEX → Your product.</strong> Stripe handles payments. APEX connects plans, payment state, usage, credits, access decisions, and audit history, and your product asks APEX what a customer is allowed to do.</p>
      <details className="ap-dev-steps"><summary>How you'd wire it up <ChevronRight size={13}/></summary><ol><li><b>Connect how you get paid.</b> Stripe or another payment system — APEX follows purchases, renewals, upgrades, cancellations, and failures.</li><li><b>Say what each plan includes.</b> Example: Pro means 5,000 credits, 10 seats, and premium reports.</li><li><b>Let the product check APEX.</b> Before an action happens, ask: is this customer allowed, and do they have enough left?</li></ol></details>
      <a href="#console">Open the behind-the-scenes sandbox <ArrowRight size={16}/></a>{' '}
      <a href="#docs/build/quickstart">Read the Build docs <ArrowRight size={16}/></a></div>
    <div className="ap-code-card"><div className="ap-code-toolbar"><div><button aria-pressed={tab === 'embed'} onClick={() => { setTab('embed'); setCopied(false); }}>Show UI</button><button aria-pressed={tab === 'usage'} onClick={() => { setTab('usage'); setCopied(false); }}>Report usage</button></div><button aria-label="Copy illustrative integration code" onClick={async () => { try { await navigator.clipboard.writeText(snippets[tab]); setCopied(true); setError(false); window.setTimeout(() => setCopied(false), 2000); } catch { setError(true); } }}>{copied ? <Check size={15}/> : <Copy size={15}/>}</button></div><pre><code>{snippets[tab]}</code></pre><div className="ap-code-foot" role="status"><Code2 size={14}/>{error ? 'Clipboard unavailable. Select the code to copy it.' : copied ? 'Illustrative code copied' : 'API design preview · not a published SDK'}</div></div>
  </div></section>;
}
