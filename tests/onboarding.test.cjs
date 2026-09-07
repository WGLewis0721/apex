const { test } = require('node:test');
const assert = require('node:assert/strict');
global.localStorage = { getItem: () => null, setItem: () => {} };
const ob = require('../.test-build/onboarding.js');

const account = { name: 'Jamie Rivera', email: 'jamie@acme.dev', company: 'Acme Studio' };

test('a fresh funnel starts on the plan step with nothing unlocked', () => {
  const state = ob.initialOnboarding();
  assert.equal(state.step, 'plan');
  assert.equal(ob.furthestUnlockedStep(state), 'plan');
  assert.equal(ob.checklistProgress(state).done, 0);
});

test('full lifecycle: plan -> account -> purchase -> workspace -> payments -> install -> verify -> complete', () => {
  let s = ob.initialOnboarding();
  s = ob.onboardingReducer(s, { type: 'select_plan', plan: 'founding' });
  assert.equal(s.step, 'account');
  assert.equal(s.selectedPlan, 'founding');

  s = ob.onboardingReducer(s, { type: 'submit_account', account });
  assert.equal(s.step, 'purchase');
  assert.equal(s.accountCreated, true);

  s = ob.onboardingReducer(s, { type: 'purchase_pending' });
  assert.equal(s.purchaseStatus, 'processing');
  s = ob.onboardingReducer(s, { type: 'purchase_succeeded', receiptId: 'rcpt_1' });
  assert.equal(s.step, 'workspace');
  assert.equal(s.purchaseStatus, 'paid');
  assert.ok(s.workspaceId);
  assert.ok(s.demoKeys.publishable.startsWith('apex_test_pk'));
  assert.ok(s.demoKeys.secret.startsWith('apex_test_sk'));

  s = ob.onboardingReducer(s, { type: 'goto_payments' });
  assert.equal(s.step, 'payments');

  s = ob.onboardingReducer(s, { type: 'connect_payments_pending' });
  assert.equal(s.paymentProviderStatus, 'connecting');
  s = ob.onboardingReducer(s, { type: 'connect_payments_succeeded' });
  assert.equal(s.paymentProviderStatus, 'demo_connected');

  s = ob.onboardingReducer(s, { type: 'goto', step: 'install' });
  assert.equal(s.step, 'install');
  s = ob.onboardingReducer(s, { type: 'choose_stack', stack: 'javascript' });
  s = ob.onboardingReducer(s, { type: 'confirm_install' });
  assert.equal(s.sdkInstalled, true);
  assert.equal(s.step, 'verify');

  s = ob.onboardingReducer(s, { type: 'run_verification' });
  assert.equal(s.verificationPassed, true);

  s = ob.onboardingReducer(s, { type: 'enter_complete' });
  assert.equal(s.step, 'complete');

  const progress = ob.checklistProgress(s);
  assert.equal(progress.done, progress.total - 1);
  s = ob.onboardingReducer(s, { type: 'request_production' });
  assert.equal(ob.checklistProgress(s).done, ob.checklistProgress(s).total);
});

test('invalid transitions never skip required steps or double-charge', () => {
  let s = ob.initialOnboarding();
  assert.equal(ob.onboardingReducer(s, { type: 'submit_account', account }), s);
  assert.equal(ob.onboardingReducer(s, { type: 'purchase_pending' }), s);
  assert.equal(ob.onboardingReducer(s, { type: 'confirm_install' }), s);
  assert.equal(ob.onboardingReducer(s, { type: 'run_verification' }), s);
  assert.equal(ob.onboardingReducer(s, { type: 'enter_complete' }), s);

  s = ob.onboardingReducer(s, { type: 'submit_account', account: { name: '', email: 'bad', company: '' } });
  assert.equal(s.accountCreated, false);

  s = ob.onboardingReducer(s, { type: 'select_plan', plan: 'sandbox' });
  s = ob.onboardingReducer(s, { type: 'submit_account', account });
  s = ob.onboardingReducer(s, { type: 'purchase_succeeded', receiptId: 'rcpt_a' });
  const paid = s;
  s = ob.onboardingReducer(s, { type: 'purchase_succeeded', receiptId: 'rcpt_b' });
  assert.equal(s, paid);
  assert.equal(s.receiptId, 'rcpt_a');
});

test('goto cannot jump ahead of the furthest unlocked step', () => {
  let s = ob.initialOnboarding();
  s = ob.onboardingReducer(s, { type: 'goto', step: 'verify' });
  assert.equal(s.step, 'plan');
  s = ob.onboardingReducer(s, { type: 'select_plan', plan: 'founding' });
  s = ob.onboardingReducer(s, { type: 'goto', step: 'install' });
  assert.equal(s.step, 'account');
  s = ob.onboardingReducer(s, { type: 'goto', step: 'plan' });
  assert.equal(s.step, 'plan');
});

test('resetting clears every field back to the initial funnel state', () => {
  let s = ob.onboardingReducer(ob.initialOnboarding(), { type: 'select_plan', plan: 'founding' });
  s = ob.onboardingReducer(s, { type: 'reset' });
  assert.deepEqual(s, ob.initialOnboarding());
});

test('malformed or missing saved onboarding state recovers to a fresh funnel', () => {
  const original = global.localStorage;
  global.localStorage = { getItem: () => null, setItem: () => {} };
  assert.deepEqual(ob.loadOnboarding(), ob.initialOnboarding());
  global.localStorage = { getItem: () => '{not json', setItem: () => { throw new Error('quota'); } };
  assert.deepEqual(ob.loadOnboarding(), ob.initialOnboarding());
  assert.equal(ob.saveOnboarding(ob.initialOnboarding()), false);
  global.localStorage = { getItem: () => JSON.stringify({ version: 2, step: 'plan' }), setItem: () => {} };
  assert.deepEqual(ob.loadOnboarding(), ob.initialOnboarding());
  global.localStorage = original;
});
