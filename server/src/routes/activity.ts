import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../auth.js';
import { query, queryOne } from '../db/pool.js';
import { TOKENS, MARK, BASE } from './theme.js';

const MONTH = `created_at >= date_trunc('month', now())`;

/** User-facing activity dashboard: the user's own usage + actions. */
export async function registerActivityRoutes(app: FastifyInstance): Promise<void> {
  app.get('/activity', async (_req, reply) => reply.type('text/html').send(ACTIVITY_HTML));

  app.get('/api/me/activity', { preHandler: requireAuth }, async (req) => {
    const userId = req.auth!.userId;
    const orgId = req.auth!.orgId;
    const [summary, byModel, recent, agents] = await Promise.all([
      queryOne<Record<string, string>>(
        `SELECT COUNT(*) AS requests, COALESCE(SUM(qty),0) AS tokens,
                COALESCE(SUM((meta->>'usd')::numeric),0) AS usd
           FROM usage_event WHERE org_id = $1 AND user_id = $2 AND kind='tokens' AND ${MONTH}`,
        [orgId, userId],
      ),
      query(
        `SELECT meta->>'model' AS model, COUNT(*) AS calls, COALESCE(SUM(qty),0) AS tokens,
                COALESCE(SUM((meta->>'usd')::numeric),0) AS usd
           FROM usage_event WHERE org_id=$1 AND user_id=$2 AND kind='tokens' AND ${MONTH}
          GROUP BY meta->>'model' ORDER BY usd DESC`,
        [orgId, userId],
      ),
      query(
        `SELECT action, target, created_at FROM audit_log
          WHERE org_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 20`,
        [orgId, userId],
      ),
      query(
        `SELECT agent, raw_name, last_model, seen_count, last_seen, project
           FROM agent_connection WHERE org_id=$1 AND user_id=$2 ORDER BY last_seen DESC`,
        [orgId, userId],
      ),
    ]);
    return {
      period: 'month',
      requests: Number(summary?.requests ?? 0),
      tokens: Number(summary?.tokens ?? 0),
      usd: Number(Number(summary?.usd ?? 0).toFixed(6)),
      byModel,
      recent,
      agents,
    };
  });
}

const STYLE = /* css */ `
${TOKENS}
${MARK}
${BASE}
body{margin:0;background:var(--bg);color:var(--ink);font-size:14.5px;line-height:1.6}
.wrap{max-width:900px;margin:8vh auto;padding:0 20px}
.brand{display:flex;align-items:center;gap:10px;font-weight:750;letter-spacing:-.02em;margin-bottom:22px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:24px;margin-bottom:18px}
h1{font-size:22px;margin:0 0 4px}.sub{color:var(--muted);font-size:14px;margin:0 0 20px}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0}
.tile{background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:14px}.tile .n{font-size:20px;font-weight:750}.tile .l{font-size:12px;color:var(--muted)}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px 8px;border-bottom:1px solid var(--line);font-size:13px}
th{color:var(--muted);font-weight:600;font-size:12px}.mono{font-family:ui-monospace,monospace}
.pill{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:var(--cyan);color:#04120f}
a{color:var(--cyan)}
`;

const ACTIVITY_HTML = /* html */ `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Activity · AI Agent Hub</title><style>${STYLE}</style></head><body>
<div class="wrap">
  <div class="brand"><span class="mark">◈</span> AI Agent Hub · My Activity</div>
  <div class="card">
    <div style="display:flex;align-items:center;gap:12px"><h1 style="margin:0">Your activity</h1><span class="pill" id="scope">this month</span></div>
    <p class="sub" id="who"></p>
    <div class="tiles">
      <div class="tile"><div class="n" id="requests">–</div><div class="l">Requests</div></div>
      <div class="tile"><div class="n" id="tokens">–</div><div class="l">Tokens</div></div>
      <div class="tile"><div class="n" id="usd">–</div><div class="l">Cost</div></div>
    </div>
  </div>
  <div class="card"><h2>Usage by model</h2><div id="byModel"><p class="sub">No usage yet.</p></div></div>
  <div class="card"><h2>Connected agents</h2><div id="agents"><p class="sub">No agents connected yet.</p></div></div>
  <div class="card"><h2>Recent actions</h2><div id="recent"><p class="sub">No actions recorded yet.</p></div></div>
  <p class="sub"><a href="/account">Back to account</a></p>
</div>
<script>
const T=localStorage.getItem('hub_token');
if(!T)location.href='/login';
function h(){return{Authorization:'Bearer '+T}}
function fmtNum(n){return Number(n||0).toLocaleString();}
function fmtUsd(n){return '$'+Number(n||0).toFixed(4);}
(async()=>{
  try{
    const me=await (await fetch('/api/me',{headers:h()})).json();
    document.getElementById('who').textContent='Signed in as '+(me.role||'')+' · workspace '+me.org;
    const a=await (await fetch('/api/me/activity',{headers:h()})).json();
    document.getElementById('requests').textContent=fmtNum(a.requests);
    document.getElementById('tokens').textContent=fmtNum(a.tokens);
    document.getElementById('usd').textContent=fmtUsd(a.usd);
    if(a.byModel&&a.byModel.length){
      document.getElementById('byModel').innerHTML='<table><tr><th>Model</th><th class="mono">Calls</th><th class="mono">Tokens</th><th class="mono">Cost</th></tr>'+
        a.byModel.map(r=>'<tr><td>'+(r.model||'—')+'</td><td>'+fmtNum(r.calls)+'</td><td>'+fmtNum(r.tokens)+'</td><td>'+fmtUsd(r.usd)+'</td></tr>').join('')+'</table>';
    }
    if(a.agents&&a.agents.length){
      document.getElementById('agents').innerHTML='<table><tr><th>Agent</th><th>Project</th><th>Model</th><th>Seen</th></tr>'+
        a.agents.map(r=>'<tr><td>'+(r.agent||'—')+'</td><td>'+(r.project||'—')+'</td><td>'+(r.last_model||'—')+'</td><td>'+new Date(r.last_seen).toLocaleString()+'</td></tr>').join('')+'</table>';
    }
    if(a.recent&&a.recent.length){
      document.getElementById('recent').innerHTML='<table><tr><th>Action</th><th>Target</th><th>When</th></tr>'+
        a.recent.map(r=>'<tr><td><span class="pill">'+(r.action||'—')+'</span></td><td class="mono">'+(r.target||'—')+'</td><td>'+new Date(r.created_at).toLocaleString()+'</td></tr>').join('')+'</table>';
    }
  }catch(e){console.error(e);}
})();
</script></body></html>`;
