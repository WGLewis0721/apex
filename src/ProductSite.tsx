import { CSSProperties, lazy, Suspense, useEffect, useReducer, useRef, useState } from 'react';
import { ArrowRight, Check, CheckCircle2, ChevronRight, CirclePlay, Code2, Copy, CreditCard, ExternalLink, Gauge, Layers, Maximize2, Pause, Play, Plus, RotateCcw, Sparkles, X } from 'lucide-react';
import { allowance, embeddedReducer, initialEmbedded, plans } from './lib/embeddedDemo';
import './product.css';
import './plain-language.css';

const Console = lazy(() => import('./App'));
const Forma = lazy(() => import('./components/FormaPage'));
const Onboarding = lazy(() => import('./components/Onboarding'));
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
  const startOpen = route === '#start';
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
    if (consoleOpen || formaOpen || startOpen || filmOpen) return;
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
  }, [consoleOpen, formaOpen, startOpen, filmOpen]);

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

  if (consoleOpen) return <>
    <div className="ap-console-return">
      <a href="#">← APEX home</a>
      <span>Behind-the-scenes controls · simulated data</span>
      <span className="ap-console-guide"><b>Plain English:</b> Plans = what people buy · Entitlements = what they get · Usage = how much they used · Billing Sync = what changes when payment changes.</span>
    </div>
    <Suspense fallback={<p className="ap-loading">Opening the sandbox…</p>}><Console /></Suspense>
  </>;

  return <div className="ap-site">
    <a className="ap-skip" href="#main">Skip to content</a>
    <header className="ap-nav">
      <a className="ap-logo" href="#" aria-label="APEX home">APEX</a>
      <nav aria-label="Main navigation"><a href="#what-it-does">What it does</a><a href="#playground">Try it</a><a href="#forma">Forma demo</a><a href="#developers">For developers</a></nav>
      <a className="ap-nav-cta" href="#start">Start with APEX <ArrowRight size={14}/></a>
    </header>

    <main id="main">
      <section className="ap-hero">
        <p className="ap-eyebrow"><span/> THE PART AFTER SOMEONE PAYS.</p>
        <h1>They paid.<br/><span>Now what do they get?</span></h1>
        <p className="ap-hero-copy"><strong>APEX connects a payment to what your customer can actually use.</strong><br/>Credits, plan limits, feature access, upgrades, and usage — without rebuilding that system inside every app.</p>
        <div className="ap-hero-actions">
          <a className="ap-button" href="#start">Get APEX <ArrowRight size={17}/></a>
          <button ref={watchButton} className="ap-text-button" onClick={() => setFilmOpen(true)}>Watch the film <CirclePlay size={21}/></button>
        </div>
        <p className="ap-plain-cta">Choose your plan. Create your workspace. Connect Stripe. Install APEX. Go live.</p>

        <div className="ap-film-wrap">
          <div className="ap-film-frame">
            <video ref={preview} muted loop playsInline preload="metadata" poster={asset('apex-film-poster.jpg')} aria-label="APEX product film: connect payments, track tokens, upgrade and customize your app" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setVideoFailed(true)} onTimeUpdate={e => { const t = e.currentTarget.currentTime; setChapter(chapters.reduce((n, c, i) => t >= c[1] ? i : n, 0)); }}>
              <source src={asset('apex-product-film.mp4')} type="video/mp4"/>
              <track kind="captions" src={asset('apex-film.vtt')} srcLang="en" label="English"/>
              Your browser does not support embedded video.
            </video>
            <div className="ap-film-top"><span><span className="ap-small-dot"/> THE APEX EXPERIENCE</span><span>SIMULATED DATA</span></div>
            <div className="ap-film-bottom"><span>Payment in. Product access updated.</span><div><button aria-label={playing ? 'Pause hero video' : 'Play hero video'} onClick={() => {
              const el = preview.current;
              if (!el) return;
              if (el.paused) { manuallyPaused.current = false; void el.play().catch(() => setVideoFailed(true)); }
              else { manuallyPaused.current = true; el.pause(); }
            }}>{playing ? <Pause size={17}/> : <Play size={17}/>}</button><button aria-label="Open full product film" onClick={() => setFilmOpen(true)}><Maximize2 size={17}/></button></div></div>
          </div>
          {videoFailed && <p className="ap-video-fallback">Video unavailable in this browser. <a href={asset('apex-product-film.mp4')}>Open the MP4 film</a> or try the interactive demo below.</p>}
          <div className="ap-chapters" aria-label="Video chapters">{chapters.map(([name, time], i) => <button key={name} aria-current={chapter === i ? 'step' : undefined} className={chapter === i ? 'is-active' : ''} onClick={() => {
            if (preview.current) { manuallyPaused.current = false; preview.current.currentTime = time; void preview.current.play().catch(() => {}); }
          }}><span>0{i + 1}</span>{name}</button>)}</div>
        </div>
        <p className="ap-underfilm"><strong>Stripe, Link, Apple Pay or another provider takes the money.</strong> <span className="ap-rust">APEX keeps track of what that purchase unlocks.</span></p>
      </section>

      <section className="ap-launch-preview ap-container" aria-label="How you get APEX">
        <img src={asset('launch/apex-customer-funnel.svg')} alt="Discover APEX, choose a plan, pay, create a workspace, connect and install, then go live."/>
        <a className="ap-button" href="#start">Start with APEX <ArrowRight size={16}/></a>
      </section>

      <section className="ap-simple" id="what-it-does">
        <div className="ap-simple-inner">
          <div className="ap-simple-head">
            <p className="ap-eyebrow">NO FINTECH DEGREE REQUIRED.</p>
            <h2>Checkout is the cashier.<br/><span>APEX updates the account.</span></h2>
            <p>Think about buying credits in a game. Paying is only the first step. Something still has to add the credits, remember the balance, unlock what you bought, and stop usage when the balance runs out.</p>
          </div>
          <div className="ap-simple-flow">
            <article className="ap-simple-card"><span className="ap-num">01</span><h3>The customer pays.</h3><p>Stripe, Link, Apple Pay, Google Pay or another payment provider says: <b>“Payment successful.”</b></p></article>
            <article className="ap-simple-card"><span className="ap-num">02</span><h3>APEX translates the purchase.</h3><p><b>$29 Starter</b> might mean 1,000 credits, three premium features, and one active seat.</p></article>
            <article className="ap-simple-card"><span className="ap-num">03</span><h3>The app knows what to allow.</h3><p>Use 250 credits? APEX tracks it. Hit zero? Stop the action or offer an upgrade. Buy more? Update immediately.</p></article>
          </div>
          <div className="ap-simple-eq"><span className="money">PAYMENT</span><span>→</span><span className="apex">APEX</span><span>→</span><span>WHAT THE CUSTOMER GETS</span></div>
        </div>
      </section>

      <section className="ap-audiences" aria-label="APEX explained for different audiences">
        <div className="ap-audience-grid">
          <article className="ap-audience"><small>IF YOU PLAY GAMES</small><h3>If you understand game credits, you understand APEX.</h3><p>The payment buys the credits. <strong>APEX is the system that adds them to your account, tracks what is left, and knows what you can unlock.</strong></p></article>
          <article className="ap-audience"><small>IF YOU RUN A BUSINESS</small><h3>It is the membership system behind the register.</h3><p>The register takes payment. <strong>APEX knows the customer is Gold, Pro, VIP, active, expired, over the limit, or ready to upgrade.</strong></p></article>
          <article className="ap-audience"><small>IF YOU BUILD SOFTWARE</small><h3>It is commercial plumbing you do not have to rebuild.</h3><p>Your app asks APEX what a customer bought, what is left, and whether an action should be allowed. <strong>You focus on your actual product.</strong></p></article>
        </div>
      </section>

      <section className="ap-house">
        <div className="ap-house-card">
          <div><p className="ap-eyebrow">THE HOME-BUILDER TEST.</p><h2>Builders do not manufacture every lock.</h2><p>A homebuilder chooses the doors, locks, thermostat, electrical panel, and security system — then installs them into the house. A software team should be able to do the same with the paid part of its app.</p><p><strong>APEX is the prebuilt commercial system they plug in instead of manufacturing one from scratch.</strong></p></div>
          <div className="ap-house-parts"><div><span>Payment provider</span><b>Takes the money</b></div><div><span>APEX</span><b>Turns payment into rights + balances</b></div><div><span>Your app</span><b>Delivers the actual product</b></div></div>
        </div>
      </section>

      <section className="ap-product ap-container" id="product">
        <div className="ap-section-heading"><p className="ap-eyebrow">WHAT APEX HANDLES.</p><h2>The paid part of your app,<br/>already thought through.</h2><p>APEX sits between the payment and the product experience.</p></div>
        <div className="ap-feature-grid">
          <article className="ap-feature-card"><div className="ap-feature-icon"><CreditCard/></div><h3>Know who paid.</h3><p>Subscriptions, renewals, failed payments, and upgrades stay tied to the right customer.</p><div className="ap-payment-example"><span className="ap-avatar-small">AC</span><div><b>Acme Studio</b><small>Pro subscription</small></div><div><b>$79.00</b><small className="ap-green">● Paid</small></div></div><div className="ap-mini-note"><CheckCircle2 size={14}/> Customer access updated</div></article>
          <article className="ap-feature-card"><div className="ap-feature-icon"><Gauge/></div><h3>Know what is left.</h3><p>Track credits, tokens, API calls, seats, or another allowance. The balance and the rules stay together.</p><div className="ap-mini-meter"><div><span>AI tokens</span><b>750 <small>/ 1,000</small></b></div><div className="ap-track"><span style={{ width: '75%' }}/></div><small>250 tokens left before an upgrade is needed.</small></div></article>
          <article className="ap-feature-card"><div className="ap-feature-icon"><Layers/></div><h3>Make it look like your app.</h3><p>Drop in billing, balance, and upgrade experiences without making customers feel like they left your product.</p><div className="ap-mini-themes"><div style={{ '--embed-accent': '#006fe8' } as CSSProperties}>Forma<span>Upgrade plan <ArrowRight size={12}/></span></div><div style={{ '--embed-accent': '#a94f38' } as CSSProperties}>studio<span>Add credits <ArrowRight size={12}/></span></div></div></article>
        </div>
      </section>

      <Playground/>

      <section className="ap-how ap-container" id="how-it-works"><p className="ap-eyebrow">THREE STEPS.</p><h2>You build the product.<br/><span>APEX handles the paid-product logic.</span></h2><div className="ap-steps"><article><span>01</span><h3>Connect how you get paid.</h3><p>Connect Stripe or another payment system. APEX listens for purchases, renewals, upgrades, and failures.</p></article><article><span>02</span><h3>Say what each purchase means.</h3><p>Example: Pro means 5,000 credits, 10 seats, and premium reports.</p></article><article><span>03</span><h3>Let the app check APEX.</h3><p>Before an action happens, your app can ask: does this customer have access and enough usage left?</p></article></div></section>

      <DeveloperSection/>

      <section className="ap-final-cta"><p className="ap-eyebrow">THE SIMPLE VERSION.</p><h2>Payment takes the money.<br/>APEX updates what they get.</h2><div className="ap-final-actions"><a href="#start" className="ap-button">Start with APEX <ArrowRight size={17}/></a><a href="#playground" className="ap-text-button">Try it yourself <ArrowRight size={17}/></a><a href="#forma" className="ap-text-button">Open the Forma demo app <ArrowRight size={17}/></a></div></section>
    </main>

    <footer className="ap-footer ap-container"><a href="#" className="ap-logo">APEX</a><p>The commercial layer between payment and product access.</p><a href="#start">Start with APEX <ExternalLink size={13}/></a><a href="#forma">Open the Forma demo app <ExternalLink size={13}/></a><a href="#console">Open behind-the-scenes controls <ExternalLink size={13}/></a><small>Product preview. All transactions are simulated.</small></footer>

    <dialog ref={film} className="ap-film-dialog" aria-label="APEX product walkthrough" onCancel={closeFilm} onClick={e => { if (e.target === e.currentTarget) closeFilm(); }}>
      <button autoFocus className="ap-close-film" aria-label="Close film" onClick={closeFilm}><X/></button>
      {filmOpen && <video ref={fullVideo} controls playsInline preload="metadata" poster={asset('apex-film-poster.jpg')}><source src={asset('apex-product-film.mp4')} type="video/mp4"/><track kind="captions" src={asset('apex-film.vtt')} srcLang="en" label="English" default/></video>}
      <p>APEX product walkthrough · 36 seconds · simulated data · silent film</p>
    </dialog>
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
    <div><p className="ap-eyebrow">FOR THE ENGINEERING TEAM.</p><h2>Simple for the customer.<br/><span>Useful for the developer.</span></h2><p>The business explanation is simple. The integration can be simple too: connect payments, tell APEX what each plan includes, report usage, and let the app read the current customer state.</p><ul><li><Check size={17}/> Brandable customer components</li><li><Check size={17}/> Backend usage tracking</li><li><Check size={17}/> Plan, credit, and payment-state events</li></ul><a href="#console">Open the behind-the-scenes sandbox <ArrowRight size={16}/></a></div>
    <div className="ap-code-card"><div className="ap-code-toolbar"><div><button aria-pressed={tab === 'embed'} onClick={() => { setTab('embed'); setCopied(false); }}>Show UI</button><button aria-pressed={tab === 'usage'} onClick={() => { setTab('usage'); setCopied(false); }}>Report usage</button></div><button aria-label="Copy illustrative integration code" onClick={async () => { try { await navigator.clipboard.writeText(snippets[tab]); setCopied(true); setError(false); window.setTimeout(() => setCopied(false), 2000); } catch { setError(true); } }}>{copied ? <Check size={15}/> : <Copy size={15}/>}</button></div><pre><code>{snippets[tab]}</code></pre><div className="ap-code-foot" role="status"><Code2 size={14}/>{error ? 'Clipboard unavailable. Select the code to copy it.' : copied ? 'Illustrative code copied' : 'API design preview · not a published SDK'}</div></div>
  </div></section>;
}
