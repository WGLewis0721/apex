const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
if (!global.crypto) global.crypto = webcrypto;
global.localStorage = { getItem: () => null, setItem: () => {} };
const core = require('../.test-build/controlPlane.js');
const forma = require('../.test-build/forma.js');

test('free plan allows exactly three generations then hard-denies the fourth', () => {
  let account = forma.createFormaAccount();
  assert.equal(forma.formaAllowance(account), 3);
  for (let i = 0; i < 3; i++) {
    const decision = forma.canGenerate(account);
    assert.equal(decision.allow, true);
    ({ account } = forma.consumeGeneration(account));
  }
  assert.equal(account.generationsUsed, 3);
  assert.equal(forma.formaRemaining(account), 0);
  const denied = forma.canGenerate(account);
  assert.equal(denied.allow, false);
  assert.match(denied.reason, /Free plan limit reached/);
  const after = forma.consumeGeneration(account);
  assert.equal(after.account.generationsUsed, 3);
});

test('upgrade to Pro preserves prior usage and raises the allowance to 50/month', () => {
  let account = forma.createFormaAccount();
  for (let i = 0; i < 3; i++) ({ account } = forma.consumeGeneration(account));
  assert.equal(forma.canGenerate(account).allow, false);
  account = forma.upgradeToPro(account);
  assert.equal(account.plan, 'pro');
  assert.equal(account.generationsUsed, 3);
  assert.equal(forma.formaAllowance(account), 50);
  assert.equal(forma.canGenerate(account).allow, true);
  assert.equal(forma.upgradeToPro(account), account);
});

test('top-ups add capacity beyond the plan limit', () => {
  let account = forma.upgradeToPro(forma.createFormaAccount());
  account = { ...account, generationsUsed: 50 };
  assert.equal(forma.canGenerate(account).allow, false);
  account = forma.topUp(account, 10);
  assert.equal(forma.formaAllowance(account), 60);
  assert.equal(forma.canGenerate(account).allow, true);
  assert.throws(() => forma.topUp(account, 0));
  assert.throws(() => forma.topUp(account, -5));
  assert.throws(() => forma.topUp(account, 1.5));
});

test('payment failure enters a grace period that still allows generation; recovery clears it', () => {
  let account = forma.upgradeToPro(forma.createFormaAccount());
  account = forma.failPayment(account);
  assert.equal(account.status, 'grace_period');
  const decision = forma.canGenerate(account);
  assert.equal(decision.allow, true);
  assert.match(decision.reason, /grace period/);
  account = forma.recoverPayment(account);
  assert.equal(account.status, 'active');
  assert.equal(forma.recoverPayment(account), account);
  assert.equal(forma.failPayment(forma.createFormaAccount()).status, 'active');
});

test('renewing the billing period resets Pro usage but not bonus generations, and never affects Free', () => {
  let account = forma.upgradeToPro(forma.createFormaAccount());
  account = { ...account, generationsUsed: 40, bonusGenerations: 5 };
  const renewed = forma.renewPeriod(account);
  assert.equal(renewed.generationsUsed, 0);
  assert.equal(renewed.bonusGenerations, 5);
  const free = forma.createFormaAccount();
  assert.equal(forma.renewPeriod(free), free);
});

test('resetting Forma returns a fresh Free account regardless of prior state', () => {
  let account = forma.upgradeToPro(forma.createFormaAccount());
  account = { ...account, generationsUsed: 40, bonusGenerations: 5, status: 'grace_period' };
  const reset = forma.resetForma();
  assert.deepEqual(reset, forma.createFormaAccount());
});

test('full lifecycle on the shared Store: allow -> consume -> deny -> upgrade -> top-up -> failure/recovery', () => {
  let store = core.loadStore();
  assert.equal(store.forma.plan, 'free');

  for (let i = 0; i < 3; i++) store = forma.recordGeneration(store);
  assert.equal(store.forma.generationsUsed, 3);
  assert.equal(store.audit[0].result, 'allow');

  store = forma.recordGeneration(store);
  assert.equal(store.forma.generationsUsed, 3);
  assert.equal(store.audit[0].result, 'deny');

  store = forma.upgradeForma(store);
  assert.equal(store.forma.plan, 'pro');
  assert.equal(store.forma.generationsUsed, 3);
  assert.equal(store.audit[0].action, 'forma.upgrade');

  store = forma.topUpForma(store, 5);
  assert.equal(store.forma.bonusGenerations, 5);
  assert.equal(forma.formaAllowance(store.forma), 55);

  store = forma.failFormaPayment(store);
  assert.equal(store.forma.status, 'grace_period');
  store = forma.recordGeneration(store);
  assert.equal(store.forma.generationsUsed, 4);
  assert.equal(store.audit[0].result, 'allow');

  store = forma.recoverFormaPayment(store);
  assert.equal(store.forma.status, 'active');

  store = forma.renewFormaPeriod(store);
  assert.equal(store.forma.generationsUsed, 0);
  assert.equal(store.forma.bonusGenerations, 5);

  store = forma.resetFormaAccount(store);
  assert.deepEqual(store.forma, forma.createFormaAccount());
});

test('subscribing to a plan does not reset usage and is reachable from either plan', () => {
  let store = core.loadStore();
  store = forma.recordGeneration(store);
  store = forma.subscribeForma(store, 'pro');
  assert.equal(store.forma.plan, 'pro');
  assert.equal(store.forma.generationsUsed, 1);
  store = forma.subscribeForma(store, 'free');
  assert.equal(store.forma.plan, 'free');
  assert.equal(store.forma.generationsUsed, 1);
});
