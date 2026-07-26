import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { HubClient } from '../core/hubClient';

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
