import type { Store } from './controlPlane';

export type EvidenceKind = 'paid_denied' | 'uncovered_usage' | 'duplicate_debit' | 'expired_override' | 'missing_debit';
export type Evidence = {
  id: string; customerId: string; kind: EvidenceKind; operationId: string;
  action: string; observed: string; expected: string; impact: number;
  corrected: boolean; dismissed: boolean;
};
export type Finding = Evidence & { title: string; severity: 'critical' | 'high' | 'medium'; explanation: string; fix: string; status: 'open' | 'resolved' | 'dismissed' };
export type Operation = { id: string; units: number; state: 'reserved' | 'settled'; unit: 'credit' | 'cent' };
export type Runtime = {
  step: number; billing: 'none' | 'pending' | 'active'; plan: 'Free' | 'Pro' | 'Business';
  limit: number; consumed: number; delegated: boolean; agentSpent: number;
  operations: Operation[]; downstream: number; lastOutcome: 'waiting' | 'allow' | 'deny' | 'info';
  lastReason: string; processedEvents: string[];
};
export type Assurance = { version: 2; evidence: Evidence[]; lastScan: string | null; scans: number; policyRevision: number; runtime: Runtime };
export const definitions: Record<EvidenceKind, { title: string; severity: Finding['severity']; explanation: string; fix: string }> = {
  paid_denied: { title: 'Paying customer blocked from automation', severity: 'high', explanation: 'The effective plan grants automation, but the application returned DENY. A stale application gate disagrees with the commercial terms.', fix: 'Refresh the application gate from the effective entitlement.' },
  uncovered_usage: { title: 'Processing continued after suspension', severity: 'critical', explanation: 'The application completed a paid operation while the commercial account was suspended. Review the suspension and any approved exception before changing access.', fix: 'Apply the suspended-account rule to the observed execution path.' },
  duplicate_debit: { title: 'One operation debited twice', severity: 'critical', explanation: 'Two debit records share one operation ID. Retrying settlement must not charge the customer twice.', fix: 'Deduplicate the second debit against the stable operation ID.' },
  expired_override: { title: 'Expired promotional grant still active', severity: 'medium', explanation: 'A temporary grant remains enabled in the application after its approved expiry. The base plan does not include this capability.', fix: 'Remove the expired application grant.' },
  missing_debit: { title: 'Completed operation has no debit', severity: 'high', explanation: 'Execution reported a completed, billable operation. No matching settled usage record was received.', fix: 'Replay the missing settlement once using its original operation ID.' },
};

export function createRuntime(): Runtime {
  return { step: 0, billing: 'none', plan: 'Free', limit: 0, consumed: 0, delegated: false, agentSpent: 0, operations: [], downstream: 0, lastOutcome: 'waiting', lastReason: 'Subscribe Acme to begin the commercial lifecycle.', processedEvents: [] };
}
export function createAssurance(): Assurance {
  return { version: 2, lastScan: null, scans: 0, policyRevision: 1, runtime: createRuntime(), evidence: [
    { id: 'FND-1042', customerId: 'northstar', kind: 'paid_denied', operationId: 'op_ns_492', action: 'automation', observed: 'DENY · app gate v2', expected: 'ALLOW · Growth plan', impact: 0, corrected: false, dismissed: false },
    { id: 'FND-1043', customerId: 'ember', kind: 'uncovered_usage', operationId: 'op_em_881', action: 'automation', observed: 'ALLOW · 240 jobs completed', expected: 'DENY · suspended account', impact: 480, corrected: false, dismissed: false },
    { id: 'FND-1044', customerId: 'orbit', kind: 'duplicate_debit', operationId: 'op_or_207', action: 'credit.settle', observed: '2 debits · same operation', expected: '1 debit · idempotent settlement', impact: 120, corrected: false, dismissed: false },
    { id: 'FND-1045', customerId: 'lattice', kind: 'expired_override', operationId: 'grant_lat_trial', action: 'automation', observed: 'ENABLED · expired trial', expected: 'DISABLED · trial ended', impact: 0, corrected: false, dismissed: false },
    { id: 'FND-1046', customerId: 'orbit', kind: 'missing_debit', operationId: 'op_or_318', action: 'credit.settle', observed: '0 debits · job completed', expected: '1 debit · completed billable job', impact: 260, corrected: false, dismissed: false },
  ] };
}

export function findings(store: Store): Finding[] {
  return store.assurance.evidence.map(e => {
    const c = store.customers.find(x => x.id === e.customerId);
    const p = store.plans.find(x => x.id === c?.planId);
    const entitled = c ? c.overrides[e.action] ?? p?.features.includes(e.action) ?? false : false;
    let relevant = true;
    if (e.kind === 'paid_denied') relevant = c?.status !== 'suspended' && entitled;
    if (e.kind === 'uncovered_usage') relevant = c?.status === 'suspended';
    if (e.kind === 'expired_override') relevant = !entitled;
    return { ...e, ...definitions[e.kind], status: e.corrected || !relevant ? 'resolved' : e.dismissed ? 'dismissed' : 'open' };
  });
}

export function log(store: Store, action: string, target: string, detail: string, result: 'allow' | 'deny' | 'info' = 'info') {
  store.audit.unshift({ id: `evt_${crypto.randomUUID().slice(0, 8)}`, at: new Date().toISOString(), actor: 'apex-sandbox', action, target, result, detail });
  store.audit = store.audit.slice(0, 500);
}
export function scan(store: Store): Store {
  const next = structuredClone(store);
  next.assurance.lastScan = new Date().toISOString(); next.assurance.scans++;
  log(next, 'verification.scan', 'DocketFlow / imported evidence', `${findings(next).filter(f => f.status === 'open').length} open findings · 5 imported evidence records checked`);
  return next;
}
export function resolveFinding(store: Store, id: string, action: 'fix' | 'dismiss' | 'reopen'): Store {
  const next = structuredClone(store); const e = next.assurance.evidence.find(x => x.id === id);
  if (!e) return next;
  if (action === 'fix') { e.corrected = true; e.dismissed = false; }
  if (action === 'dismiss') e.dismissed = true;
  if (action === 'reopen') { e.corrected = false; e.dismissed = false; }
  log(next, `finding.${action === 'fix' ? 'resolved' : action === 'dismiss' ? 'dismissed' : 'reopened'}`, `${id} / ${e.customerId}`, action === 'fix' ? 'Applied correction to sandbox evidence; comparison now matches. No external system changed.' : action === 'dismiss' ? 'Classified as an intentional exception in this sandbox.' : 'Restored original sandbox observation for review.');
  return next;
}

export function available(runtime: Runtime, unit: 'credit' | 'cent' = 'credit') {
  const reserved = runtime.operations.filter(o => o.state === 'reserved' && o.unit === unit).reduce((s, o) => s + o.units, 0);
  return (unit === 'credit' ? runtime.limit - runtime.consumed : 5000 - runtime.agentSpent) - reserved;
}

export function reserve(r: Runtime, id: string, units: number, unit: 'credit' | 'cent' = 'credit'): Runtime {
  const next = structuredClone(r);
  const existing = next.operations.find(o => o.id === id);
  if (existing) {
    next.lastOutcome = existing.units === units && existing.unit === unit ? 'info' : 'deny';
    next.lastReason = next.lastOutcome === 'info' ? 'Idempotent replay. Existing operation returned; no extra reservation.' : 'IDEMPOTENCY_CONFLICT · operation payload changed.';
    return next;
  }
  if (!Number.isSafeInteger(units) || units <= 0) { next.lastOutcome = 'deny'; next.lastReason = 'INVALID_UNITS · request a positive integer.'; return next; }
  if (next.billing !== 'active') { next.lastOutcome = 'deny'; next.lastReason = 'NO_ACTIVE_GRANT · subscription has not been activated.'; return next; }
  if (unit === 'cent' && !next.delegated) { next.lastOutcome = 'deny'; next.lastReason = 'NO_DELEGATION · the agent has no spending authority.'; return next; }
  if (unit === 'cent' && units > 500) { next.lastOutcome = 'deny'; next.lastReason = 'APPROVAL_REQUIRED · exceeds the $5 per-operation authority. No transaction submitted.'; return next; }
  if (units > available(next, unit)) { next.lastOutcome = 'deny'; next.lastReason = `QUOTA_EXCEEDED · ${available(next, unit)} ${unit === 'credit' ? 'credits' : 'cents'} available, ${units} requested. No downstream execution.`; return next; }
  next.operations.push({ id, units, unit, state: 'reserved' }); next.lastOutcome = 'allow';
  next.lastReason = `${units} ${unit === 'credit' ? 'credits' : 'cents'} reserved for ${id}. Capacity is held before execution.`;
  return next;
}
export function settle(r: Runtime, id: string): Runtime {
  const next = structuredClone(r); const op = next.operations.find(o => o.id === id);
  if (!op) { next.lastOutcome = 'deny'; next.lastReason = 'UNKNOWN_OPERATION · cannot settle without a reservation.'; return next; }
  if (op.state === 'settled') { next.lastOutcome = 'info'; next.lastReason = 'Settlement replay ignored. No duplicate debit or execution.'; return next; }
  op.state = 'settled'; next.downstream++;
  if (op.unit === 'credit') next.consumed += op.units; else next.agentSpent += op.units;
  next.lastOutcome = 'allow'; next.lastReason = `Execution completed and ${op.units} ${op.unit === 'credit' ? 'credits' : 'cents'} settled exactly once in this sandbox.`;
  return next;
}

export const demoSteps = [
  ['Subscribe', 'Acme selects Pro with 100 credits.'],
  ['Receive billing webhook', 'The subscription event creates the effective grant.'],
  ['Reserve 20 credits', 'Authorize the first analysis before execution.'],
  ['Execute and settle', 'Turn the reservation into completed usage.'],
  ['Process another 70 credits', 'Complete a second batch; 10 credits remain.'],
  ['Try a 20-credit job', 'Block the action before it consumes compute.'],
  ['Upgrade to Business', 'Increase the period allowance to 500; retain usage.'],
  ['Retry the analysis', 'Access is restored under the new allowance.'],
  ['Delegate agent authority', 'Allow $50 per session, at most $5 per operation.'],
  ['Agent requests $4', 'Execute within both delegated limits.'],
  ['Agent requests $7', 'Require approval; no transaction is submitted.'],
  ['Replay settlement', 'Prove a retry cannot debit or execute twice.'],
] as const;

export function advanceDemo(store: Store): Store {
  const next = structuredClone(store); let r = next.assurance.runtime; const step = r.step;
  if (step >= demoSteps.length) return next;
  switch (step) {
    case 0: r.billing = 'pending'; r.lastOutcome = 'info'; r.lastReason = 'Checkout completed in the sandbox. Waiting for billing confirmation.'; break;
    case 1: r.billing = 'active'; r.plan = 'Pro'; r.limit = 100; r.processedEvents.push('stripe_demo_sub_001'); r.lastOutcome = 'allow'; r.lastReason = 'Billing event accepted. Pro grants ai_analysis and 100 period credits.'; break;
    case 2: r = reserve(r, 'op_analysis_001', 20); break;
    case 3: r = settle(r, 'op_analysis_001'); break;
    case 4: r = settle(reserve(r, 'op_batch_002', 70), 'op_batch_002'); break;
    case 5: r = reserve(r, 'op_analysis_003', 20); break;
    case 6: r.plan = 'Business'; r.limit = 500; r.lastOutcome = 'allow'; r.lastReason = `Upgrade confirmed. 500 total credits, ${r.consumed} already consumed. No usage reset.`; break;
    case 7: r = settle(reserve(r, 'op_analysis_003', 20), 'op_analysis_003'); break;
    case 8: r.delegated = true; r.lastOutcome = 'allow'; r.lastReason = 'Acme admin delegated invoices.read to finance-agent. $50/session, $5/operation. Sandbox authority.'; break;
    case 9: r = settle(reserve(r, 'op_agent_004', 400, 'cent'), 'op_agent_004'); break;
    case 10: r = reserve(r, 'op_agent_007', 700, 'cent'); break;
    case 11: r = settle(r, 'op_agent_004'); break;
  }
  r.step = step + 1; next.assurance.runtime = r;
  log(next, `demo.${demoSteps[step][0].toLowerCase().replaceAll(' ', '_')}`, 'Acme / DocketFlow', r.lastReason, r.lastOutcome === 'allow' ? 'allow' : r.lastOutcome === 'deny' ? 'deny' : 'info');
  return next;
}

export function simulatePolicy(store: Store, planId: string, limit: number, feature: string, enabled: boolean) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('The quota must be a positive whole number.');
  return store.customers.filter(c => c.planId === planId).map(c => {
    const p = store.plans.find(p => p.id === planId)!;
    const before = c.overrides[feature] ?? p.features.includes(feature);
    const after = c.overrides[feature] ?? enabled;
    return { id: c.id, name: c.name, before, after, overLimit: c.apiCallsUsed > limit, override: c.overrides[feature] !== undefined, used: c.apiCallsUsed };
  });
}
