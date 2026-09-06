const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
if (!global.crypto) global.crypto = webcrypto;
global.localStorage = { getItem: () => null, setItem: () => {} };
const core = require('../.test-build/controlPlane.js');
const engine = require('../.test-build/assurance.js');
const fresh = () => core.loadStore();
const active = () => ({ ...engine.createRuntime(), billing: 'active', plan: 'Pro', limit: 100 });

test('five imported evidence failures are detected without changing customer terms', () => {
  const state = fresh(); const before = JSON.stringify(state.customers);
  const scanned = engine.scan(state);
  assert.equal(engine.findings(scanned).filter(x => x.status === 'open').length, 5);
  assert.equal(scanned.assurance.scans, 1);
  assert.equal(JSON.stringify(scanned.customers), before);
  assert.equal(state.assurance.scans, 0);
});
test('correction is auditable, replay-safe, and scoped to one observation', () => {
  const next = engine.resolveFinding(fresh(), 'FND-1044', 'fix');
  assert.equal(engine.findings(next).filter(x => x.status === 'open').length, 4);
  assert.equal(next.audit[0].action, 'finding.resolved');
  assert.equal(engine.findings(engine.scan(next)).find(x => x.id === 'FND-1044').status, 'resolved');
});
test('dismissal and reopening preserve original evidence', () => {
  const state = fresh(); const dismissed = engine.resolveFinding(state, 'FND-1042', 'dismiss');
  assert.equal(engine.findings(dismissed)[0].status, 'dismissed');
  assert.equal(engine.findings(engine.resolveFinding(dismissed, 'FND-1042', 'reopen'))[0].status, 'open');
});
test('API quota checks are reachable and validate units', () => {
  const state = fresh();
  assert.equal(core.evaluateAccess(state, 'northstar', 'api_calls', 1).allow, true);
  assert.equal(core.evaluateAccess(state, 'northstar', 'api_calls', 40000).allow, false);
  for (const n of [0, -1, NaN, Infinity, 0.2]) assert.equal(core.evaluateAccess(state, 'northstar', 'automation', n).allow, false);
  assert.equal(core.recordAccessCheck(state, 'missing', 'automation').decision.allow, false);
});
test('grace period retains access; suspension and explicit denies remain effective', () => {
  const state = fresh(); state.customers[0].status = 'grace_period';
  assert.equal(core.evaluateAccess(state, 'northstar', 'automation').allow, true);
  state.customers[0].overrides.automation = false;
  assert.equal(core.evaluateAccess(state, 'northstar', 'automation').allow, false);
  state.customers[0].overrides.automation = true; state.customers[0].status = 'suspended';
  assert.equal(core.evaluateAccess(state, 'northstar', 'automation').allow, false);
});
test('serial reservation model admits only available capacity under competing requests', () => {
  let state = { ...active(), limit: 10 }; let allowed = 0;
  for (let i = 0; i < 100; i++) { state = engine.reserve(state, `op_${i}`, 1); if (state.lastOutcome === 'allow') allowed++; }
  assert.equal(allowed, 10); assert.equal(engine.available(state), 0); assert.equal(state.downstream, 0);
});
test('idempotent reserve and settlement do not repeat debit or execution', () => {
  let state = engine.reserve(active(), 'one', 20);
  state = engine.reserve(state, 'one', 20); assert.equal(state.operations.length, 1);
  state = engine.settle(state, 'one'); state = engine.settle(state, 'one');
  assert.equal(state.consumed, 20); assert.equal(state.downstream, 1); assert.equal(engine.available(state), 80);
  assert.equal(engine.reserve(state, 'one', 30).lastOutcome, 'deny');
});
test('invalid reservations and unknown settlements never consume capacity', () => {
  for (const n of [0, -2, Infinity, NaN, 1.1]) assert.equal(engine.reserve(active(), 'bad', n).lastOutcome, 'deny');
  assert.equal(engine.settle(active(), 'missing').downstream, 0);
});
test('agent needs both an active grant and delegated authority', () => {
  assert.equal(engine.reserve(active(), 'agent', 400, 'cent').lastOutcome, 'deny');
  const state = { ...active(), delegated: true };
  assert.equal(engine.reserve(state, 'agent', 400, 'cent').lastOutcome, 'allow');
  assert.equal(engine.reserve(state, 'agent', 700, 'cent').lastOutcome, 'deny');
  state.delegated = false; assert.equal(engine.reserve(state, 'new', 100, 'cent').lastOutcome, 'deny');
});
test('agent cumulative spending cannot exceed session authority', () => {
  let state = { ...active(), delegated: true };
  for (let i = 0; i < 10; i++) state = engine.settle(engine.reserve(state, `${i}`, 500, 'cent'), `${i}`);
  const denied = engine.reserve(state, 'eleven', 1, 'cent');
  assert.equal(denied.lastOutcome, 'deny'); assert.equal(denied.agentSpent, 5000); assert.equal(denied.consumed, 0);
});
test('walkthrough denies before execution, preserves usage on upgrade, and blocks excess authority', () => {
  let state = fresh();
  for (let i = 0; i < 6; i++) state = engine.advanceDemo(state);
  assert.equal(state.assurance.runtime.consumed, 90); assert.equal(state.assurance.runtime.lastOutcome, 'deny');
  assert.equal(state.assurance.runtime.downstream, 2);
  state = engine.advanceDemo(state); assert.equal(engine.available(state.assurance.runtime), 410);
  while (state.assurance.runtime.step < engine.demoSteps.length) state = engine.advanceDemo(state);
  const r = state.assurance.runtime;
  assert.equal(r.consumed, 110); assert.equal(r.agentSpent, 400); assert.equal(r.downstream, 4);
  assert.equal(state.audit.filter(x => x.result === 'deny' && x.target === 'Acme / DocketFlow').length, 2);
});
test('policy simulation preserves overrides and never mutates live terms', () => {
  const state = fresh(); const before = JSON.stringify(state);
  const impact = engine.simulatePolicy(state, 'growth', 1000, 'sso', false);
  assert.equal(impact.find(x => x.id === 'northstar').after, true);
  assert.equal(impact.find(x => x.id === 'northstar').overLimit, true);
  assert.equal(JSON.stringify(state), before);
  assert.throws(() => engine.simulatePolicy(state, 'growth', NaN, 'sso', false));
});
test('legacy saved state migrates; unavailable and malformed storage recover', () => {
  const original = global.localStorage; const state = fresh(); delete state.assurance;
  global.localStorage = { getItem: key => key.endsWith('v1') ? JSON.stringify(state) : null, setItem: () => {} };
  assert.equal(core.loadStore().assurance.version, 2);
  global.localStorage = { getItem: () => '{broken', setItem: () => { throw Error('quota'); } };
  assert.equal(core.loadStore().customers.length, 4); assert.equal(core.saveStore(fresh()), false);
  global.localStorage = original;
});
