import { Assurance, createAssurance } from './assurance';

export type Plan = {
  id: string;
  name: string;
  price: number;
  interval: 'month' | 'year';
  seats: number;
  apiCalls: number;
  features: string[];
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  planId: string;
  status: 'active' | 'grace_period' | 'suspended';
  seatsUsed: number;
  apiCallsUsed: number;
  overrides: Record<string, boolean>;
};

export type AuditEvent = {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  result: 'allow' | 'deny' | 'info';
  detail: string;
};

export type BillingEvent = {
  id: string;
  at: string;
  customerId: string;
  type: 'invoice.paid' | 'invoice.payment_failed' | 'subscription.updated';
  amount?: number;
};

export type Store = {
  assurance: Assurance;
  plans: Plan[];
  customers: Customer[];
  audit: AuditEvent[];
  billing: BillingEvent[];
};

const seed: Store = {
  assurance: createAssurance(),
  plans: [
    {
      id: 'starter',
      name: 'Starter',
      price: 49,
      interval: 'month',
      seats: 5,
      apiCalls: 10000,
      features: ['dashboard', 'exports'],
    },
    {
      id: 'growth',
      name: 'Growth',
      price: 249,
      interval: 'month',
      seats: 25,
      apiCalls: 100000,
      features: ['dashboard', 'exports', 'automation', 'priority_support'],
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 1200,
      interval: 'month',
      seats: 250,
      apiCalls: 1000000,
      features: ['dashboard', 'exports', 'automation', 'priority_support', 'sso', 'audit_api', 'ai_agents'],
    },
  ],
  customers: [
    {
      id: 'northstar',
      name: 'Northstar Software',
      email: 'ops@northstar.demo',
      planId: 'growth',
      status: 'active',
      seatsUsed: 18,
      apiCallsUsed: 68420,
      overrides: { sso: true },
    },
    {
      id: 'orbit',
      name: 'Orbit Analytics',
      email: 'billing@orbit.demo',
      planId: 'enterprise',
      status: 'active',
      seatsUsed: 74,
      apiCallsUsed: 412880,
      overrides: {},
    },
    {
      id: 'lattice',
      name: 'Lattice Labs',
      email: 'founders@lattice.demo',
      planId: 'starter',
      status: 'active',
      seatsUsed: 4,
      apiCallsUsed: 7920,
      overrides: { exports: false },
    },
    {
      id: 'ember',
      name: 'Ember AI',
      email: 'platform@ember.demo',
      planId: 'growth',
      status: 'suspended',
      seatsUsed: 11,
      apiCallsUsed: 91250,
      overrides: {},
    },
  ],
  audit: [
    {
      id: 'a1',
      at: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
      actor: 'policy-engine',
      action: 'feature.check',
      target: 'Northstar Software / sso',
      result: 'allow',
      detail: 'Granted by customer override',
    },
    {
      id: 'a2',
      at: new Date(Date.now() - 1000 * 60 * 31).toISOString(),
      actor: 'stripe-webhook',
      action: 'invoice.paid',
      target: 'Orbit Analytics',
      result: 'info',
      detail: '$1,200 subscription renewed',
    },
    {
      id: 'a3',
      at: new Date(Date.now() - 1000 * 60 * 57).toISOString(),
      actor: 'admin@apex.demo',
      action: 'customer.suspend',
      target: 'Ember AI',
      result: 'info',
      detail: 'Suspended after failed invoice simulation',
    },
  ],
  billing: [
    {
      id: 'b1',
      at: new Date(Date.now() - 1000 * 60 * 31).toISOString(),
      customerId: 'orbit',
      type: 'invoice.paid',
      amount: 1200,
    },
    {
      id: 'b2',
      at: new Date(Date.now() - 1000 * 60 * 57).toISOString(),
      customerId: 'ember',
      type: 'invoice.payment_failed',
      amount: 249,
    },
  ],
};

const KEY = 'apex-control-plane-v2';

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem('apex-control-plane-v1');
    if (!raw) return structuredClone(seed);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.customers) || !parsed.customers.length || !Array.isArray(parsed.plans) || !parsed.plans.length || !Array.isArray(parsed.audit) || !Array.isArray(parsed.billing)) return structuredClone(seed);
    if (!parsed.customers.every((c: Customer) => c && typeof c.id === 'string' && c.overrides && ['active', 'grace_period', 'suspended'].includes(c.status) && parsed.plans.some((p: Plan) => p.id === c.planId))) return structuredClone(seed);
    parsed.assurance = parsed.assurance?.version === 2 && Array.isArray(parsed.assurance.evidence) && parsed.assurance.runtime && Array.isArray(parsed.assurance.runtime.operations) ? parsed.assurance : createAssurance();
    parsed.billing = parsed.billing.map((b: BillingEvent & { type: string }) => ({ ...b, type: String(b.type) === 'invoice.failed' ? 'invoice.payment_failed' : b.type }));
    return parsed as Store;
  } catch {
    return structuredClone(seed);
  }
}

export function saveStore(store: Store) {
  try { localStorage.setItem(KEY, JSON.stringify(store)); return true; } catch { return false; }
}

export function resetStore(): Store {
  const next = structuredClone(seed);
  saveStore(next);
  return next;
}

export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function findPlan(store: Store, customer: Customer) {
  return store.plans.find((p) => p.id === customer.planId)!;
}

export function evaluateAccess(
  store: Store,
  customerId: string,
  feature: string,
  requestedUnits = 1,
) {
  const customer = store.customers.find((c) => c.id === customerId);
  if (!customer) return { allow: false, reason: 'Customer not found' };
  if (!Number.isSafeInteger(requestedUnits) || requestedUnits < 1) return { allow: false, reason: 'Requested units must be a positive whole number' };
  if (customer.status === 'suspended') return { allow: false, reason: 'Customer is suspended' };

  const plan = findPlan(store, customer);
  const override = customer.overrides[feature];
  const featureAllowed = override ?? (feature === 'api_calls' || feature === 'api' || plan.features.includes(feature));
  if (!featureAllowed) return { allow: false, reason: `Feature '${feature}' is not entitled` };

  if (feature === 'api_calls' || feature === 'api') {
    const nextUsage = customer.apiCallsUsed + requestedUnits;
    if (nextUsage > plan.apiCalls) {
      return { allow: false, reason: `Usage limit exceeded (${plan.apiCalls.toLocaleString()} calls)` };
    }
  }

  return {
    allow: true,
    reason: override === true ? 'Allowed by entitlement override' : `Allowed by ${plan.name} plan`,
  };
}

export function recordAccessCheck(
  store: Store,
  customerId: string,
  feature: string,
  requestedUnits = 1,
) {
  const customer = store.customers.find((c) => c.id === customerId)!;
  const decision = evaluateAccess(store, customerId, feature, requestedUnits);
  const event: AuditEvent = {
    id: uid('evt'),
    at: new Date().toISOString(),
    actor: 'policy-engine',
    action: 'access.check',
    target: `${customer?.name ?? customerId} / ${feature}`,
    result: decision.allow ? 'allow' : 'deny',
    detail: decision.reason,
  };
  return { decision, event };
}

export function utilization(current: number, max: number) {
  return Math.min(100, Math.round((current / max) * 100));
}
