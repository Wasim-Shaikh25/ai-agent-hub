import type { FastifyInstance } from 'fastify';
import { TOKENS, MARK, BASE } from './theme.js';

/** Serves the self-contained web dashboard at GET /dashboard. */
export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/dashboard', async (_req, reply) => {
    reply.type('text/html').send(DASHBOARD_HTML);
  });
}

const DASHBOARD_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AI Agent Hub — Dashboard</title>
<style>
${TOKENS}
${MARK}
  /* Map the dashboard's local names onto the shared palette. */
  :root{--surface:var(--panel);--text:var(--ink);--border:var(--line);--accent:var(--cyan);
    --accent-soft:color-mix(in oklab,var(--cyan) 16%,transparent);--warn:var(--amber);
    --bar:var(--violet);--grid:var(--line)}
${BASE}
  body{margin:0;background:var(--bg);color:var(--text);font-size:14.5px;line-height:1.6}
  .mono{font-variant-numeric:tabular-nums}
  .brand{width:30px;height:30px;border-radius:8px;background:conic-gradient(from 210deg,var(--cyan),var(--violet),var(--amber),var(--cyan));display:grid;place-items:center;color:#04060c;font-weight:900}
  .wrap{max-width:1080px;margin:0 auto;padding:28px 20px 80px}
  header{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:8px}
  h1{font-size:20px;margin:0;letter-spacing:-.01em}
  .spacer{flex:1}
  input,button{font:inherit;border-radius:9px;border:1px solid var(--border);background:var(--surface);color:var(--text);padding:8px 12px}
  input{min-width:230px}
  button{cursor:pointer;background:var(--accent);color:#04120f;border-color:transparent;font-weight:700}
  .hint{color:var(--muted);font-size:12.5px;margin:2px 0 20px}
  .tiles{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:18px}
  @media(max-width:820px){.tiles{grid-template-columns:repeat(2,1fr)}}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px}
  .tile .n{font-size:23px;font-weight:750;letter-spacing:-.02em}
  .tile .l{font-size:12px;color:var(--muted);margin-top:3px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  @media(max-width:820px){.grid2{grid-template-columns:1fr}}
  h2{font-size:14px;margin:0 0 12px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
  table{width:100%;border-collapse:collapse}
  th,td{text-align:left;padding:7px 6px;border-bottom:1px solid var(--border);font-size:13px}
  th{color:var(--muted);font-weight:600}
  td.r,th.r{text-align:right}
  .barcell{position:relative}
  .barcell i{position:absolute;left:6px;top:50%;transform:translateY(-50%);height:16px;background:var(--accent-soft);border-radius:4px;z-index:0}
  .barcell span{position:relative;z-index:1}
  .pill{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--accent-soft);color:var(--accent)}
  canvas{width:100%;height:120px;display:block}
  .muted{color:var(--muted)}
  section{margin-top:16px}
  .err{color:var(--bad)}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand">◈</div>
    <h1>AI Agent Hub</h1>
    <span class="pill" id="scope">this month</span>
    <div class="spacer"></div>
    <input id="key" type="password" placeholder="API key (hub_… or session token)" />
    <button id="load">Load</button>
  </header>
  <div class="hint" id="status">Enter an API key to load live metrics. Everything is served from this Hub server.</div>

  <div class="tiles" id="tiles"></div>

  <section class="card">
    <h2>Spend over time (30 days)</h2>
    <canvas id="spark" width="1040" height="120"></canvas>
  </section>

  <section class="grid2">
    <div class="card"><h2>Cost by model</h2><div id="byModel"></div></div>
    <div class="card"><h2>By developer</h2><div id="byUser"></div></div>
  </section>

  <section class="grid2">
    <div class="card"><h2>Savings (cache + routing)</h2><div id="savings"></div></div>
    <div class="card"><h2>Recent audit</h2><div id="audit"></div></div>
  </section>
</div>

<script>
const $ = (id) => document.getElementById(id);
const fmtUsd = (n) => '$' + Number(n||0).toFixed(4);
const fmtNum = (n) => Number(n||0).toLocaleString();

$('key').value = localStorage.getItem('hub_key') || '';
$('load').onclick = load;
$('key').addEventListener('keydown', e => { if(e.key==='Enter') load(); });
if ($('key').value) load();

async function api(path){
  const key = $('key').value.trim();
  const r = await fetch(path, { headers: { Authorization: 'Bearer ' + key } });
  if(!r.ok) throw new Error(path + ' → ' + r.status);
  return r.json();
}

async function load(){
  const key = $('key').value.trim();
  if(!key){ $('status').textContent = 'Enter an API key.'; return; }
  localStorage.setItem('hub_key', key);
  $('status').textContent = 'Loading…';
  try{
    const [sum, byModel, byUser, ts, savings, audit] = await Promise.all([
      api('/api/metrics/summary'),
      api('/api/metrics/by-model'),
      api('/api/metrics/by-user').catch(()=>[]),
      api('/api/metrics/timeseries?days=30'),
      api('/api/metrics/savings'),
      api('/api/audit?limit=8').catch(()=>[]),
    ]);
    renderTiles(sum);
    renderModels(byModel);
    renderUsers(byUser);
    renderSavings(savings);
    renderAudit(audit);
    drawSpark(ts);
    $('status').textContent = 'Live · ' + new Date().toLocaleTimeString();
  }catch(e){
    $('status').innerHTML = '<span class="err">'+e.message+'</span> — check the key/role.';
  }
}

function tile(n,l){ return '<div class="card tile"><div class="n mono">'+n+'</div><div class="l">'+l+'</div></div>'; }
function renderTiles(s){
  $('tiles').innerHTML = [
    tile(fmtNum(s.requests),'requests'),
    tile(fmtNum(s.tokens),'tokens'),
    tile(fmtUsd(s.usd),'cost'),
    tile((s.cacheHitRate*100).toFixed(0)+'%','cache hit rate'),
    tile(s.avgLatencyMs+' ms','avg latency'),
  ].join('');
}
function renderModels(rows){
  const max = Math.max(1, ...rows.map(r=>Number(r.usd)));
  $('byModel').innerHTML = '<table><tr><th>Model</th><th class="r">Calls</th><th class="r">Tokens</th><th class="r">Cost</th></tr>'+
    rows.map(r=>{const w=(Number(r.usd)/max*100).toFixed(1);
      return '<tr><td class="barcell"><i style="width:'+w+'%"></i><span>'+(r.model||'—')+'</span></td>'+
      '<td class="r mono">'+fmtNum(r.calls)+'</td><td class="r mono">'+fmtNum(r.tokens)+'</td><td class="r mono">'+fmtUsd(r.usd)+'</td></tr>';
    }).join('') + '</table>' + (rows.length?'':'<p class="muted">No usage yet.</p>');
}
function renderUsers(rows){
  $('byUser').innerHTML = rows.length ? '<table><tr><th>Developer</th><th class="r">Calls</th><th class="r">Cost</th></tr>'+
    rows.map(r=>'<tr><td>'+r.user+'</td><td class="r mono">'+fmtNum(r.calls)+'</td><td class="r mono">'+fmtUsd(r.usd)+'</td></tr>').join('')+'</table>'
    : '<p class="muted">Admin role required, or no data.</p>';
}
function renderSavings(s){
  $('savings').innerHTML = '<div style="display:flex;gap:24px">'+
    '<div><div class="n mono" style="font-size:22px;font-weight:750">'+fmtUsd(s.savedUsd)+'</div><div class="l muted">saved</div></div>'+
    '<div><div class="n mono" style="font-size:22px;font-weight:750">'+fmtNum(s.savedTokens)+'</div><div class="l muted">tokens saved</div></div>'+
    '<div><div class="n mono" style="font-size:22px;font-weight:750">'+fmtNum(s.cacheHits)+'</div><div class="l muted">cache hits</div></div></div>';
}
function renderAudit(rows){
  $('audit').innerHTML = rows.length ? '<table>'+rows.map(r=>
    '<tr><td><span class="pill">'+r.action+'</span></td><td class="muted mono" style="font-size:11px">'+
    new Date(r.created_at).toLocaleString()+'</td></tr>').join('')+'</table>' : '<p class="muted">No audit events.</p>';
}
function drawSpark(ts){
  const c = $('spark'), ctx = c.getContext('2d');
  const w=c.width, h=c.height; ctx.clearRect(0,0,w,h);
  const css=getComputedStyle(document.body);
  const bar=css.getPropertyValue('--bar'), grid=css.getPropertyValue('--grid'), muted=css.getPropertyValue('--muted');
  const data = ts.map(d=>Number(d.usd));
  const max = Math.max(0.0000001, ...data);
  const n = data.length || 1, pad=8, bw=(w-pad*2)/n;
  ctx.strokeStyle=grid; ctx.lineWidth=1;
  for(let i=0;i<=3;i++){const y=pad+(h-pad*2)*i/3; ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(w-pad,y);ctx.stroke();}
  ctx.fillStyle=bar;
  data.forEach((v,i)=>{const bh=(h-pad*2)*(v/max); const x=pad+i*bw+bw*0.15; const y=h-pad-bh;
    ctx.fillRect(x,y,Math.max(1,bw*0.7),bh);});
  if(!ts.length){ctx.fillStyle=muted;ctx.font='12px system-ui';ctx.fillText('No spend in range',pad+4,h/2);}
}
</script>
</body>
</html>`;
