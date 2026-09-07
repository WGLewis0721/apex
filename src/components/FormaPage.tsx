import { useState } from 'react';
import { Store, loadStore, saveStore } from '../lib/controlPlane';
import {
  FORMA_PLANS,
  failFormaPayment,
  formaAllowance,
  formaRemaining,
  planLimit,
  recordGeneration,
  recoverFormaPayment,
  renewFormaPeriod,
  resetFormaAccount,
  subscribeForma,
  topUpForma,
  upgradeForma,
} from '../lib/forma';

// Functional shell only. Not styled — a follow-up pass wires this into the
// product navigation and applies visual design.
export default function FormaPage() {
  const [store, setStore] = useState<Store>(() => loadStore());

  function commit(next: Store) {
    setStore(next);
    saveStore(next);
  }

  const account = store.forma;
  const plan = FORMA_PLANS[account.plan];
  const lastEvent = store.audit.find((e) => e.action.startsWith('forma.'));

  return (
    <div className="forma-page">
      <h1>Forma</h1>

      <section aria-label="Account status">
        <p>Plan: {plan.name}</p>
        <p>Status: {account.status === 'grace_period' ? 'Payment grace period' : 'Active'}</p>
        <p>
          Used {account.generationsUsed} of {formaAllowance(account)} generations
          {account.bonusGenerations > 0 && ` (includes ${account.bonusGenerations} bonus)`}
        </p>
        <p>{formaRemaining(account)} remaining</p>
      </section>

      {lastEvent && (
        <section aria-label="Last event">
          <p data-result={lastEvent.result}>{lastEvent.detail}</p>
        </section>
      )}

      <section aria-label="Generate">
        <button onClick={() => commit(recordGeneration(store))}>Generate</button>
      </section>

      <section aria-label="Plan">
        {account.plan === 'free' ? (
          <button onClick={() => commit(upgradeForma(store))}>
            Upgrade to Pro (${FORMA_PLANS.pro.price}/mo, {planLimit({ ...account, plan: 'pro' })}/month)
          </button>
        ) : (
          <button onClick={() => commit(subscribeForma(store, 'free'))}>Switch to Free</button>
        )}
        <button onClick={() => commit(topUpForma(store, 10))}>Buy 10 bonus generations</button>
      </section>

      <section aria-label="Billing simulation">
        {account.status === 'active' ? (
          <button onClick={() => commit(failFormaPayment(store))} disabled={account.plan !== 'pro'}>
            Simulate payment failure
          </button>
        ) : (
          <button onClick={() => commit(recoverFormaPayment(store))}>Recover payment</button>
        )}
        <button onClick={() => commit(renewFormaPeriod(store))} disabled={account.plan !== 'pro'}>
          Simulate next billing period
        </button>
      </section>

      <section aria-label="Reset">
        <button onClick={() => commit(resetFormaAccount(store))}>Reset demo</button>
      </section>
    </div>
  );
}
