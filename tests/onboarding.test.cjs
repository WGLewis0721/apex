const { test } = require('node:test');
const assert = require('node:assert/strict');
global.localStorage = { getItem: () => null, setItem: () => {} };
const ob = require('../.test-build/onboarding.js');

const account = { name: 'Jamie Rivera', email: 'jamie@acme.dev', company: 'Acme Studio' };

function toStack(state) {
  state = ob.onboardingReducer(state, { type: 'select_plan', plan: 'founding' });
  state = ob.onboardingReducer(state, { type: 'submit_account', account });
  state = ob.onboardingReducer(state, { type: 'purchase_succeeded', receiptId: 'rcpt_1' });
  return state;
}

function toLauncher(state) {
  state = toStack(state);
  state = ob.onboardingReducer(state, { type: 'choose_stack', stack: 'javascript' });
  state = ob.onboardingReducer(state, { type: 'connect_payments_pending' });
  state = ob.onboardingReducer(state, { type: 'connect_payments_succeeded' });
  return ob.onboardingReducer(state, { type: 'goto', step: 'launcher' });
}

test('a fresh funnel starts on the plan step with nothing unlocked', () => {
  const state = ob.initialOnboarding();
  assert.equal(state.step, 'plan');
  assert.equal(state.launcherStage, 0);
  assert.equal(ob.furthestUnlockedStep(state), 'plan');
  assert.equal(ob.checklistProgress(state).done, 0);
});

test('full lifecycle: plan -> account -> purchase -> workspace -> stack -> payments -> launcher -> complete', () => {
  let s = ob.initialOnboarding();
  s = ob.onboardingReducer(s, { type: 'select_plan', plan: 'founding' });
  assert.equal(s.step, 'account');

  s = ob.onboardingReducer(s, { type: 'submit_account', account });
  assert.equal(s.step, 'purchase');

  s = ob.onboardingReducer(s, { type: 'purchase_pending' });
  assert.equal(s.purchaseStatus, 'processing');
  s = ob.onboardingReducer(s, { type: 'purchase_succeeded', receiptId: 'rcpt_1' });
  assert.equal(s.step, 'workspace');
  assert.ok(s.workspaceId);

  s = ob.onboardingReducer(s, { type: 'goto', step: 'stack' });
  s = ob.onboardingReducer(s, { type: 'choose_stack', stack: 'javascript' });
  assert.equal(s.stack, 'javascript');
  assert.equal(s.step, 'payments');

  s = ob.onboardingReducer(s, { type: 'connect_payments_pending' });
  assert.equal(s.paymentProviderStatus, 'connecting');
  s = ob.onboardingReducer(s, { type: 'connect_payments_succeeded' });
  assert.equal(s.paymentProviderStatus, 'demo_connected');
  assert.equal(s.step, 'payments', 'connecting Stripe should not silently jump the user into the launcher');

  s = ob.onboardingReducer(s, { type: 'goto', step: 'launcher' });
  assert.equal(s.step, 'launcher');

  for (let stage = 1; stage <= ob.LAUNCHER_STAGE_COUNT; stage++) {
    s = ob.onboardingReducer(s, { type: 'launcher_progress', stage });
  }
  assert.equal(s.launcherStage, ob.LAUNCHER_STAGE_COUNT);
  assert.equal(s.sdkInstalled, true);
  assert.equal(s.environmentConfigured, true);
  assert.equal(s.verificationPassed, true);

  s = ob.onboardingReducer(s, { type: 'enter_complete' });
  assert.equal(s.step, 'complete');

  const progress = ob.checklistProgress(s);
  assert.equal(progress.done, progress.total - 1);
  s = ob.onboardingReducer(s, { type: 'request_production' });
  assert.equal(ob.checklistProgress(s).done, ob.checklistProgress(s).total);
});

test('launcher progress flips sdkInstalled/environmentConfigured/verificationPassed at the documented stage thresholds', () => {
  let s = toLauncher(ob.initialOnboarding());
  s = ob.onboardingReducer(s, { type: 'launcher_progress', stage: 3 });
  assert.equal(s.sdkInstalled, false);
  s = ob.onboardingReducer(s, { type: 'launcher_progress', stage: 4 });
  assert.equal(s.sdkInstalled, true);
  assert.equal(s.environmentConfigured, false);
  s = ob.onboardingReducer(s, { type: 'launcher_progress', stage: 7 });
  assert.equal(s.environmentConfigured, false);
  s = ob.onboardingReducer(s, { type: 'launcher_progress', stage: 8 });
  assert.equal(s.environmentConfigured, true);
  assert.equal(s.verificationPassed, false);
  s = ob.onboardingReducer(s, { type: 'launcher_progress', stage: 12 });
  assert.equal(s.verificationPassed, false);
  s = ob.onboardingReducer(s, { type: 'launcher_progress', stage: 13 });
  assert.equal(s.verificationPassed, true);
});

test('launcher progress cannot regress, cannot exceed the stage count, and requires stack + connected payments', () => {
  let s = toStack(ob.initialOnboarding());
  // No stack chosen yet, no payment connected: progress is refused.
  assert.equal(ob.onboardingReducer(s, { type: 'launcher_progress', stage: 1 }), s);

  s = ob.onboardingReducer(s, { type: 'choose_stack', stack: 'javascript' });
  // Stack chosen but Stripe not connected yet: still refused.
  assert.equal(ob.onboardingReducer(s, { type: 'launcher_progress', stage: 1 }), s);

  s = toLauncher(ob.initialOnboarding());
  s = ob.onboardingReducer(s, { type: 'launcher_progress', stage: 5 });
  assert.equal(s.launcherStage, 5);
  const atFive = s;
  s = ob.onboardingReducer(s, { type: 'launcher_progress', stage: 3 });
  assert.equal(s, atFive, 'progress must never go backwards');

  s = ob.onboardingReducer(s, { type: 'launcher_progress', stage: 999 });
  assert.equal(s.launcherStage, ob.LAUNCHER_STAGE_COUNT);
});

test('resuming after a refresh only re-plays stages after the persisted launcherStage', () => {
  let s = toLauncher(ob.initialOnboarding());
  s = ob.onboardingReducer(s, { type: 'launcher_progress', stage: 6 });
  const serialized = JSON.parse(JSON.stringify(s));
  assert.equal(serialized.launcherStage, 6);
  assert.equal(serialized.sdkInstalled, true);
  assert.equal(serialized.environmentConfigured, false);
  // Continuing from a "reloaded" copy behaves identically to continuing live.
  let resumed = ob.onboardingReducer(serialized, { type: 'launcher_progress', stage: 7 });
  assert.equal(resumed.launcherStage, 7);
});

test('cannot enter the complete step, connect payments, or choose a stack out of order', () => {
  const fresh = ob.initialOnboarding();
  assert.equal(ob.onboardingReducer(fresh, { type: 'choose_stack', stack: 'javascript' }), fresh);
  assert.equal(ob.onboardingReducer(fresh, { type: 'connect_payments_pending' }), fresh);
  assert.equal(ob.onboardingReducer(fresh, { type: 'enter_complete' }), fresh);

  let s = toStack(fresh);
  const beforeStack = s;
  assert.equal(ob.onboardingReducer(beforeStack, { type: 'connect_payments_pending' }), beforeStack);

  s = toLauncher(fresh);
  const beforeVerified = s;
  assert.equal(ob.onboardingReducer(beforeVerified, { type: 'enter_complete' }), beforeVerified);
});

test('invalid account submissions and duplicate purchases are rejected', () => {
  let s = ob.onboardingReducer(ob.initialOnboarding(), { type: 'select_plan', plan: 'sandbox' });
  s = ob.onboardingReducer(s, { type: 'submit_account', account: { name: '', email: 'bad', company: '' } });
  assert.equal(s.accountCreated, false);

  s = ob.onboardingReducer(s, { type: 'submit_account', account });
  s = ob.onboardingReducer(s, { type: 'purchase_succeeded', receiptId: 'rcpt_a' });
  const paid = s;
  s = ob.onboardingReducer(s, { type: 'purchase_succeeded', receiptId: 'rcpt_b' });
  assert.equal(s, paid);
  assert.equal(s.receiptId, 'rcpt_a');
});

test('goto cannot jump ahead of the furthest unlocked step', () => {
  let s = ob.initialOnboarding();
  s = ob.onboardingReducer(s, { type: 'goto', step: 'launcher' });
  assert.equal(s.step, 'plan');
  s = ob.onboardingReducer(s, { type: 'select_plan', plan: 'founding' });
  s = ob.onboardingReducer(s, { type: 'goto', step: 'payments' });
  assert.equal(s.step, 'account');
});

test('resetting clears every field, including launcher progress, back to the initial funnel state', () => {
  let s = toLauncher(ob.initialOnboarding());
  s = ob.onboardingReducer(s, { type: 'launcher_progress', stage: 10 });
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

test('a state saved before the launcher stage model existed still loads with launcher progress defaulted to zero', () => {
  const original = global.localStorage;
  // No launcherStage/sdkInstalled/environmentConfigured field at all, as a
  // pre-launcher save would have looked, but 'payments' is still a valid step.
  const legacy = { version: 1, step: 'payments', selectedPlan: 'founding', accountCreated: true, purchaseStatus: 'paid', workspaceCreated: true, stack: 'javascript', paymentProviderStatus: 'connecting', productionRequested: false };
  global.localStorage = { getItem: () => JSON.stringify(legacy), setItem: () => {} };
  const loaded = ob.loadOnboarding();
  assert.equal(loaded.launcherStage, 0);
  assert.equal(loaded.environmentConfigured, false);
  assert.equal(ob.furthestUnlockedStep(loaded), 'payments');

  // A saved step name removed by this refactor ('install') can no longer be
  // trusted and falls back to a fresh funnel rather than guessing a mapping.
  global.localStorage = { getItem: () => JSON.stringify({ ...legacy, step: 'install' }), setItem: () => {} };
  assert.deepEqual(ob.loadOnboarding(), ob.initialOnboarding());
  global.localStorage = original;
});
