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
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { homedir } from 'node:os';

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

const AGENTS = ['cursor', 'claude', 'vscode', 'windsurf'];

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
  const snippet = await api(`/api/mcp-config?agent=${agent}`, cfg);

  const target = isAbsolute(snippet.file) || snippet.file.startsWith('~') ? expandHome(snippet.file) : join(dir, snippet.file);
  let existing = {};
  if (existsSync(target)) {
    try { existing = JSON.parse(readFileSync(target, 'utf-8')); } catch { existing = {}; }
  }
  const merged = mergeMcpConfig(existing, snippet.config);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(merged, null, 2));

  console.log(`✓ Wrote MCP config for ${agent}: ${target}`);
  console.log(`  ${snippet.note}`);
  console.log('');
  console.log(gatewayHint(agent, cfg.url, cfg.key));
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
  aihub config <agent>                      Print the MCP config snippet

Agents: ${AGENTS.join(', ')}`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { flags, positional } = parseFlags(rest);
  try {
    switch (cmd) {
      case 'login': await cmdLogin(flags); break;
      case 'status': await cmdStatus(); break;
      case 'connect': await cmdConnect(positional, flags); break;
      case 'config': await cmdConfig(positional); break;
      default: usage();
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
