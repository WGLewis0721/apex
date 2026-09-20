import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, CreditCard, RefreshCcw, Users } from 'lucide-react';
import { getOperatorSnapshot, OperatorSnapshot } from '../lib/backend';

const when = (value: string | null) => value ? new Date(value).toLocaleString() : '—';
const short = (value: string | null) => value ? `${value.slice(0, 12)}…` : '—';

export default function LiveOperations() {
  const [snapshot, setSnapshot] = useState<OperatorSnapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    setError('');
    try { setSnapshot(await getOperatorSnapshot()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load live operations.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);

  const totals = useMemo(() => ({
    remaining: snapshot?.accounts.reduce((sum, row) => sum + Number(row.remaining), 0) ?? 0,
    failures: snapshot?.events.filter((event) => event.status === 'failed').length ?? 0,
    processed: snapshot?.events.filter((event) => event.status === 'processed').length ?? 0,
  }), [snapshot]);
  const customerName = (id: string) => snapshot?.customers.find(customer => customer.id === id)?.external_id ?? short(id);
  const connection = snapshot?.connections[0];

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
