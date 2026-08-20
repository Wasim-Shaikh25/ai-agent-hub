import type { FastifyInstance } from 'fastify';
import { TOKENS, MARK, BASE } from './theme.js';

/** Serves the public, searchable Help center and the ticket form. */
export async function registerHelpRoutes(app: FastifyInstance): Promise<void> {
  app.get('/help', async (_req, reply) => reply.type('text/html').send(HELP_HTML));
}

const HELP_TOPICS = [
  { title: 'Sign up and log in', body: 'You can create an account with your work email and password. After sign-up you get a workspace and an API key. Owners can invite members from the Members tab.' },
  { title: 'Connect your agent', body: 'Install the AI Agent Hub VS Code extension, then run the AI Agent Hub: Connect to Server command and paste your API key. The extension will keep your skills and rules in sync.' },
  { title: 'API keys', body: 'Create and copy API keys from the Account page. Treat them like passwords. If you lose one, revoke it and create a new one.' },
  { title: 'Pick a model', body: 'On the Account page you can choose the default language model for your requests. Automatic routing is used when no model is selected.' },
  { title: 'Plans and billing', body: 'The free plan includes core features. Upgrade to the paid plan for more seats, shared context, and advanced governance. Billing is handled by Stripe.' },
  { title: 'Open a support ticket', body: 'Use the form at the bottom of this page to report a problem. Include what you were doing, what you expected, and any error message.' },
  { title: 'Security and privacy', body: 'Rules and skills are stored in your workspace. The server only receives metadata, usage counts, and redacted snippets for RAG. See the Security page for details.' },
  { title: 'Organisation admin', body: 'Owners and admins can manage content, policies, team members, MCP servers, and API keys from the Admin console.' },
];

const HELP_HTML = /* html */ `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Help · AI Agent Hub</title><style>
${TOKENS}
${MARK}
${BASE}
body{margin:0;background:var(--bg);color:var(--ink);font-size:15px;line-height:1.6}
.wrap{max-width:760px;margin:0 auto;padding:40px 20px}
.brand{display:flex;align-items:center;gap:10px;font-weight:750;letter-spacing:-.02em;margin-bottom:26px}
h1{font-size:26px;margin:0 0 6px;letter-spacing:-.02em}.sub{color:var(--muted);font-size:15px;margin:0 0 22px}
.search{width:100%;padding:12px 16px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font:inherit;font-size:16px;margin-bottom:8px}
.count{font-size:13px;color:var(--muted);margin-bottom:14px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px;margin-bottom:14px}
.card h2{font-size:17px;margin:0 0 8px}
.card p{margin:0;color:var(--ink);font-size:15px}
.empty{color:var(--muted);text-align:center;padding:40px 0}
.ticket{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px;margin-top:30px}
label{display:block;font-size:13px;color:var(--muted);margin:14px 0 5px}
input,textarea,select{width:100%;padding:11px 13px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink);font:inherit;box-sizing:border-box}
textarea{min-height:120px}
button{width:100%;margin-top:18px;padding:12px;border-radius:10px;border:0;background:var(--cyan);color:#04120f;font-weight:700;font-size:15px;cursor:pointer}
.msg{margin-top:14px;font-size:13.5px;min-height:18px}.msg.err{color:var(--bad)}.msg.ok{color:var(--good)}
.back{font-size:13px;color:var(--muted);margin-bottom:18px;display:inline-block}
</style></head><body>
<div class="wrap">
  <div class="brand"><span class="mark">◈</span> AI Agent Hub</div>
  <a class="back" href="/login">← Back to sign in</a>
  <h1>Help centre</h1>
  <p class="sub">Search answers, or open a support ticket at the bottom of the page.</p>
  <input id="q" class="search" type="search" placeholder="e.g. API key, connect agent, billing" oninput="render()" autocomplete="off"/>
  <div class="count" id="count"></div>
  <div id="topics"></div>
  <div class="ticket">
    <h2>Open a support ticket</h2>
    <p class="sub">If you cannot find the answer above, tell us what happened and we will get back to you.</p>
    <label>Topic</label>
    <select id="category"><option>General</option><option>Login issue</option><option>Billing</option><option>Agent not syncing</option><option>Bug report</option></select>
    <label>Subject</label><input id="subject" placeholder="Short summary" maxlength="120"/>
    <label>Description</label><textarea id="body" placeholder="What were you doing? What did you expect? What happened instead?"></textarea>
    <button onclick="submitTicket()">Submit ticket</button>
    <div class="msg" id="tmsg"></div>
  </div>
</div>
<script>
const topics=${JSON.stringify(HELP_TOPICS)};
function render(){
  const q=document.getElementById('q').value.trim().toLowerCase();
  const matched=topics.filter(t=>(t.title+' '+t.body).toLowerCase().includes(q));
  document.getElementById('count').textContent=matched.length+' result'+(matched.length===1?'':'s');
  document.getElementById('topics').innerHTML=matched.map(t=>'<div class="card"><h2>'+esc(t.title)+'</h2><p>'+esc(t.body)+'</p></div>').join('') || '<div class="empty">No results. Try a different term or open a ticket below.</div>';
}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
async function submitTicket(){
  const m=document.getElementById('tmsg');m.className='msg';m.textContent='…';
  const body={category:document.getElementById('category').value,subject:document.getElementById('subject').value.trim(),body:document.getElementById('body').value.trim()};
  if(!body.subject||!body.body){m.className='msg err';m.textContent='Please enter a subject and description.';return;}
  try{
    const r=await fetch('/api/tickets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){m.className='msg err';m.textContent=(d.error&&d.error.message)||'Could not submit. Make sure you are signed in.';return;}
    m.className='msg ok';m.textContent='Ticket submitted. We will follow up by email.';
    document.getElementById('subject').value='';document.getElementById('body').value='';
  }catch(e){m.className='msg err';m.textContent=e.message;}
}
render();
</script></body></html>`;
