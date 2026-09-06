const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initialEmbedded, embeddedReducer: act, allowance } = require('../.test-build/embeddedDemo.js');

test('subscription to limit to upgrade preserves usage and produces correct balances', () => {
  let state = initialEmbedded();
  state = act(state, 'generate');
  assert.equal(state.used, 0);
  assert.equal(state.events[0].type, 'usage.blocked');
  state = act(state, 'subscribe');
  assert.equal(allowance(state), 1000);
  const subscribed = state;
  assert.equal(act(state, 'subscribe'), subscribed);
  for (let i = 0; i < 4; i++) state = act(state, 'generate');
  assert.equal(state.used, 1000);
  state = act(state, 'generate');
  assert.equal(state.used, 1000);
  assert.equal(state.events[0].type, 'usage.blocked');
  state = act(state, 'upgrade');
  assert.equal(state.used, 1000);
  assert.equal(allowance(state), 5000);
  state = act(state, 'generate');
  assert.equal(state.used, 1250);
  assert.equal(state.events.filter(e => e.amount).reduce((n,e) => n + e.amount,0), 79);
});

test('top-ups add capacity; failures enter grace; recovery preserves consumption', () => {
  let state = act(initialEmbedded(), 'subscribe');
  state = act(state, 'generate');
  state = act(state, 'topup');
  assert.equal(allowance(state), 2000);
  state = act(state, 'fail');
  assert.equal(state.payment, 'past_due');
  state = act(state, 'generate');
  assert.equal(state.used, 500);
  state = act(state, 'recover');
  assert.equal(state.payment, 'paid');
  assert.equal(state.used, 500);
  assert.equal(state.extra, 1000);
  assert.deepEqual(act(state, 'reset'), initialEmbedded());
});

test('invalid lifecycle actions do not grant unpurchased capacity or duplicate upgrades', () => {
  const fresh = initialEmbedded();
  for (const action of ['upgrade','topup','fail','recover']) assert.equal(act(fresh, action), fresh);
  const pro = act(act(fresh, 'subscribe'), 'upgrade');
  assert.equal(act(pro, 'upgrade'), pro);
  assert.equal(act(pro, 'recover'), pro);
});

test('retains receipt history and totals beyond fifty operations without mutating earlier state', () => {
  const fresh = initialEmbedded();
  let state = act(fresh, 'subscribe');
  for(let i=0;i<60;i++) state = act(state,'topup');
  assert.equal(state.events.length,61);
  assert.equal(state.events.reduce((sum,e)=>sum+(e.amount || 0),0),629);
  assert.equal(allowance(state),61000);
  assert.deepEqual(fresh,initialEmbedded());
});
