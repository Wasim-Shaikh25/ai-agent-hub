import type { FastifyInstance } from 'fastify';
import { TOKENS, MARK, BASE } from './theme.js';

/** Serves the org admin console at /admin (manage everything in a workspace). */
export async function registerAdminUiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin', async (_req, reply) => reply.type('text/html').send(ADMIN_HTML));
}

const ADMIN_HTML = /* html */ `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Admin · AI Agent Hub</title>
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
main{padding:26px 30px;max-width:960px}
h1{font-size:20px;margin:0 0 4px;letter-spacing:-.02em}.muted{color:var(--muted)}.sub{color:var(--muted);font-size:13px;margin:0 0 18px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:18px;margin-bottom:16px}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.tile .n{font-size:20px;font-weight:750}.tile .l{font-size:12px;color:var(--muted)}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px 8px;border-bottom:1px solid var(--line);font-size:13px;vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:12px}
input,textarea,select{width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font:inherit}
textarea{font-family:ui-monospace,monospace;font-size:12.5px;min-height:64px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:end}.row>div{flex:1;min-width:120px}
label{display:block;font-size:12px;color:var(--muted);margin:0 0 4px}
button{padding:8px 14px;border-radius:8px;border:0;background:var(--cyan);color:#04120f;font-weight:700;cursor:pointer;font-size:13px}
button.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
button.danger{background:transparent;color:var(--bad);border:1px solid var(--line)}
.pill{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:color-mix(in oklab,var(--cyan) 16%,transparent);color:var(--cyan)}
.pill.amber{background:color-mix(in oklab,var(--amber) 18%,transparent);color:var(--amber)}
.right{text-align:right}.msg{font-size:13px;margin-top:8px;min-height:16px}.err{color:var(--bad)}.ok{color:var(--good)}
.locked{color:var(--amber);font-size:13px}
h2{font-size:15px;margin:0 0 12px}
a.top{color:var(--cyan);text-decoration:none;font-size:13px}
.hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
</style></head><body>
<div class="app">
  <aside>
    <div class="brand"><span class="mark">◈</span> Admin</div>
    <div class="nav" id="nav"></div>
    <div style="margin-top:20px;padding:0 8px"><a class="top" href="/help">Help →</a><br/><a class="top" href="/dashboard">Cost dashboard →</a><br/><a class="top" href="/account">Account →</a><br/><a class="top" id="logout">Log out</a></div>
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

const TABS=[['overview','Overview'],['agents','Agents & Models'],['content','Content'],['policies','Policies'],['keys','API Keys'],['team','Members'],['mcp','MCP Servers'],['audit','Audit']];
const nav=document.getElementById('nav');
TABS.forEach(([id,label])=>{const a=el('<a data-t="'+id+'">'+label+'</a>').firstChild;a.onclick=()=>show(id);nav.appendChild(a)});
function show(id){[...nav.children].forEach(a=>a.classList.toggle('on',a.dataset.t===id));(VIEWS[id]||(()=>{}))();location.hash=id}
const M=document.getElementById('main');
async function guard(fn){try{await fn()}catch(e){M.innerHTML='<div class="card locked">This section needs a higher plan or admin role: '+esc(e.message)+'</div>'}}

const VIEWS={
 async overview(){
   const [me,plan,usage]=await Promise.all([api('/api/me'),api('/api/plan'),api('/api/usage')]);
   M.innerHTML='<h1>Overview</h1><p class="sub">Workspace '+esc(me.org)+' · you are '+esc(me.role)+'</p>'+
   '<div class="card"><div class="tiles">'+
   tile(plan.plan,'Plan')+tile((usage.tokens||0).toLocaleString(),'Tokens this month')+tile('$'+Number(usage.usd||0).toFixed(4),'Cost this month')+tile((plan.features||[]).length,'Paid features')+
   '</div></div><div class="card"><h2>Included features</h2><p class="muted">'+((plan.features||[]).join(', ')||'core (free)')+'</p></div>';
 },
 agents(){guard(async()=>{
   const [list,cat]=await Promise.all([api('/api/agents'),api('/api/models')]);
   const opts=(cat.models||[]).map(m=>'<option '+(cat.default===m?'selected':'')+'>'+esc(m)+'</option>').join('');
   M.innerHTML='<div class="hdr"><h1>Agents &amp; Models</h1></div>'+
   '<div class="card"><h2>Org default model</h2><p class="muted" style="margin-top:-4px">Fallback only — used for users who haven\\'t picked their own model on their Account page. Users always choose for themselves; this never overrides them. We never touch an agent\\'s internal picker.</p>'+
   '<div class="row"><div style="flex:2"><label>Model</label><select id="dm">'+(opts||'<option>gpt-4o-mini</option>')+'</select></div><div style="flex:0"><label>&nbsp;</label><button onclick="setDefaultModel()">Save</button></div></div><div class="msg" id="dmm"></div></div>'+
   '<div class="card"><h2>Available models ('+(cat.models||[]).length+')</h2><p class="muted mono">'+((cat.models||[]).map(esc).join(' · ')||'none')+'</p><p class="muted" style="font-size:12px">Edit <span class="mono">deploy/litellm.config.yaml</span> or set <span class="mono">HUB_MODELS</span> to change this list.</p></div>'+
   '<div class="card"><h2>Agents ('+Object.keys(groupAgents(list)).length+')</h2><p class="muted" style="margin-top:-4px">Connected = talking to your Hub (MCP/gateway). Running/installed comes from <span class="mono">aihub detect</span> on the machine.</p>'+
   '<table><tr><th>Agent</th><th>Status</th><th>Via</th><th>Last model</th><th>Last seen</th><th></th></tr>'+
   (list.length?Object.values(groupAgents(list)).map(g=>'<tr><td>'+esc(g.agent)+(g.version?' <span class="muted">'+esc(g.version)+'</span>':'')+'</td><td>'+statusPill(g.status)+'</td><td class="muted">'+[...g.sources].map(esc).join(', ')+'</td><td class="mono">'+esc(g.last_model||'—')+'</td><td class="muted">'+new Date(g.last_seen).toLocaleString()+'</td><td class="right">'+(g.status==='connected'?'':'<button class="ghost" onclick="showConnect(\\''+esc(g.agent)+'\\')">Connect</button>')+'</td></tr>').join(''):'<tr><td colspan="6" class="muted">No agents yet — run <span class="mono">aihub detect</span> on your machine, or <span class="mono">aihub connect</span> an agent.</td></tr>')+
   '</table><div class="msg" id="connmsg"></div></div>';
 })},
 content(){guard(async()=>{
   const items=await api('/api/content');
   M.innerHTML='<div class="hdr"><h1>Content</h1></div>'+
   '<div class="card"><h2>Add content</h2><div class="row">'+
   '<div><label>Type</label><select id="ct">'+['skill','rule','hook','workflow','persona'].map(t=>'<option>'+t+'</option>').join('')+'</select></div>'+
   '<div style="flex:2"><label>Name</label><input id="cn" placeholder="No console.log"/></div></div>'+
   '<div style="margin-top:10px"><label>Description</label><input id="cd" placeholder="Short description"/></div>'+
   '<div style="margin-top:10px"><label>Body (instructions)</label><textarea id="cb"></textarea></div>'+
   '<div style="margin-top:10px"><button onclick="addContent()">Create</button><span class="msg" id="cm"></span></div></div>'+
   '<div class="card"><h2>'+items.length+' items</h2><table><tr><th>Type</th><th>Name</th><th>Status</th><th></th></tr>'+
   items.map(i=>'<tr><td><span class="pill">'+esc(i.type)+'</span></td><td>'+esc(i.name)+'<div class="muted">'+esc(i.description)+'</div></td><td>'+(i.enabled?'enabled':'disabled')+' · '+esc(i.status||'approved')+'</td><td class="right"><button class="danger" onclick="delContent(\\''+i.id+'\\')">Delete</button></td></tr>').join('')+'</table></div>';
 })},
 policies(){guard(async()=>{
   const pols=await api('/api/policies');
   M.innerHTML='<div class="hdr"><h1>Policies</h1></div>'+
   '<div class="card"><h2>Add policy</h2><div class="row"><div><label>Kind</label><select id="pk">'+['routing','model','budget','quality','redaction','retention','content'].map(k=>'<option>'+k+'</option>').join('')+'</select></div></div>'+
   '<div style="margin-top:10px"><label>Spec (JSON)</label><textarea id="ps">{"maxTokens":100000}</textarea></div>'+
   '<div style="margin-top:10px"><button onclick="addPolicy()">Create</button><span class="msg" id="pm"></span></div>'+
   '<p class="muted" style="margin-top:8px;font-size:12px">Examples — routing: {"task":"refactor","model":"claude-sonnet"} · budget: {"maxTokens":5000000} · quality: {"tiers":{"trivial":"gpt-4o-mini","complex":"claude-opus"}}</p></div>'+
   '<div class="card"><h2>'+pols.length+' policies</h2><table><tr><th>Kind</th><th>Spec</th><th></th></tr>'+
   pols.map(p=>'<tr><td><span class="pill">'+esc(p.kind)+'</span></td><td class="mono">'+esc(JSON.stringify(p.spec))+'</td><td class="right"><button class="danger" onclick="delPolicy(\\''+p.id+'\\')">Delete</button></td></tr>').join('')+'</table></div>';
 })},
 keys(){guard(async()=>{
   const ks=await api('/api/keys');
   M.innerHTML='<div class="hdr"><h1>API Keys</h1></div>'+
   '<div class="card"><div class="row"><div><label>Name</label><input id="kn" placeholder="ci-server"/></div><div><label>Role (optional)</label><select id="kr"><option value="">(inherit)</option>'+['viewer','member','admin'].map(r=>'<option>'+r+'</option>').join('')+'</select></div><div style="flex:0"><label>&nbsp;</label><button onclick="addKey()">Create</button></div></div><div class="msg" id="km"></div></div>'+
   '<div class="card"><table><tr><th>Name</th><th>Prefix</th><th>Role</th><th>Status</th><th></th></tr>'+
   ks.map(k=>'<tr><td>'+esc(k.name)+'</td><td class="mono">'+esc(k.prefix)+'…</td><td>'+esc(k.role||'—')+'</td><td>'+(k.revoked?'revoked':'active')+'</td><td class="right">'+(k.revoked?'':'<button class="danger" onclick="revokeKey(\\''+k.id+'\\')">Revoke</button>')+'</td></tr>').join('')+'</table></div>';
 })},
 team(){guard(async()=>{
   const ms=await api('/api/members');
   M.innerHTML='<div class="hdr"><h1>Members</h1></div><div class="card"><table><tr><th>Email</th><th>Role</th><th></th></tr>'+
   ms.map(m=>'<tr><td>'+esc(m.email)+'</td><td><select id="r_'+m.userId+'">'+['viewer','member','admin','owner'].map(r=>'<option '+(m.role===r?'selected':'')+'>'+r+'</option>').join('')+'</select></td><td class="right"><button class="ghost" onclick="setRole(\\''+m.userId+'\\')">Save</button></td></tr>').join('')+'</table><p class="muted" style="font-size:12px;margin-top:8px">Invite via SSO or share a signup link.</p></div>';
 })},

 mcp(){guard(async()=>{
   const srv=await api('/api/mcp-servers');
   M.innerHTML='<div class="hdr"><h1>MCP Servers</h1></div>'+
   '<div class="card"><h2>Register a downstream MCP server</h2><div class="row"><div><label>Name</label><input id="mn" placeholder="github"/></div><div style="flex:2"><label>URL (http transport)</label><input id="mu" placeholder="http://host:port/mcp"/></div><div style="flex:0"><label>&nbsp;</label><button onclick="addMcp()">Add</button></div></div><div class="msg" id="mm"></div></div>'+
   '<div class="card"><table><tr><th>Name</th><th>Transport</th><th>URL</th><th></th></tr>'+
   srv.map(s=>'<tr><td>'+esc(s.name)+'</td><td>'+esc(s.transport)+'</td><td class="mono">'+esc(s.url)+'</td><td class="right"><button class="danger" onclick="delMcp(\\''+s.id+'\\')">Delete</button></td></tr>').join('')+'</table></div>';
 })},
 audit(){guard(async()=>{
   const a=await api('/api/audit?limit=40');
   M.innerHTML='<div class="hdr"><h1>Audit log</h1></div><div class="card"><table><tr><th>Action</th><th>Target</th><th>When</th></tr>'+
   a.map(e=>'<tr><td><span class="pill">'+esc(e.action)+'</span></td><td class="mono">'+esc((e.target||'').slice(0,20))+'</td><td class="muted">'+new Date(e.created_at).toLocaleString()+'</td></tr>').join('')+'</table></div>';
 })},
};
function tile(n,l){return '<div class="tile"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>'}
const STATUS_RANK={connected:3,running:2,installed:1};
function groupAgents(list){const g={};list.forEach(a=>{const k=a.agent;if(!g[k])g[k]={agent:a.agent,status:a.status,sources:new Set(),last_model:null,last_seen:a.last_seen,version:a.version};const e=g[k];e.sources.add(a.source);if((STATUS_RANK[a.status]||0)>(STATUS_RANK[e.status]||0))e.status=a.status;if(a.last_model)e.last_model=a.last_model;if(new Date(a.last_seen)>new Date(e.last_seen))e.last_seen=a.last_seen;if(a.version)e.version=a.version;});return g}
function statusPill(s){const c=s==='connected'?'':(s==='running'?'amber':'');const dot=s==='installed'?'○':'●';return '<span class="pill '+c+'">'+dot+' '+esc(s)+'</span>'}
const CONNECT_SLUG={'Cursor':'cursor','Kiro':'kiro','Windsurf':'windsurf','VS Code':'vscode','Cline':'cline','Claude Code':'claude'};
function showConnect(agent){const slug=CONNECT_SLUG[agent];const m=document.getElementById('connmsg');if(!slug){m.className='msg';m.textContent=agent+': launch it with  aihub run  (terminal agent).';return}m.className='msg ok';m.textContent='Run on your machine:  aihub connect '+slug+'   (writes its MCP config + gateway URL).'}
function msg(id,t,ok){const m=document.getElementById(id);m.className='msg '+(ok?'ok':'err');m.textContent=t}

async function addContent(){try{await api('/api/content',{method:'POST',body:JSON.stringify({type:content_type(),name:v('cn'),description:v('cd'),body:v('cb')})});VIEWS.content()}catch(e){msg('cm',e.message)}}
function content_type(){return document.getElementById('ct').value}
async function delContent(id){if(confirm('Delete this item?')){await api('/api/content/'+id,{method:'DELETE'});VIEWS.content()}}
async function addPolicy(){try{const spec=JSON.parse(v('ps'));await api('/api/policies',{method:'POST',body:JSON.stringify({kind:document.getElementById('pk').value,spec})});VIEWS.policies()}catch(e){msg('pm',e.message)}}
async function delPolicy(id){await api('/api/policies/'+id,{method:'DELETE'});VIEWS.policies()}
async function addKey(){try{const d=await api('/api/keys',{method:'POST',body:JSON.stringify({name:v('kn')||'key',role:document.getElementById('kr').value||undefined})});msg('km','Key created — copy now: '+d.key,true);setTimeout(VIEWS.keys,4000)}catch(e){msg('km',e.message)}}
async function revokeKey(id){await api('/api/keys/'+id,{method:'DELETE'});VIEWS.keys()}
async function setRole(uid){try{await api('/api/members/'+uid,{method:'PUT',body:JSON.stringify({role:document.getElementById('r_'+uid).value})});VIEWS.team()}catch(e){alert(e.message)}}
async function addMcp(){try{await api('/api/mcp-servers',{method:'POST',body:JSON.stringify({name:v('mn'),transport:'http',url:v('mu')})});VIEWS.mcp()}catch(e){msg('mm',e.message)}}
async function setDefaultModel(){try{const d=await api('/api/settings/default-model',{method:'PUT',body:JSON.stringify({model:v('dm')})});msg('dmm','Default model set to '+d.default,true)}catch(e){msg('dmm',e.message)}}
async function delMcp(id){await api('/api/mcp-servers/'+id,{method:'DELETE'});VIEWS.mcp()}
function v(id){return document.getElementById(id).value}

show((location.hash||'#overview').slice(1));
</script></body></html>`;
