import { FormEvent, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Code2,
  Copy,
  CreditCard,
  Info,
  Loader2,
  Lock,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  ChecklistItem,
  DemoKeys,
  OFFERS,
  OnboardingAccount,
  OnboardingState,
  OnboardingStep,
  PlanId,
  STEP_ORDER,
  Stack,
  checklist,
  checklistProgress,
  furthestUnlockedStep,
  loadOnboarding,
  onboardingReducer,
  resetOnboarding,
  saveOnboarding,
  stepIndex,
} from '../lib/onboarding';
import { createSimulatedBillingProvider, createSimulatedPaymentConnection } from '../lib/launchProviders';
import '../onboarding.css';

const billingProvider = createSimulatedBillingProvider();
const paymentConnection = createSimulatedPaymentConnection();

const STEP_LABELS: Record<OnboardingStep, string> = {
  plan: 'Choose APEX',
  account: 'Create account',
  purchase: 'Purchase',
  workspace: 'Workspace ready',
  payments: 'Connect payments',
  install: 'Install APEX',
  verify: 'Verify connection',
  complete: 'Go live',
};

const asset = (name: string) => `/apex/assets/${name}`;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy to clipboard"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

export default function Onboarding() {
  const [state, setState] = useState<OnboardingState>(() => loadOnboarding());
  const [accountForm, setAccountForm] = useState(() => state.account ?? { name: '', email: '', company: '' });
  const [accountError, setAccountError] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ allowance: number; remaining: number } | null>(() => (state.verificationPassed ? { allowance: 1000, remaining: 750 } : null));

  function apply(next: OnboardingState) {
    setState(next);
    saveOnboarding(next);
  }

  function dispatch(action: Parameters<typeof onboardingReducer>[1]) {
    apply(onboardingReducer(state, action));
  }

  const furthest = furthestUnlockedStep(state);
  const items = checklist(state);
  const progress = checklistProgress(state);

  function goto(step: OnboardingStep) {
    if (stepIndex(step) > stepIndex(furthest)) return;
    dispatch({ type: 'goto', step });
  }

  async function submitAccount(e: FormEvent) {
    e.preventDefault();
    if (!accountForm.name.trim() || !accountForm.company.trim()) {
      setAccountError('Name and company are required.');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(accountForm.email.trim())) {
      setAccountError('Enter a work email address.');
      return;
    }
    setAccountError(null);
    const account: OnboardingAccount = { name: accountForm.name.trim(), email: accountForm.email.trim(), company: accountForm.company.trim() };
    dispatch({ type: 'submit_account', account });
  }

  async function runPurchase() {
    if (purchasing || !state.selectedPlan) return;
    setPurchasing(true);
    dispatch({ type: 'purchase_pending' });
    const offer = OFFERS[state.selectedPlan];
    const result = await billingProvider.checkout({ planId: offer.id, setupFee: offer.setupFee, monthly: offer.monthly });
    apply(onboardingReducer(onboardingReducer(state, { type: 'purchase_pending' }), { type: 'purchase_succeeded', receiptId: result.receiptId }));
    setPurchasing(false);
  }

  async function runConnect() {
    if (connecting) return;
    setConnecting(true);
    dispatch({ type: 'connect_payments_pending' });
    await paymentConnection.connect();
    apply(onboardingReducer(onboardingReducer(state, { type: 'connect_payments_pending' }), { type: 'connect_payments_succeeded' }));
    setConnecting(false);
  }

  async function runVerification() {
    if (verifying) return;
    setVerifying(true);
    setVerifyResult(null);
    await new Promise((resolve) => setTimeout(resolve, 700));
    dispatch({ type: 'run_verification' });
    setVerifyResult({ allowance: 1000, remaining: 750 });
    setVerifying(false);
  }

  return (
    <div className="ap-site ob">
      <a className="ap-skip" href="#main">Skip to content</a>
      <header className="ap-nav ob-nav">
        <a className="ap-logo" href="#" aria-label="APEX home">APEX</a>
        <span className="ob-nav-mark"><Sparkles size={14} /> Start with APEX</span>
        <button className="ob-reset" onClick={() => { if (window.confirm('Reset this onboarding demo? Nothing you entered is a real account.')) { apply(resetOnboarding()); setAccountForm({ name: '', email: '', company: '' }); setVerifyResult(null); } }}>
          <RotateCcw size={13} /> Reset onboarding demo
        </button>
        <a className="ob-nav-back" href="#"><ArrowLeft size={14} /> Back to APEX</a>
      </header>

      <div className="ob-mobile-rail">
        <div className="ob-mobile-rail-label"><span>Step {stepIndex(state.step) + 1} of {STEP_ORDER.length}</span><b>{STEP_LABELS[state.step]}</b></div>
        <div className="ob-progress-track"><span style={{ width: `${((stepIndex(state.step) + 1) / STEP_ORDER.length) * 100}%` }} /></div>
      </div>

      <main id="main" className="ob-body">
        <nav className="ob-rail" aria-label="Onboarding progress">
          {STEP_ORDER.map((step, i) => {
            const done = stepIndex(furthest) > i || (step === 'complete' && state.step === 'complete');
            const reachable = stepIndex(step) <= stepIndex(furthest);
            return (
              <button
                key={step}
                className={done ? 'ob-rail-item ob-rail-done' : 'ob-rail-item'}
                aria-current={state.step === step ? 'step' : undefined}
                disabled={!reachable}
                onClick={() => goto(step)}
              >
                <span className="ob-rail-dot">{done ? <Check size={11} /> : reachable ? i + 1 : <Lock size={10} />}</span>
                {STEP_LABELS[step]}
              </button>
            );
          })}
        </nav>

        <section className="ob-panel" aria-live="polite">
          {state.step === 'plan' && (
            <PlanStep selected={state.selectedPlan} onSelect={(plan) => dispatch({ type: 'select_plan', plan })} />
          )}

          {state.step === 'account' && (
            <AccountStep
              form={accountForm}
              error={accountError}
              onChange={setAccountForm}
              onSubmit={submitAccount}
              onBack={() => goto('plan')}
            />
          )}

          {state.step === 'purchase' && state.selectedPlan && (
            <PurchaseStep offer={OFFERS[state.selectedPlan]} purchasing={purchasing} onPurchase={runPurchase} onBack={() => goto('account')} />
          )}

          {state.step === 'workspace' && (
            <WorkspaceStep workspaceId={state.workspaceId} keys={state.demoKeys} onContinue={() => dispatch({ type: 'goto_payments' })} />
          )}

          {state.step === 'payments' && (
            <PaymentsStep status={state.paymentProviderStatus} connecting={connecting} onConnect={runConnect} onContinue={() => goto('install')} />
          )}

          {state.step === 'install' && (
            <InstallStep
              stack={state.stack}
              onChooseStack={(stack) => dispatch({ type: 'choose_stack', stack })}
              onConfirm={() => dispatch({ type: 'confirm_install' })}
            />
          )}

          {state.step === 'verify' && (
            <VerifyStep
              verifying={verifying}
              result={verifyResult}
              verificationPassed={state.verificationPassed}
              onRun={runVerification}
              onContinue={() => dispatch({ type: 'enter_complete' })}
            />
          )}

          {state.step === 'complete' && (
            <CompleteStep items={items} progress={progress} onJump={goto} onRequestProduction={() => dispatch({ type: 'request_production' })} productionRequested={state.productionRequested} />
          )}
        </section>
      </main>
    </div>
  );
}

function PlanStep({ selected, onSelect }: { selected: PlanId | null; onSelect: (plan: PlanId) => void }) {
  return (
    <>
      <p className="ob-eyebrow">STEP 1 OF 7 · CHOOSE APEX</p>
      <h1>What if the paid part of your app was already built?</h1>
      <p className="ob-lede">APEX is the commercial plumbing behind a paid product: plan limits, credits, upgrades, and payment-state sync. Pick how you want to start.</p>
      <div className="ob-offers">
        <article className="ob-offer is-featured">
          <span className="ob-offer-badge">RECOMMENDED · FOUNDING PARTNER</span>
          <h3>{OFFERS.founding.name}</h3>
          <p className="ob-tagline">{OFFERS.founding.tagline}</p>
          <div className="ob-offer-price"><b>${OFFERS.founding.monthly}</b><span>/ month, early-access infrastructure</span></div>
          <p className="ob-offer-setup">+ ${OFFERS.founding.setupFee.toLocaleString()} one-time guided implementation</p>
          <ul>{OFFERS.founding.features.map((f) => <li key={f}><CheckCircle2 size={15} />{f}</li>)}</ul>
          <button className="ob-primary" onClick={() => onSelect('founding')} aria-pressed={selected === 'founding'}>Continue with Founding Partner <ArrowRight size={15} /></button>
        </article>
        <article className="ob-offer">
          <h3>{OFFERS.sandbox.name}</h3>
          <p className="ob-tagline">{OFFERS.sandbox.tagline}</p>
          <div className="ob-offer-price"><b>$0</b><span>/ month</span></div>
          <p className="ob-offer-setup">No setup fee</p>
          <ul>{OFFERS.sandbox.features.map((f) => <li key={f}><CheckCircle2 size={15} />{f}</li>)}</ul>
          <button className="ob-ghost" style={{ width: '100%' }} onClick={() => onSelect('sandbox')} aria-pressed={selected === 'sandbox'}>Start free in the sandbox</button>
        </article>
      </div>
      <p className="ob-note">Prices shown are launch-strategy examples for this preview and are easy to change later.</p>
      <div className="ob-mini">
        <p className="ob-eyebrow">WHY APEX</p>
        <img src={asset('launch/apex-payment-to-access.svg')} alt="Stripe answers whether money moved. APEX turns that event into credits, plan rights, usage state, and allow, warn, or block behavior inside the product." />
      </div>
    </>
  );
}

function AccountStep({ form, error, onChange, onSubmit, onBack }: {
  form: { name: string; email: string; company: string };
  error: string | null;
  onChange: (form: { name: string; email: string; company: string }) => void;
  onSubmit: (e: FormEvent) => void;
  onBack: () => void;
}) {
  return (
    <>
      <p className="ob-eyebrow">STEP 2 OF 7 · CREATE ACCOUNT</p>
      <h1>Create your APEX workspace.</h1>
      <p className="ob-lede">Just enough to personalize the rest of this preview.</p>
      <form className="ob-form" onSubmit={onSubmit}>
        <label className="ob-field">Your name
          <input value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} placeholder="Jamie Rivera" autoComplete="name" />
        </label>
        <label className="ob-field">Work email
          <input type="email" value={form.email} onChange={(e) => onChange({ ...form, email: e.target.value })} placeholder="jamie@yourcompany.com" autoComplete="email" />
        </label>
        <label className="ob-field">Company / product name
          <input value={form.company} onChange={(e) => onChange({ ...form, company: e.target.value })} placeholder="Acme Studio" autoComplete="organization" />
        </label>
        {error && <p className="ob-form-error">{error}</p>}
        <div className="ob-preview-note"><Info size={15} /><span>This is a product preview. No real account is created — these details stay in your browser for this demo only.</span></div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" className="ob-ghost" onClick={onBack}><ArrowLeft size={14} /> Back</button>
          <button type="submit" className="ob-primary">Create workspace <ArrowRight size={15} /></button>
        </div>
      </form>
    </>
  );
}

function PurchaseStep({ offer, purchasing, onPurchase, onBack }: { offer: (typeof OFFERS)['founding']; purchasing: boolean; onPurchase: () => void; onBack: () => void }) {
  const totalToday = offer.setupFee + offer.monthly;
  return (
    <>
      <p className="ob-eyebrow">STEP 3 OF 7 · PURCHASE</p>
      <h1>Review your order.</h1>
      <span className="ob-sim-badge">SIMULATED CHECKOUT · NO CARD COLLECTED</span>
      <div className="ob-checkout">
        <div className="ob-checkout-row"><span>{offer.name}</span><span>{offer.tagline}</span></div>
        {offer.setupFee > 0 && <div className="ob-checkout-row"><span>Setup fee</span><span>${offer.setupFee.toLocaleString()}</span></div>}
        <div className="ob-checkout-row"><span>Monthly price</span><span>${offer.monthly}/mo</span></div>
        <div className="ob-checkout-row"><span>What's included</span><span>{offer.features.length} items — see plan details</span></div>
        <div className="ob-checkout-row is-total"><span>Total due today</span><span>${totalToday.toLocaleString()}</span></div>
        <div className="ob-checkout-row"><span>Renews at</span><span>${offer.monthly}/mo</span></div>
      </div>
      <div className="ob-preview-note"><CreditCard size={15} /><span>A real build would redirect here to a Stripe Checkout session. This demo simulates a successful payment and never asks for a card number.</span></div>
      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
        <button type="button" className="ob-ghost" onClick={onBack} disabled={purchasing}><ArrowLeft size={14} /> Back</button>
        <button className="ob-primary" onClick={onPurchase} disabled={purchasing}>
          {purchasing ? <><Loader2 size={16} className="ob-spin" /> Processing…</> : <>Pay ${totalToday.toLocaleString()} and activate <ArrowRight size={15} /></>}
        </button>
      </div>
    </>
  );
}

function WorkspaceStep({ workspaceId, keys, onContinue }: { workspaceId: string | null; keys: DemoKeys | null; onContinue: () => void }) {
  return (
    <>
      <p className="ob-eyebrow">STEP 4 OF 7 · WORKSPACE READY</p>
      <div className="ob-celebrate"><CheckCircle2 size={20} /> Payment received. Your workspace is ready.</div>
      <h1>{workspaceId ?? 'Your workspace'}</h1>
      <div className="ob-workspace-meta">
        <div><span>Environment</span><b>Sandbox</b></div>
        <div><span>Workspace ID</span><code>{workspaceId}</code></div>
      </div>
      <p className="ob-lede">These are demo keys — obvious preview values, not real credentials. A real workspace would show live keys here instead.</p>
      {keys && (
        <div className="ob-keys">
          <div className="ob-key-row"><span>PUBLISHABLE</span><code>{keys.publishable}</code><CopyButton text={keys.publishable} /></div>
          <div className="ob-key-row"><span>SECRET</span><code>{keys.secret}</code><CopyButton text={keys.secret} /></div>
        </div>
      )}
      <button className="ob-primary" onClick={onContinue}>Connect my payment provider <ArrowRight size={15} /></button>
    </>
  );
}

function PaymentsStep({ status, connecting, onConnect, onContinue }: { status: OnboardingState['paymentProviderStatus']; connecting: boolean; onConnect: () => void; onContinue: () => void }) {
  return (
    <>
      <p className="ob-eyebrow">STEP 5 OF 7 · CONNECT PAYMENTS</p>
      <h1>Connect Stripe.</h1>
      <p className="ob-lede">Stripe moves the money. APEX uses those payment events to update what the customer gets inside your product.</p>
      <div className="ob-connect">
        <div className="ob-connect-icon"><CreditCard size={20} /></div>
        <div style={{ flex: 1 }}>
          <b>Stripe</b>
          <div className={`ob-connect-status ${status === 'demo_connected' ? 'is-connected' : status === 'connecting' ? 'is-connecting' : ''}`}>
            {status === 'demo_connected' ? 'CONNECTED IN DEMO' : status === 'connecting' ? 'CONNECTING…' : 'NOT CONNECTED'}
          </div>
        </div>
        {status !== 'demo_connected' && (
          <button className="ob-ghost" onClick={onConnect} disabled={connecting}>
            {connecting ? <><Loader2 size={15} className="ob-spin" /> Connecting…</> : 'Connect Stripe (demo)'}
          </button>
        )}
      </div>
      <div className="ob-preview-note"><Info size={15} /><span>There is no real Stripe OAuth connection yet. This is an interactive preview of the connection state — a real build would redirect to Stripe Connect here.</span></div>
      <button className="ob-primary" style={{ marginTop: 20 }} disabled={status !== 'demo_connected'} onClick={onContinue}>Continue to install <ArrowRight size={15} /></button>
    </>
  );
}

const NPM_INSTALL = 'npm install @apex/sdk';
const QUICKSTART = `import { Apex } from "@apex/sdk";

const apex = new Apex({ apiKey: process.env.APEX_SECRET_KEY });

const decision = await apex.access.check({
  customer: session.customerId,
  action: "generate_content",
});

if (decision.outcome !== "allow") return denyRequest(decision.reason);`;
const COMPONENTS = `<ApexUsage />
<ApexBilling />
<ApexUpgrade />`;

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="ob-code">
      <div className="ob-code-top"><span>{label}</span><CopyButton text={code} /></div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

function InstallStep({ stack, onChooseStack, onConfirm }: { stack: Stack | null; onChooseStack: (stack: Stack) => void; onConfirm: () => void }) {
  return (
    <>
      <p className="ob-eyebrow">STEP 6 OF 7 · INSTALL APEX</p>
      <h1>Install the SDK.</h1>
      <p className="ob-lede">Choose your stack, then drop APEX into your app.</p>
      <div className="ob-stacks">
        <button aria-pressed={stack === 'javascript'} onClick={() => onChooseStack('javascript')}>JavaScript / TypeScript</button>
        <button disabled title="Coming next">Python (coming next)</button>
        <button disabled title="Coming next">Other languages (coming next)</button>
      </div>
      <CodeBlock label="1. Install" code={NPM_INSTALL} />
      <CodeBlock label="2. Server-side quickstart" code={QUICKSTART} />
      <p className="ob-preview-flag"><Code2 size={13} /> API design preview · @apex/sdk is not a published package yet.</p>
      <CodeBlock label="Optional embedded components" code={COMPONENTS} />
      <p className="ob-preview-flag"><Code2 size={13} /> API design preview · these components are not published yet.</p>
      <button className="ob-primary" disabled={!stack} onClick={onConfirm}>I've installed it — continue to verify <ArrowRight size={15} /></button>
      <div className="ob-mini">
        <p className="ob-eyebrow">HOW APEX SHIPS</p>
        <img src={asset('launch/apex-how-it-ships.svg')} alt="You install a lightweight SDK and components in your app; APEX itself runs as hosted infrastructure kept in sync with your payment provider." />
      </div>
    </>
  );
}

function VerifyStep({ verifying, result, verificationPassed, onRun, onContinue }: {
  verifying: boolean;
  result: { allowance: number; remaining: number } | null;
  verificationPassed: boolean;
  onRun: () => void;
  onContinue: () => void;
}) {
  return (
    <>
      <p className="ob-eyebrow">STEP 7 OF 7 · VERIFY CONNECTION</p>
      <h1>Test APEX.</h1>
      <p className="ob-lede">Your app can now ask APEX what a customer paid for, how much they have left, and whether an action should be allowed.</p>
      <div className="ob-verify-card">
        <div className="ob-verify-row"><ShieldCheck size={16} /> Sample customer <b style={{ marginLeft: 'auto' }}>Pro</b></div>
        <div className="ob-verify-row"><Sparkles size={16} /> Allowance <b style={{ marginLeft: 'auto' }}>1,000 credits</b></div>
        {!verifying && !verificationPassed && <div className="ob-verify-row" style={{ color: 'var(--ap-muted)' }}>Send a test request to see APEX decide in real time.</div>}
        {verifying && <div className="ob-verify-anim"><Loader2 size={16} className="ob-spin" /> Request arriving at APEX…</div>}
        {result && verificationPassed && (
          <div className="ob-verify-success"><CheckCircle2 size={19} /> APEX returned ALLOW · {result.remaining} of {result.allowance} credits remaining</div>
        )}
      </div>
      {!verificationPassed ? (
        <button className="ob-primary" onClick={onRun} disabled={verifying}>
          {verifying ? <><Loader2 size={16} className="ob-spin" /> Checking access…</> : <>Send a test request <ArrowRight size={15} /></>}
        </button>
      ) : (
        <>
          <div className="ob-celebrate"><CheckCircle2 size={20} /> APEX is connected.</div>
          <button className="ob-primary" onClick={onContinue}>See your launch checklist <ArrowRight size={15} /></button>
        </>
      )}
    </>
  );
}

function CompleteStep({ items, progress, onJump, onRequestProduction, productionRequested }: {
  items: ChecklistItem[];
  progress: { done: number; total: number };
  onJump: (step: OnboardingStep) => void;
  onRequestProduction: () => void;
  productionRequested: boolean;
}) {
  return (
    <>
      <p className="ob-eyebrow">YOU'RE SET UP</p>
      <h1>Welcome to APEX.</h1>
      <p className="ob-lede">Finish the rest whenever you're ready. Each step below links back to exactly where you left off.</p>
      <p className="ob-progress-line">{progress.done} of {progress.total} complete</p>
      <div className="ob-progress-track"><span style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
      <ul className="ob-checklist">
        {items.map((item) => (
          <li key={item.id}>
            <button disabled={item.done} onClick={() => onJump(item.step)}>
              <span className={`ob-check-dot ${item.done ? 'is-done' : ''}`}>{item.done ? <Check size={12} /> : <Circle size={8} fill="currentColor" />}</span>
              <span>
                {item.label}
                {!item.done && <small>Go to {STEP_LABELS[item.step]} →</small>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {!productionRequested ? (
        <button className="ob-ghost" onClick={onRequestProduction}>Request production access</button>
      ) : (
        <p className="ob-preview-note"><Info size={15} /><span>Production access requested (simulated). A real build would open a ticket here — nothing is provisioned automatically in this preview.</span></p>
      )}
      <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
        <a className="ob-primary" style={{ textDecoration: 'none' }} href="#console">Open APEX dashboard <ArrowRight size={15} /></a>
        <a className="ob-ghost" style={{ textDecoration: 'none' }} href="#forma">See it running in Forma</a>
      </div>
    </>
  );
}
