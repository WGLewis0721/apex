import { uid } from './controlPlane';

// Pure state/reducer for the APEX signup -> purchase -> install -> verify
// funnel (see docs/CLAUDE_CUSTOMER_FUNNEL.md). This models buying APEX
// itself, which is a different product from the customer entitlement
// engine in controlPlane.ts/forma.ts, so it is intentionally its own small
// module — the same pattern src/lib/embeddedDemo.ts already uses for a
// self-contained reducer.
//
// The post-purchase half of the funnel is an "installer": workspace ->
// pick a stack -> connect Stripe -> install the SDK -> configure the
// environment -> verify a live decision -> go live. None of it installs
// APEX itself locally — only a small SDK/CLI that talks to hosted APEX
// Cloud, which in turn talks to the payment provider. See the
// ArchitectureStrip copy in Onboarding.tsx for how that is communicated.

export type OnboardingStep = 'plan' | 'account' | 'purchase' | 'workspace' | 'stack' | 'payments' | 'install' | 'configure' | 'verify' | 'complete';
export type PlanId = 'founding' | 'sandbox';
export type PurchaseStatus = 'unpaid' | 'processing' | 'paid';
export type PaymentProviderStatus = 'not_connected' | 'connecting' | 'demo_connected';
export type Stack = 'javascript';

export const STEP_ORDER: OnboardingStep[] = ['plan', 'account', 'purchase', 'workspace', 'stack', 'payments', 'install', 'configure', 'verify', 'complete'];

export function stepIndex(step: OnboardingStep): number {
  return STEP_ORDER.indexOf(step);
}

export type Offer = {
  id: PlanId;
  name: string;
  tagline: string;
  setupFee: number;
  monthly: number;
  features: string[];
};

export const OFFERS: Record<PlanId, Offer> = {
  founding: {
    id: 'founding',
    name: 'APEX Founding Partner',
    tagline: 'Guided implementation for your first launch.',
    setupFee: 2000,
    monthly: 299,
    features: [
      'Guided implementation with the APEX team',
      'Direct integration help while you build',
      'Sandbox workspace today, production workspace when available',
      'Early-access pricing locked in',
    ],
  },
  sandbox: {
    id: 'sandbox',
    name: 'Developer sandbox',
    tagline: 'Try the SDK yourself, free, no guided help.',
    setupFee: 0,
    monthly: 0,
    features: [
      'Sandbox workspace',
      'Full SDK and component access',
      'Community support only',
    ],
  },
};

export type OnboardingAccount = { name: string; email: string; company: string };

export type DemoKeys = { publishable: string; secret: string };

export type OnboardingState = {
  version: 1;
  step: OnboardingStep;
  selectedPlan: PlanId | null;
  account: OnboardingAccount | null;
  accountCreated: boolean;
  purchaseStatus: PurchaseStatus;
  receiptId: string | null;
  workspaceCreated: boolean;
  workspaceId: string | null;
  demoKeys: DemoKeys | null;
  stack: Stack | null;
  paymentProviderStatus: PaymentProviderStatus;
  sdkInstalled: boolean;
  environmentConfigured: boolean;
  verificationPassed: boolean;
  productionRequested: boolean;
};

export function initialOnboarding(): OnboardingState {
  return {
    version: 1,
    step: 'plan',
    selectedPlan: null,
    account: null,
    accountCreated: false,
    purchaseStatus: 'unpaid',
    receiptId: null,
    workspaceCreated: false,
    workspaceId: null,
    demoKeys: null,
    stack: null,
    paymentProviderStatus: 'not_connected',
    sdkInstalled: false,
    environmentConfigured: false,
    verificationPassed: false,
    productionRequested: false,
  };
}

export type OnboardingAction =
  | { type: 'select_plan'; plan: PlanId }
  | { type: 'submit_account'; account: OnboardingAccount }
  | { type: 'purchase_pending' }
  | { type: 'purchase_succeeded'; receiptId: string }
  | { type: 'choose_stack'; stack: Stack }
  | { type: 'connect_payments_pending' }
  | { type: 'connect_payments_succeeded' }
  | { type: 'confirm_install' }
  | { type: 'configure_environment' }
  | { type: 'run_verification' }
  | { type: 'enter_complete' }
  | { type: 'request_production' }
  | { type: 'goto'; step: OnboardingStep }
  | { type: 'reset' };

function isValidAccount(account: OnboardingAccount): boolean {
  return account.name.trim().length > 0 && account.company.trim().length > 0 && /\S+@\S+\.\S+/.test(account.email.trim());
}

export function onboardingReducer(state: OnboardingState, action: OnboardingAction): OnboardingState {
  switch (action.type) {
    case 'select_plan':
      return { ...state, selectedPlan: action.plan, step: 'account' };
    case 'submit_account':
      if (!state.selectedPlan || !isValidAccount(action.account)) return state;
      return { ...state, account: action.account, accountCreated: true, step: 'purchase' };
    case 'purchase_pending':
      if (!state.selectedPlan || !state.accountCreated || state.purchaseStatus === 'paid') return state;
      return { ...state, purchaseStatus: 'processing' };
    case 'purchase_succeeded':
      if (!state.selectedPlan || !state.accountCreated || state.purchaseStatus === 'paid') return state;
      return {
        ...state,
        purchaseStatus: 'paid',
        receiptId: action.receiptId,
        workspaceCreated: true,
        workspaceId: state.workspaceId ?? uid('ws'),
        demoKeys: state.demoKeys ?? { publishable: uid('apex_test_pk'), secret: uid('apex_test_sk') },
        step: 'workspace',
      };
    case 'choose_stack':
      if (!state.workspaceCreated) return state;
      return { ...state, stack: action.stack, step: 'payments' };
    case 'connect_payments_pending':
      if (!state.stack || state.paymentProviderStatus === 'demo_connected') return state;
      return { ...state, paymentProviderStatus: 'connecting' };
    case 'connect_payments_succeeded':
      if (!state.stack) return state;
      return { ...state, paymentProviderStatus: 'demo_connected' };
    case 'confirm_install':
      if (!state.stack || state.paymentProviderStatus !== 'demo_connected') return state;
      return { ...state, sdkInstalled: true, step: 'configure' };
    case 'configure_environment':
      if (!state.sdkInstalled) return state;
      return { ...state, environmentConfigured: true, step: 'verify' };
    case 'run_verification':
      if (!state.environmentConfigured) return state;
      return { ...state, verificationPassed: true };
    case 'enter_complete':
      if (!state.verificationPassed) return state;
      return { ...state, step: 'complete' };
    case 'request_production':
      return { ...state, productionRequested: true };
    case 'goto':
      if (stepIndex(action.step) > stepIndex(furthestUnlockedStep(state))) return state;
      return { ...state, step: action.step };
    case 'reset':
      return initialOnboarding();
    default:
      return state;
  }
}

export function furthestUnlockedStep(state: OnboardingState): OnboardingStep {
  if (state.step === 'complete') return 'complete';
  if (state.verificationPassed) return 'complete';
  if (state.environmentConfigured) return 'verify';
  if (state.sdkInstalled) return 'configure';
  if (state.paymentProviderStatus === 'demo_connected') return 'install';
  if (state.stack) return 'payments';
  if (state.workspaceCreated) return 'stack';
  if (state.purchaseStatus === 'paid') return 'workspace';
  if (state.accountCreated) return 'purchase';
  if (state.selectedPlan) return 'account';
  return 'plan';
}

export type ChecklistItem = { id: string; label: string; done: boolean; step: OnboardingStep };

export function checklist(state: OnboardingState): ChecklistItem[] {
  return [
    { id: 'account', label: 'APEX account created', done: state.accountCreated, step: 'account' },
    { id: 'subscription', label: 'Subscription active', done: state.purchaseStatus === 'paid', step: 'purchase' },
    { id: 'workspace', label: 'Workspace created', done: state.workspaceCreated, step: 'workspace' },
    { id: 'stack', label: 'Application stack selected', done: !!state.stack, step: 'stack' },
    { id: 'payments', label: 'Payment provider connected', done: state.paymentProviderStatus === 'demo_connected', step: 'payments' },
    { id: 'sdk', label: 'SDK installed', done: state.sdkInstalled, step: 'install' },
    { id: 'environment', label: 'Environment configured', done: state.environmentConfigured, step: 'configure' },
    { id: 'customer', label: 'First customer identified', done: state.verificationPassed, step: 'verify' },
    { id: 'usage', label: 'First usage event received', done: state.verificationPassed, step: 'verify' },
    { id: 'decision', label: 'First access decision verified', done: state.verificationPassed, step: 'verify' },
    { id: 'production', label: 'Production environment requested', done: state.productionRequested, step: 'complete' },
  ];
}

export function checklistProgress(state: OnboardingState): { done: number; total: number } {
  const items = checklist(state);
  return { done: items.filter((i) => i.done).length, total: items.length };
}

const KEY = 'apex-onboarding-v1';

export function loadOnboarding(): OnboardingState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initialOnboarding();
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || typeof parsed.step !== 'string' || !STEP_ORDER.includes(parsed.step)) return initialOnboarding();
    return { ...initialOnboarding(), ...parsed };
  } catch {
    return initialOnboarding();
  }
}

export function saveOnboarding(state: OnboardingState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function resetOnboarding(): OnboardingState {
  const next = initialOnboarding();
  saveOnboarding(next);
  return next;
}
