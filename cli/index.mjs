#!/usr/bin/env node
/**
 * aihub — connect any AI coding agent to an AI Agent Hub server.
 *
 * Writes the native MCP config (so the agent gets the Hub's context/memory/RAG
 * tools + aggregated MCP tools) and prints the gateway base-URL settings (so the
 * agent's LLM calls flow through the Hub for fallback/routing/metering).
 *
 * No dependencies — Node built-ins only.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, isAbsolute, basename, relative, extname } from 'node:path';
import { homedir } from 'node:os';
import { execSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', 'coverage', 'vendor', 'target', '__pycache__', '.venv', '.turbo', '.cache']);
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.java', '.rb', '.rs', '.cs', '.php', '.md', '.markdown', '.txt', '.json', '.yaml', '.yml', '.sql', '.sh', '.html', '.css', '.vue', '.svelte']);
const MAX_FILE_BYTES = 200 * 1024;

/** Recursively collects indexable source/doc files under a directory. */
function walkFiles(root, dir = root, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walkFiles(root, full, out);
    else if (st.isFile() && CODE_EXT.has(extname(name).toLowerCase()) && st.size <= MAX_FILE_BYTES) {
      out.push({ path: relative(root, full), content: readFileSync(full, 'utf-8') });
    }
  }
  return out;
}

/** Detects the repo name (project) and branch (session key) for a directory. */
function detectWorkspace(dir) {
  const run = (cmd) => {
    try { return execSync(cmd, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
    catch { return ''; }
  };
  const remote = run('git config --get remote.origin.url');
  const project = remote
    ? basename(remote.replace(/\.git$/, ''))
    : basename(isAbsolute(dir) ? dir : join(process.cwd(), dir));
  const branch = run('git rev-parse --abbrev-ref HEAD') || 'main';
  return { project, branch };
}

const CONFIG_PATH = join(homedir(), '.ai-agent-hub', 'config.json');

function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveConfig(cfg) {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
      flags[key] = val;
    } else positional.push(args[i]);
  }
  return { flags, positional };
}

async function api(path, cfg) {
  if (!cfg.url || !cfg.key) throw new Error('Not logged in. Run: aihub login --url <URL> --key <API_KEY>');
  const res = await fetch(`${cfg.url}${path}`, { headers: { Authorization: `Bearer ${cfg.key}` } });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPost(path, cfg, body) {
  if (!cfg.url || !cfg.key) throw new Error('Not logged in. Run: aihub login --url <URL> --key <API_KEY>');
  const res = await fetch(`${cfg.url}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function cmdIndex(flags) {
  const cfg = loadConfig();
  if (!cfg.url || !cfg.key) throw new Error('Not logged in. Run: aihub login --url <URL> --key <API_KEY>');
  const dir = flags.dir ?? '.';
  const abs = isAbsolute(dir) ? dir : join(process.cwd(), dir);
  const { project } = detectWorkspace(dir);
  const proj = flags.project || project;
  const files = walkFiles(abs);
  if (!files.length) { console.log('No indexable files found.'); return; }
  console.log(`Indexing ${files.length} files into project "${proj}"…`);
  let docs = 0, chunks = 0;
  const BATCH = 25;
  for (let i = 0; i < files.length; i += BATCH) {
    const r = await apiPost('/api/rag/index-batch', cfg, { project: proj, files: files.slice(i, i + BATCH) });
    docs += r.documents; chunks += r.chunks;
    process.stdout.write(`\r  ${docs}/${files.length} files · ${chunks} chunks`);
  }
  console.log(`\n✓ Indexed ${docs} files (${chunks} chunks) into "${proj}". Agents can now knowledge_map / rag_query this repo.`);
}

function expandHome(p) {
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p;
}

/** Shallow-merges the Hub's MCP server block into any existing config file. */
function mergeMcpConfig(existing, incoming) {
  const out = { ...existing };
  for (const topKey of ['mcpServers', 'servers']) {
    if (incoming[topKey]) out[topKey] = { ...(existing[topKey] ?? {}), ...incoming[topKey] };
  }
  return out;
}

const AGENTS = ['cursor', 'claude', 'vscode', 'windsurf', 'cline', 'kiro'];

function gatewayHint(agent, url, key) {
  const base = url.replace(/\/$/, '');
  if (agent === 'claude') {
    return [
      'Gateway (Claude Code) — route inference through the Hub:',
      `  export ANTHROPIC_BASE_URL=${base}`,
      `  export ANTHROPIC_API_KEY=${key}`,
    ].join('\n');
  }
  return [
    `Gateway (${agent}) — set the OpenAI-compatible base URL:`,
    `  base URL: ${base}/v1`,
    `  api key : ${key}`,
  ].join('\n');
}

async function cmdLogin(flags) {
  if (!flags.url || !flags.key) throw new Error('Usage: aihub login --url <URL> --key <API_KEY>');
  const cfg = { url: flags.url.replace(/\/$/, ''), key: flags.key };
  // validate
  const me = await api('/api/me', cfg);
  saveConfig(cfg);
  console.log(`Logged in to ${cfg.url} (org ${me.org}, role ${me.role}).`);
}

async function cmdStatus() {
  const cfg = loadConfig();
  if (!cfg.url) return console.log('Not logged in.');
  const health = await fetch(`${cfg.url}/health`).then((r) => r.json()).catch(() => ({ status: 'unreachable' }));
  const me = await api('/api/me', cfg).catch((e) => ({ error: e.message }));
  console.log(`Server:  ${cfg.url}  (${health.status})`);
  console.log(`Auth:    ${me.error ? me.error : `org ${me.org}, role ${me.role}`}`);
}

async function cmdConnect(positional, flags) {
  const agent = positional[0];
  if (!AGENTS.includes(agent)) throw new Error(`Usage: aihub connect <${AGENTS.join('|')}> [--dir .]`);
  const cfg = loadConfig();
  const dir = flags.dir ?? '.';
  const { project, branch } = detectWorkspace(dir);
  const proj = flags.project || project;
  const session = flags.session || branch;
  const snippet = await api(`/api/mcp-config?agent=${agent}&project=${encodeURIComponent(proj)}&session=${encodeURIComponent(session)}`, cfg);

  const target = isAbsolute(snippet.file) || snippet.file.startsWith('~') ? expandHome(snippet.file) : join(dir, snippet.file);
  let existing = {};
  if (existsSync(target)) {
    try { existing = JSON.parse(readFileSync(target, 'utf-8')); } catch { existing = {}; }
  }
  const merged = mergeMcpConfig(existing, snippet.config);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(merged, null, 2));

  console.log(`✓ Wrote MCP config for ${agent}: ${target}`);
  console.log(`  bound project="${proj}"  session="${session}"  (auto-detected from git)`);
  console.log(`  ${snippet.note}`);
  console.log('');
  console.log(gatewayHint(agent, cfg.url, cfg.key));
}

// --- terminal launcher: pick a CLI agent + model, run it through the Hub -----

/** How to launch each supported terminal agent, pointed at the Hub. */
const RUNNERS = {
  aider: (base, key, model) => ({
    cmd: 'aider',
    args: ['--model', `openai/${model}`, '--openai-api-base', `${base}/v1`, '--openai-api-key', key],
    env: {},
  }),
  claude: (base, key, model) => ({
    cmd: 'claude',
    args: [],
    env: { ANTHROPIC_BASE_URL: base, ANTHROPIC_API_KEY: key, ANTHROPIC_MODEL: model },
  }),
  codex: (base, key, model) => ({
    cmd: 'codex',
    args: ['-m', model],
    env: { OPENAI_BASE_URL: `${base}/v1`, OPENAI_API_KEY: key },
  }),
};

/** True if `bin` is on PATH. */
function hasBin(bin) {
  try { execSync(process.platform === 'win32' ? `where ${bin}` : `command -v ${bin}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(question, (a) => { rl.close(); res(a.trim()); }));
}

async function pick(label, options) {
  if (options.length === 1) return options[0];
  console.log(`\n${label}:`);
  options.forEach((o, i) => console.log(`  ${i + 1}) ${o}`));
  const a = await ask(`Choose 1-${options.length}: `);
  const idx = Number(a) - 1;
  return options[idx] ?? options[0];
}

// Standalone agent apps we can detect by process name / install dir. In-editor
// agents (Amazon Q, Copilot) aren't separate processes — the VS Code extension
// detects those; a CLI process scan can't.
const APP_MATCHERS = [
  { name: 'Cursor', slug: 'cursor', proc: /cursor/i, dir: '~/.cursor' },
  { name: 'Kiro', slug: 'kiro', proc: /kiro/i, dir: '~/.kiro' },
  { name: 'Windsurf', slug: 'windsurf', proc: /windsurf/i, dir: '~/.codeium/windsurf' },
  { name: 'VS Code', slug: 'vscode', proc: /(^|[\\/])code(\.exe)?$/i, dir: '~/.vscode' },
];
// CLI agents detected on PATH (from the RUNNERS registry) count as installed.
const CLI_SLUGS = { aider: 'claude', claude: 'claude', codex: 'codex' };

function runningProcesses() {
  try {
    const cmd = process.platform === 'win32' ? 'tasklist' : 'ps -A -o comm=';
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { return ''; }
}

/** Scans the machine for known agents; returns [{agent, slug, status}]. */
function detectAgents() {
  const procs = runningProcesses();
  const lines = procs.split('\n');
  const found = [];
  for (const m of APP_MATCHERS) {
    const running = lines.some((l) => m.proc.test(l));
    const installed = existsSync(expandHome(m.dir));
    if (running) found.push({ agent: m.name, slug: m.slug, status: 'running' });
    else if (installed) found.push({ agent: m.name, slug: m.slug, status: 'installed' });
  }
  // CLI agents on PATH (Claude Code, Codex) — installed, launchable via `aihub run`.
  for (const bin of Object.keys(RUNNERS)) {
    if (hasBin(bin)) {
      const name = bin === 'aider' ? 'Aider' : bin === 'claude' ? 'Claude Code' : 'Codex';
      if (!found.some((f) => f.agent === name)) found.push({ agent: name, slug: bin, status: 'installed' });
    }
  }
  return found;
}

async function cmdDetect(flags) {
  const cfg = loadConfig();
  const found = detectAgents();
  if (!found.length) {
    console.log('No known agents detected (looked for Cursor, Kiro, Windsurf, VS Code, and CLI agents on PATH).');
    return;
  }
  console.log('Detected agents:');
  for (const f of found) console.log(`  ${f.agent.padEnd(14)} ${f.status}`);

  // Report to the Hub so they appear in the console's Agents tab.
  if (cfg.url && cfg.key) {
    try {
      const r = await apiPost('/api/agents/local', cfg, { agents: found.map((f) => ({ agent: f.agent, status: f.status })) });
      console.log(`\n✓ Reported ${r.recorded} agents to the Hub — see ${cfg.url}/admin → Agents & Models.`);
    } catch (e) {
      console.log(`\n(Not reported: ${e.message})`);
    }
  } else {
    console.log('\nNot logged in — run `aihub login` to report these to your Hub console.');
  }

  // Optionally wire each detected agent to the Hub in one shot.
  if (flags.connect) {
    console.log('\nConnecting detected agents…');
    for (const f of found) {
      if (!AGENTS.includes(f.slug)) { console.log(`  ${f.agent}: launch via \`aihub run\` (CLI agent)`); continue; }
      try { await cmdConnect([f.slug], { dir: flags.dir ?? '.' }); }
      catch (e) { console.log(`  ${f.agent}: ${e.message}`); }
    }
  } else {
    console.log('\nTip: `aihub detect --connect` wires them all to the Hub at once.');
  }
}

async function cmdModels() {
  const cfg = loadConfig();
  const { data } = await api('/v1/models', cfg);
  console.log('Available models:');
  for (const m of data) console.log(`  ${m.id}`);
}

async function cmdAgents() {
  const cfg = loadConfig();
  const list = await api('/api/agents', cfg);
  if (!list.length) { console.log('No connected agents yet. Connect one with: aihub connect <agent>'); return; }
  console.log('Connected agents:');
  for (const a of list) {
    console.log(`  ${a.agent.padEnd(16)} via ${a.source.padEnd(8)} model=${a.last_model ?? '—'}  calls=${a.seen_count}  last=${new Date(a.last_seen).toLocaleString()}`);
  }
}

async function cmdRun(flags) {
  const cfg = loadConfig();
  if (!cfg.url || !cfg.key) throw new Error('Not logged in. Run: aihub login --url <URL> --key <API_KEY>');

  // 1) pick the agent — auto-detect which CLI agents are installed.
  const installed = Object.keys(RUNNERS).filter(hasBin);
  if (!installed.length) {
    throw new Error(`No supported CLI agent found on PATH. Install one of: ${Object.keys(RUNNERS).join(', ')} (e.g. "pip install aider-chat").`);
  }
  const agent = flags.agent && RUNNERS[flags.agent] ? flags.agent : await pick('Agent', installed);

  // 2) pick the model — from the Hub's catalog.
  const { data } = await api('/v1/models', cfg);
  const models = data.map((m) => m.id);
  const model = flags.model && models.includes(flags.model) ? flags.model : await pick('Model', models);

  // 3) launch it, pointed at the Hub.
  const base = cfg.url.replace(/\/$/, '');
  const spec = RUNNERS[agent](base, cfg.key, model);
  const { project, branch } = detectWorkspace(flags.dir ?? '.');
  console.log(`\n▶ launching ${agent} · model=${model} · via ${base} (project=${project}, branch=${branch})\n`);
  const child = spawn(spec.cmd, spec.args, {
    stdio: 'inherit',
    env: { ...process.env, ...spec.env, HUB_URL: base },
  });
  child.on('exit', (code) => process.exit(code ?? 0));
  child.on('error', (e) => { console.error(`Failed to launch ${spec.cmd}: ${e.message}`); process.exit(1); });
}

async function cmdConfig(positional) {
  const agent = positional[0] ?? 'cursor';
  const cfg = loadConfig();
  const snippet = await api(`/api/mcp-config?agent=${agent}`, cfg);
  console.log(JSON.stringify(snippet.config, null, 2));
}

function usage() {
  console.log(`aihub — connect AI coding agents to an AI Agent Hub server

Usage:
  aihub login --url <URL> --key <API_KEY>   Save & validate credentials
  aihub status                              Show server + auth status
  aihub connect <agent> [--dir .]           Write native MCP config + gateway hint
  aihub detect [--connect]                  Scan for installed/running agents, report to Hub
  aihub run [--agent X] [--model Y]         Pick a CLI agent + model, run via the Hub
  aihub models                              List available models
  aihub agents                              List agents connected to the Hub
  aihub index [--dir .] [--project X]       Index the repo for RAG / knowledge map
  aihub config <agent>                      Print the MCP config snippet

Connect agents: ${AGENTS.join(', ')}
Run agents:     ${Object.keys(RUNNERS).join(', ')}`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { flags, positional } = parseFlags(rest);
  try {
    switch (cmd) {
      case 'login': await cmdLogin(flags); break;
      case 'status': await cmdStatus(); break;
      case 'connect': await cmdConnect(positional, flags); break;
      case 'detect': await cmdDetect(flags); break;
      case 'run': await cmdRun(flags); break;
      case 'models': await cmdModels(); break;
      case 'agents': await cmdAgents(); break;
      case 'index': await cmdIndex(flags); break;
      case 'config': await cmdConfig(positional); break;
      default: usage();
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
