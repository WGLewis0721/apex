import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Blocks,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Code2,
  CreditCard,
  Database,
  FileClock,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  PackageCheck,
  RefreshCcw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  Customer,
  Store,
  findPlan,
  loadStore,
  recordAccessCheck,
  resetStore,
  saveStore,
  uid,
  utilization,
} from './lib/controlPlane';

import { AgentControls, CommandCenter, Connections, Customer360, ExecutionDemo, FindingsWorkspace, PolicyStudio } from './components/AssuranceWorkspace';
import { findings } from './lib/assurance';

const pages = [
  ['Command Center', LayoutDashboard],
  ['Findings', ShieldCheck],
  ['Customer 360', Users],
  ['Policy Studio', SlidersHorizontal],
  ['Execution Demo', Zap],
  ['Customers', Users],
  ['Products & Plans', Blocks],
  ['Entitlements', PackageCheck],
  ['Access Lab', LockKeyhole],
  ['Usage', Gauge],
  ['Billing Sync', CreditCard],
  ['AI Controls', Bot],
  ['Audit Log', FileClock],
  ['Developer', Code2],
  ['Connections', Database],
] as const;

type Page = (typeof pages)[number][0];

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const niceDate = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function App() {
  const [store, setStore] = useState<Store>(() => loadStore());
  const [page, setPage] = useState<Page>('Billing Sync');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(store.customers[0].id);
  const [toast, setToast] = useState('');
  const [selectedFindingId, setSelectedFindingId] = useState<string>();

  useEffect(() => { const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, []);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 3500); return () => window.clearTimeout(timer); }, [toast]);

  const selectedCustomer = store.customers.find((c) => c.id === selectedCustomerId) ?? store.customers[0];

  function commit(next: Store, message?: string) {
    setStore(next);
    const persisted = saveStore(next);
    if (!persisted) setToast('Changes work in this session, but browser storage is unavailable.');
    if (persisted && message) setToast(message);
  }

  function navigate(next: Page) {
    setPage(next);
    setMobileOpen(false);
  }

  const workspaceProps = { store, commit, go: (p: string, findingId?: string) => { setSelectedFindingId(findingId); navigate(p as Page); }, initialFindingId: selectedFindingId, selectedId: selectedCustomerId, select: setSelectedCustomerId };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="brand-block">
          <div className="brand-mark"><span>A</span></div>
          <div>
            <div className="brand">APEX</div>
            <div className="brand-sub">Payments & usage</div>
          </div>
          <button className="mobile-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={18}/></button>
        </div>

        <div className="env-pill"><Database size={14}/> Demo workspace <span className="env-label">SANDBOX</span></div>
        <div className="nav-section-label">WORKSPACE</div>

        <nav>
          {pages.filter(([label]) => !['Command Center', 'Findings', 'Customer 360', 'Execution Demo', 'AI Controls', 'Connections', 'Developer'].includes(label)).map(([label, Icon]) => (
            <button key={label} aria-current={page === label ? 'page' : undefined} className={`nav-item ${page === label ? 'active' : ''}`} onClick={() => navigate(label)}>
              <Icon size={18}/><span>{label}</span>{label === 'Findings' && <b className="nav-count">{findings(store).filter(f => f.status === 'open').length}</b>}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="workspace-card">
            <div className="avatar">GM</div>
            <div><strong>Gray Matter Labs</strong><span>apex_sandbox_01</span></div>
            <Settings2 size={16}/>
          </div>
        </div>
      </aside>

      {mobileOpen && <button className="scrim" onClick={() => setMobileOpen(false)} aria-label="Close menu"/>}

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20}/></button>
            <div>
              <h1>{page}</h1>
              <p>{subtitle(page)}</p>
            </div>
          </div>
          <div className="top-actions">
            <div className="health"><Database size={15}/> Local sandbox · v0.3</div>
            <button className="icon-btn" title="Reset sandbox" aria-label="Reset sandbox" onClick={() => {
              if (!window.confirm('Reset all sandbox changes, findings, and demo history?')) return;
              const next = resetStore();
              setSelectedCustomerId(next.customers[0].id);
              setStore(next);
              setToast('Sandbox reset to seed data');
            }}><RefreshCcw size={17}/></button>
            <button className="primary" onClick={() => navigate('Usage')}><Zap size={16}/> Track usage</button>
          </div>
        </header>

        <div className="content">
          {page === 'Command Center' && <CommandCenter {...workspaceProps}/>}
          {page === 'Findings' && <FindingsWorkspace {...workspaceProps}/>}
          {page === 'Customer 360' && <Customer360 {...workspaceProps}/>}
          {page === 'Policy Studio' && <PolicyStudio {...workspaceProps}/>}
          {page === 'Execution Demo' && <ExecutionDemo {...workspaceProps}/>}
          {page === 'Connections' && <Connections {...workspaceProps}/>}
          {page === 'Customers' && <Customers store={store} commit={commit} selectedCustomerId={selectedCustomerId} setSelectedCustomerId={setSelectedCustomerId} onNavigate={navigate}/>}
          {page === 'Products & Plans' && <Plans store={store} onEdit={() => navigate('Policy Studio')}/>}
          {page === 'Entitlements' && <Entitlements store={store} commit={commit} selected={selectedCustomer} setSelectedCustomerId={setSelectedCustomerId}/>}
          {page === 'Access Lab' && <AccessLab store={store} commit={commit} selected={selectedCustomer} setSelectedCustomerId={setSelectedCustomerId}/>}
          {page === 'Usage' && <Usage store={store} commit={commit}/>}
          {page === 'Billing Sync' && <Billing store={store} commit={commit}/>}
          {page === 'AI Controls' && <AgentControls {...workspaceProps}/>}
          {page === 'Audit Log' && <Audit store={store}/>}
          {page === 'Developer' && <Developer/>}
        </div>
      </main>
      {toast && <div className="toast" role="status"><CheckCircle2 size={17}/>{toast}</div>}
    </div>
  );
}

function subtitle(page: Page) {
  const map: Record<Page, string> = {
    'Command Center': 'Revenue, access, and usage — one operational view.',
    'Findings': 'Detect, investigate, and resolve commercial discrepancies.',
    'Customer 360': 'The terms, grants, and history behind customer access.',
    'Policy Studio': 'Simulate customer impact before publishing a change.',
    'Execution Demo': 'An interactive subscription-to-execution walkthrough.',
    'Connections': 'Source contracts and integration readiness.',
    'Customers': 'Commercial state for every account.',
    'Products & Plans': 'Define what customers buy and what each plan unlocks.',
    'Entitlements': 'Translate commercial terms into enforceable product rights.',
    'Access Lab': 'Test a live policy decision against your current control state.',
    'Usage': 'Track consumption and remaining plan balances.',
    'Billing Sync': 'Keep billing state and product access synchronized.',
    'AI Controls': 'Govern autonomous agents with identity, budgets, and permissions.',
    'Audit Log': 'Every commercial and access decision, recorded.',
    'Developer': 'Integrate once. Enforce everywhere.',
  };
  return map[page];
}

function PanelTitle({icon,title,action,onAction}:{icon:React.ReactNode;title:string;action?:string;onAction?:()=>void}) {
  return <div className="panel-title"><div>{icon}<h3>{title}</h3></div>{action&&<button onClick={onAction}>{action}<ChevronRight size={15}/></button>}</div>;
}

function ResultDot({result}:{result:'allow'|'deny'|'info'}) {
  return <span className={`result-dot ${result}`}>{result==='allow'?<CheckCircle2/>:result==='deny'?<XCircle/>:<Activity/>}</span>;
}

function Customers({store,commit,selectedCustomerId,setSelectedCustomerId,onNavigate}:{store:Store;commit:(s:Store,m?:string)=>void;selectedCustomerId:string;setSelectedCustomerId:(s:string)=>void;onNavigate:(p:Page)=>void}) {
  const [query,setQuery]=useState('');
  const rows=store.customers.filter(c=>`${c.name} ${c.email}`.toLowerCase().includes(query.toLowerCase()));
  function toggle(c:Customer){
    const next=structuredClone(store); const target=next.customers.find(x=>x.id===c.id)!; target.status=target.status==='suspended'?'active':'suspended';
    next.audit.unshift({id:uid('evt'),at:new Date().toISOString(),actor:'admin@apex.demo',action:target.status==='active'?'customer.resume':'customer.suspend',target:target.name,result:'info',detail:`Customer set to ${target.status}`});
    commit(next,`${target.name} is now ${target.status}`);
  }
  return <div className="panel">
    <div className="table-toolbar"><div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search customers..."/></div><span>{rows.length} accounts</span></div>
    <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Plan</th><th>Status</th><th>Seats</th><th>API usage</th><th></th></tr></thead><tbody>
      {rows.map(c=>{const p=findPlan(store,c);return <tr key={c.id} className={selectedCustomerId===c.id?'selected-row':''} onClick={()=>setSelectedCustomerId(c.id)}>
        <td><div className="customer-cell"><div className="company-icon">{c.name.slice(0,2).toUpperCase()}</div><div><strong>{c.name}</strong><span>{c.email}</span></div></div></td>
        <td><span className="plan-badge">{p.name}</span></td><td><span className={`status ${c.status}`}>{c.status}</span></td><td>{c.seatsUsed} / {p.seats}</td><td>{utilization(c.apiCallsUsed,p.apiCalls)}%</td>
        <td><div className="row-actions"><button className="small-btn" onClick={e=>{e.stopPropagation();setSelectedCustomerId(c.id);onNavigate('Entitlements')}}>Manage</button><button className="small-btn" onClick={e=>{e.stopPropagation();toggle(c)}}>{c.status==='suspended'?'Resume':'Suspend'}</button></div></td>
      </tr>})}
    </tbody></table></div>
  </div>;
}

function Plans({store,onEdit}:{store:Store;onEdit:()=>void}) {
  return <div className="plan-grid">{store.plans.map((p,i)=><div className={`plan-card ${i===1?'featured':''}`} key={p.id}>
    {i===1&&<div className="recommended">Most deployed</div>}
    <div className="plan-top"><div><span>PLAN</span><h3>{p.name}</h3></div><div className="price">{money(p.price)}<small>/mo</small></div></div>
    <p>{p.seats} seats · {p.apiCalls.toLocaleString()} API calls / period</p>
    <div className="feature-list">{p.features.map(f=><div key={f}><CheckCircle2 size={16}/><span>{humanize(f)}</span></div>)}</div>
    <button className="secondary full" onClick={onEdit}>Edit in Policy Studio</button>
  </div>)}</div>;
}

function Entitlements({store,commit,selected,setSelectedCustomerId}:{store:Store;commit:(s:Store,m?:string)=>void;selected:Customer;setSelectedCustomerId:(s:string)=>void}) {
  const [feature,setFeature]=useState('');
  const plan=findPlan(store,selected);
  const all=Array.from(new Set([...plan.features,...Object.keys(selected.overrides),'sso','audit_api','ai_agents','exports','automation']));
  function setOverride(name:string,value:boolean|undefined){
    const next=structuredClone(store); const c=next.customers.find(x=>x.id===selected.id)!;
    if(value===undefined) delete c.overrides[name]; else c.overrides[name]=value;
    next.audit.unshift({id:uid('evt'),at:new Date().toISOString(),actor:'admin@apex.demo',action:'entitlement.override',target:`${c.name} / ${name}`,result:'info',detail:value===undefined?'Override removed':`Override set to ${value?'allow':'deny'}`});
    commit(next,'Entitlement policy updated');
  }
  return <section className="two-col wide-left">
    <div className="panel">
      <PanelTitle icon={<PackageCheck/>} title="Effective entitlements"/>
      <CustomerSelector store={store} value={selected.id} onChange={setSelectedCustomerId}/>
      <div className="entitlement-head"><div><span>Inherited plan</span><strong>{plan.name}</strong></div><div><span>Overrides</span><strong>{Object.keys(selected.overrides).length}</strong></div></div>
      <div className="entitlement-list">{all.map(name=>{const inherited=plan.features.includes(name);const override=selected.overrides[name];const effective=override??inherited;return <div key={name} className="entitlement-row"><div><span className={`feature-state ${effective?'on':'off'}`}>{effective?<CheckCircle2/>:<XCircle/>}</span><div><strong>{humanize(name)}</strong><span>{override!==undefined?`Customer override: ${override?'allow':'deny'}`:inherited?'Inherited from plan':'Not included in plan'}</span></div></div><div className="segmented"><button className={override===undefined?'active':''} onClick={()=>setOverride(name,undefined)}>Plan</button><button className={override===true?'active allow':''} onClick={()=>setOverride(name,true)}>Allow</button><button className={override===false?'active deny':''} onClick={()=>setOverride(name,false)}>Deny</button></div></div>})}</div>
    </div>
    <div className="panel compact">
      <PanelTitle icon={<KeyRound/>} title="Add entitlement"/>
      <p className="muted">Create an account-level right without changing the base plan.</p>
      <input className="field" value={feature} onChange={e=>setFeature(e.target.value)} placeholder="e.g. beta_reporting"/>
      <button className="primary full" disabled={!feature.trim()} onClick={()=>{setOverride(feature.trim().toLowerCase().replaceAll(' ','_'),true);setFeature('')}}>Grant entitlement</button>
    </div>
  </section>;
}

function CustomerSelector({store,value,onChange}:{store:Store;value:string;onChange:(v:string)=>void}){
  return <label className="select-label">Customer<select value={value} onChange={e=>onChange(e.target.value)}>{store.customers.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>;
}

function AccessLab({store,commit,selected,setSelectedCustomerId}:{store:Store;commit:(s:Store,m?:string)=>void;selected:Customer;setSelectedCustomerId:(s:string)=>void}){
  const [feature,setFeature]=useState('automation'); const [units,setUnits]=useState(1); const [result,setResult]=useState<{allow:boolean;reason:string;id:string}|null>(null);
  function run(e:FormEvent){e.preventDefault();const {decision,event}=recordAccessCheck(store,selected.id,feature,units);const next=structuredClone(store);next.audit.unshift(event);commit(next,decision.allow?'Access allowed':'Access denied');setResult({...decision,id:event.id})}
  return <div className="access-layout"><form className="panel access-form" onSubmit={run}>
    <div className="lab-badge"><Zap size={15}/> LOCAL POLICY SIMULATOR</div><h2>Can this customer perform this action?</h2><p>APEX evaluates account status, inherited plan rights, customer overrides and quota state in one deterministic decision.</p>
    <CustomerSelector store={store} value={selected.id} onChange={v=>{setSelectedCustomerId(v);setResult(null)}}/>
    <label className="select-label">Feature / action<input className="field" value={feature} onChange={e=>{setFeature(e.target.value);setResult(null)}} placeholder="automation"/></label>
    <label className="select-label">Requested units<input className="field" type="number" min={1} value={units} onChange={e=>{setUnits(Number(e.target.value));setResult(null)}}/></label>
    <button className="primary full big"><ShieldCheck size={17}/> Evaluate access</button>
  </form>
  <div className={`decision-card ${result?result.allow?'allowed':'denied':''}`}>
    {!result?<><div className="decision-icon neutral"><LockKeyhole/></div><span>Waiting for request</span><h3>Policy decision will appear here.</h3><p>Checks do not reserve capacity or execute work. Every decision is written to the audit trail.</p></>:<><div className={`decision-icon ${result.allow?'allowed':'denied'}`}>{result.allow?<CheckCircle2/>:<XCircle/>}</div><span>{result.allow?'ACCESS ALLOWED':'ACCESS DENIED'}</span><h3>{result.reason}</h3><div className="decision-meta"><div><span>Customer</span><strong>{selected.name}</strong></div><div><span>Feature</span><strong>{feature}</strong></div><div><span>Decision ID</span><strong>{result.id}</strong></div></div></>}
  </div></div>;
}

function Usage({store,commit}:{store:Store;commit:(s:Store,m?:string)=>void}){
  function add(c:Customer, amount:number){const next=structuredClone(store);const t=next.customers.find(x=>x.id===c.id)!;t.apiCallsUsed+=amount;next.audit.unshift({id:uid('evt'),at:new Date().toISOString(),actor:'metering-api',action:'usage.record',target:c.name,result:'info',detail:`+${amount.toLocaleString()} API calls`});commit(next,`Recorded ${amount.toLocaleString()} calls for ${c.name}`)}
  return <div className="panel"><PanelTitle icon={<CircleGauge/>} title="Current billing period"/><div className="usage-cards">{store.customers.map(c=>{const p=findPlan(store,c);const pct=utilization(c.apiCallsUsed,p.apiCalls);return <div className="usage-card" key={c.id}><div className="usage-card-top"><div><strong>{c.name}</strong><span>{p.name} plan</span></div><b className={pct>85?'danger-text':''}>{pct}%</b></div><div className="bar large"><span style={{width:`${pct}%`}} className={pct>85?'warn':''}/></div><div className="usage-numbers"><span>{c.apiCallsUsed.toLocaleString()} consumed</span><span>{p.apiCalls.toLocaleString()} limit</span></div><div className="row-actions"><button className="small-btn" onClick={()=>add(c,1000)}>+ 1K calls</button><button className="small-btn" onClick={()=>add(c,10000)}>+ 10K calls</button></div></div>})}</div></div>;
}

function Billing({store,commit}:{store:Store;commit:(s:Store,m?:string)=>void}){
  const [customerId,setCustomerId]=useState(store.customers[0].id);
  function simulate(type:'invoice.paid'|'invoice.payment_failed') {const next=structuredClone(store);const c=next.customers.find(x=>x.id===customerId)!;const p=findPlan(next,c);next.billing.unshift({id:uid('bill'),at:new Date().toISOString(),customerId:c.id,type,amount:p.price});if(type==='invoice.payment_failed' && c.status==='active')c.status='grace_period';else if(type==='invoice.paid' && c.status==='grace_period')c.status='active';next.audit.unshift({id:uid('evt'),at:new Date().toISOString(),actor:'stripe-webhook',action:type,target:c.name,result:'info',detail:type==='invoice.payment_failed'?'Failed invoice recorded → grace period for active accounts; suspended accounts stay suspended':`Payment recorded: ${money(p.price)}. Grace period cleared; manual suspension preserved.`});commit(next,type==='invoice.payment_failed'?'Payment failure recorded. Grace policy applied.':'Payment recorded. Manual suspension preserved.')}
  return <section className="two-col"><div className="panel"><PanelTitle icon={<CreditCard/>} title="Webhook simulator"/><p className="muted">Demonstrate how a billing event changes commercial state without touching application code.</p><CustomerSelector store={store} value={customerId} onChange={setCustomerId}/><div className="button-stack"><button className="success-btn" onClick={()=>simulate('invoice.paid')}><CheckCircle2/> Simulate invoice.paid</button><button className="danger-btn" onClick={()=>simulate('invoice.payment_failed')}><XCircle/> Simulate invoice.payment_failed</button></div></div><div className="panel"><PanelTitle icon={<Activity/>} title="Recent billing events"/><div className="activity-list">{store.billing.map(b=>{const c=store.customers.find(x=>x.id===b.customerId);return <div className="activity-row" key={b.id}><ResultDot result={b.type==='invoice.payment_failed'?'deny':'allow'}/><div><strong>{b.type}</strong><span>{c?.name}</span></div><div className="activity-detail"><span>{b.amount?money(b.amount):'—'}</span><time>{niceDate(b.at)}</time></div></div>})}</div></div></section>;
}

function Audit({store}:{store:Store}){
  const [query,setQuery]=useState('');const rows=useMemo(()=>store.audit.filter(e=>`${e.actor} ${e.action} ${e.target} ${e.detail}`.toLowerCase().includes(query.toLowerCase())),[store.audit,query]);
  return <div className="panel"><div className="table-toolbar"><div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search actions, customers, actors..."/></div><span>{rows.length} events</span></div><div className="audit-list">{rows.map(e=><div className="audit-row" key={e.id}><ResultDot result={e.result}/><time>{niceDate(e.at)}</time><div><strong>{e.action}</strong><span>{e.actor}</span></div><div><strong>{e.target}</strong><span>{e.detail}</span></div><code>{e.id}</code></div>)}</div></div>;
}

function Developer() {
  const [tab, setTab] = useState<'check' | 'reserve' | 'verify'>('reserve');
  const [copied, setCopied] = useState(false);
  const snippets = {
    check: `// Proposed server-side SDK contract
const decision = await apex.access.check({
  organizationId: session.organizationId,
  principal: { type: "user", id: session.userId },
  action: "reports.view"
});

// Resource authorization is checked separately.
if (decision.outcome !== "allow") return deny();`,
    reserve: `// Proposed API — package is not published
const operation = await apex.operations.authorize({
  operationId: job.id,
  organizationId: job.organizationId,
  action: "documents.analyze",
  reserve: { unit: "processing_credit", quantity: 20 }
}, { idempotencyKey: job.id });

// Only execute after capacity is reserved.
// Settle once, using a durable execution receipt.
// A timeout must not release uncertain spending.`,
    verify: `POST /v1/observations/batch

{
  "organizationId": "org_acme",
  "operationId": "op_492",
  "action": "documents.analyze",
  "observedDecision": "allow",
  "execution": "completed",
  "settledCredits": 20
}

// Compare approved terms to observed behavior.
// Inspect mismatches in the findings queue.`
  };
  return <section className="developer-layout"><div className="panel docs"><div className="lab-badge"><Code2 size={15}/> PROPOSED DEVELOPER CONTRACTS</div><h2>Observe first. Enforce with evidence.</h2><p>Read-only access checks and transactional capacity authorization are different operations. These examples describe the intended hosted API; the current app is a local sandbox.</p><div className="doc-tabs">{(['check', 'reserve', 'verify'] as const).map(t => <button key={t} className={tab === t ? 'active' : ''} onClick={() => { setTab(t); setCopied(false); }}>{t === 'check' ? 'Access check' : t === 'reserve' ? 'Reserve & settle' : 'Evidence import'}</button>)}</div><pre><code>{snippets[tab]}</code></pre><button className="secondary" style={{margin:'14px 18px 0'}} onClick={async () => { try { await navigator.clipboard.writeText(snippets[tab]); setCopied(true); } catch { setCopied(false); } }}>{copied ? 'Copied' : 'Copy example'}</button></div><div className="panel compact"><PanelTitle icon={<Database/>} title="Proposed endpoints"/>{['/v1/access/check','/v1/operations/authorize','/v1/operations/:id/settle','/v1/observations/batch','/v1/simulations'].map(path => <div className="endpoint" key={path}><b>POST</b><code>{path}</code></div>)}<div className="api-key"><span>Integration status</span><code>No live API key · examples only</code><p className="muted">No hosted API or production SDK is connected. Local reservations demonstrate semantics, not distributed enforcement guarantees.</p></div></div></section>;
}

function humanize(v:string){return v.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}

export default App;
