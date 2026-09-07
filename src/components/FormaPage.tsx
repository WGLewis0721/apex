import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, CreditCard, Loader2, Plus, RotateCcw, Sparkles, TriangleAlert, Wand2 } from 'lucide-react';
import { AuditEvent, Store, loadStore, saveStore } from '../lib/controlPlane';
import {
  FORMA_PLANS,
  canGenerate,
  failFormaPayment,
  formaAllowance,
  formaRemaining,
  planLimit,
  recordGeneration,
  recoverFormaPayment,
  renewFormaPeriod,
  resetFormaAccount,
  subscribeForma,
  topUpForma,
  upgradeForma,
} from '../lib/forma';
import '../forma.css';

const TOP_UP_SIZE = 10;
const TOP_UP_PRICE = 5;

const PROMPTS = [
  'Write a launch announcement for our new design studio.',
  'Draft a friendly follow-up email after a sales call.',
  'Turn these release notes into a short changelog post.',
];

const DRAFTS = [
  'Meet a studio built for your next big idea. Thoughtful design, fresh perspective, and a team that ships. Say hello — we would love to hear what you are building.',
  'Thanks again for the time today. I pulled together the two points you raised and a short plan for what happens next. Let me know if a quick call this week works.',
  'This release focuses on speed and clarity: faster loads, a cleaner editor, and clearer limits so you always know what is left in your plan.',
];

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function FormaPage() {
  const [store, setStore] = useState<Store>(() => loadStore());
  const [prompt, setPrompt] = useState(PROMPTS[0]);
  const [generating, setGenerating] = useState(false);
  const [drafts, setDrafts] = useState<{ id: number; prompt: string; body: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<number>();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function commit(next: Store) {
    setStore(next);
    if (!saveStore(next)) setError('This browser blocked local storage, so the demo will not remember this session.');
  }

  const account = store.forma;
  const plan = FORMA_PLANS[account.plan];
  const allowance = formaAllowance(account);
  const remaining = formaRemaining(account);
  const used = Math.min(account.generationsUsed, allowance);
  const pct = allowance ? Math.min(100, Math.round((used / allowance) * 100)) : 0;
  const decision = canGenerate(account);
  const formaEvents = store.audit.filter((e) => e.action.startsWith('forma.'));
  const blocked = !decision.allow;

  function generate() {
    if (generating) return;
    setError(null);
    setNotice(null);

    const next = recordGeneration(store);
    commit(next);

    const event = next.audit.find((e) => e.action === 'forma.generate');
    if (event?.result === 'deny') {
      setError(event.detail);
      return;
    }

    setGenerating(true);
    timer.current = window.setTimeout(() => {
      setDrafts((prev) => [
        { id: Date.now(), prompt, body: DRAFTS[prev.length % DRAFTS.length] },
        ...prev,
      ].slice(0, 4));
      setGenerating(false);
    }, 700);
  }

  function run(next: Store, message: string) {
    commit(next);
    setError(null);
    setNotice(message);
  }

  return (
    <div className="ap-site fx">
      <a className="ap-skip" href="#main">Skip to content</a>

      <header className="ap-nav fx-nav">
        <a className="ap-logo" href="#" aria-label="APEX home">APEX</a>
        <span className="fx-nav-mark"><Wand2 size={15} /> Forma <small>Demo app</small></span>
        <a className="fx-nav-back" href="#"><ArrowLeft size={14} /> Back to APEX</a>
      </header>

      <main id="main" className="ap-container fx-main">
        <section className="fx-head">
          <div>
            <p className="ap-eyebrow"><span /> AN AI WRITING APP RUNNING ON APEX.</p>
            <h1>Write something.<br /><span>APEX decides if you can.</span></h1>
            <p className="fx-lede">
              Forma is a sample product. Every generation checks the plan, spends one credit, and updates
              billing state — all through the APEX control plane. Nothing here charges real money.
            </p>
          </div>
          <div className="fx-head-meta">
            <span className="fx-pill">SIMULATED DATA</span>
            <button className="fx-ghost" onClick={() => {
              setDrafts([]);
              setNotice(null);
              setError(null);
              run(resetFormaAccount(store), 'Demo reset to a fresh Free account.');
            }}><RotateCcw size={14} /> Reset demo</button>
          </div>
        </section>

        <div className="fx-grid">
          <section className="fx-panel fx-editor" aria-label="Generate">
            <div className="fx-panel-head">
              <h2><Sparkles size={17} /> New draft</h2>
              <span>1 generation per request</span>
            </div>

            <label className="fx-label" htmlFor="fx-prompt">What should Forma write?</label>
            <textarea
              id="fx-prompt"
              className="fx-textarea"
              rows={4}
              maxLength={400}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want to write…"
            />
            <div className="fx-suggestions">
              {PROMPTS.map((p) => (
                <button key={p} type="button" onClick={() => setPrompt(p)} aria-pressed={prompt === p}>{p.slice(0, 34)}…</button>
              ))}
            </div>

            <div className="fx-editor-actions">
              <button className="fx-primary" onClick={generate} disabled={generating || blocked || !prompt.trim()}>
                {generating ? <><Loader2 size={16} className="fx-spin" /> Generating…</> : <><Sparkles size={16} /> Generate</>}
              </button>
              <span className="fx-remaining">{remaining} of {allowance} generations left</span>
            </div>

            {blocked && (
              <div className="fx-alert is-limit" role="status">
                <TriangleAlert size={16} />
                <div>
                  <b>You have used every generation on the {plan.name} plan.</b>
                  <p>{decision.reason}</p>
                  <div className="fx-alert-actions">
                    {account.plan === 'free'
                      ? <button className="fx-primary fx-small" onClick={() => run(upgradeForma(store), `Upgraded to Pro. ${FORMA_PLANS.pro.limit} generations per month are now available.`)}>Upgrade to Pro <ArrowRight size={14} /></button>
                      : <button className="fx-primary fx-small" onClick={() => run(renewFormaPeriod(store), 'New billing period started. Usage is back to zero.')}>Start next billing period <ArrowRight size={14} /></button>}
                    <button className="fx-ghost fx-small" onClick={() => run(topUpForma(store, TOP_UP_SIZE), `Added ${TOP_UP_SIZE} bonus generations.`)}>
                      <Plus size={14} /> Buy {TOP_UP_SIZE} more · ${TOP_UP_PRICE}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {error && !blocked && <div className="fx-alert is-error" role="alert"><TriangleAlert size={16} /><p>{error}</p></div>}
            {notice && !error && <div className="fx-alert is-ok" role="status"><CheckCircle2 size={16} /><p>{notice}</p></div>}

            <div className="fx-results" aria-live="polite">
              {generating && <article className="fx-draft is-loading"><span /><span /><span /></article>}
              {!generating && !drafts.length && (
                <div className="fx-empty">
                  <Wand2 size={22} />
                  <b>No drafts yet</b>
                  <p>Write a prompt and press Generate. Each draft spends one generation from your plan.</p>
                </div>
              )}
              {drafts.map((d) => (
                <article className="fx-draft" key={d.id}>
                  <small>{d.prompt}</small>
                  <p>{d.body}</p>
                </article>
              ))}
            </div>
          </section>

          <aside className="fx-side">
            <section className="fx-panel fx-plan" aria-label="Plan and usage">
              <div className="fx-plan-top">
                <span>{plan.name} plan</span>
                <span className={`fx-status ${account.status === 'grace_period' ? 'is-warning' : ''}`}>
                  {account.status === 'grace_period' ? 'Payment issue' : 'Active'}
                </span>
              </div>
              <div className="fx-price">${plan.price}<small>/ {plan.interval === 'month' ? 'month' : 'forever'}</small></div>
              <p className="fx-plan-note">{planLimit(account)} generations {plan.interval === 'month' ? 'per month' : 'total'}{account.bonusGenerations > 0 && ` · ${account.bonusGenerations} bonus`}</p>

              <div className="fx-meter" role="img" aria-label={`${used} of ${allowance} generations used`}>
                <span style={{ width: `${pct}%` }} className={blocked ? 'is-full' : ''} />
              </div>
              <div className="fx-meter-label"><span>{used} used</span><span>{remaining} left</span></div>

              {account.plan === 'free' ? (
                <button className="fx-primary fx-block" onClick={() => run(upgradeForma(store), `Upgraded to Pro. ${FORMA_PLANS.pro.limit} generations per month are now available.`)}>
                  Upgrade to Pro · ${FORMA_PLANS.pro.price}/mo <ArrowRight size={15} />
                </button>
              ) : (
                <button className="fx-ghost fx-block" onClick={() => run(subscribeForma(store, 'free'), 'Moved back to the Free plan.')}>Switch to Free</button>
              )}
              <button className="fx-ghost fx-block" onClick={() => run(topUpForma(store, TOP_UP_SIZE), `Added ${TOP_UP_SIZE} bonus generations.`)}>
                <Plus size={14} /> Top up {TOP_UP_SIZE} generations · ${TOP_UP_PRICE}
              </button>
              <p className="fx-stub"><CreditCard size={12} /> Checkout is a stub. A real build would call a payment provider here.</p>
            </section>

            <section className="fx-panel fx-billing" aria-label="Billing simulation">
              <div className="fx-panel-head"><h2>Billing simulation</h2></div>
              <div className="fx-billing-actions">
                {account.status === 'active' ? (
                  <button className="fx-ghost fx-block" disabled={account.plan !== 'pro'} onClick={() => run(failFormaPayment(store), 'Renewal failed. Access continues during the grace period.')}>Simulate failed renewal</button>
                ) : (
                  <button className="fx-ghost fx-block" onClick={() => run(recoverFormaPayment(store), 'Payment recovered. The account is active again.')}>Recover payment</button>
                )}
                <button className="fx-ghost fx-block" disabled={account.plan !== 'pro'} onClick={() => run(renewFormaPeriod(store), 'New billing period started. Usage is back to zero.')}>Start next billing period</button>
              </div>
              {account.plan !== 'pro' && <p className="fx-stub">Billing events apply to the Pro subscription.</p>}
            </section>

            <section className="fx-panel fx-activity" aria-label="Activity">
              <div className="fx-panel-head"><h2>Activity</h2><span>{formaEvents.length}</span></div>
              {formaEvents.length ? (
                <ul className="fx-feed">
                  {formaEvents.slice(0, 8).map((e: AuditEvent) => (
                    <li key={e.id}>
                      <span className={`fx-dot ${e.result === 'deny' ? 'is-deny' : e.result === 'allow' ? 'is-allow' : ''}`} />
                      <div><code>{e.action}</code><p>{e.detail}</p></div>
                      <time dateTime={e.at}>{time(e.at)}</time>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="fx-stub">Nothing yet. Generate a draft or change the plan to see APEX decisions here.</p>
              )}
            </section>
          </aside>
        </div>

        <p className="fx-disclosure">
          Forma is a demo surface for the APEX control plane. Plan limits, top-ups, grace periods and audit
          events come from the same logic APEX would run in a real product. <a href="#console">Open the behind-the-scenes controls</a>.
        </p>
      </main>
    </div>
  );
}
