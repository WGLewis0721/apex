import { uid } from './controlPlane';

// Pure state/reducer for the APEX signup -> purchase -> install -> verify
// funnel (see docs/CLAUDE_CUSTOMER_FUNNEL.md). This models buying APEX
// itself, which is a different product from the customer entitlement
// engine in controlPlane.ts/forma.ts, so it is intentionally its own small
// module — the same pattern src/lib/embeddedDemo.ts already uses for a
// self-contained reducer.
//
// The post-purchase half of the funnel is: workspace -> connect Stripe ->
// one animated "Install APEX" launcher stage (stack detection, SDK install,
// environment config, webhook, live verification) -> go live. None of it
// installs APEX itself locally — only a small SDK/CLI that talks to hosted
// APEX Cloud, which in turn talks to the payment provider.

export type OnboardingStep = 'plan' | 'account' | 'purchase' | 'workspace' | 'stack' | 'payments' | 'launcher' | 'complete';
export type PlanId = 'founding' | 'sandbox';
export type PurchaseStatus = 'unpaid' | 'processing' | 'paid';
export type PaymentProviderStatus = 'not_connected' | 'connecting' | 'demo_connected' | 'connected';
export type Stack = 'javascript';

// `stack` remains in the type for backwards compatibility with older demo
// state, but it is no longer a numbered screen. The launcher detects the
// only supported v1 stack (JavaScript/TypeScript) during installation.
export const STEP_ORDER: OnboardingStep[] = ['plan', 'account', 'purchase', 'workspace', 'payments', 'launcher', 'complete'];

export function stepIndex(step: OnboardingStep): number {
  return STEP_ORDER.indexOf(step);
}

export const LAUNCHER_STAGES = [
  'Signing into APEX workspace',
  'Detecting project',
  'Found React / Node / TypeScript',
  'Installing @apex/sdk',
  'Creating APEX environment configuration',
  'Linking the selected workspace',
  'Connecting Stripe configuration',
  'Registering webhook endpoint',
  'Creating a sample customer',
  'Giving the customer 1,000 credits',
  'Recording 250 credits of usage',
  'Running an access check',
  'Receiving ALLOW',
  'Displaying APEX IS READY',
] as const;

export const LAUNCHER_STAGE_COUNT = LAUNCHER_STAGES.length;
const SDK_INSTALLED_AT_STAGE = 4;
const ENVIRONMENT_CONFIGURED_AT_STAGE = 8;
const VERIFICATION_PASSED_AT_STAGE = 13;

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
      'SDK + component integration preview',
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
  launcherStage: number;
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
    launcherStage: 0,
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
  | { type: 'connect_payments_succeeded'; real?: boolean }
  | { type: 'launcher_progress'; stage: number }
  | { type: 'enter_complete' }
  | { type: 'request_production' }
  | { type: 'goto'; step: OnboardingStep }
  | { type: 'reset' };

function isValidAccount(account: OnboardingAccount): boolean {
  return account.name.trim().length > 0 && account.company.trim().length > 0 && /\S+@\S+\.\S+/.test(account.email.trim());
}

function paymentsConnected(status: PaymentProviderStatus): boolean {
  return status === 'demo_connected' || status === 'connected';
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
      if (!state.stack || paymentsConnected(state.paymentProviderStatus)) return state;
      return { ...state, paymentProviderStatus: 'connecting' };
    case 'connect_payments_succeeded':
      if (!state.stack) return state;
      return { ...state, paymentProviderStatus: action.real ? 'connected' : 'demo_connected' };
    case 'launcher_progress': {
      if (!state.stack || !paymentsConnected(state.paymentProviderStatus)) return state;
      if (action.stage <= state.launcherStage) return state;
      const stage = Math.min(LAUNCHER_STAGE_COUNT, Math.max(0, action.stage));
      return {
        ...state,
        launcherStage: stage,
        sdkInstalled: state.sdkInstalled || stage >= SDK_INSTALLED_AT_STAGE,
        environmentConfigured: state.environmentConfigured || stage >= ENVIRONMENT_CONFIGURED_AT_STAGE,
        verificationPassed: state.verificationPassed || stage >= VERIFICATION_PASSED_AT_STAGE,
      };
    }
    case 'enter_complete':
      if (!state.verificationPassed) return state;
      return { ...state, step: 'complete' };
    case 'request_production':
      return { ...state, productionRequested: true };
    case 'goto':
      if (!STEP_ORDER.includes(action.step)) return state;
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
  if (paymentsConnected(state.paymentProviderStatus)) return 'launcher';
  if (state.stack) return 'payments';
  if (state.workspaceCreated) return 'workspace';
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
    { id: 'stack', label: 'Application stack detected', done: !!state.stack, step: 'payments' },
    { id: 'payments', label: 'Payment provider connected', done: paymentsConnected(state.paymentProviderStatus), step: 'payments' },
    { id: 'sdk', label: 'SDK installed', done: state.sdkInstalled, step: 'launcher' },
    { id: 'environment', label: 'Environment configured', done: state.environmentConfigured, step: 'launcher' },
    { id: 'customer', label: 'First customer identified', done: state.verificationPassed, step: 'launcher' },
    { id: 'usage', label: 'First usage event received', done: state.verificationPassed, step: 'launcher' },
    { id: 'decision', label: 'First access decision verified', done: state.verificationPassed, step: 'launcher' },
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
