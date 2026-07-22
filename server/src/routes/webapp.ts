import type { FastifyInstance } from 'fastify';

/** Serves the customer-facing web app: /login (signup+login) and /account. */
export async function registerWebappRoutes(app: FastifyInstance): Promise<void> {
  app.get('/login', async (_req, reply) => reply.type('text/html').send(LOGIN_HTML));
  app.get('/account', async (_req, reply) => reply.type('text/html').send(ACCOUNT_HTML));
}

const STYLE = /* css */ `
:root{--bg:#0a0e1a;--panel:#111a2e;--line:#1c2740;--ink:#eaf0fb;--muted:#8ea0c0;--cyan:#3ee0d0;--violet:#8b93f8;--good:#54d98c;--bad:#f4707f}
@media(prefers-color-scheme:light){:root{--bg:#f4f7fc;--panel:#fff;--line:#e3e9f4;--ink:#111a2e;--muted:#4d5c78;--cyan:#0d9488;--violet:#5b63c4;--good:#137a4b;--bad:#c02a3b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.mono{font-family:ui-monospace,Menlo,Consolas,monospace}
.wrap{max-width:440px;margin:8vh auto;padding:0 20px}
.acct{max-width:720px}
.brand{display:flex;align-items:center;gap:10px;font-weight:750;letter-spacing:-.02em;margin-bottom:22px}
.mark{width:30px;height:30px;border-radius:8px;background:conic-gradient(from 210deg,var(--cyan),var(--violet),var(--cyan));display:grid;place-items:center;color:#04060c;font-weight:900}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:26px}
h1{font-size:22px;letter-spacing:-.02em;margin:0 0 4px}.sub{color:var(--muted);font-size:14px;margin:0 0 20px}
label{display:block;font-size:13px;color:var(--muted);margin:14px 0 5px}
input{width:100%;padding:11px 13px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font:inherit}
button{width:100%;margin-top:18px;padding:12px;border-radius:10px;border:0;background:var(--cyan);color:#04120f;font-weight:700;font-size:15px;cursor:pointer}
.tabs{display:flex;gap:8px;margin-bottom:18px}.tab{flex:1;padding:9px;text-align:center;border-radius:9px;border:1px solid var(--line);cursor:pointer;font-weight:600;font-size:14px;color:var(--muted)}
.tab.on{background:var(--cyan);color:#04120f;border-color:transparent}
.msg{margin-top:14px;font-size:13.5px;min-height:18px}.msg.err{color:var(--bad)}.msg.ok{color:var(--good)}
.row{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid var(--line);font-size:14px}
.row:last-child{border-bottom:0}.k{color:var(--muted)}.v{font-weight:600}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0}
.tile{background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:14px}.tile .n{font-size:20px;font-weight:750}.tile .l{font-size:12px;color:var(--muted)}
.pill{display:inline-block;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:3px 10px;border-radius:999px;background:var(--cyan);color:#04120f}
.key{background:var(--bg);border:1px dashed var(--line);border-radius:10px;padding:10px 12px;font-size:12.5px;word-break:break-all;margin-top:6px}
.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
a{color:var(--cyan)}.small{font-size:13px;color:var(--muted)}
`;

const LOGIN_HTML = /* html */ `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Sign in · AI Agent Hub</title><style>${STYLE}</style></head><body>
<div class="wrap">
  <div class="brand"><span class="mark">◈</span> AI Agent Hub</div>
  <div class="card">
    <div class="tabs"><div class="tab on" id="tabSignup" onclick="mode('signup')">Sign up</div><div class="tab" id="tabLogin" onclick="mode('login')">Log in</div></div>
    <h1 id="title">Create your account</h1>
    <p class="sub" id="sub">Start free — connect your first agent in minutes.</p>
    <div id="orgWrap"><label>Team name</label><input id="orgName" placeholder="Acme Engineering"/></div>
    <label>Work email</label><input id="email" type="email" placeholder="you@company.com"/>
    <label>Password</label><input id="password" type="password" placeholder="At least 8 characters"/>
    <button id="go" onclick="submit()">Create account</button>
    <div class="msg" id="msg"></div>
  </div>
</div>
<script>
let M='signup';
function mode(m){M=m;
  document.getElementById('tabSignup').classList.toggle('on',m==='signup');
  document.getElementById('tabLogin').classList.toggle('on',m==='login');
  document.getElementById('title').textContent=m==='signup'?'Create your account':'Welcome back';
  document.getElementById('sub').textContent=m==='signup'?'Start free — connect your first agent in minutes.':'Log in to your account.';
  document.getElementById('orgWrap').style.display=m==='signup'?'block':'none';
  document.getElementById('go').textContent=m==='signup'?'Create account':'Log in';
  document.getElementById('msg').textContent='';
}
async function submit(){
  const msg=document.getElementById('msg');msg.className='msg';msg.textContent='…';
  const body={email:document.getElementById('email').value,password:document.getElementById('password').value};
  if(M==='signup')body.orgName=document.getElementById('orgName').value;
  try{
    const r=await fetch('/auth/'+M,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d=await r.json();
    if(!r.ok){msg.className='msg err';msg.textContent=(d.error&&d.error.message)||'Something went wrong';return;}
    localStorage.setItem('hub_token',d.token);
    if(d.apiKey)localStorage.setItem('hub_apikey',d.apiKey);
    location.href='/account';
  }catch(e){msg.className='msg err';msg.textContent=e.message;}
}
</script></body></html>`;

const ACCOUNT_HTML = /* html */ `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Account · AI Agent Hub</title><style>${STYLE}</style></head><body>
<div class="wrap acct">
  <div class="brand"><span class="mark">◈</span> AI Agent Hub <span style="flex:1"></span><a class="small" href="#" onclick="logout()">Log out</a></div>
  <div class="card">
    <div style="display:flex;align-items:center;gap:12px"><h1 style="margin:0">Your workspace</h1><span class="pill" id="plan">…</span></div>
    <p class="sub" id="who"></p>
    <div class="tiles">
      <div class="tile"><div class="n" id="tokens">–</div><div class="l">tokens this month</div></div>
      <div class="tile"><div class="n" id="usd">–</div><div class="l">cost this month</div></div>
      <div class="tile"><div class="n" id="reqlimit">–</div><div class="l">request limit / mo</div></div>
    </div>
    <div id="keyBox" style="display:none"><label>Your API key (copy it into <span class="mono">aihub login</span>)</label><div class="key mono" id="apikey"></div></div>
    <button class="ghost" onclick="newKey()" style="margin-top:14px">Create a new API key</button>
    <div class="msg" id="keymsg"></div>
    <hr style="border:0;border-top:1px solid var(--line);margin:22px 0"/>
    <div class="row"><span class="k">Plan</span><span class="v" id="planName">…</span></div>
    <div class="row"><span class="k">Included features</span><span class="v" id="features" style="text-align:right;max-width:60%"></span></div>
    <button id="upgrade" onclick="upgrade()">Upgrade to Team</button>
    <div class="msg" id="billmsg"></div>
    <p class="small" style="margin-top:16px">Next: <a href="/admin">admin console</a> · <a href="/dashboard">cost dashboard</a> · connect an agent with <span class="mono">aihub connect cursor</span>.</p>
  </div>
</div>
<script>
const T=localStorage.getItem('hub_token');
if(!T)location.href='/login';
function h(){return{Authorization:'Bearer '+T}}
function logout(){localStorage.clear();location.href='/login';}
(async()=>{
  const ak=localStorage.getItem('hub_apikey');
  if(ak){document.getElementById('keyBox').style.display='block';document.getElementById('apikey').textContent=ak;}
  try{
    const me=await (await fetch('/api/me',{headers:h()})).json();
    document.getElementById('who').textContent='Signed in as '+(me.role||'')+' · org '+me.org;
    const plan=await (await fetch('/api/plan',{headers:h()})).json();
    document.getElementById('plan').textContent=plan.plan;
    document.getElementById('planName').textContent=plan.plan;
    document.getElementById('features').textContent=(plan.features||[]).join(', ')||'core';
    document.getElementById('reqlimit').textContent=fmt(plan.limits&&plan.limits.monthlyRequests);
    if(plan.plan!=='free')document.getElementById('upgrade').style.display='none';
    const u=await (await fetch('/api/usage',{headers:h()})).json();
    document.getElementById('tokens').textContent=fmt(u.tokens);
    document.getElementById('usd').textContent='$'+Number(u.usd||0).toFixed(4);
  }catch(e){}
})();
function fmt(n){return n===Infinity||n===null||n===undefined?'∞':Number(n).toLocaleString();}
async function newKey(){
  const m=document.getElementById('keymsg');m.className='msg';m.textContent='…';
  const r=await fetch('/api/keys',{method:'POST',headers:{...h(),'Content-Type':'application/json'},body:JSON.stringify({name:'web'})});
  const d=await r.json();
  if(!r.ok){m.className='msg err';m.textContent=(d.error&&d.error.message)||'Failed';return;}
  localStorage.setItem('hub_apikey',d.key);
  document.getElementById('keyBox').style.display='block';document.getElementById('apikey').textContent=d.key;
  m.className='msg ok';m.textContent='New key created — copy it now, it won\\'t be shown again.';
}
async function upgrade(){
  const m=document.getElementById('billmsg');m.className='msg';m.textContent='…';
  const r=await fetch('/api/billing/checkout',{method:'POST',headers:{...h(),'Content-Type':'application/json'},body:JSON.stringify({priceId:'price_team'})});
  const d=await r.json();
  if(r.ok&&d.url){location.href=d.url;return;}
  m.className='msg err';m.textContent=(d.error&&d.error.message)||'Billing is not configured on this instance yet.';
}
</script></body></html>`;
