export type DemoPlan = 'starter' | 'pro';
export type DemoEvent = { id: number; type: string; detail: string; amount?: number };
export type EmbeddedState = { plan: DemoPlan; subscribed: boolean; payment: 'none' | 'paid' | 'past_due'; used: number; extra: number; events: DemoEvent[]; sequence: number };
export type DemoAction = 'subscribe' | 'generate' | 'upgrade' | 'topup' | 'fail' | 'recover' | 'reset';
export const plans = { starter: { name: 'Starter', price: 29, tokens: 1000 }, pro: { name: 'Pro', price: 79, tokens: 5000 } };
export const initialEmbedded = (): EmbeddedState => ({ plan: 'starter', subscribed: false, payment: 'none', used: 0, extra: 0, events: [], sequence: 0 });
export const allowance = (s: EmbeddedState) => s.subscribed ? plans[s.plan].tokens + s.extra : 0;
export function embeddedReducer(s: EmbeddedState, action: DemoAction): EmbeddedState {
  if (action === 'reset') return initialEmbedded();
  const next = { ...s, sequence: s.sequence + 1 };
  let event: Omit<DemoEvent, 'id'>;
  switch (action) {
    case 'subscribe':
      if (s.subscribed) return s;
      next.subscribed = true; next.payment = 'paid';
      event = { type: 'payment.succeeded', detail: 'Starter activated · 1,000 tokens available', amount: 29 }; break;
    case 'generate':
      if (!s.subscribed || s.used + 250 > allowance(s)) {
        event = { type: 'usage.blocked', detail: s.subscribed ? 'Token limit reached · no tokens deducted' : 'Subscription required · no tokens deducted' };
      } else {
        next.used += 250;
        event = { type: 'usage.recorded', detail: '250 tokens used · content generated' };
      }
      break;
    case 'upgrade':
      if (!s.subscribed || s.plan === 'pro') return s;
      next.plan = 'pro'; next.payment = 'paid';
      event = { type: 'plan.upgraded', detail: 'Pro activated · usage preserved · $50 demo charge, proration omitted', amount: 50 }; break;
    case 'topup':
      if (!s.subscribed) return s;
      next.extra += 1000;
      event = { type: 'credits.purchased', detail: '1,000 additional tokens available', amount: 10 }; break;
    case 'fail':
      if (!s.subscribed || s.payment === 'past_due') return s;
      next.payment = 'past_due';
      event = { type: 'payment.failed', detail: 'Renewal failed · access remains active during the demo grace period' }; break;
    case 'recover':
      if (s.payment !== 'past_due') return s;
      next.payment = 'paid';
      event = { type: 'payment.recovered', detail: 'Renewal payment received · grace period cleared', amount: plans[s.plan].price }; break;
    default: return s;
  }
  next.events = [{ id: next.sequence, ...event }, ...s.events];
  return next;
}
