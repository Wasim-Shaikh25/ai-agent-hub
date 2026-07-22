import type { FastifyInstance } from 'fastify';

/** Serves the platform super-admin console at /superadmin (cross-org control). */
export async function registerSuperadminUiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/superadmin', async (_req, reply) => reply.type('text/html').send(SUPERADMIN_HTML));
}

const SUPERADMIN_HTML = /* html */ `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Platform · AI Agent Hub</title>
<style>
:root{--bg:#0a0e1a;--panel:#111a2e;--panel2:#0d1526;--line:#1c2740;--ink:#eaf0fb;--muted:#8ea0c0;--cyan:#3ee0d0;--violet:#8b93f8;--good:#54d98c;--bad:#f4707f;--amber:#f5b53d}
@media(prefers-color-scheme:light){:root{--bg:#f4f7fc;--panel:#fff;--panel2:#f7f9fd;--line:#e3e9f4;--ink:#111a2e;--muted:#4d5c78;--cyan:#0d9488;--violet:#5b63c4;--good:#137a4b;--bad:#c02a3b;--amber:#b7791f}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.mono{font-family:ui-monospace,Menlo,Consolas,monospace}
.app{display:grid;grid-template-columns:220px 1fr;min-height:100vh}
aside{background:var(--panel2);border-right:1px solid var(--line);padding:18px 12px}
.brand{display:flex;align-items:center;gap:9px;font-weight:750;padding:0 8px 16px;letter-spacing:-.02em}
.mark{width:26px;height:26px;border-radius:7px;background:conic-gradient(from 210deg,var(--violet),var(--cyan),var(--violet));display:grid;place-items:center;color:#04060c;font-weight:900}
.nav a{display:block;padding:9px 10px;border-radius:8px;color:var(--muted);cursor:pointer;font-weight:600;font-size:13.5px}
.nav a.on{background:var(--panel);color:var(--ink)}
.nav a:hover{color:var(--ink)}
main{padding:26px 30px;max-width:1000px}
h1{font-size:20px;margin:0 0 4px;letter-spacing:-.02em}.muted{color:var(--muted)}.sub{color:var(--muted);font-size:13px;margin:0 0 18px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:16px}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.tile .n{font-size:20px;font-weight:750}.tile .l{font-size:12px;color:var(--muted)}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px 8px;border-bottom:1px solid var(--line);font-size:13px;vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:12px}
input,textarea,select{width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font:inherit}
textarea{font-family:ui-monospace,monospace;font-size:12.5px;min-height:56px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:end}.row>div{flex:1;min-width:120px}
label{display:block;font-size:12px;color:var(--muted);margin:0 0 4px}
button{padding:8px 14px;border-radius:8px;border:0;background:var(--cyan);color:#04120f;font-weight:700;cursor:pointer;font-size:13px}
button.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
button.danger{background:transparent;color:var(--bad);border:1px solid var(--line)}
.pill{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:color-mix(in oklab,var(--cyan) 16%,transparent);color:var(--cyan)}
.pill.bad{background:color-mix(in oklab,var(--bad) 16%,transparent);color:var(--bad)}
.right{text-align:right}.msg{font-size:13px;margin-top:8px;min-height:16px}.err{color:var(--bad)}.ok{color:var(--good)}
.locked{color:var(--amber);font-size:13px}
h2{font-size:15px;margin:0 0 12px}
a.top{color:var(--cyan);text-decoration:none;font-size:13px}
.hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.chat{display:flex;flex-direction:column;gap:10px;max-height:52vh;overflow:auto;margin-bottom:12px}
.bub{padding:10px 12px;border-radius:12px;max-width:82%;white-space:pre-wrap;font-size:13px}
.bub.u{align-self:flex-end;background:color-mix(in oklab,var(--violet) 22%,transparent)}
.bub.a{align-self:flex-start;background:var(--panel2);border:1px solid var(--line)}
.tag{font-size:11px;color:var(--muted);margin-top:3px}
</style></head><body>
<div class="app">
  <aside>
    <div class="brand"><span class="mark">▲</span> Platform</div>
    <div class="nav" id="nav"></div>
    <div style="margin-top:20px;padding:0 8px"><a class="top" href="/admin">Org admin →</a><br/><a class="top" href="/dashboard">Cost dashboard →</a><br/><a class="top" id="logout">Log out</a></div>
  </aside>
  <main id="main"></main>
</div>
<script>
const T=localStorage.getItem('hub_token');
if(!T)location.href='/login';
const H={Authorization:'Bearer '+T};
const HJ={...H,'Content-Type':'application/json'};
document.getElementById('logout').onclick=()=>{localStorage.clear();location.href='/login'};
const api=async(p,o={})=>{const r=await fetch(p,{headers:o.body?HJ:H,...o});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error((d.error&&d.error.message)||('HTTP '+r.status));return d};
const el=(h)=>{const d=document.createElement('div');d.innerHTML=h;return d};
const esc=(s)=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

const TABS=[['overview','Overview'],['orgs','Organizations'],['training','Training data'],['assistant','Copilot']];
const nav=document.getElementById('nav');
TABS.forEach(([id,label])=>{const a=el('<a data-t="'+id+'">'+label+'</a>').firstChild;a.onclick=()=>show(id);nav.appendChild(a)});
function show(id){[...nav.children].forEach(a=>a.classList.toggle('on',a.dataset.t===id));(VIEWS[id]||(()=>{}))();location.hash=id}
const M=document.getElementById('main');
async function guard(fn){try{await fn()}catch(e){M.innerHTML='<div class="card locked">Platform admin required — '+esc(e.message)+'</div>'}}

const VIEWS={
 overview(){guard(async()=>{
   const s=await api('/api/platform/stats');
   const plans=Object.entries(s.byPlan||{}).map(([p,n])=>p+' '+n).join(' · ')||'—';
   const kinds=(s.training.byKind||[]).map(k=>k.kind+' '+k.n).join(' · ')||'none yet';
   M.innerHTML='<h1>Platform overview</h1><p class="sub">Everything across every workspace.</p>'+
   '<div class="card"><div class="tiles">'+
   tile(s.orgs,'organizations')+tile(s.suspended,'suspended')+tile((s.monthTokens||0).toLocaleString(),'tokens/mo')+tile('$'+Number(s.monthUsd||0).toFixed(2),'cost/mo')+
   '</div></div>'+
   '<div class="card"><h2>Plans</h2><p class="muted">'+esc(plans)+'</p></div>'+
   '<div class="card"><h2>Training samples</h2><p class="muted">'+s.training.total+' total · '+esc(kinds)+'</p></div>';
 })},
 orgs(){guard(async()=>{
   const os=await api('/api/platform/orgs');
   M.innerHTML='<div class="hdr"><h1>Organizations</h1></div><div class="card"><table><tr><th>Name</th><th>Plan</th><th>Seats</th><th>Tokens/mo</th><th>State</th><th></th></tr>'+
   os.map(o=>'<tr><td>'+esc(o.name)+'<div class="muted mono">'+esc(o.slug)+'</div></td>'+
   '<td><select id="p_'+o.id+'">'+['free','team','enterprise'].map(p=>'<option '+(o.plan===p?'selected':'')+'>'+p+'</option>').join('')+'</select></td>'+
   '<td>'+o.seats+'</td><td>'+Number(o.month_tokens||0).toLocaleString()+'</td>'+
   '<td>'+(o.suspended?'<span class="pill bad">suspended</span>':'<span class="pill">active</span>')+'</td>'+
   '<td class="right"><button class="ghost" onclick="savePlan(\\''+o.id+'\\')">Save plan</button> '+
   '<button class="'+(o.suspended?'ghost':'danger')+'" onclick="toggleSuspend(\\''+o.id+'\\','+(o.suspended?'false':'true')+')">'+(o.suspended?'Resume':'Suspend')+'</button></td></tr>').join('')+
   '</table><div class="msg" id="om"></div></div>';
 })},
 training(){guard(async()=>{
   const d=await api('/api/platform/training?limit=60');
   const kinds=(d.stats.byKind||[]).map(k=>k.kind+' '+k.n).join(' · ')||'none';
   M.innerHTML='<div class="hdr"><h1>Training data</h1><a class="top" href="/api/platform/training?limit=500" target="_blank">Export JSON →</a></div>'+
   '<div class="card"><p class="muted">'+d.stats.total+' samples · '+esc(kinds)+'. Everything is redacted at rest. Enable capture with TRAINING_LOG=true.</p></div>'+
   '<div class="card"><table><tr><th>Kind</th><th>Input</th><th>Output</th><th>Rating</th><th>When</th></tr>'+
   (d.samples||[]).map(s=>'<tr><td><span class="pill">'+esc(s.kind)+'</span></td><td class="mono">'+esc((s.input||'').slice(0,90))+'</td><td class="mono">'+esc((s.output||'').slice(0,90))+'</td><td>'+(s.rating==null?'—':(s.rating>0?'👍':'👎'))+'</td><td class="muted">'+new Date(s.created_at).toLocaleString()+'</td></tr>').join('')+
   '</table></div>';
 })},
 assistant(){guard(async()=>{
   M.innerHTML='<div class="hdr"><h1>Operator copilot</h1></div>'+
   '<div class="card"><div class="chat" id="chat"></div>'+
   '<div class="row"><div style="flex:5"><input id="q" placeholder="Ask about orgs, plans, training, cost…" onkeydown="if(event.key===\\'Enter\\')ask()"/></div><div style="flex:0"><button onclick="ask()">Send</button></div></div>'+
   '<p class="muted" style="font-size:12px;margin-top:8px">Grounded in your live platform snapshot. Set SUMMARY_MODEL for conversational answers.</p></div>';
   bubble('a','Hi — I can read your platform stats and help with training, plans, and operations. Ask me anything.');
 })},
};
function tile(n,l){return '<div class="tile"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>'}
function bubble(who,text,tag){const c=document.getElementById('chat');const b=el('<div class="bub '+who+'">'+esc(text)+(tag?'<div class="tag">'+esc(tag)+'</div>':'')+'</div>').firstChild;c.appendChild(b);c.scrollTop=c.scrollHeight}
function msg(id,t,ok){const m=document.getElementById(id);if(m){m.className='msg '+(ok?'ok':'err');m.textContent=t}}

async function savePlan(id){try{const plan=document.getElementById('p_'+id).value;await api('/api/platform/orgs/'+id,{method:'PUT',body:JSON.stringify({plan})});msg('om','Plan updated for '+id.slice(0,8)+' → '+plan,true)}catch(e){msg('om',e.message)}}
async function toggleSuspend(id,to){try{await api('/api/platform/orgs/'+id,{method:'PUT',body:JSON.stringify({suspended:to})});VIEWS.orgs()}catch(e){msg('om',e.message)}}
async function ask(){const i=document.getElementById('q');const q=i.value.trim();if(!q)return;i.value='';bubble('u',q);try{const d=await api('/api/platform/assistant',{method:'POST',body:JSON.stringify({message:q})});bubble('a',d.reply,d.llm?'':'offline · snapshot only')}catch(e){bubble('a','Error: '+e.message)}}

show((location.hash||'#overview').slice(1));
</script></body></html>`;
