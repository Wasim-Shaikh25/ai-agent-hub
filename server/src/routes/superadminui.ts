import type { FastifyInstance } from 'fastify';
import { TOKENS, MARK, BASE } from './theme.js';
import { config } from '../config.js';

/** Serves the platform super-admin console at /superadmin (cross-org control). */
export async function registerSuperadminUiRoutes(app: FastifyInstance): Promise<void> {
  const html = SUPERADMIN_HTML.replace(
    '<!--__CONFIG__-->',
    `<script>window.ENABLE_AI_ASSISTANT=${JSON.stringify(config.enableAiAssistant)}</script>`,
  );
  app.get('/superadmin', async (_req, reply) => reply.type('text/html').send(html));
}

const SUPERADMIN_HTML = /* html */ `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Platform · AI Agent Hub</title>
<style>
${TOKENS}
${MARK}
${BASE}
body{margin:0;background:var(--bg);color:var(--ink);font-size:14.5px;line-height:1.6}
.app{display:grid;grid-template-columns:220px 1fr;min-height:100vh}
aside{background:var(--panel2);border-right:1px solid var(--line);padding:18px 12px}
.brand{display:flex;align-items:center;gap:9px;font-weight:750;padding:0 8px 16px;letter-spacing:-.02em}
.nav a{display:block;padding:9px 10px;border-radius:8px;color:var(--muted);cursor:pointer;font-weight:600;font-size:13.5px}
.nav a.on{background:var(--panel);color:var(--ink)}
.nav a:hover{color:var(--ink)}
main{padding:26px 30px;max-width:1000px}
h1{font-size:20px;margin:0 0 4px;letter-spacing:-.02em}.muted{color:var(--muted)}.sub{color:var(--muted);font-size:13px;margin:0 0 18px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:18px;margin-bottom:16px}
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
.pill.amber{background:color-mix(in oklab,var(--amber) 18%,transparent);color:var(--amber)}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{display:inline-block;font-size:12px;padding:4px 10px;border-radius:999px;border:1px solid var(--line);cursor:pointer;color:var(--muted)}
.chip.on{border-color:var(--cyan);color:var(--ink)}.chip:hover{color:var(--ink)}.chip b{color:var(--ink)}
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
</style>
<!--__CONFIG__-->
</head><body>
<div class="app">
  <aside>
    <div class="brand"><span class="mark">▲</span> Platform</div>
    <div class="nav" id="nav"></div>
    <div style="margin-top:20px;padding:0 8px"><a class="top" href="/help">Help →</a><br/><a class="top" href="/admin">Org admin →</a><br/><a class="top" href="/dashboard">Cost dashboard →</a><br/><a class="top" id="logout">Log out</a></div>
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

let TABS=[['overview','Overview'],['orgs','Organizations'],['issues','Issues'],['tickets','Tickets']];
if (window.ENABLE_AI_ASSISTANT) TABS.push(['assistant','Copilot']);
const nav=document.getElementById('nav');
TABS.forEach(([id,label])=>{const a=el('<a data-t="'+id+'">'+label+'</a>').firstChild;a.onclick=()=>show(id);nav.appendChild(a)});
function show(id){[...nav.children].forEach(a=>a.classList.toggle('on',a.dataset.t===id));(VIEWS[id]||(()=>{}))();location.hash=id}
const M=document.getElementById('main');
async function guard(fn){try{await fn()}catch(e){M.innerHTML='<div class="card locked">Platform admin required — '+esc(e.message)+'</div>'}}

const VIEWS={
 overview(){guard(async()=>{
   const s=await api('/api/platform/stats');
   const plans=Object.entries(s.byPlan||{}).map(([p,n])=>p+' '+n).join(' · ')||'—';
   const iss=s.issues||{byLevel:{},byCode:[],total:0,windowHours:24};
   const errs=(iss.byLevel||{}).error||0, warns=(iss.byLevel||{}).warn||0;
   const topCodes=(iss.byCode||[]).slice(0,5).map(c=>c.code+' '+c.n).join(' · ')||'none';
   M.innerHTML='<h1>Platform overview</h1><p class="sub">Everything across every workspace.</p>'+
   '<div class="card"><div class="tiles">'+
   tile(s.orgs,'Organizations')+tile(s.suspended,'Suspended')+tile((s.monthTokens||0).toLocaleString(),'Tokens this month')+tile('$'+Number(s.monthUsd||0).toFixed(2),'Cost this month')+
   '</div></div>'+
   '<div class="card"><h2>Plans</h2><p class="muted">'+esc(plans)+'</p></div>'+
   '<div class="card"><h2>Issues · last '+iss.windowHours+'h</h2><div class="tiles" style="grid-template-columns:repeat(3,1fr)">'+
   tile('<span style="color:var(--bad)">'+errs+'</span>','Errors')+tile('<span style="color:var(--amber)">'+warns+'</span>','Warnings')+tile(iss.total,'Total events')+
   '</div><p class="muted" style="margin-top:10px">Top: '+esc(topCodes)+'</p></div>';
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
 issues(){guard(async()=>{
   const flt=window.__issf||{};
   const qs=Object.entries(flt).filter(([,v])=>v).map(([k,v])=>k+'='+encodeURIComponent(v)).join('&');
   const [sum,list]=await Promise.all([api('/api/platform/events/summary?hours=24'),api('/api/platform/events?limit=100'+(qs?'&'+qs:''))]);
   const errs=(sum.byLevel||{}).error||0, warns=(sum.byLevel||{}).warn||0;
   const codeChips=(sum.byCode||[]).map(c=>'<a class="chip'+(flt.code===c.code?' on':'')+'" onclick="setIssueFilter(\\'code\\',\\''+esc(c.code)+'\\')">'+esc(c.code)+' <b>'+c.n+'</b></a>').join('');
   const worst=(sum.topOrgs||[]).map(o=>esc(o.name||'unknown')+' ('+o.n+')').join(' · ')||'none';
   M.innerHTML='<div class="hdr"><h1>Issues</h1><a class="top" href="/api/platform/events?limit=500" target="_blank">Export JSON →</a></div>'+
   '<div class="card"><div class="tiles" style="grid-template-columns:repeat(3,1fr)">'+
   tile('<span style="color:var(--bad)">'+errs+'</span>','Errors · 24h')+tile('<span style="color:var(--amber)">'+warns+'</span>','Warnings · 24h')+tile(sum.total,'Total · 24h')+
   '</div><p class="muted" style="margin-top:10px">Orgs with most errors: '+worst+'</p></div>'+
   '<div class="card"><h2>Filter by code</h2><div class="chips">'+(codeChips||'<span class="muted">No events yet — issues appear here as they occur.</span>')+
   (Object.keys(flt).length?' <a class="chip" onclick="clearIssueFilter()">clear ✕</a>':'')+'</div></div>'+
   '<div class="card"><table><tr><th>Level</th><th>Source</th><th>Code</th><th>Message</th><th>Org</th><th>When</th></tr>'+
   (list||[]).map(e=>'<tr><td>'+levelPill(e.level)+'</td><td>'+esc(e.source)+'</td><td class="mono">'+esc(e.code)+'</td><td>'+esc((e.message||'').slice(0,120))+'</td><td class="mono">'+esc((e.org_id||'').slice(0,8))+'</td><td class="muted">'+new Date(e.created_at).toLocaleString()+'</td></tr>').join('')+
   '</table></div>';
 })},
 tickets(){guard(async()=>{
   const qry=(window.__ticketsf||{});const qs=Object.entries(qry).filter(([,v])=>v).map(([k,v])=>k+'='+encodeURIComponent(v)).join('&');
   const list=await api('/api/platform/tickets?limit=100'+(qs?'&'+qs:''));
   const statusChips=['open','in_progress','closed'].map(s=>'<a class="chip'+(qry.status===s?' on':'')+'" onclick="setTicketFilter(\'status\',\''+s+'\')">'+esc(s)+'</a>').join('');
   M.innerHTML='<div class="hdr"><h1>Support tickets</h1><a class="top" href="/api/platform/tickets?limit=500" target="_blank">Export JSON →</a></div>'+
   '<div class="card"><h2>Filter by status</h2><div class="chips">'+statusChips+(Object.keys(qry).length?' <a class="chip" onclick="clearTicketFilter()">clear ✕</a>':'')+'</div></div>'+
   '<div class="card"><table><tr><th>Subject</th><th>Category</th><th>Status</th><th>From</th><th>Org</th><th>When</th><th></th></tr>'+
   (list||[]).map(t=>'<tr><td>'+esc(t.subject)+'<div class="muted">'+esc(t.body.slice(0,80))+'…</div></td>'+
   '<td>'+esc(t.category)+'</td>'+
   '<td>'+esc(t.status)+'</td>'+
   '<td>'+esc(t.user_email||'—')+'</td>'+
   '<td class="muted">'+esc(t.org_name||'—')+'</td>'+
   '<td class="muted">'+new Date(t.created_at).toLocaleString()+'</td>'+
   '<td class="right">'+(t.status!=='closed'?'<button class="ghost" onclick="closeTicket(\''+t.id+'\')">Close</button>':'')+'</td></tr>').join('')+
   '</table></div>';
 })},
 assistant(){guard(async()=>{
   M.innerHTML='<div class="hdr"><h1>Operator copilot</h1></div>'+
   '<div class="card"><div class="chat" id="chat"></div>'+
   '<div class="row"><div style="flex:5"><input id="q" placeholder="e.g. what is failing today? which orgs have the most errors?" onkeydown="if(event.key===\\'Enter\\')ask()"/></div><div style="flex:0"><button onclick="ask()">Send</button></div></div>'+
   '<p class="muted" style="font-size:12px;margin-top:8px">Grounded in your live platform snapshot. Set SUMMARY_MODEL for conversational answers.</p></div>';
   bubble('a','Hi — I can read your platform stats and the last 24h of issues. Ask me what is failing, which orgs are affected, or anything about plans and operations.');
 })},
};
function tile(n,l){return '<div class="tile"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>'}
function levelPill(l){const c=l==='error'?'bad':(l==='warn'?'amber':'');return '<span class="pill '+c+'">'+esc(l)+'</span>'}
function setIssueFilter(k,v){window.__issf={...(window.__issf||{}),[k]:v};VIEWS.issues()}
function clearIssueFilter(){window.__issf={};VIEWS.issues()}
function setTicketFilter(k,v){window.__ticketsf={...(window.__ticketsf||{}),[k]:v};VIEWS.tickets()}
function clearTicketFilter(){window.__ticketsf={};VIEWS.tickets()}
async function closeTicket(id){try{await api('/api/platform/tickets/'+id,{method:'PUT',body:JSON.stringify({status:'closed'})});VIEWS.tickets()}catch(e){alert(e.message)}}
function bubble(who,text,tag){const c=document.getElementById('chat');const b=el('<div class="bub '+who+'">'+esc(text)+(tag?'<div class="tag">'+esc(tag)+'</div>':'')+'</div>').firstChild;c.appendChild(b);c.scrollTop=c.scrollHeight}
function msg(id,t,ok){const m=document.getElementById(id);if(m){m.className='msg '+(ok?'ok':'err');m.textContent=t}}

async function savePlan(id){try{const plan=document.getElementById('p_'+id).value;await api('/api/platform/orgs/'+id,{method:'PUT',body:JSON.stringify({plan})});msg('om','Plan updated for '+id.slice(0,8)+' → '+plan,true)}catch(e){msg('om',e.message)}}
async function toggleSuspend(id,to){try{await api('/api/platform/orgs/'+id,{method:'PUT',body:JSON.stringify({suspended:to})});VIEWS.orgs()}catch(e){msg('om',e.message)}}
async function ask(){const i=document.getElementById('q');const q=i.value.trim();if(!q)return;i.value='';bubble('u',q);try{const d=await api('/api/platform/assistant',{method:'POST',body:JSON.stringify({message:q})});bubble('a',d.reply,d.llm?'':'offline · snapshot only')}catch(e){bubble('a','Error: '+e.message)}}

show((location.hash||'#overview').slice(1));
</script></body></html>`;
