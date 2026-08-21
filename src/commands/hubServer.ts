import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AgentConfigStore } from '../core/agentConfig';
import { FileWriter } from '../core/fileWriter';
import { HubClient } from '../core/hubClient';
import { UniversalMcpProxy } from '../core/universalMcpProxy';
import { HubItem } from '../core/types';

const AGENTS = ['cursor', 'claude', 'vscode', 'windsurf'];

/** Prompts for the Hub server URL + API key and validates them. */
export async function connectServer(hub: HubClient): Promise<void> {
  const url = await vscode.window.showInputBox({
    title: 'Connect to AI Agent Hub',
    prompt: 'Hub server URL',
    value: (await hub.getUrl()) ?? 'http://localhost:8080',
    ignoreFocusOut: true,
  });
  if (!url) return;

  const key = await vscode.window.showInputBox({
    title: 'Connect to AI Agent Hub',
    prompt: 'API key (or SSO session token)',
    password: true,
    ignoreFocusOut: true,
  });
  if (!key) return;

  await hub.setCredentials(url, key);
  try {
    const me = await hub.me();
    vscode.window.showInformationMessage(`Connected to Hub (org ${me.org}, role ${me.role}).`);
  } catch (err) {
    await hub.clear();
    vscode.window.showErrorMessage(
      `Hub connection failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Writes the Hub's MCP config into each chosen agent in the current workspace. */
export async function connectAgentsToHub(hub: HubClient): Promise<void> {
  if (!(await hub.isConnected())) {
    vscode.window.showWarningMessage('Connect to a Hub first (AI Agent Hub: Connect to Server).');
    return;
  }

  const picks = await vscode.window.showQuickPick(AGENTS, {
    title: 'Point which agents at the Hub?',
    canPickMany: true,
  });
  if (!picks || picks.length === 0) return;

  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const written: string[] = [];

  for (const agent of picks) {
    try {
      const snippet = await hub.mcpConfig(agent);
      const target = resolveTarget(snippet.file, root);
      if (!target) {
        vscode.window.showWarningMessage(`Open a workspace folder to write ${agent} config.`);
        continue;
      }
      writeMerged(target, snippet.config as Record<string, unknown>);
      written.push(`${agent}: ${target}`);
    } catch (err) {
      vscode.window.showErrorMessage(
        `${agent}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (written.length) {
    vscode.window.showInformationMessage(`Wrote MCP config → ${written.join(' · ')}`);
  }
}

/** Lists the org's content items from the Hub registry. */
export async function pullFromHub(hub: HubClient): Promise<void> {
  if (!(await hub.isConnected())) {
    vscode.window.showWarningMessage('Connect to a Hub first (AI Agent Hub: Connect to Server).');
    return;
  }
  try {
    const items = await hub.listContent();
    if (items.length === 0) {
      vscode.window.showInformationMessage('Hub registry is empty.');
      return;
    }
    await vscode.window.showQuickPick(
      items.map((i) => ({
        label: `[${i.type}] ${i.name}`,
        description: i.status,
        detail: i.description,
      })),
      { title: `Hub content (${items.length})`, canPickMany: false },
    );
  } catch (err) {
    vscode.window.showErrorMessage(
      `Pull failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function resolveTarget(file: string, root: string | undefined): string | undefined {
  if (file.startsWith('~')) return path.join(os.homedir(), file.slice(1));
  if (path.isAbsolute(file)) return file;
  if (!root) return undefined;
  return path.join(root, file);
}

/** Merges the Hub's server block into any existing MCP config file. */
function buildUniversalMcpRule(localUrl: string): string {
  return `# AI Agent Hub — Universal MCP Proxy

A local MCP proxy is running in the AI Agent Hub VS Code: extension at:

\`\`\`
${localUrl}
\`\`\`

This endpoint forwards to the connected Hub, so any AI agent, shell, or script that can make an HTTP POST request can use it — no per-agent MCP config format required.

## List available tools

\`\`\`bash
curl -s -X POST ${localUrl} \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
\`\`\`

## Call a tool (example: session_get_context)

\`\`\`bash
curl -s -X POST ${localUrl} \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"session_get_context","arguments":{"project":"my-project","key":"my-branch"}}}'
\`\`\`

You can also set the project/branch context via headers instead of arguments:

\`\`\`bash
curl -s -X POST ${localUrl} \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -H "X-Hub-Project: my-project" \\
  -H "X-Hub-Session: my-branch" \\
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"session_get_context","arguments":{}}}'
\`\`\`

## Available tools

- \`session_get_context\` — Get token-budgeted context for the current work.
- \`diagnostics_context\` — Retrieve code for given compiler/lint diagnostics.
- \`session_extract_memory\` — Extract durable facts from a session to memory.
- \`session_summarize\` — Summarize the current session.

Use \`tools/list\` to discover the full set at runtime.
`;
}

/** Starts a local, agent-agnostic MCP proxy and writes a usage rule to the workspace and every enabled agent target. */
export async function startUniversalMcpProxy(
  proxy: UniversalMcpProxy,
  hub: HubClient,
  agentConfig: AgentConfigStore,
  fileWriter: FileWriter,
): Promise<void> {
  if (!(await hub.isConnected())) {
    vscode.window.showWarningMessage('Connect to a Hub first (AI Agent Hub: Connect to Server).');
    return;
  }

  const hubUrl = await hub.getUrl();
  const hubKey = await hub.getKey();
  if (!hubUrl || !hubKey) {
    vscode.window.showWarningMessage('Connect to a Hub first (AI Agent Hub: Connect to Server).');
    return;
  }

  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    vscode.window.showWarningMessage('Open a workspace folder to start the universal MCP proxy.');
    return;
  }

  const localUrl = await proxy.start(hubUrl, hubKey);
  const content = buildUniversalMcpRule(localUrl);
  const written: string[] = [];

  // Reference copy in the workspace root
  const workspaceRuleDir = path.join(root, '.ai-agent-hub');
  fs.mkdirSync(workspaceRuleDir, { recursive: true });
  const workspaceRulePath = path.join(workspaceRuleDir, 'MCP.md');
  fs.writeFileSync(workspaceRulePath, content, 'utf-8');
  written.push(workspaceRulePath);

  // Push the same guide to every enabled agent target's rule folder
  const ruleItem: HubItem = {
    id: 'universal-mcp-proxy',
    name: 'AI Agent Hub MCP',
    type: 'rule',
    source: 'builtin',
    enabled: true,
    description: 'Universal MCP proxy usage guide',
    content,
    format: 'markdown',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  for (const config of agentConfig.getEnabled()) {
    const target = config.targets['rule'];
    if (!target?.enabled) {
      continue;
    }
    try {
      const result = await fileWriter.write([ruleItem], target, 'rule', root);
      written.push(...result.filesWritten);
    } catch (err) {
      vscode.window.showWarningMessage(
        `${config.displayName}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  await vscode.env.clipboard.writeText(localUrl);
  vscode.window.showInformationMessage(
    `Universal MCP proxy running at ${localUrl}. Rule written to ${written.join(', ')}.`,
  );
}

function writeMerged(target: string, incoming: Record<string, unknown>): void {
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(target)) {
    try {
      existing = JSON.parse(fs.readFileSync(target, 'utf-8')) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }
  const out: Record<string, unknown> = { ...existing };
  for (const topKey of ['mcpServers', 'servers']) {
    const inc = incoming[topKey] as Record<string, unknown> | undefined;
    if (inc) {
      out[topKey] = { ...((existing[topKey] as Record<string, unknown>) ?? {}), ...inc };
    }
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(out, null, 2), 'utf-8');
}
