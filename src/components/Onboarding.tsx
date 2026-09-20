import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
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
  Sparkles,
} from 'lucide-react';
import {
  ChecklistItem,
  DemoKeys,
  LAUNCHER_STAGES,
  LAUNCHER_STAGE_COUNT,
  OFFERS,
  OnboardingAccount,
  OnboardingState,
  OnboardingStep,
  PlanId,
  STEP_ORDER,
  checklist,
  checklistProgress,
  furthestUnlockedStep,
  loadOnboarding,
  initialOnboarding,
  onboardingReducer,
  resetOnboarding,
  saveOnboarding,
  stepIndex,
} from '../lib/onboarding';
import {
  createSimulatedBillingProvider,
  createSimulatedEnvironment,
  createSimulatedInstaller,
  createSimulatedPaymentConnection,
  createSimulatedVerification,
} from '../lib/launchProviders';
import { backendConfigured, supabase } from '../lib/supabaseClient';
import {
  getCurrentAccount,
  getManualStripeWebhook,
  getProvisionedWorkspace,
  getStripeConnection,
  signIn,
  signUpOrSignIn,
  startCheckout,
  configureManualStripeWebhook,
  startStripeConnect,
  type ProvisionedWorkspace,
} from '../lib/backend';
import '../onboarding.css';

const billingProvider = createSimulatedBillingProvider();
const paymentConnection = createSimulatedPaymentConnection();

const STEP_LABELS: Record<OnboardingStep, string> = {
  plan: 'Choose APEX',
  account: 'Create account',
  purchase: 'Purchase',
  workspace: 'Workspace ready',
  stack: 'Select stack',
  payments: 'Connect Stripe',
  launcher: 'Install APEX',
  complete: 'Go live',
};

const TOTAL_NUMBERED_STEPS = STEP_ORDER.length;
const stepEyebrow = (step: OnboardingStep, title: string) => `STEP ${stepIndex(step) + 1} OF ${TOTAL_NUMBERED_STEPS} · ${title}`;
const asset = (name: string) => `/apex/assets/${name}`;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

function ArchitectureStrip() {
  const nodes = ['Your app', '@apex/sdk / CLI', 'APEX Cloud', 'Stripe'];
  return (
    <div className="ob-arch" aria-label="APEX architecture">
      <div className="ob-arch-row">
        {nodes.map((n, i) => (
          <span key={n}>
            <b>{n}</b>
            {i < nodes.length - 1 && <ArrowRight size={13} />}
          </span>
        ))}
      </div>
      <p className="ob-arch-note">Only a thin client installs in your app. APEX Cloud and the entitlement engine run remotely — none of it runs on your machine.</p>
    </div>
  );
}

function ShipsStrip() {
  const nodes = ['GitHub source', 'CI/CD', 'npm / installer distribution', 'Customer app', 'Hosted APEX Cloud'];
  return (
    <div className="ob-mini">
      <p className="ob-eyebrow">HOW APEX SHIPS</p>
      <div className="ob-ships">
        {nodes.map((n, i) => (
          <span key={n}>
            <b>{i + 1}</b>{n}
            {i < nodes.length - 1 && <ArrowRight size={12} />}
          </span>
        ))}
      </div>
      <p className="ob-note">APEX's own code ships through ordinary CI/CD to npm and a small CLI installer. Buying APEX never installs the APEX Cloud backend on your machine — only the client library your app calls.</p>
    </div>
  );
}

export default function Onboarding() {
  const [state, setState] = useState<OnboardingState>(() => backendConfigured ? initialOnboarding() : loadOnboarding());
  const [accountForm, setAccountForm] = useState(() => ({ ...(state.account ?? { name: '', email: '', company: '' }), password: '' }));
  const [accountError, setAccountError] = useState<string | null>(null);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const [recoveryMode, setRecoveryMode] = useState(new URLSearchParams(window.location.search).get('recovery') === '1');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup');
  const [authBusy, setAuthBusy] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const authGeneration = useRef(0);
  const activeUserId = useRef<string | null>(null);
  const [workspace, setWorkspace] = useState<ProvisionedWorkspace | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [checking, setChecking] = useState(backendConfigured);
  const [waitingForPayment, setWaitingForPayment] = useState(new URLSearchParams(window.location.search).get('checkout') === 'success');
  const [connecting, setConnecting] = useState(false);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [manualWebhook, setManualWebhook] = useState<{ configured: boolean; endpoint: string | null } | null>(null);
  const [manualSecret, setManualSecret] = useState('');
  const [manualBusy, setManualBusy] = useState(false);

  function apply(next: OnboardingState) {
    setState(next);
    if (!backendConfigured) saveOnboarding(next);
  }

  function dispatch(action: Parameters<typeof onboardingReducer>[1]) {
    apply(onboardingReducer(state, action));
  }

  function hydrateFromServer(patch: Partial<OnboardingState>, landOn?: OnboardingStep) {
    setState((prev) => {
      const merged: OnboardingState = { ...prev, ...patch };
      if (landOn && stepIndex(landOn) > stepIndex(merged.step)) merged.step = landOn;
      if (!backendConfigured) saveOnboarding(merged);
      return merged;
    });
  }

  async function refreshWorkspace(): Promise<boolean> {
    const generation = authGeneration.current;
    const result = await getProvisionedWorkspace();
    if (generation !== authGeneration.current) return false;
    if (result.status === 'ready') {
      setWorkspace(result);
      setWaitingForPayment(false);
      hydrateFromServer({
        selectedPlan: 'founding',
        accountCreated: true,
        purchaseStatus: 'paid',
        workspaceCreated: true,
        workspaceId: result.workspace.id,
        demoKeys: null,
      }, 'workspace');
      return true;
    }
    return false;
  }

  async function refreshStripeConnection() {
    const generation = authGeneration.current;
    const result = await getStripeConnection();
    if (generation !== authGeneration.current) return;
    setStripeAccountId(result.stripeAccountId);
    if (result.status === 'connected') {
      hydrateFromServer({ stack: 'javascript', paymentProviderStatus: 'connected' });
    } else if (result.status === 'pending') {
      // A redirect can be abandoned or rejected outside APEX. Never let a
      // stale OAuth attempt displace a payment-verified workspace on restore.
      hydrateFromServer({ stack: 'javascript', paymentProviderStatus: 'connecting' });
    } else {
      hydrateFromServer({ paymentProviderStatus: 'not_connected' });
    }
  }

  async function refreshManualWebhook() {
    const generation = authGeneration.current;
    const result = await getManualStripeWebhook();
    if (generation === authGeneration.current) setManualWebhook(result);
  }

  useEffect(() => {
    if (!backendConfigured) return;
    let active = true;
    const generation = authGeneration.current;
    const restore = async () => {
      try {
        const account = await getCurrentAccount();
        if (!active || !account || generation !== authGeneration.current) return;
        setAccountForm({ name: account.fullName ?? '', email: account.email, company: account.companyName ?? '', password: '' });
        hydrateFromServer({
          account: { name: account.fullName ?? '', email: account.email, company: account.companyName ?? '' },
          accountCreated: true,
          selectedPlan: 'founding',
        }, 'purchase');
        const ready = await refreshWorkspace();
        if (ready) { await refreshStripeConnection(); await refreshManualWebhook(); }
      } catch (error) {
        if (active) setBillingError(error instanceof Error ? error.message : 'Could not restore your account.');
      } finally {
        if (active) setChecking(false);
      }
    };
    void restore();
    const { data } = supabase!.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
        setChecking(false);
      }
      if (event === 'SIGNED_OUT' || (activeUserId.current && session?.user && activeUserId.current !== session.user.id)) {
        authGeneration.current++;
        setBillingError(null);
        setWorkspace(null);
        setStripeAccountId(null);
        setState(initialOnboarding());
        setWaitingForPayment(false);
        setAccountForm({ name: '', email: '', company: '', password: '' });
      }
      activeUserId.current = session?.user.id ?? null;
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!backendConfigured || !waitingForPayment || !state.accountCreated) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { await refreshWorkspace(); } catch { /* Keep waiting; allow manual retry. */ }
      if (!cancelled) timer = setTimeout(poll, 3000);
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [waitingForPayment, state.accountCreated]);

  const furthest = furthestUnlockedStep(state);
  const items = checklist(state);
  const progress = checklistProgress(state);

  function goto(step: OnboardingStep) {
    if (backendConfigured && stepIndex(step) > stepIndex('payments')) return;
    if (stepIndex(step) > stepIndex(furthest)) return;
    dispatch({ type: 'goto', step });
  }

  function continueFromWorkspace() {
    dispatch({ type: 'choose_stack', stack: 'javascript' });
  }

  async function requestPasswordReset() {
    if (!backendConfigured || authBusy) return;
    const email = accountForm.email.trim();
    if (!email) {
      setAccountError('Enter your email first.');
      return;
    }
    setAccountError(null);
    setResetNotice(null);
    setAuthBusy(true);
    try {
      const redirectTo = `${window.location.origin}${window.location.pathname}?recovery=1`;
      const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      setResetNotice('Password reset email sent. Check your inbox.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not send a password reset email.';
      setAccountError(/rate|too many/i.test(message)
        ? 'Email delivery is temporarily rate-limited. APEX needs custom SMTP for reliable auth email delivery.'
        : message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function submitRecoveryPassword(e: FormEvent) {
    e.preventDefault();
    if (recoveryBusy) return;
    if (recoveryPassword.length < 8) {
      setRecoveryError('Use a password of at least 8 characters.');
      return;
    }
    setRecoveryBusy(true);
    setRecoveryError(null);
    try {
      const { error } = await supabase!.auth.updateUser({ password: recoveryPassword });
      if (error) throw error;
      await supabase!.auth.signOut();
      window.location.assign(`${window.location.origin}${window.location.pathname}#start`);
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : 'Could not update your password.');
      setRecoveryBusy(false);
    }
  }

  async function submitAccount(e: FormEvent) {
    e.preventDefault();
    if (backendConfigured) {
      if (!accountForm.email.trim() || accountForm.password.length < 8) {
        setAccountError('Enter your email and a password of at least 8 characters.');
        return;
      }
      if (authMode === 'signup' && (!accountForm.name.trim() || !accountForm.company.trim())) {
        setAccountError('Name and company are required.');
        return;
      }
      setAccountError(null);
      setAuthBusy(true);
      try {
        const account = authMode === 'signup'
          ? await signUpOrSignIn({ name: accountForm.name.trim(), email: accountForm.email.trim(), company: accountForm.company.trim(), password: accountForm.password })
          : await signIn({ email: accountForm.email.trim(), password: accountForm.password });
        authGeneration.current++;
        setAccountForm((f) => ({ ...f, password: '' }));
        setWorkspace(null);
        setStripeAccountId(null);
        setState({ ...initialOnboarding(), account: { name: account.fullName ?? '', email: account.email, company: account.companyName ?? '' }, accountCreated: true, selectedPlan: 'founding', step: 'purchase' });
        try {
          const ready = await refreshWorkspace();
          if (ready) { await refreshStripeConnection(); await refreshManualWebhook(); }
        } catch (error) {
          setBillingError(error instanceof Error ? error.message : 'Could not load workspace status.');
        }
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Something went wrong.';
        const normalized = /rate|too many/i.test(message)
          ? 'Email delivery is temporarily rate-limited. APEX needs custom SMTP for reliable auth email delivery.'
          : message === 'Failed to fetch'
            ? 'Could not reach APEX. Check your connection and try again.'
            : message;
        setAccountError(normalized);
      } finally {
        setAuthBusy(false);
      }
      return;
    }

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
    if (backendConfigured) {
      setBillingError(null);
      try {
        const result = await startCheckout();
        if (result.url) { window.location.assign(result.url); return; }
        setWaitingForPayment(true);
        await refreshWorkspace();
      } catch (error) {
        setBillingError(error instanceof Error ? error.message : 'Could not start checkout.');
      } finally {
        setPurchasing(false);
      }
      return;
    }
    dispatch({ type: 'purchase_pending' });
    const offer = OFFERS[state.selectedPlan];
    const result = await billingProvider.checkout({ planId: offer.id, setupFee: offer.setupFee, monthly: offer.monthly });
    apply(onboardingReducer(onboardingReducer(state, { type: 'purchase_pending' }), { type: 'purchase_succeeded', receiptId: result.receiptId }));
    setPurchasing(false);
  }

  async function runConnect() {
    if (connecting) return;
    setConnecting(true);
    setBillingError(null);

    if (backendConfigured) {
      hydrateFromServer({ stack: 'javascript', paymentProviderStatus: 'connecting' }, 'payments');
      try {
        const result = await startStripeConnect();
        if (result.status === 'connected') {
          setStripeAccountId(result.stripeAccountId ?? null);
          hydrateFromServer({ stack: 'javascript', paymentProviderStatus: 'connected' }, 'payments');
          return;
        }
        if (result.url) {
          window.location.assign(result.url);
          return;
        }
        throw new Error('Stripe did not return an authorization URL.');
      } catch (error) {
        hydrateFromServer({ paymentProviderStatus: 'not_connected' });
        setBillingError(error instanceof Error ? error.message : 'Could not start Stripe authorization.');
      } finally {
        setConnecting(false);
      }
      return;
    }

    dispatch({ type: 'connect_payments_pending' });
    await paymentConnection.connect();
    apply(onboardingReducer(onboardingReducer(state, { type: 'connect_payments_pending' }), { type: 'connect_payments_succeeded' }));
    setConnecting(false);
  }

  async function saveManualWebhook() {
    if (manualBusy || !manualSecret.trim()) return;
    setManualBusy(true);
    setBillingError(null);
    try {
      const result = await configureManualStripeWebhook(manualSecret.trim());
      setManualWebhook(result);
      setManualSecret('');
      hydrateFromServer({ stack: 'javascript', paymentProviderStatus: 'connected' });
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : 'Could not save the Stripe webhook secret.');
    } finally { setManualBusy(false); }
  }

  if (recoveryMode) {
    return (
      <div className="ap-site ob">
        <header className="ap-nav ob-nav">
          <a className="ap-logo" href="#" aria-label="APEX home">APEX</a>
          <span className="ob-nav-mark"><Lock size={14} /> Password recovery</span>
        </header>
        <main id="main" className="ob-body" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
          <section className="ob-panel">
            <p className="ob-eyebrow">ACCOUNT RECOVERY</p>
            <h1>Choose a new password.</h1>
            <p className="ob-lede">This recovery link is tied to your APEX account. Set a new password, then log in again.</p>
            <form className="ob-form" onSubmit={submitRecoveryPassword}>
              <label className="ob-field">New password
                <input type="password" value={recoveryPassword} onChange={(e) => setRecoveryPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" minLength={8} />
              </label>
              {recoveryError && <p className="ob-form-error" role="alert">{recoveryError}</p>}
              <button type="submit" className="ob-primary" disabled={recoveryBusy}>
                {recoveryBusy ? <><Loader2 size={16} className="ob-spin" /> Updating…</> : <>Update password <ArrowRight size={15} /></>}
              </button>
            </form>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="ap-site ob">
      <a className="ap-skip" href="#main">Skip to content</a>
      <header className="ap-nav ob-nav">
        <a className="ap-logo" href="#" aria-label="APEX home">APEX</a>
        <span className="ob-nav-mark"><Sparkles size={14} /> Start with APEX</span>
        {backendConfigured ? <button className="ob-reset" onClick={() => void supabase!.auth.signOut()}>Sign out</button> : <button className="ob-reset" onClick={() => { if (window.confirm('Reset this onboarding demo? Nothing you entered is a real account.')) { apply(resetOnboarding()); setAccountForm({ name: '', email: '', company: '', password: '' }); } }}>
          <RotateCcw size={13} /> Reset onboarding demo
        </button>}
        <a className="ob-nav-back" href="#"><ArrowLeft size={14} /> Back to APEX</a>
      </header>

      <div className="ob-mobile-rail">
        <div className="ob-mobile-rail-label"><span>Step {Math.min(stepIndex(state.step) + 1, TOTAL_NUMBERED_STEPS)} of {TOTAL_NUMBERED_STEPS}</span><b>{STEP_LABELS[state.step]}</b></div>
        <div className="ob-progress-track"><span style={{ width: `${(Math.min(stepIndex(state.step) + 1, TOTAL_NUMBERED_STEPS) / TOTAL_NUMBERED_STEPS) * 100}%` }} /></div>
      </div>

      <main id="main" className="ob-body">
        <nav className="ob-rail" aria-label="Onboarding progress">
          {STEP_ORDER.map((step, i) => {
            const done = stepIndex(furthest) > i || (step === 'complete' && state.step === 'complete');
            const reachable = stepIndex(step) <= stepIndex(furthest) && (!backendConfigured || stepIndex(step) <= stepIndex('payments'));
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
          {checking && <p>Checking your account…</p>}
          {billingError && <p className="ob-form-error" role="alert">{billingError}</p>}
          {waitingForPayment && !workspace && <div className="ob-preview-note"><Info size={15} /><span>Waiting for Stripe to confirm payment. Your workspace appears here after verification. You can return later without paying again.</span></div>}

          {!checking && state.step === 'plan' && (
            <PlanStep selected={state.selectedPlan} onSelect={(plan) => dispatch({ type: 'select_plan', plan })} />
          )}

          {state.step === 'account' && (
            <AccountStep
              form={accountForm}
              error={accountError}
              notice={resetNotice}
              busy={authBusy}
              mode={authMode}
              onToggleMode={() => { setAuthMode((m) => (m === 'signup' ? 'login' : 'signup')); setAccountError(null); setResetNotice(null); }}
              onForgotPassword={requestPasswordReset}
              onChange={setAccountForm}
              onSubmit={submitAccount}
              onBack={() => goto('plan')}
            />
          )}

          {!checking && state.step === 'purchase' && state.selectedPlan && (
            <PurchaseStep offer={OFFERS[state.selectedPlan]} purchasing={purchasing} onPurchase={runPurchase} onBack={() => goto('account')} />
          )}

          {state.step === 'workspace' && (
            backendConfigured && workspace ? <>
              <p className="ob-eyebrow">{stepEyebrow('workspace', 'WORKSPACE READY')}</p>
              <div className="ob-celebrate"><CheckCircle2 size={20} /> Payment verified. Your workspace is ready.</div>
              <h1>{workspace.workspace.name}</h1>
              <div className="ob-workspace-meta"><div><span>Environment</span><b>Sandbox</b></div><div><span>Workspace ID</span><code>{workspace.workspace.id}</code></div></div>
              <p className="ob-note">Subscription: {workspace.subscriptionStatus}. These are real Sandbox credentials. Keep the secret key on your server.</p>
              <div className="ob-keys">
                <div className="ob-key-row"><span>PUBLISHABLE</span><code>{workspace.publishable}</code><CopyButton text={workspace.publishable} /></div>
                {workspace.secret && <div className="ob-key-row"><span>SECRET</span><code>{workspace.secret}</code><CopyButton text={workspace.secret} /></div>}
              </div>
              <button className="ob-ghost" onClick={async () => {
                if (workspace.secret) { setWorkspace({ ...workspace, secret: undefined }); return; }
                const generation = authGeneration.current;
                try {
                  const result = await getProvisionedWorkspace(true);
                  if (result.status === 'ready' && generation === authGeneration.current) setWorkspace(result);
                } catch (error) {
                  setBillingError(error instanceof Error ? error.message : 'Could not reveal credentials.');
                }
              }}>{workspace.secret ? 'Hide secret key' : 'Reveal secret key'}</button>
              <div className="ob-preview-note"><Info size={15} /><span>Payment verification is complete. Connecting a customer Stripe account is optional advanced setup and is not needed to test APEX billing.</span></div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
                <button className="ob-primary" onClick={() => { window.location.assign('#console'); }}>Open APEX dashboard <ArrowRight size={15} /></button>
                <button className="ob-ghost" onClick={continueFromWorkspace}>Connect Stripe later <ArrowRight size={15} /></button>
              </div>
            </> : <WorkspaceStep workspaceId={state.workspaceId} keys={state.demoKeys} onContinue={continueFromWorkspace} />
          )}

          {state.step === 'payments' && (
            <PaymentsStep
              status={state.paymentProviderStatus}
              connecting={connecting}
              stripeAccountId={stripeAccountId}
              onConnect={runConnect}
              onContinue={() => goto('launcher')}
              onFinishDemo={() => { window.location.assign('#console'); }}
              manualWebhook={manualWebhook}
              manualSecret={manualSecret}
              manualBusy={manualBusy}
              onManualSecretChange={setManualSecret}
              onSaveManualWebhook={saveManualWebhook}
            />
          )}

          {state.step === 'launcher' && !backendConfigured && (
            <LauncherStep
              launcherStage={state.launcherStage}
              email={state.account?.email ?? null}
              workspaceId={state.workspaceId}
              onProgress={(stage) => dispatch({ type: 'launcher_progress', stage })}
              onOpenDashboard={() => dispatch({ type: 'enter_complete' })}
            />
          )}

          {state.step === 'complete' && !backendConfigured && (
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
      <p className="ob-eyebrow">{stepEyebrow('plan', 'CHOOSE APEX')}</p>
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
          <button className="ob-ghost" style={{ width: '100%' }} onClick={() => { if (backendConfigured) window.location.hash = 'forma'; else onSelect('sandbox'); }} aria-pressed={selected === 'sandbox'}>{backendConfigured ? 'Explore the free demo' : 'Start free in the sandbox'}</button>
        </article>
      </div>
      <p className="ob-note">{backendConfigured ? 'Checkout is in Stripe test mode. No real money is collected.' : 'Prices shown are launch-strategy examples for this preview.'}</p>
      <div className="ob-mini">
        <p className="ob-eyebrow">WHY APEX</p>
        <img src={asset('launch/apex-payment-to-access.svg')} alt="Stripe answers whether money moved. APEX turns that event into credits, plan rights, usage state, and allow, warn, or block behavior inside the product." />
      </div>
    </>
  );
}

function AccountStep({ form, error, notice, busy, mode, onToggleMode, onForgotPassword, onChange, onSubmit, onBack }: {
  form: { name: string; email: string; company: string; password: string };
  error: string | null;
  notice: string | null;
  busy: boolean;
  mode: 'signup' | 'login';
  onToggleMode: () => void;
  onForgotPassword: () => void;
  onChange: (form: { name: string; email: string; company: string; password: string }) => void;
  onSubmit: (e: FormEvent) => void;
  onBack: () => void;
}) {
  const isLogin = backendConfigured && mode === 'login';
  return (
    <>
      <p className="ob-eyebrow">{stepEyebrow('account', 'CREATE ACCOUNT')}</p>
      <h1>{isLogin ? 'Log in to APEX.' : 'Create your APEX workspace.'}</h1>
      <p className="ob-lede">{backendConfigured ? 'Real sign-up — your account and workspace persist between visits.' : 'Just enough to personalize the rest of this preview.'}</p>
      <form className="ob-form" onSubmit={onSubmit}>
        {!isLogin && (
          <label className="ob-field">Your name
            <input value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} placeholder="Jamie Rivera" autoComplete="name" />
          </label>
        )}
        <label className="ob-field">Work email
          <input type="email" value={form.email} onChange={(e) => onChange({ ...form, email: e.target.value })} placeholder="jamie@yourcompany.com" autoComplete="email" />
        </label>
        {!isLogin && (
          <label className="ob-field">Company / product name
            <input value={form.company} onChange={(e) => onChange({ ...form, company: e.target.value })} placeholder="Acme Studio" autoComplete="organization" />
          </label>
        )}
        {backendConfigured && (
          <label className="ob-field">Password
            <input type="password" value={form.password} onChange={(e) => onChange({ ...form, password: e.target.value })} placeholder="At least 8 characters" autoComplete={isLogin ? 'current-password' : 'new-password'} minLength={8} />
          </label>
        )}
        {error && <p className="ob-form-error">{error}</p>}
        {notice && <p className="ob-note" role="status">{notice}</p>}
        {backendConfigured ? (
          <div className="ob-preview-note"><Info size={15} /><span>Real authentication via Supabase. Your password is never visible to APEX staff.</span></div>
        ) : (
          <div className="ob-preview-note"><Info size={15} /><span>This is a product preview. No real account is created — these details stay in your browser for this demo only.</span></div>
        )}
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" className="ob-ghost" onClick={onBack} disabled={busy}><ArrowLeft size={14} /> Back</button>
          <button type="submit" className="ob-primary" disabled={busy}>
            {busy ? <><Loader2 size={16} className="ob-spin" /> {isLogin ? 'Logging in…' : 'Creating…'}</> : <>{isLogin ? 'Log in' : 'Create account'} <ArrowRight size={15} /></>}
          </button>
        </div>
        {backendConfigured && isLogin && (
          <button type="button" className="ob-link-btn" onClick={onForgotPassword} disabled={busy}>Forgot password?</button>
        )}
        {backendConfigured && (
          <button type="button" className="ob-link-btn" onClick={onToggleMode} disabled={busy}>
            {isLogin ? "Need an account? Sign up instead" : 'Already have an account? Log in'}
          </button>
        )}
      </form>
    </>
  );
}

function PurchaseStep({ offer, purchasing, onPurchase, onBack }: { offer: (typeof OFFERS)['founding']; purchasing: boolean; onPurchase: () => void; onBack: () => void }) {
  const totalToday = offer.setupFee + offer.monthly;
  return (
    <>
      <p className="ob-eyebrow">{stepEyebrow('purchase', 'PURCHASE')}</p>
      <h1>Review your order.</h1>
      <span className="ob-sim-badge">{backendConfigured ? 'STRIPE TEST CHECKOUT · NO REAL CHARGE' : 'SIMULATED CHECKOUT · NO CARD COLLECTED'}</span>
      <div className="ob-checkout">
        <div className="ob-checkout-row"><span>{offer.name}</span><span>{offer.tagline}</span></div>
        {offer.setupFee > 0 && <div className="ob-checkout-row"><span>Setup fee</span><span>${offer.setupFee.toLocaleString()}</span></div>}
        <div className="ob-checkout-row"><span>Monthly price</span><span>${offer.monthly}/mo</span></div>
        <div className="ob-checkout-row"><span>What's included</span><span>{offer.features.length} items — see plan details</span></div>
        <div className="ob-checkout-row is-total"><span>Total due today</span><span>${totalToday.toLocaleString()}</span></div>
        <div className="ob-checkout-row"><span>Renews at</span><span>${offer.monthly}/mo</span></div>
      </div>
      <div className="ob-preview-note"><CreditCard size={15} /><span>{backendConfigured ? 'Continue to Stripe to pay securely in test mode. APEX prepares your workspace only after Stripe confirms payment.' : 'This demo simulates a successful payment and never asks for a card number.'}</span></div>
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
      <p className="ob-eyebrow">{stepEyebrow('workspace', 'WORKSPACE CREATED')}</p>
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
      <button className="ob-primary" onClick={onContinue}>Continue to Connect Stripe <ArrowRight size={15} /></button>
    </>
  );
}

function PaymentsStep({ status, connecting, stripeAccountId, onConnect, onContinue, onFinishDemo, manualWebhook, manualSecret, manualBusy, onManualSecretChange, onSaveManualWebhook }: {
  status: OnboardingState['paymentProviderStatus'];
  connecting: boolean;
  stripeAccountId: string | null;
  onConnect: () => void;
  onContinue: () => void;
  onFinishDemo: () => void;
  manualWebhook: { configured: boolean; endpoint: string | null } | null;
  manualSecret: string;
  manualBusy: boolean;
  onManualSecretChange: (value: string) => void;
  onSaveManualWebhook: () => void;
}) {
  const connected = status === 'connected' || status === 'demo_connected';
  return (
    <>
      <p className="ob-eyebrow">{stepEyebrow('payments', 'CONNECT STRIPE')}</p>
      <h1>Connect Stripe.</h1>
      <p className="ob-lede">Stripe moves the money. This pilot uses a signed Stripe webhook, so there is no OAuth installation gate.</p>
      <ArchitectureStrip />
      <div className="ob-connect">
        <div className="ob-connect-icon"><CreditCard size={20} /></div>
        <div style={{ flex: 1 }}>
          <b>Stripe</b>
          <div className={`ob-connect-status ${connected ? 'is-connected' : status === 'connecting' ? 'is-connecting' : ''}`}>
            {status === 'connected' ? 'CONNECTED' : status === 'demo_connected' ? 'CONNECTED IN DEMO' : status === 'connecting' ? 'CONNECTING…' : 'NOT CONNECTED'}
          </div>
          {backendConfigured && stripeAccountId && <small><code>{stripeAccountId}</code></small>}
        </div>
        {!connected && !backendConfigured && (
          <button className="ob-ghost" onClick={onConnect} disabled={connecting}>
            {connecting ? <><Loader2 size={15} className="ob-spin" /> Connecting…</> : backendConfigured ? (status === 'connecting' ? 'Restart Stripe connection' : 'Connect Stripe') : 'Connect Stripe (demo)'}
          </button>
        )}
      </div>
      {backendConfigured && <div style={{ marginTop: 20 }}>
        <p className="ob-note">1. In Stripe Test mode: Developers → Webhooks → Create event destination. Select <code>checkout.session.completed</code> and <code>charge.refunded</code>.</p>
        <p className="ob-note">2. Paste this endpoint into Stripe:</p>
        {manualWebhook?.endpoint ? <div className="ob-key-row"><code>{manualWebhook.endpoint}</code><CopyButton text={manualWebhook.endpoint} /></div> : <p className="ob-note">Preparing your secure endpoint…</p>}
        <p className="ob-note">3. Reveal Stripe’s signing secret and paste it here:</p>
        <div className="ob-field"><input aria-label="Stripe webhook signing secret" type="password" value={manualSecret} onChange={(e) => onManualSecretChange(e.target.value)} placeholder="whsec_…" autoComplete="off" /></div>
        <button className="ob-primary" style={{ marginTop: 12 }} onClick={onSaveManualWebhook} disabled={manualBusy || !manualSecret.trim()}>{manualBusy ? <><Loader2 size={15} className="ob-spin" /> Saving…</> : <>Save webhook connection <ArrowRight size={15} /></>}</button>
        {manualWebhook?.configured && <div className="ob-celebrate" style={{ marginTop: 20 }}><CheckCircle2 size={20} /> Stripe webhook connected. Create a test Checkout Session with <code>apex_credits</code> metadata to grant credits.</div>}
      </div>}
      <div className="ob-preview-note"><Info size={15} /><span>{backendConfigured ? 'APEX sends you to Stripe’s hosted install page. APEX never receives your Stripe password or secret API key; Stripe returns scoped OAuth credentials to APEX after you approve the app.' : 'This is an interactive preview of the connection state. No Stripe account is actually linked.'}</span></div>
      {backendConfigured ? (
        connected ? <>
          <div className="ob-celebrate" style={{ marginTop: 20 }}><CheckCircle2 size={20} /> Stripe account connected. Step 5 is complete.</div>
          <button className="ob-primary" style={{ marginTop: 20 }} disabled>Install APEX — next step</button>
        </> : <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
          <button className="ob-primary" onClick={onFinishDemo}>Payment test complete <ArrowRight size={15} /></button>
          <span className="ob-note">Connecting Stripe is optional for this test.</span>
        </div>
      ) : (
        <button className="ob-primary" style={{ marginTop: 20 }} disabled={!connected} onClick={onContinue}>Continue to install <ArrowRight size={15} /></button>
      )}
    </>
  );
}

const CLI_INIT = 'npx @apex/cli init';
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

function statusFor(n: number, completed: number, runningStage: number | null): 'pending' | 'running' | 'done' {
  if (n <= completed) return 'done';
  if (n === runningStage) return 'running';
  return 'pending';
}

function staticDetailFor(n: number, email: string | null, workspaceId: string | null): string {
  switch (n) {
    case 1: return `Signed in as ${email ?? 'you'} · workspace ${workspaceId}`;
    case 2: return 'Project scan complete';
    case 3: return 'Node.js 20 · React · TypeScript';
    case 4: return '@apex/sdk@0.1.0-preview';
    case 5: return '.env.local (APEX_PUBLISHABLE_KEY, APEX_SECRET_KEY)';
    case 6: return `Linked to ${workspaceId}`;
    case 7: return 'Stripe connection confirmed (demo)';
    case 8: return 'Webhook listener ready (preview)';
    case 9: return 'cus_demo_pro (Pro)';
    case 10: return '1,000 credits granted';
    case 11: return '250 credits used';
    case 12: return 'Request sent to APEX Cloud';
    case 13: return 'ALLOW · 750 of 1,000 credits remaining';
    case 14: return 'APEX IS READY';
    default: return '';
  }
}

function LauncherStep({ launcherStage, email, workspaceId, onProgress, onOpenDashboard }: {
  launcherStage: number;
  email: string | null;
  workspaceId: string | null;
  onProgress: (stage: number) => void;
  onOpenDashboard: () => void;
}) {
  const installer = useMemo(() => createSimulatedInstaller(), []);
  const environment = useMemo(() => createSimulatedEnvironment(), []);
  const verification = useMemo(() => createSimulatedVerification(), []);

  const [completed, setCompleted] = useState(launcherStage);
  const [runningStage, setRunningStage] = useState<number | null>(null);
  const [detail, setDetail] = useState<Record<number, string>>(() => {
    const seed: Record<number, string> = {};
    for (let n = 1; n <= launcherStage; n++) seed[n] = staticDetailFor(n, email, workspaceId);
    return seed;
  });
  const [decision, setDecision] = useState<{ allowance: number; remaining: number } | null>(
    launcherStage >= 13 ? { allowance: 1000, remaining: 750 } : null,
  );
  const [reverifying, setReverifying] = useState(false);
  const [reverified, setReverified] = useState<{ allowance: number; remaining: number } | null>(null);
  const started = useRef(launcherStage >= LAUNCHER_STAGE_COUNT);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      async function run(n: number, task: () => Promise<string>) {
        setRunningStage(n);
        const text = await task();
        setDetail((d) => ({ ...d, [n]: text }));
        setRunningStage(null);
        setCompleted(n);
        onProgress(n);
      }
      let n = launcherStage;
      if (n < 1) await run(1, async () => { await delay(500); return `Signed in as ${email ?? 'you'} · workspace ${workspaceId}`; });
      if (n < 2) await run(2, async () => { await delay(450); return 'Project scan complete'; });
      if (n < 3) await run(3, async () => { const r = await installer.detectStack(); return `${r.runtime} · ${r.framework} · TypeScript`; });
      if (n < 4) await run(4, async () => { const pkg = await installer.installSdk(); return `${pkg.pkg}@${pkg.version}`; });
      if (n < 5) await run(5, async () => { const cfg = await environment.writeEnvConfig(); return `${cfg.path} (${cfg.variables.join(', ')})`; });
      if (n < 6) await run(6, async () => { await delay(400); return `Linked to ${workspaceId}`; });
      if (n < 7) await run(7, async () => { await delay(400); return 'Stripe connection confirmed (demo)'; });
      if (n < 8) await run(8, async () => { const wh = await environment.configureWebhook(); return `${wh.endpoint} (preview)`; });
      if (n < 9) await run(9, async () => { const c = await verification.sendTestCustomer(); return `${c.customerId} (${c.plan})`; });
      if (n < 10) await run(10, async () => { const g = await verification.grantCredits(); return `${g.amount.toLocaleString()} credits granted`; });
      if (n < 11) await run(11, async () => { const u = await verification.recordUsageEvent(); return `${u.quantity} credits used`; });
      if (n < 12) await run(12, async () => { await delay(400); return 'Request sent to APEX Cloud'; });
      if (n < 13) await run(13, async () => {
        const d = await verification.checkAccess();
        setDecision({ allowance: d.allowance, remaining: d.remaining });
        return `ALLOW · ${d.remaining} of ${d.allowance.toLocaleString()} credits remaining`;
      });
      if (n < 14) await run(14, async () => { await delay(300); return 'APEX IS READY'; });
    })();
  }, []);

  async function verifyAgain() {
    if (reverifying) return;
    setReverifying(true);
    const d = await verification.checkAccess();
    setReverified({ allowance: d.allowance, remaining: d.remaining });
    setReverifying(false);
  }

  const allDone = completed >= LAUNCHER_STAGE_COUNT;

  return (
    <>
      <p className="ob-eyebrow">{stepEyebrow('launcher', 'INSTALL APEX')}</p>
      <h1>APEX Launcher.</h1>
      <p className="ob-lede">Sit back — APEX is preparing your application to connect to hosted APEX Cloud. This remains an interactive product preview: no real operations run.</p>
      <ArchitectureStrip />
      <CodeBlock label="Recommended: guided setup" code={CLI_INIT} />
      <p className="ob-preview-flag"><Code2 size={13} /> CLI design preview · @apex/cli is not published yet.</p>

      <div className="ob-launcher">
        <div className="ob-launcher-legend">
          <span><i className="ob-glyph">○</i> Pending</span>
          <span><i className="ob-glyph is-running">◌</i> Running</span>
          <span><i className="ob-glyph is-done">✓</i> Complete</span>
          <span><i className="ob-glyph is-attn">!</i> Attention</span>
        </div>
        <ol className="ob-stage-list">
          {LAUNCHER_STAGES.map((label, i) => {
            const n = i + 1;
            const status = statusFor(n, completed, runningStage);
            return (
              <li key={n} className={`ob-stage is-${status}`}>
                <i className={`ob-glyph ${status === 'done' ? 'is-done' : status === 'running' ? 'is-running' : ''}`}>{status === 'done' ? '✓' : status === 'running' ? '◌' : '○'}</i>
                <span className="ob-stage-text">
                  {label}
                  {detail[n] && <small>{detail[n]}</small>}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {allDone ? (
        <>
          <div className="ob-celebrate is-ready"><CheckCircle2 size={22} /> APEX IS READY.</div>
          <p className="ob-note">Nothing above called a real backend — @apex/cli, @apex/sdk, and the APEX Cloud API are all previews.</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="ob-ghost" onClick={verifyAgain} disabled={reverifying}>
              {reverifying ? <><Loader2 size={15} className="ob-spin" /> Checking…</> : 'Verify APEX'}
            </button>
            <button className="ob-primary" style={{ width: 'auto', flex: 1 }} onClick={onOpenDashboard}>Open dashboard <ArrowRight size={15} /></button>
          </div>
          {reverified && (
            <p className="ob-note"><CheckCircle2 size={13} style={{ verticalAlign: -2 }} /> APEX returned ALLOW just now · {reverified.remaining} of {reverified.allowance.toLocaleString()} credits remaining.</p>
          )}
          {decision && !reverified && (
            <p className="ob-note">{decision.remaining} of {decision.allowance.toLocaleString()} credits remaining on the sample customer.</p>
          )}
        </>
      ) : (
        <p className="ob-note">Installing… this takes a few seconds.</p>
      )}

      <CodeBlock label="Or install the SDK directly" code={NPM_INSTALL} />
      <CodeBlock label="Server-side quickstart" code={QUICKSTART} />
      <p className="ob-preview-flag"><Code2 size={13} /> API design preview · @apex/sdk and @apex/cli are not published packages yet.</p>
      <CodeBlock label="Optional embedded components" code={COMPONENTS} />
      <p className="ob-preview-flag"><Code2 size={13} /> API design preview · these components are not published yet.</p>
      <div className="ob-mini">
        <p className="ob-eyebrow">WHERE THINGS RUN</p>
        <img src={asset('launch/apex-how-it-ships.svg')} alt="Your app calls a small connector; APEX Cloud hosts commercial state, usage, entitlements, and billing sync; APEX Cloud talks to Stripe over webhooks." />
      </div>
      <ShipsStrip />
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
