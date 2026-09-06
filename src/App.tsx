import { FormEvent, useMemo, useState } from 'react';
import {
  Activity,
  BadgeDollarSign,
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

const pages = [
  ['Overview', LayoutDashboard],
  ['Customers', Users],
  ['Products & Plans', Blocks],
  ['Entitlements', PackageCheck],
  ['Access Lab', LockKeyhole],
  ['Usage', Gauge],
  ['Billing Sync', CreditCard],
  ['AI Controls', Bot],
  ['Audit Log', FileClock],
  ['Developer', Code2],
] as const;

type Page = (typeof pages)[number][0];

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const niceDate = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function App() {
  const [store, setStore] = useState<Store>(() => loadStore());
  const [page, setPage] = useState<Page>('Overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(store.customers[0].id);
  const [toast, setToast] = useState('');

  const selectedCustomer = store.customers.find((c) => c.id === selectedCustomerId) ?? store.customers[0];

  function commit(next: Store, message?: string) {
    setStore(next);
    saveStore(next);
    if (message) {
      setToast(message);
      window.setTimeout(() => setToast(''), 2600);
    }
  }

  function navigate(next: Page) {
    setPage(next);
    setMobileOpen(false);
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="brand-block">
          <div className="brand-mark"><span>A</span></div>
          <div>
            <div className="brand">APEX</div>
            <div className="brand-sub">Commercial Control Plane</div>
          </div>
          <button className="mobile-close" onClick={() => setMobileOpen(false)}><X size={18}/></button>
        </div>

        <div className="env-pill"><span className="pulse-dot"/> Sandbox environment</div>

        <nav>
          {pages.map(([label, Icon]) => (
            <button key={label} className={`nav-item ${page === label ? 'active' : ''}`} onClick={() => navigate(label)}>
              <Icon size={18}/><span>{label}</span>
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
            <button className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={20}/></button>
            <div>
              <h1>{page}</h1>
              <p>{subtitle(page)}</p>
            </div>
          </div>
          <div className="top-actions">
            <div className="health"><CheckCircle2 size={15}/> All systems operational</div>
            <button className="icon-btn" title="Reset demo" onClick={() => {
              const next = resetStore();
              setSelectedCustomerId(next.customers[0].id);
              setStore(next);
              setToast('Sandbox reset to seed data');
            }}><RefreshCcw size={17}/></button>
            <button className="primary" onClick={() => navigate('Access Lab')}><Zap size={16}/> Run access check</button>
          </div>
        </header>

        <div className="content">
          {page === 'Overview' && <Overview store={store} onNavigate={navigate}/>} 
          {page === 'Customers' && <Customers store={store} commit={commit} selectedCustomerId={selectedCustomerId} setSelectedCustomerId={setSelectedCustomerId} onNavigate={navigate}/>} 
          {page === 'Products & Plans' && <Plans store={store}/>} 
          {page === 'Entitlements' && <Entitlements store={store} commit={commit} selected={selectedCustomer} setSelectedCustomerId={setSelectedCustomerId}/>} 
          {page === 'Access Lab' && <AccessLab store={store} commit={commit} selected={selectedCustomer} setSelectedCustomerId={setSelectedCustomerId}/>} 
          {page === 'Usage' && <Usage store={store} commit={commit}/>} 
          {page === 'Billing Sync' && <Billing store={store} commit={commit}/>} 
          {page === 'AI Controls' && <AIControls store={store}/>} 
          {page === 'Audit Log' && <Audit store={store}/>} 
          {page === 'Developer' && <Developer/>}
        </div>
      </main>
      {toast && <div className="toast"><CheckCircle2 size={17}/>{toast}</div>}
    </div>
  );
}

function subtitle(page: Page) {
  const map: Record<Page, string> = {
    'Overview': 'Revenue, access, and usage — one operational view.',
    'Customers': 'Commercial state for every account.',
    'Products & Plans': 'Define what customers buy and what each plan unlocks.',
    'Entitlements': 'Translate commercial terms into enforceable product rights.',
    'Access Lab': 'Test a live policy decision against your current control state.',
    'Usage': 'Meter consumption before it becomes revenue leakage.',
    'Billing Sync': 'Keep billing state and product access synchronized.',
    'AI Controls': 'Govern autonomous agents with identity, budgets, and permissions.',
    'Audit Log': 'Every commercial and access decision, recorded.',
    'Developer': 'Integrate once. Enforce everywhere.',
  };
  return map[page];
}

function Overview({ store, onNavigate }: { store: Store; onNavigate: (p: Page) => void }) {
  const active = store.customers.filter((c) => c.status === 'active').length;
  const mrr = store.customers.filter((c) => c.status === 'active').reduce((sum, c) => sum + findPlan(store, c).price, 0);
  const allowed = store.audit.filter((e) => e.result === 'allow').length;
  const denied = store.audit.filter((e) => e.result === 'deny').length;
  const decisionRate = allowed + denied ? Math.round((allowed / (allowed + denied)) * 1000) / 10 : 100;

  return <>
    <section className="hero-strip">
      <div>
        <div className="eyebrow">COMMERCIAL CONTROL PLANE</div>
        <h2>Know exactly who can use what — and why.</h2>
        <p>APEX turns billing events, plans, entitlements, usage and policy into one enforceable source of commercial truth.</p>
        <div className="hero-actions"><button className="primary" onClick={() => onNavigate('Access Lab')}>Test the policy engine <ChevronRight size={16}/></button><button className="secondary" onClick={() => onNavigate('Developer')}>View API contract</button></div>
      </div>
      <div className="control-loop">
        <div><CreditCard/><span>Billing</span></div><ChevronRight/>
        <div><PackageCheck/><span>Entitlements</span></div><ChevronRight/>
        <div><ShieldCheck/><span>Enforcement</span></div><ChevronRight/>
        <div><Activity/><span>Usage</span></div>
      </div>
    </section>

    <section className="metric-grid">
      <Metric title="Monthly recurring revenue" value={money(mrr)} note="Sandbox subscriptions" icon={<BadgeDollarSign/>}/>
      <Metric title="Active customers" value={String(active)} note={`${store.customers.length - active} account suspended`} icon={<Users/>}/>
      <Metric title="Access allow rate" value={`${decisionRate}%`} note="Across recorded checks" icon={<ShieldCheck/>}/>
      <Metric title="Metered API usage" value={store.customers.reduce((s,c)=>s+c.apiCallsUsed,0).toLocaleString()} note="Current billing period" icon={<CircleGauge/>}/>
    </section>

    <section className="two-col">
      <div className="panel">
        <PanelTitle icon={<Activity/>} title="Live control activity" action="Open audit" onAction={() => onNavigate('Audit Log')}/>
        <div className="activity-list">
          {store.audit.slice(0,5).map((e) => <div className="activity-row" key={e.id}>
            <ResultDot result={e.result}/><div><strong>{e.action}</strong><span>{e.target}</span></div><div className="activity-detail"><span>{e.detail}</span><time>{niceDate(e.at)}</time></div>
          </div>)}
        </div>
      </div>
      <div className="panel">
        <PanelTitle icon={<Gauge/>} title="Usage pressure" action="View usage" onAction={() => onNavigate('Usage')}/>
        <div className="usage-stack">
          {store.customers.map((c) => {
            const p = findPlan(store,c); const pct=utilization(c.apiCallsUsed,p.apiCalls);
            return <div key={c.id} className="usage-line"><div><strong>{c.name}</strong><span>{c.apiCallsUsed.toLocaleString()} / {p.apiCalls.toLocaleString()} calls</span></div><div className="bar"><span style={{width:`${pct}%`}} className={pct>85?'warn':''}/></div><b>{pct}%</b></div>
          })}
        </div>
      </div>
    </section>
  </>;
}

function Metric({title,value,note,icon}:{title:string;value:string;note:string;icon:React.ReactNode}) {
  return <div className="metric-card"><div className="metric-icon">{icon}</div><span>{title}</span><strong>{value}</strong><small>{note}</small></div>;
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
    const next=structuredClone(store); const target=next.customers.find(x=>x.id===c.id)!; target.status=target.status==='active'?'suspended':'active';
    next.audit.unshift({id:uid('evt'),at:new Date().toISOString(),actor:'admin@apex.demo',action:target.status==='active'?'customer.resume':'customer.suspend',target:target.name,result:'info',detail:`Customer set to ${target.status}`});
    commit(next,`${target.name} is now ${target.status}`);
  }
  return <div className="panel">
    <div className="table-toolbar"><div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search customers..."/></div><span>{rows.length} accounts</span></div>
    <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Plan</th><th>Status</th><th>Seats</th><th>API usage</th><th></th></tr></thead><tbody>
      {rows.map(c=>{const p=findPlan(store,c);return <tr key={c.id} className={selectedCustomerId===c.id?'selected-row':''} onClick={()=>setSelectedCustomerId(c.id)}>
        <td><div className="customer-cell"><div className="company-icon">{c.name.slice(0,2).toUpperCase()}</div><div><strong>{c.name}</strong><span>{c.email}</span></div></div></td>
        <td><span className="plan-badge">{p.name}</span></td><td><span className={`status ${c.status}`}>{c.status}</span></td><td>{c.seatsUsed} / {p.seats}</td><td>{utilization(c.apiCallsUsed,p.apiCalls)}%</td>
        <td><div className="row-actions"><button className="small-btn" onClick={e=>{e.stopPropagation();setSelectedCustomerId(c.id);onNavigate('Entitlements')}}>Manage</button><button className="small-btn" onClick={e=>{e.stopPropagation();toggle(c)}}>{c.status==='active'?'Suspend':'Resume'}</button></div></td>
      </tr>})}
    </tbody></table></div>
  </div>;
}

function Plans({store}:{store:Store}) {
  return <div className="plan-grid">{store.plans.map((p,i)=><div className={`plan-card ${i===1?'featured':''}`} key={p.id}>
    {i===1&&<div className="recommended">Most deployed</div>}
    <div className="plan-top"><div><span>PLAN</span><h3>{p.name}</h3></div><div className="price">{money(p.price)}<small>/mo</small></div></div>
    <p>{p.seats} seats · {p.apiCalls.toLocaleString()} API calls / period</p>
    <div className="feature-list">{p.features.map(f=><div key={f}><CheckCircle2 size={16}/><span>{humanize(f)}</span></div>)}</div>
    <button className="secondary full">Edit plan definition</button>
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
  const [feature,setFeature]=useState('automation'); const [units,setUnits]=useState(1); const [result,setResult]=useState<{allow:boolean;reason:string}|null>(null);
  function run(e:FormEvent){e.preventDefault();const {decision,event}=recordAccessCheck(store,selected.id,feature,units);const next=structuredClone(store);next.audit.unshift(event);commit(next,decision.allow?'Access allowed':'Access denied');setResult(decision)}
  return <div className="access-layout"><form className="panel access-form" onSubmit={run}>
    <div className="lab-badge"><Zap size={15}/> LIVE POLICY SIMULATOR</div><h2>Can this customer perform this action?</h2><p>APEX evaluates account status, inherited plan rights, customer overrides and quota state in one deterministic decision.</p>
    <CustomerSelector store={store} value={selected.id} onChange={v=>{setSelectedCustomerId(v);setResult(null)}}/>
    <label className="select-label">Feature / action<input className="field" value={feature} onChange={e=>setFeature(e.target.value)} placeholder="automation"/></label>
    <label className="select-label">Requested units<input className="field" type="number" min={1} value={units} onChange={e=>setUnits(Number(e.target.value))}/></label>
    <button className="primary full big"><ShieldCheck size={17}/> Evaluate access</button>
  </form>
  <div className={`decision-card ${result?result.allow?'allowed':'denied':''}`}>
    {!result?<><div className="decision-icon neutral"><LockKeyhole/></div><span>Waiting for request</span><h3>Policy decision will appear here.</h3><p>No data is changed by a check. Every decision is written to the audit trail.</p></>:<><div className={`decision-icon ${result.allow?'allowed':'denied'}`}>{result.allow?<CheckCircle2/>:<XCircle/>}</div><span>{result.allow?'ACCESS ALLOWED':'ACCESS DENIED'}</span><h3>{result.reason}</h3><div className="decision-meta"><div><span>Customer</span><strong>{selected.name}</strong></div><div><span>Feature</span><strong>{feature}</strong></div><div><span>Decision ID</span><strong>{uid('dec')}</strong></div></div></>}
  </div></div>;
}

function Usage({store,commit}:{store:Store;commit:(s:Store,m?:string)=>void}){
  function add(c:Customer, amount:number){const next=structuredClone(store);const t=next.customers.find(x=>x.id===c.id)!;t.apiCallsUsed+=amount;next.audit.unshift({id:uid('evt'),at:new Date().toISOString(),actor:'metering-api',action:'usage.record',target:c.name,result:'info',detail:`+${amount.toLocaleString()} API calls`});commit(next,`Recorded ${amount.toLocaleString()} calls for ${c.name}`)}
  return <div className="panel"><PanelTitle icon={<CircleGauge/>} title="Current billing period"/><div className="usage-cards">{store.customers.map(c=>{const p=findPlan(store,c);const pct=utilization(c.apiCallsUsed,p.apiCalls);return <div className="usage-card" key={c.id}><div className="usage-card-top"><div><strong>{c.name}</strong><span>{p.name} plan</span></div><b className={pct>85?'danger-text':''}>{pct}%</b></div><div className="bar large"><span style={{width:`${pct}%`}} className={pct>85?'warn':''}/></div><div className="usage-numbers"><span>{c.apiCallsUsed.toLocaleString()} consumed</span><span>{p.apiCalls.toLocaleString()} limit</span></div><div className="row-actions"><button className="small-btn" onClick={()=>add(c,1000)}>+ 1K calls</button><button className="small-btn" onClick={()=>add(c,10000)}>+ 10K calls</button></div></div>})}</div></div>;
}

function Billing({store,commit}:{store:Store;commit:(s:Store,m?:string)=>void}){
  const [customerId,setCustomerId]=useState(store.customers[0].id);
  function simulate(type:'invoice.paid'|'invoice.failed') {const next=structuredClone(store);const c=next.customers.find(x=>x.id===customerId)!;const p=findPlan(next,c);next.billing.unshift({id:uid('bill'),at:new Date().toISOString(),customerId:c.id,type,amount:p.price});if(type==='invoice.failed')c.status='suspended';else c.status='active';next.audit.unshift({id:uid('evt'),at:new Date().toISOString(),actor:'stripe-webhook',action:type,target:c.name,result:'info',detail:type==='invoice.failed'?'Invoice failed → access suspended':`Invoice paid → ${money(p.price)} access active`});commit(next,type==='invoice.failed'?'Failed payment suspended access':'Payment synced and access active')}
  return <section className="two-col"><div className="panel"><PanelTitle icon={<CreditCard/>} title="Webhook simulator"/><p className="muted">Demonstrate how a billing event changes commercial state without touching application code.</p><CustomerSelector store={store} value={customerId} onChange={setCustomerId}/><div className="button-stack"><button className="success-btn" onClick={()=>simulate('invoice.paid')}><CheckCircle2/> Simulate invoice.paid</button><button className="danger-btn" onClick={()=>simulate('invoice.failed')}><XCircle/> Simulate invoice.failed</button></div></div><div className="panel"><PanelTitle icon={<Activity/>} title="Recent billing events"/><div className="activity-list">{store.billing.map(b=>{const c=store.customers.find(x=>x.id===b.customerId);return <div className="activity-row" key={b.id}><ResultDot result={b.type==='invoice.failed'?'deny':'allow'}/><div><strong>{b.type}</strong><span>{c?.name}</span></div><div className="activity-detail"><span>{b.amount?money(b.amount):'—'}</span><time>{niceDate(b.at)}</time></div></div>})}</div></div></section>;
}

function AIControls({store}:{store:Store}){
  const enterprise=store.customers.find(c=>c.planId==='enterprise');
  return <><section className="hero-strip ai-hero"><div><div className="eyebrow">EXPANSION SURFACE</div><h2>Commercial policy for autonomous agents.</h2><p>The same control plane can identify an agent, restrict delegated actions, enforce spend ceilings, meter model/API consumption and preserve a human-readable audit trail.</p></div><div className="agent-orb"><Bot/><span>agent://finance-copilot</span><b>Trusted · Scoped</b></div></section><section className="metric-grid ai-grid"><Metric title="Registered agents" value="12" note="Across sandbox tenants" icon={<Bot/>}/><Metric title="Monthly spend ceiling" value="$8,500" note="Aggregate delegated budget" icon={<BadgeDollarSign/>}/><Metric title="Blocked actions" value="7" note="Policy prevented execution" icon={<ShieldCheck/>}/><Metric title="Audited tool calls" value="18.4K" note="Current period" icon={<Activity/>}/></section><div className="panel"><PanelTitle icon={<SlidersHorizontal/>} title="Agent policy example"/><div className="policy-grid"><Policy label="Principal" value={enterprise?.name ?? 'Orbit Analytics'}/><Policy label="Agent identity" value="finance-copilot-v2"/><Policy label="Allowed tools" value="invoices.read, reports.generate"/><Policy label="Denied tools" value="payouts.create"/><Policy label="Per-action spend" value="$250"/><Policy label="Monthly budget" value="$2,500"/></div></div></>;
}
function Policy({label,value}:{label:string;value:string}){return <div className="policy"><span>{label}</span><strong>{value}</strong></div>}

function Audit({store}:{store:Store}){
  const [query,setQuery]=useState('');const rows=useMemo(()=>store.audit.filter(e=>`${e.actor} ${e.action} ${e.target} ${e.detail}`.toLowerCase().includes(query.toLowerCase())),[store.audit,query]);
  return <div className="panel"><div className="table-toolbar"><div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search actions, customers, actors..."/></div><span>{rows.length} events</span></div><div className="audit-list">{rows.map(e=><div className="audit-row" key={e.id}><ResultDot result={e.result}/><time>{niceDate(e.at)}</time><div><strong>{e.action}</strong><span>{e.actor}</span></div><div><strong>{e.target}</strong><span>{e.detail}</span></div><code>{e.id}</code></div>)}</div></div>;
}

function Developer(){const [tab,setTab]=useState<'check'|'meter'|'webhook'>('check');const snippets={check:`const decision = await apex.access.check({\n  customer: "cus_northstar",\n  feature: "automation",\n  context: { requested_units: 1 }\n});\n\nif (!decision.allow) {\n  throw new Error(decision.reason);\n}`,meter:`await apex.usage.record({\n  customer: "cus_northstar",\n  meter: "api_calls",\n  quantity: 125,\n  idempotency_key: requestId\n});`,webhook:`POST /v1/billing/webhooks/stripe\n\ninvoice.paid\nsubscription.updated\ninvoice.payment_failed\ncustomer.subscription.deleted`};return <section className="developer-layout"><div className="panel docs"><div className="lab-badge"><Code2 size={15}/> DEVELOPER API</div><h2>One decision endpoint between revenue and product access.</h2><p>Keep commercial logic outside your product code. Your app asks APEX for a deterministic decision and continues.</p><div className="doc-tabs"><button className={tab==='check'?'active':''} onClick={()=>setTab('check')}>Access check</button><button className={tab==='meter'?'active':''} onClick={()=>setTab('meter')}>Usage meter</button><button className={tab==='webhook'?'active':''} onClick={()=>setTab('webhook')}>Billing webhook</button></div><pre><code>{snippets[tab]}</code></pre></div><div className="panel compact"><PanelTitle icon={<Database/>} title="API contract"/><div className="endpoint"><b>POST</b><code>/v1/access/check</code></div><div className="endpoint"><b>POST</b><code>/v1/usage/events</code></div><div className="endpoint"><b>GET</b><code>/v1/customers/:id/entitlements</code></div><div className="endpoint"><b>POST</b><code>/v1/billing/webhooks/stripe</code></div><div className="api-key"><span>Sandbox API key</span><code>apx_test_••••••••••8f2c</code><button>Reveal</button></div></div></section>}

function humanize(v:string){return v.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}

export default App;
