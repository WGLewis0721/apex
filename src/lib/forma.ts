import { Store } from './controlPlane';
import { log } from './assurance';

export type FormaPlanId = 'free' | 'pro';
export type FormaStatus = 'active' | 'grace_period';

export type FormaPlan = {
  id: FormaPlanId;
  name: string;
  price: number;
  interval: 'lifetime' | 'month';
  limit: number;
};

export type FormaAccount = {
  plan: FormaPlanId;
  status: FormaStatus;
  generationsUsed: number;
  bonusGenerations: number;
  periodStart: string;
};

export type FormaDecision = { allow: boolean; reason: string };

export const FORMA_PLANS: Record<FormaPlanId, FormaPlan> = {
  free: { id: 'free', name: 'Free', price: 0, interval: 'lifetime', limit: 3 },
  pro: { id: 'pro', name: 'Pro', price: 20, interval: 'month', limit: 50 },
};

export function createFormaAccount(): FormaAccount {
  return { plan: 'free', status: 'active', generationsUsed: 0, bonusGenerations: 0, periodStart: new Date().toISOString() };
}

export function planLimit(account: FormaAccount): number {
  return FORMA_PLANS[account.plan].limit;
}

export function formaAllowance(account: FormaAccount): number {
  return planLimit(account) + account.bonusGenerations;
}

export function formaRemaining(account: FormaAccount): number {
  return Math.max(0, formaAllowance(account) - account.generationsUsed);
}

export function canGenerate(account: FormaAccount): FormaDecision {
  if (account.generationsUsed >= formaAllowance(account)) {
    return {
      allow: false,
      reason: account.plan === 'free'
        ? `Free plan limit reached (${planLimit(account)} generations). Upgrade to Pro for more.`
        : `Monthly Pro limit reached (${planLimit(account)} generations). Buy a top-up or wait for the next billing period.`,
    };
  }
  return {
    allow: true,
    reason: account.status === 'grace_period'
      ? 'Allowed during the payment grace period.'
      : `Allowed under the ${FORMA_PLANS[account.plan].name} plan.`,
  };
}

export function consumeGeneration(account: FormaAccount): { account: FormaAccount; decision: FormaDecision } {
  const decision = canGenerate(account);
  if (!decision.allow) return { account, decision };
  return { account: { ...account, generationsUsed: account.generationsUsed + 1 }, decision };
}

export function subscribe(account: FormaAccount, plan: FormaPlanId): FormaAccount {
  return { ...account, plan, status: 'active' };
}

export function upgradeToPro(account: FormaAccount): FormaAccount {
  if (account.plan === 'pro') return account;
  return { ...account, plan: 'pro', status: 'active' };
}

export function topUp(account: FormaAccount, amount: number): FormaAccount {
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error('Top-up amount must be a positive whole number.');
  return { ...account, bonusGenerations: account.bonusGenerations + amount };
}

export function failPayment(account: FormaAccount): FormaAccount {
  if (account.plan !== 'pro' || account.status !== 'active') return account;
  return { ...account, status: 'grace_period' };
}

export function recoverPayment(account: FormaAccount): FormaAccount {
  if (account.status !== 'grace_period') return account;
  return { ...account, status: 'active' };
}

export function renewPeriod(account: FormaAccount): FormaAccount {
  if (account.plan !== 'pro') return account;
  return { ...account, generationsUsed: 0, periodStart: new Date().toISOString() };
}

export function resetForma(): FormaAccount {
  return createFormaAccount();
}

export function recordGeneration(store: Store): Store {
  const next = structuredClone(store);
  const { account, decision } = consumeGeneration(next.forma);
  next.forma = account;
  log(next, 'forma.generate', 'Forma', decision.reason, decision.allow ? 'allow' : 'deny');
  return next;
}

export function subscribeForma(store: Store, plan: FormaPlanId): Store {
  const next = structuredClone(store);
  next.forma = subscribe(next.forma, plan);
  log(next, 'forma.subscribe', 'Forma', `Subscribed to the ${FORMA_PLANS[plan].name} plan.`, 'info');
  return next;
}

export function upgradeForma(store: Store): Store {
  const next = structuredClone(store);
  const before = next.forma.generationsUsed;
  next.forma = upgradeToPro(next.forma);
  log(next, 'forma.upgrade', 'Forma', `Upgraded to Pro. ${before} generations already used are preserved under the new ${FORMA_PLANS.pro.limit}/month allowance.`, 'info');
  return next;
}

export function topUpForma(store: Store, amount: number): Store {
  const next = structuredClone(store);
  next.forma = topUp(next.forma, amount);
  log(next, 'forma.topup', 'Forma', `Purchased ${amount} bonus generations.`, 'info');
  return next;
}

export function failFormaPayment(store: Store): Store {
  const next = structuredClone(store);
  next.forma = failPayment(next.forma);
  log(next, 'forma.payment_failed', 'Forma', 'Simulated renewal failure. Access continues during the grace period.', 'info');
  return next;
}

export function recoverFormaPayment(store: Store): Store {
  const next = structuredClone(store);
  next.forma = recoverPayment(next.forma);
  log(next, 'forma.payment_recovered', 'Forma', 'Renewal payment received. Grace period cleared.', 'info');
  return next;
}

export function renewFormaPeriod(store: Store): Store {
  const next = structuredClone(store);
  next.forma = renewPeriod(next.forma);
  log(next, 'forma.period_renewed', 'Forma', `New billing period started. Usage reset to 0 of ${planLimit(next.forma)}.`, 'info');
  return next;
}

export function resetFormaAccount(store: Store): Store {
  const next = structuredClone(store);
  next.forma = createFormaAccount();
  log(next, 'forma.reset', 'Forma', 'Forma demo account reset to the initial Free plan state.', 'info');
  return next;
}
