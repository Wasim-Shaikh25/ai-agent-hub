import type { FastifyInstance } from 'fastify';
import { TOKENS, MARK, BASE } from './theme.js';

/** Serves the customer-facing web app: /login (signup+login) and /account. */
export async function registerWebappRoutes(app: FastifyInstance): Promise<void> {
  app.get('/login', async (_req, reply) => reply.type('text/html').send(LOGIN_HTML));
  app.get('/superadmin-login', async (_req, reply) => reply.type('text/html').send(SUPERADMIN_LOGIN_HTML));
  app.get('/forgot-password', async (_req, reply) => reply.type('text/html').send(FORGOT_PASSWORD_HTML));
  app.get('/reset-password', async (_req, reply) => reply.type('text/html').send(RESET_PASSWORD_HTML));
  app.get('/account', async (_req, reply) => reply.type('text/html').send(ACCOUNT_HTML));
}

const STYLE = /* css */ `
${TOKENS}
${MARK}
${BASE}
body{margin:0;background:var(--bg);color:var(--ink);font-size:14.5px;line-height:1.6}
.wrap{max-width:440px;margin:8vh auto;padding:0 20px}
.acct{max-width:720px}
.brand{display:flex;align-items:center;gap:10px;font-weight:750;letter-spacing:-.02em;margin-bottom:22px}
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

const SUPERADMIN_LOGIN_HTML = /* html */ `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Superadmin · AI Agent Hub</title><style>${STYLE}</style></head><body>
<div class="wrap">
  <div class="brand"><span class="mark">◈</span> AI Agent Hub · Superadmin</div>
  <div class="card">
    <h1>Sign in as application owner</h1>
    <p class="sub">An OTP will be sent to the registered email address.</p>
    <label>Email</label><input id="email" type="email" placeholder="admin@company.com"/>
    <label>Password</label><input id="password" type="password" placeholder="Password"/>
    <button id="go" onclick="startOtp()">Send sign-in code</button>
    <div id="otpWrap" style="display:none">
      <label>One-time code</label><input id="otp" type="text" inputmode="numeric" placeholder="123456"/>
      <button onclick="verifyOtp()">Verify and sign in</button>
    </div>
    <div class="msg" id="msg"></div>
  </div>
</div>
<script>
let email='';
async function startOtp(){
  const msg=document.getElementById('msg');msg.className='msg';msg.textContent='…';
  email=document.getElementById('email').value;
  const r=await fetch('/auth/superadmin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:document.getElementById('password').value})});
  const d=await r.json();
  if(!r.ok){msg.className='msg err';msg.textContent=(d.error&&d.error.message)||'Failed';return;}
  document.getElementById('otpWrap').style.display='block';
  msg.className='msg ok';msg.textContent='Check the server output or your inbox for the code.';
}
async function verifyOtp(){
  const msg=document.getElementById('msg');msg.className='msg';msg.textContent='…';
  const code=document.getElementById('otp').value;
  const r=await fetch('/auth/superadmin/verify-otp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,code})});
  const d=await r.json();
  if(!r.ok){msg.className='msg err';msg.textContent=(d.error&&d.error.message)||'Invalid code';return;}
  localStorage.setItem('hub_token',d.token);
  location.href='/superadmin';
}
</script></body></html>`;

const LOGIN_HTML = /* html */ `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Sign in · AI Agent Hub</title><style>${STYLE}</style></head><body>
<div class="wrap">
  <div class="brand"><span class="mark">◈</span> AI Agent Hub</div>
  <div style="text-align:right;margin-bottom:8px"><a class="small" href="/help">Help</a> · <a class="small" href="/superadmin-login">Superadmin</a></div>
  <div class="card">
    <div class="tabs"><div class="tab on" id="tabSignup" onclick="mode('signup')">Sign up</div><div class="tab" id="tabLogin" onclick="mode('login')">Log in</div></div>
    <h1 id="title">Create your account</h1>
    <p class="sub" id="sub">Start free — connect your first agent in minutes.</p>
    <div id="orgWrap"><label>Team name</label><input id="orgName" placeholder="Acme Engineering"/></div>
    <label>Work email</label><input id="email" type="email" placeholder="you@company.com"/>
    <label>Password</label><input id="password" type="password" placeholder="At least 8 characters"/>
    <div id="forgotLink" style="text-align:right;font-size:12px;margin:-6px 0 10px;display:none"><a class="small" href="/forgot-password">Forgot password?</a></div>
    <button id="go" onclick="submit()">Create account</button>
    <div style="text-align:center;margin:18px 0 8px;color:var(--muted);font-size:13px">Or continue with</div>
    <div style="display:flex;gap:10px">
      <button class="ghost" style="flex:1" onclick="oauth('google')">Google</button>
      <button class="ghost" style="flex:1" onclick="oauth('apple')">Apple</button>
      <button class="ghost" style="flex:1" onclick="oauth('mobile')">Mobile</button>
    </div>
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
  document.getElementById('forgotLink').style.display=m==='login'?'block':'none';
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
function oauth(provider){
  if(provider==='mobile'){alert('Mobile OTP sign-in is not configured yet.');return;}
  if(provider==='apple'){alert('Apple sign-in is not configured yet.');return;}
  location.href='/auth/oauth/'+provider;
}
</script></body></html>`;

const FORGOT_PASSWORD_HTML = /* html */ `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Reset password · AI Agent Hub</title><style>${STYLE}</style></head><body>
<div class="wrap">
  <div class="brand"><span class="mark">◈</span> AI Agent Hub</div>
  <div class="card">
    <h1>Reset your password</h1>
    <p class="sub">Enter your email and we'll send a reset code.</p>
    <label>Work email</label><input id="email" type="email" placeholder="you@company.com"/>
    <button onclick="send()">Send reset code</button>
    <div class="msg" id="msg"></div>
    <p class="small" style="margin-top:16px"><a href="/login">Back to sign in</a></p>
  </div>
</div>
<script>
async function send(){
  const msg=document.getElementById('msg');msg.className='msg';msg.textContent='…';
  const email=document.getElementById('email').value.trim();
  try{
    const r=await fetch('/auth/forgot-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
    const d=await r.json();
    if(!r.ok){msg.className='msg err';msg.textContent=(d.error&&d.error.message)||'Something went wrong';return;}
    msg.className='msg ok';msg.textContent='If this account exists, a reset code has been sent.';
  }catch(e){msg.className='msg err';msg.textContent=e.message;}
}
</script></body></html>`;

const RESET_PASSWORD_HTML = /* html */ `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Choose new password · AI Agent Hub</title><style>${STYLE}</style></head><body>
<div class="wrap">
  <div class="brand"><span class="mark">◈</span> AI Agent Hub</div>
  <div class="card">
    <h1>Choose a new password</h1>
    <p class="sub">Enter the code from your email and a new password.</p>
    <label>Work email</label><input id="email" type="email" placeholder="you@company.com"/>
    <label>Reset code</label><input id="code" placeholder="123456"/>
    <label>New password</label><input id="password" type="password" placeholder="At least 8 characters"/>
    <button onclick="resetP()">Update password</button>
    <div class="msg" id="msg"></div>
    <p class="small" style="margin-top:16px"><a href="/login">Back to sign in</a></p>
  </div>
</div>
<script>
(function(){
  const p=new URLSearchParams(location.search);
  const email=p.get('email');const code=p.get('code');
  if(email)document.getElementById('email').value=email;
  if(code)document.getElementById('code').value=code;
})();
async function resetP(){
  const msg=document.getElementById('msg');msg.className='msg';msg.textContent='…';
  const body={
    email:document.getElementById('email').value.trim(),
    code:document.getElementById('code').value.trim(),
    password:document.getElementById('password').value,
  };
  try{
    const r=await fetch('/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d=await r.json();
    if(!r.ok){msg.className='msg err';msg.textContent=(d.error&&d.error.message)||'Something went wrong';return;}
    msg.className='msg ok';msg.textContent='Password updated. Redirecting…';
    setTimeout(()=>location.href='/login',1200);
  }catch(e){msg.className='msg err';msg.textContent=e.message;}
}
</script></body></html>`;

const ACCOUNT_HTML = /* html */ `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Account · AI Agent Hub</title><style>${STYLE}</style></head><body>
<div class="wrap acct">
  <div class="brand"><span class="mark">◈</span> AI Agent Hub <span style="flex:1"></span><a class="small" href="/help">Help</a> · <a class="small" href="#" onclick="logout()">Log out</a></div>
  <div class="card">
    <div style="display:flex;align-items:center;gap:12px"><h1 style="margin:0">Your workspace</h1><span class="pill" id="plan">…</span></div>
    <p class="sub" id="who"></p>
    <div class="tiles">
      <div class="tile"><div class="n" id="tokens">–</div><div class="l">Tokens this month</div></div>
      <div class="tile"><div class="n" id="usd">–</div><div class="l">Cost this month</div></div>
      <div class="tile"><div class="n" id="reqlimit">–</div><div class="l">Request limit per month</div></div>
    </div>
    <div id="keyBox" style="display:none"><label>Your API key (copy it into <span class="mono">aihub login</span>)</label><div class="key mono" id="apikey"></div></div>
    <button class="ghost" onclick="newKey()" style="margin-top:14px">Create a new API key</button>
    <div class="msg" id="keymsg"></div>
    <hr style="border:0;border-top:1px solid var(--line);margin:22px 0"/>
    <label>Your model</label>
    <p class="small" style="margin:0 0 8px">Your choice — used whenever your agent doesn't pin its own model. This is yours, not an admin setting.</p>
    <div style="display:flex;gap:8px;align-items:center">
      <select id="mymodel" style="flex:1;padding:9px 10px;border-radius:8px;border:1px solid var(--line);background:var(--bg,#fff);color:inherit;font:inherit"></select>
      <button class="ghost" onclick="saveModel()">Save</button>
    </div>
    <div class="msg" id="modelmsg"></div>
    <hr style="border:0;border-top:1px solid var(--line);margin:22px 0"/>
    <div class="row"><span class="k">Plan</span><span class="v" id="planName">…</span></div>
    <div class="row"><span class="k">Included features</span><span class="v" id="features" style="text-align:right;max-width:60%"></span></div>
    <button id="upgrade" onclick="upgrade()">Upgrade to Team</button>
    <div class="msg" id="billmsg"></div>
    <p class="small" style="margin-top:16px">Next: <a href="/admin">admin console</a> · <a href="/dashboard">cost dashboard</a> · <a href="/activity">my activity</a> · connect an agent with <span class="mono">aihub connect cursor</span>.</p>
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
    await loadModels();
  }catch(e){}
})();
async function loadModels(){
  try{
    const c=await (await fetch('/api/models',{headers:h()})).json();
    const sel=document.getElementById('mymodel');
    const def=c.default?(' (org default: '+c.default+')'):'';
    sel.innerHTML='<option value="">Automatic'+def+'</option>'+(c.models||[]).map(function(m){return '<option'+(c.mine===m?' selected':'')+'>'+m+'</option>'}).join('');
  }catch(e){}
}
async function saveModel(){
  const m=document.getElementById('modelmsg');m.className='msg';m.textContent='…';
  const model=document.getElementById('mymodel').value;
  const r=await fetch('/api/me/model',{method:'PUT',headers:{...h(),'Content-Type':'application/json'},body:JSON.stringify({model:model})});
  const d=await r.json();
  if(!r.ok){m.className='msg err';m.textContent=(d.error&&d.error.message)||'Failed';return;}
  m.className='msg ok';m.textContent=d.model?('Your model is now '+d.model):'Cleared — using automatic routing.';
}
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
