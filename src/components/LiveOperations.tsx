import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, CreditCard, RefreshCcw, Users } from 'lucide-react';
import {
  getOperatorSnapshot,
  OperatorSnapshot,
  setPriceMappingActive,
  upsertPriceMapping,
} from '../lib/backend';
import {
  applyMappingChange,
  mappingNeeded as mappingNeededFromEvents,
  PriceMapping,
  validateCreditAmount,
  validateStripePriceId,
} from '../lib/priceMappings';

const when = (value: string | null) => value ? new Date(value).toLocaleString() : '—';
const short = (value: string | null) => value ? `${value.slice(0, 12)}…` : '—';

export default function LiveOperations() {
  const [snapshot, setSnapshot] = useState<OperatorSnapshot | null>(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [priceId, setPriceId] = useState('price_test_example');
  const [credits, setCredits] = useState('1000');

  async function refresh() {
    setLoading(true);
    setError('');
    try { setSnapshot(await getOperatorSnapshot()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load live operations.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);

  const mappings = snapshot?.mappings ?? [];
  const totals = useMemo(() => ({
    remaining: snapshot?.accounts.reduce((sum, row) => sum + Number(row.remaining), 0) ?? 0,
    failures: snapshot?.events.filter((event) => event.status === 'failed').length ?? 0,
    processed: snapshot?.events.filter((event) => event.status === 'processed').length ?? 0,
  }), [snapshot]);
  const customerName = (id: string) => snapshot?.customers.find(customer => customer.id === id)?.external_id ?? short(id);
  const connection = snapshot?.connections[0];
  const needsMapping = snapshot?.mappingNeeded ?? mappingNeededFromEvents(snapshot?.events ?? []);

  function remember(mapping: PriceMapping) {
    setSnapshot((current) => current ? { ...current, mappings: applyMappingChange(current.mappings ?? [], mapping) } : current);
  }

  async function saveMapping(event: FormEvent) {
    event.preventDefault();
    const priceError = validateStripePriceId(priceId);
    const amountError = validateCreditAmount(credits);
    if (priceError || amountError) {
      setFormError(priceError ?? amountError ?? '');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const result = await upsertPriceMapping(priceId.trim(), Number(credits));
      remember(result.mapping);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not save that price.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleMapping(mapping: PriceMapping) {
    setFormError('');
    try {
      const result = await setPriceMappingActive(mapping.id, !mapping.is_active);
      remember(result.mapping);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not update that price.');
    }
  }

  return <div className="live-ops">
    <div className="live-ops-head">
      <div><span className="live-kicker">HOSTED SUPABASE STATE</span><h2>Live operations</h2><p>Verified Stripe delivery, product value, and ledger evidence for your paid workspace.</p></div>
      <button className="secondary" onClick={() => void refresh()} disabled={loading}><RefreshCcw size={15}/>{loading ? 'Loading…' : 'Refresh'}</button>
    </div>
    {error && <div className="live-error"><AlertTriangle size={20}/><div><strong>Live workspace unavailable</strong><p>{error} Sign in through Start with APEX to view hosted data.</p></div></div>}
    {snapshot && <>
      <div className="live-summary">
        <article className={connection?.status === 'connected' ? '' : 'warning'}><Activity/><span>Stripe connection</span><strong>{connection?.status ?? 'none'}</strong></article>
        <article><Users/><span>Customers</span><strong>{snapshot.customers.length}</strong></article>
        <article><CreditCard/><span>Spendable credits</span><strong>{totals.remaining.toLocaleString()}</strong></article>
        <article><CheckCircle2/><span>Processed events</span><strong>{totals.processed}</strong></article>
        <article className={totals.failures ? 'warning' : ''}><Activity/><span>Failed events</span><strong>{totals.failures}</strong></article>
      </div>
      <section className="panel">
        <div className="panel-title"><div><CreditCard/><h3>What each Stripe Price unlocks</h3></div><span>{snapshot.workspace.name}{connection?.stripe_account_id ? ` · ${connection.stripe_account_id}` : ''}</span></div>
        <p style={{ margin: '0 0 12px', fontSize: 14 }}>Tell APEX what each Stripe Price unlocks. Example: price_123 → 1,000 credits. Unmapped prices grant nothing.</p>
        {needsMapping && <div className="live-error" style={{ marginBottom: 12 }}><AlertTriangle size={18}/><div><strong>A purchase is waiting on a price setup</strong><p>A connected Stripe event could not grant credits because that Price is not configured. Add it below. Existing retry will pick it up; this does not invent a second processor.</p></div></div>}
        <form onSubmit={(event) => void saveMapping(event)} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) auto', gap: 10, marginBottom: 16 }}>
          <label>Stripe Price ID
            <input value={priceId} onChange={(event) => setPriceId(event.target.value)} placeholder="price_test_example" autoComplete="off" />
          </label>
          <label>Credits unlocked
            <input value={credits} onChange={(event) => setCredits(event.target.value)} inputMode="numeric" />
          </label>
          <button className="secondary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save price'}</button>
        </form>
        {formError && <p className="live-error" style={{ marginBottom: 12 }}>{formError}</p>}
        <div className="table-wrap"><table><thead><tr><th>Stripe Price</th><th>Credits</th><th>State</th><th></th></tr></thead><tbody>
          {mappings.map((mapping) => <tr key={mapping.id}>
            <td><code>{mapping.stripe_price_id}</code></td>
            <td><strong>{Number(mapping.credit_amount).toLocaleString()}</strong></td>
            <td><span className={`status ${mapping.is_active ? 'active' : ''}`}>{mapping.is_active ? 'active' : 'inactive'}</span></td>
            <td><button className="secondary" type="button" onClick={() => void toggleMapping(mapping)}>{mapping.is_active ? 'Deactivate' : 'Reactivate'}</button></td>
          </tr>)}
          {!mappings.length && <tr><td colSpan={4}>No prices configured yet. Add price_test_example → 1,000 credits to start.</td></tr>}
        </tbody></table></div>
      </section>
      <section className="panel">
        <div className="panel-title"><div><Users/><h3>Customer balances</h3></div><span>{snapshot.accounts.length} funded</span></div>
        <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Stripe customer</th><th>Remaining</th><th>Version</th><th>Updated</th></tr></thead><tbody>
          {snapshot.accounts.map(account => { const customer = snapshot.customers.find(row => row.id === account.customer_id); return <tr key={account.customer_id}><td>{customerName(account.customer_id)}</td><td><code>{short(customer?.stripe_customer_id ?? null)}</code></td><td><strong>{Number(account.remaining).toLocaleString()}</strong></td><td>{account.version}</td><td>{when(account.updated_at)}</td></tr>; })}
          {!snapshot.accounts.length && <tr><td colSpan={5}>No funded customers yet.</td></tr>}
        </tbody></table></div>
      </section>
      <section className="panel">
        <div className="panel-title"><div><Activity/><h3>Stripe event deliveries</h3></div><span>As of {when(snapshot.asOf)}</span></div>
        <div className="table-wrap"><table><thead><tr><th>Event</th><th>Type</th><th>Status</th><th>Attempts</th><th>Error</th><th>Received</th></tr></thead><tbody>
          {snapshot.events.map(event => <tr key={event.id}><td><code title={event.stripe_event_id}>{short(event.stripe_event_id)}</code></td><td>{event.event_type}</td><td><span className={`status ${event.status === 'processed' ? 'active' : event.status}`}>{event.status}</span></td><td>{event.attempt_count}</td><td>{event.last_error ?? '—'}</td><td>{when(event.received_at)}</td></tr>)}
          {!snapshot.events.length && <tr><td colSpan={6}>No Stripe events received yet.</td></tr>}
        </tbody></table></div>
      </section>
      <section className="panel">
        <div className="panel-title"><div><CreditCard/><h3>Credit ledger</h3></div><span>{snapshot.workspace.name}</span></div>
        <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Entry</th><th>Amount</th><th>Idempotency key</th><th>Created</th></tr></thead><tbody>
          {snapshot.ledger.map(entry => <tr key={entry.id}><td>{customerName(entry.customer_id)}</td><td><span className={`status ${entry.entry_type}`}>{entry.entry_type}</span></td><td>{Number(entry.amount).toLocaleString()}</td><td><code title={entry.idempotency_key}>{short(entry.idempotency_key)}</code></td><td>{when(entry.created_at)}</td></tr>)}
          {!snapshot.ledger.length && <tr><td colSpan={5}>No credit activity yet.</td></tr>}
        </tbody></table></div>
      </section>
    </>}
  </div>;
}
