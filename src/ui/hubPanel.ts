import * as vscode from 'vscode';
import { Registry } from '../core/registry';
import { AgentConfigStore } from '../core/agentConfig';
import { SyncEngine } from '../core/syncEngine';
import { Storage } from '../core/storage';
import { McpStore } from '../core/mcpStore';
import { McpManager } from '../core/mcpManager';
import {
  ItemType,
  TabType,
  AnyHubItem,
  HookItem,
  AgentTargetConfig,
  SyncResult,
  AgentSyncResult,
  McpServerConfig,
} from '../core/types';
import { getNonce, getBaseStyles, getBaseScriptSetup } from './webviewHtml';

/** Maps a TabType to the corresponding ItemType (content tabs only). */
const TAB_TO_ITEM_TYPE: Partial<Record<TabType, ItemType>> = {
  skills: 'skill',
  rules: 'rule',
  hooks: 'hook',
  workflows: 'workflow',
  personas: 'persona',
};

/** All tabs rendered in the Hub panel. */
const ALL_TABS: readonly TabType[] = [
  'skills',
  'rules',
  'hooks',
  'workflows',
  'personas',
  'agents',
  'mcps',
  'sync',
];

/**
 * Manages the main Hub webview panel with six tabs:
 * Skills, Rules, Hooks, Workflows, Agents, Repos, and Sync.
 *
 * Implements singleton panel behaviour — calling {@link open}
 * when a panel already exists will reveal it instead of
 * creating a duplicate.
 */
export class HubPanel {
  private panel: vscode.WebviewPanel | undefined;
  private activeTab: TabType = 'skills';

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly registry: Registry,
    private readonly agentConfig: AgentConfigStore,
    private readonly syncEngine: SyncEngine,
    private readonly storage: Storage,
    private readonly mcpStore: McpStore,
    private readonly mcpManager: McpManager,
    private readonly onOpenSetup: () => void,
  ) {}

  /**
   * Opens the Hub panel or reveals it if already open.
   * Optionally switches to the given tab.
   */
  open(activeTab?: TabType): void {
    if (activeTab) {
      this.activeTab = activeTab;
    }

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      this.sendTabContent(this.activeTab);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'aiAgentHub.hubPanel',
      'AI Agent Hub',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.extensionUri],
      },
    );

    this.panel.webview.html = this.getHtml(this.panel.webview);
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.onDidReceiveMessage((msg: HubMessage) => {
      this.handleMessage(msg);
    });
  }

  /** Disposes the panel if it is open. */
  dispose(): void {
    this.panel?.dispose();
  }

  // -----------------------------------------------------------------
  // Message handling
  // -----------------------------------------------------------------

  private handleMessage(msg: HubMessage): void {
    switch (msg.type) {
      case 'requestItems':
        this.sendTabContent(msg.tab as TabType);
        break;

      case 'switchTab':
        this.activeTab = msg.tab as TabType;
        this.sendTabContent(this.activeTab);
        break;

      case 'addItem':
        this.handleAddItem(msg);
        break;

      case 'editItem':
        this.handleEditItem(msg);
        break;

      case 'deleteItem':
        this.handleDeleteItem(msg);
        break;

      case 'toggleItem':
        this.handleToggleItem(msg);
        break;

      case 'requestForm':
        this.handleRequestForm(msg);
        break;

      case 'syncAll':
        this.handleSyncAll();
        break;

      case 'openSetup':
        this.onOpenSetup();
        break;

      case 'removeAgent':
        this.handleRemoveAgent(msg);
        break;

      case 'addMcp':
        this.handleAddMcp(msg);
        break;

      case 'removeMcp':
        this.handleRemoveMcp(msg);
        break;

      case 'startMcp':
        this.handleStartMcp(msg);
        break;

      case 'stopMcp':
        this.handleStopMcp(msg);
        break;

      default:
        break;
    }
  }

  private handleAddItem(msg: HubMessage): void {
    const itemType = TAB_TO_ITEM_TYPE[msg.tab as TabType];
    if (!itemType) {
      return;
    }

    try {
      const fields = msg.fields ?? {};
      this.registry.addItem(itemType, {
        name: String(fields.name ?? ''),
        type: itemType,
        description: String(fields.description ?? ''),
        content: String(fields.content ?? ''),
        format: 'markdown',
        enabled: true,
        ...(itemType === 'hook' ? { trigger: fields.trigger ?? 'always' } : {}),
      } as Omit<AnyHubItem, 'id' | 'source' | 'createdAt' | 'updatedAt'>);
      this.sendTabContent(msg.tab as TabType);
    } catch (err) {
      this.sendError(err);
    }
  }

  private handleEditItem(msg: HubMessage): void {
    const itemType = TAB_TO_ITEM_TYPE[msg.tab as TabType];
    if (!itemType || !msg.id) {
      return;
    }

    try {
      this.registry.updateItem(itemType, msg.id, msg.fields ?? {});
      this.sendTabContent(msg.tab as TabType);
    } catch (err) {
      this.sendError(err);
    }
  }

  private handleDeleteItem(msg: HubMessage): void {
    const itemType = TAB_TO_ITEM_TYPE[msg.tab as TabType];
    if (!itemType || !msg.id) {
      return;
    }

    try {
      this.registry.deleteItem(itemType, msg.id);
      this.sendTabContent(msg.tab as TabType);
    } catch (err) {
      this.sendError(err);
    }
  }

  private handleToggleItem(msg: HubMessage): void {
    const itemType = TAB_TO_ITEM_TYPE[msg.tab as TabType];
    if (!itemType || !msg.id) {
      return;
    }

    try {
      this.registry.toggleItem(itemType, msg.id);
      this.sendTabContent(msg.tab as TabType);
    } catch (err) {
      this.sendError(err);
    }
  }

  private handleRequestForm(msg: HubMessage): void {
    const itemType = TAB_TO_ITEM_TYPE[msg.tab as TabType];
    if (!itemType) {
      return;
    }

    let mode: 'add' | 'edit' = 'add';
    let item: AnyHubItem | undefined;

    if (msg.id) {
      const items = this.registry.getItems(itemType);
      item = items.find((i) => i.id === msg.id);
      if (item) {
        mode = 'edit';
      }
    }

    const html = this.renderForm(msg.tab as TabType, itemType, mode, item);
    this.postMessage({ type: 'showForm', tab: msg.tab, mode, html });
  }

  private async handleSyncAll(): Promise<void> {
    try {
      const result = await this.syncEngine.sync();
      this.sendSyncContent(result);
    } catch (err) {
      this.sendError(err);
    }
  }

  private handleRemoveAgent(msg: HubMessage): void {
    if (!msg.id) {
      return;
    }
    this.agentConfig.delete(msg.id);
    this.sendAgentsContent();
  }

  private handleAddMcp(msg: HubMessage): void {
    const f = msg.fields ?? {};
    try {
      this.mcpStore.add({
        name: String(f.name ?? ''),
        packageName: String(f.packageName ?? ''),
        args: String(f.args ?? '').split(' ').filter(Boolean),
        env: this.parseEnvString(String(f.env ?? '')),
        port: parseInt(String(f.port ?? '3100'), 10),
        autoStart: f.autoStart === 'true',
      });
      this.sendMcpContent();
    } catch (err) {
      this.sendError(err);
    }
  }

  private handleRemoveMcp(msg: HubMessage): void {
    if (!msg.id) { return; }
    this.mcpManager.stop(msg.id);
    this.mcpStore.remove(msg.id);
    this.sendMcpContent();
  }

  private async handleStartMcp(msg: HubMessage): Promise<void> {
    if (!msg.id) { return; }
    const config = this.mcpStore.get(msg.id);
    if (!config) { return; }
    try {
      await this.mcpManager.start(config);
      this.sendMcpContent();
    } catch (err) {
      this.sendError(err);
    }
  }

  private handleStopMcp(msg: HubMessage): void {
    if (!msg.id) { return; }
    this.mcpManager.stop(msg.id);
    this.sendMcpContent();
  }

  /** Parses "KEY=VALUE KEY2=VALUE2" into a Record. */
  private parseEnvString(raw: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const pair of raw.split(/\s+/).filter(Boolean)) {
      const eq = pair.indexOf('=');
      if (eq > 0) {
        result[pair.slice(0, eq)] = pair.slice(eq + 1);
      }
    }
    return result;
  }

  // -----------------------------------------------------------------
  // Content rendering
  // -----------------------------------------------------------------

  private sendTabContent(tab: TabType): void {
    if (tab === 'agents') {
      this.sendAgentsContent();
      return;
    }
    if (tab === 'mcps') {
      this.sendMcpContent();
      return;
    }
    if (tab === 'sync') {
      const lastResult = this.storage.loadSingle<SyncResult>('lastSyncResult');
      this.sendSyncContent(lastResult);
      return;
    }

    const itemType = TAB_TO_ITEM_TYPE[tab];
    if (!itemType) {
      return;
    }

    const items = this.registry.getItems(itemType);
    const html = this.renderItemList(items);
    this.postMessage({ type: 'updateItems', tab, html });
  }

  private sendAgentsContent(): void {
    const configs = this.agentConfig.getAll();
    const html = this.renderAgentList(configs);
    this.postMessage({ type: 'updateAgents', html });
  }

  private sendMcpContent(): void {
    const servers = this.mcpStore.getAll();
    const html = this.renderMcpList(servers);
    this.postMessage({ type: 'updateMcps', html });
  }

  private sendSyncContent(result?: SyncResult): void {
    const html = result ? this.renderSyncResult(result) : '<p class="info-msg">No sync has been performed yet.</p>';
    this.postMessage({ type: 'updateSync', html });
  }

  private sendError(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.postMessage({ type: 'error', message });
  }

  private postMessage(msg: Record<string, unknown>): void {
    this.panel?.webview.postMessage(msg);
  }

  // -----------------------------------------------------------------
  // HTML renderers
  // -----------------------------------------------------------------

  private renderItemList(items: readonly AnyHubItem[]): string {
    if (items.length === 0) {
      return '<p class="empty-state">No items yet. Click "Add" to create one.</p>';
    }

    return items
      .map(
        (item) => /* html */ `
      <div class="item-row" data-id="${item.id}">
        <label class="toggle">
          <input type="checkbox" ${item.enabled ? 'checked' : ''}
            data-action="toggle-item" data-tab="${this.activeTab}" data-id="${item.id}" />
          <span class="toggle-slider"></span>
        </label>
        <span class="item-name">${escapeHtml(item.name)}</span>
        <span class="badge ${item.source === 'builtin' ? 'badge-builtin' : 'badge-user'}">${item.source}</span>
        <span class="item-desc">${escapeHtml(item.description)}</span>
        <span class="item-actions">
          ${
            item.source === 'user'
              ? `<button class="btn-icon" title="Edit" data-action="edit-item" data-tab="${this.activeTab}" data-id="${item.id}">&#9998;</button>
                 <button class="btn-icon" title="Delete" data-action="delete-item" data-tab="${this.activeTab}" data-id="${item.id}">&#128465;</button>`
              : ''
          }
        </span>
      </div>`,
      )
      .join('');
  }

  private renderForm(
    tab: TabType,
    itemType: ItemType,
    mode: 'add' | 'edit',
    item?: AnyHubItem,
  ): string {
    const nameVal = item ? escapeAttr(item.name) : '';
    const descVal = item ? escapeAttr(item.description) : '';
    const contentVal = item ? escapeHtml(item.content) : '';

    let extraFields = '';
    if (itemType === 'hook') {
      const hook = item as HookItem | undefined;
      const trigger = hook?.trigger ?? 'always';
      extraFields = /* html */ `
        <div class="form-group">
          <label for="form-trigger">Trigger</label>
          <select id="form-trigger">
            <option value="before" ${trigger === 'before' ? 'selected' : ''}>before</option>
            <option value="after" ${trigger === 'after' ? 'selected' : ''}>after</option>
            <option value="always" ${trigger === 'always' ? 'selected' : ''}>always</option>
          </select>
        </div>`;
    }

    return /* html */ `
      <div class="form-panel">
        <h3>${mode === 'add' ? 'Add' : 'Edit'} ${capitalize(itemType)}</h3>
        <div class="form-group">
          <label for="form-name">Name</label>
          <input type="text" id="form-name" value="${nameVal}" placeholder="Enter name" />
        </div>
        <div class="form-group">
          <label for="form-desc">Description</label>
          <input type="text" id="form-desc" value="${descVal}" placeholder="Enter description" />
        </div>
        ${extraFields}
        <div class="form-group">
          <label for="form-content">Content</label>
          <textarea id="form-content" placeholder="Enter content">${contentVal}</textarea>
        </div>
        <div class="form-actions">
          <button class="btn-primary" data-action="submit-form" data-tab="${tab}" data-mode="${mode}" data-id="${item?.id ?? ''}">
            ${mode === 'add' ? 'Add' : 'Save'}
          </button>
          <button class="btn-secondary" data-action="cancel-form">Cancel</button>
        </div>
      </div>`;
  }

  private renderAgentList(configs: AgentTargetConfig[]): string {
    if (configs.length === 0) {
      return '<p class="empty-state">No agents configured. Click "Open Setup" to detect and configure agents.</p>';
    }

    return configs
      .map((cfg) => {
        const targetPaths = (['skill', 'rule', 'hook', 'workflow', 'persona'] as ItemType[])
          .filter((t) => cfg.targets[t]?.enabled)
          .map((t) => `${t}: ${escapeHtml(cfg.targets[t].path)}`)
          .join(', ');

        return /* html */ `
        <div class="agent-card">
          <div class="agent-card-header">
            <div>
              <strong>${escapeHtml(cfg.displayName)}</strong>
              <span style="opacity:0.6; margin-left:8px;">${escapeHtml(cfg.extensionId)}</span>
            </div>
            <div class="item-actions">
              <span class="badge ${cfg.enabled ? 'badge-user' : 'badge-builtin'}">
                ${cfg.enabled ? 'enabled' : 'disabled'}
              </span>
              <button class="btn-icon" title="Remove"
                data-action="remove-agent" data-id="${cfg.id}">&#128465;</button>
            </div>
          </div>
          <div class="agent-card-details">
            ${targetPaths ? `Targets: ${targetPaths}` : 'No targets configured'}
          </div>
        </div>`;
      })
      .join('');
  }

  private renderMcpList(servers: McpServerConfig[]): string {
    const addForm = /* html */ `
      <div class="mcp-add-form" style="margin-bottom:16px;padding:12px;border:1px solid var(--vscode-panel-border);border-radius:6px;">
        <strong style="display:block;margin-bottom:8px;">Register MCP Server</strong>
        <p style="font-size:0.85em;opacity:0.6;margin-bottom:10px;">
          Developer only — MCP servers run inside the Hub and are exposed to AI agents via generated rules.
        </p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
          <div>
            <label style="font-size:0.8em;opacity:0.6;display:block;margin-bottom:2px;">Name</label>
            <input type="text" id="mcp-name" placeholder="e.g. GitHub MCP" style="width:100%" />
          </div>
          <div>
            <label style="font-size:0.8em;opacity:0.6;display:block;margin-bottom:2px;">npx Package</label>
            <input type="text" id="mcp-pkg" placeholder="@modelcontextprotocol/server-github" style="width:100%" />
          </div>
          <div>
            <label style="font-size:0.8em;opacity:0.6;display:block;margin-bottom:2px;">Port</label>
            <input type="number" id="mcp-port" value="${this.nextAvailablePort(servers)}" min="1024" max="65535" style="width:100%" />
          </div>
          <div>
            <label style="font-size:0.8em;opacity:0.6;display:block;margin-bottom:2px;">Extra Args (space-separated)</label>
            <input type="text" id="mcp-args" placeholder="--verbose" style="width:100%" />
          </div>
          <div style="grid-column:1/-1;">
            <label style="font-size:0.8em;opacity:0.6;display:block;margin-bottom:2px;">Env Vars (KEY=VALUE space-separated)</label>
            <input type="text" id="mcp-env" placeholder="GITHUB_TOKEN=ghp_xxx API_KEY=abc" style="width:100%" />
          </div>
          <div style="grid-column:1/-1;display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="mcp-autostart" />
            <label for="mcp-autostart" style="font-size:0.85em;">Auto-start when Hub activates</label>
          </div>
        </div>
        <button class="btn-primary" data-action="add-mcp">Add MCP Server</button>
        <div id="mcp-err" style="margin-top:6px;"></div>
      </div>`;

    if (servers.length === 0) {
      return addForm + '<p class="empty-state">No MCP servers registered yet.</p>';
    }

    const list = servers.map((s) => {
      const state = this.mcpManager.getState(s.id);
      const statusColor = state.status === 'running'
        ? 'var(--vscode-testing-iconPassed,#73c991)'
        : state.status === 'error'
          ? 'var(--vscode-errorForeground,#f48771)'
          : 'var(--vscode-descriptionForeground)';

      return /* html */ `
        <div class="agent-card" style="margin-bottom:8px;">
          <div class="agent-card-header">
            <div>
              <strong>${escapeHtml(s.name)}</strong>
              <span style="opacity:0.6;margin-left:8px;font-size:0.85em;">${escapeHtml(s.packageName)}</span>
              <span style="margin-left:8px;font-size:0.8em;color:${statusColor};">● ${state.status}</span>
              ${state.url ? `<span style="opacity:0.5;font-size:0.8em;margin-left:6px;">${escapeHtml(state.url)}</span>` : ''}
            </div>
            <div class="item-actions">
              <span style="font-size:0.8em;opacity:0.5;">port ${s.port}</span>
              ${state.status === 'running'
                ? `<button class="btn-secondary" data-action="stop-mcp" data-id="${s.id}">Stop</button>`
                : `<button class="btn-primary" data-action="start-mcp" data-id="${s.id}">Start</button>`}
              <button class="btn-icon" title="Remove" data-action="remove-mcp" data-id="${s.id}">&#128465;</button>
            </div>
          </div>
          <div class="agent-card-details" style="font-size:0.8em;opacity:0.6;">
            ${state.error ? `<span style="color:var(--vscode-errorForeground);">${escapeHtml(state.error)}</span>` : ''}
            ${state.status === 'running' ? `Rule auto-generated and synced to agent targets on next sync.` : 'Start the server to generate its rule.'}
          </div>
        </div>`;
    }).join('');

    return addForm + list;
  }

  /** Returns the next available port starting from 3100. */
  private nextAvailablePort(servers: McpServerConfig[]): number {
    const usedPorts = new Set(servers.map((s) => s.port));
    let port = 3100;
    while (usedPorts.has(port)) {
      port++;
    }
    return port;
  }

  private renderSyncResult(result: SyncResult): string {
    const agentHtml = result.agentResults
      .map((ar: AgentSyncResult) => {
        const count = ar.filesWritten.length;
        const errCount = ar.errors.length;
        const status = errCount > 0
          ? `<span style="color:var(--vscode-errorForeground,#f48771);">${errCount} error${errCount > 1 ? 's' : ''}</span>`
          : `<span style="color:var(--vscode-testing-iconPassed,#73c991);">${count} item${count !== 1 ? 's' : ''} synced</span>`;
        return /* html */ `
          <div class="sync-agent">
            <strong>${escapeHtml(ar.agentName)}</strong> — ${escapeHtml(ar.contentType)}s — ${status}
          </div>`;
      })
      .join('');

    return /* html */ `
      <div class="sync-result">
        <div class="sync-timestamp">Last synced: ${escapeHtml(result.timestamp)}</div>
        ${agentHtml || '<p class="info-msg">No items were synced.</p>'}
      </div>`;
  }

  // -----------------------------------------------------------------
  // Full webview HTML
  // -----------------------------------------------------------------

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const styles = getBaseStyles();
    const baseScript = getBaseScriptSetup();

    const tabButtons = ALL_TABS.map(
      (t) =>
        `<button class="tab-btn ${t === this.activeTab ? 'active' : ''}" data-tab="${t}">${capitalize(t)}</button>`,
    ).join('');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style nonce="${nonce}">${styles}</style>
</head>
<body>
  <h1>AI Agent Hub</h1>

  <div class="tab-bar">${tabButtons}</div>

  <div id="form-area"></div>

  <div id="content-skills" class="tab-content ${this.activeTab === 'skills' ? 'active' : ''}">
    <div class="toolbar">
      <span></span>
      <button class="btn-primary" data-action="add-item" data-tab="skills">+ Add Skill</button>
    </div>
    <div id="list-skills"><p class="info-msg">Loading…</p></div>
  </div>

  <div id="content-rules" class="tab-content ${this.activeTab === 'rules' ? 'active' : ''}">
    <div class="toolbar">
      <span></span>
      <button class="btn-primary" data-action="add-item" data-tab="rules">+ Add Rule</button>
    </div>
    <div id="list-rules"><p class="info-msg">Loading…</p></div>
  </div>

  <div id="content-hooks" class="tab-content ${this.activeTab === 'hooks' ? 'active' : ''}">
    <div class="toolbar">
      <span></span>
      <button class="btn-primary" data-action="add-item" data-tab="hooks">+ Add Hook</button>
    </div>
    <div id="list-hooks"><p class="info-msg">Loading…</p></div>
  </div>

  <div id="content-workflows" class="tab-content ${this.activeTab === 'workflows' ? 'active' : ''}">
    <div class="toolbar">
      <span></span>
      <button class="btn-primary" data-action="add-item" data-tab="workflows">+ Add Workflow</button>
    </div>
    <div id="list-workflows"><p class="info-msg">Loading…</p></div>
  </div>

  <div id="content-personas" class="tab-content ${this.activeTab === 'personas' ? 'active' : ''}">
    <div class="toolbar">
      <span></span>
      <button class="btn-primary" data-action="add-item" data-tab="personas">+ Add Persona</button>
    </div>
    <div id="list-personas"><p class="info-msg">Loading…</p></div>
  </div>

  <div id="content-agents" class="tab-content ${this.activeTab === 'agents' ? 'active' : ''}">
    <div class="toolbar">
      <span></span>
      <button class="btn-primary" data-action="open-setup">Open Setup</button>
    </div>
    <div id="list-agents"><p class="info-msg">Loading…</p></div>
  </div>

  <div id="content-mcps" class="tab-content ${this.activeTab === 'mcps' ? 'active' : ''}">
    <div id="list-mcps"><p class="info-msg">Loading…</p></div>
  </div>

  <div id="content-sync" class="tab-content ${this.activeTab === 'sync' ? 'active' : ''}">
    <div class="toolbar">
      <span></span>
      <button class="btn-primary" data-action="sync-all">Sync All</button>
    </div>
    <div id="sync-result"><p class="info-msg">Loading…</p></div>
  </div>

  <script nonce="${nonce}">
    ${baseScript}

    let activeTab = '${this.activeTab}';

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        activeTab = tab;

        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        const content = document.getElementById('content-' + tab);
        if (content) { content.classList.add('active'); }

        hideForm();
        postMsg('switchTab', { tab });
      });
    });

    // Handle messages from host
    window.addEventListener('message', event => {
      const msg = event.data;
      switch (msg.type) {
        case 'updateItems': {
          const el = document.getElementById('list-' + msg.tab);
          if (el) { el.innerHTML = msg.html; }
          break;
        }
        case 'showForm': {
          document.getElementById('form-area').innerHTML = msg.html;
          break;
        }
        case 'updateAgents': {
          document.getElementById('list-agents').innerHTML = msg.html;
          break;
        }
        case 'updateMcps': {
          document.getElementById('list-mcps').innerHTML = msg.html;
          break;
        }
        case 'updateSync': {
          document.getElementById('sync-result').innerHTML = msg.html;
          break;
        }
        case 'error': {
          showError(msg.message);
          break;
        }
      }
    });

    function hideForm() {
      document.getElementById('form-area').innerHTML = '';
    }

    function submitForm(tab, mode, id) {
      const name = document.getElementById('form-name')?.value ?? '';
      const description = document.getElementById('form-desc')?.value ?? '';
      const content = document.getElementById('form-content')?.value ?? '';
      const trigger = document.getElementById('form-trigger')?.value;
      const fields = { name, description, content };
      if (trigger !== undefined) { fields.trigger = trigger; }

      if (mode === 'edit') {
        postMsg('editItem', { tab, id, fields });
      } else {
        postMsg('addItem', { tab, fields });
      }
      hideForm();
    }

    function showError(message) {
      const area = document.getElementById('form-area');
      area.innerHTML = '<p class="error-msg">' + escapeForHtml(message) + '</p>';
      setTimeout(() => { if (area.querySelector('.error-msg')) { area.innerHTML = ''; } }, 5000);
    }

    function escapeForHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    // Event delegation for toolbar buttons
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-action');
      if (action === 'add-item') {
        postMsg('requestForm', { tab: btn.getAttribute('data-tab') });
      } else if (action === 'edit-item') {
        postMsg('requestForm', { tab: btn.getAttribute('data-tab'), id: btn.getAttribute('data-id') });
      } else if (action === 'delete-item') {
        postMsg('deleteItem', { tab: btn.getAttribute('data-tab'), id: btn.getAttribute('data-id') });
      } else if (action === 'open-setup') {
        postMsg('openSetup');
      } else if (action === 'sync-all') {
        postMsg('syncAll');
      } else if (action === 'remove-agent') {
        postMsg('removeAgent', { id: btn.getAttribute('data-id') });
      } else if (action === 'add-mcp') {
        var name = document.getElementById('mcp-name')?.value?.trim();
        var pkg = document.getElementById('mcp-pkg')?.value?.trim();
        var port = document.getElementById('mcp-port')?.value?.trim();
        var args = document.getElementById('mcp-args')?.value?.trim();
        var env = document.getElementById('mcp-env')?.value?.trim();
        var autoStart = document.getElementById('mcp-autostart')?.checked;
        if (!name || !pkg) {
          document.getElementById('mcp-err').innerHTML = '<p class="error-msg">Name and package are required.</p>';
          return;
        }
        document.getElementById('mcp-err').innerHTML = '';
        postMsg('addMcp', { fields: { name, packageName: pkg, port: port || '3100', args: args || '', env: env || '', autoStart: String(autoStart) } });
      } else if (action === 'start-mcp') {
        postMsg('startMcp', { id: btn.getAttribute('data-id') });
      } else if (action === 'stop-mcp') {
        postMsg('stopMcp', { id: btn.getAttribute('data-id') });
      } else if (action === 'remove-mcp') {
        postMsg('removeMcp', { id: btn.getAttribute('data-id') });
      } else if (action === 'submit-form') {
        submitForm(btn.getAttribute('data-tab'), btn.getAttribute('data-mode'), btn.getAttribute('data-id'));
      } else if (action === 'cancel-form') {
        hideForm();
      }
    });

    // Event delegation for toggle checkboxes
    document.addEventListener('change', function(e) {
      var el = e.target;
      if (el.getAttribute && el.getAttribute('data-action') === 'toggle-item') {
        postMsg('toggleItem', { tab: el.getAttribute('data-tab'), id: el.getAttribute('data-id') });
      }
    });

    // Request initial content
    postMsg('requestItems', { tab: activeTab });
  </script>
</body>
</html>`;
  }
}

// -------------------------------------------------------------------
// Utility helpers
// -------------------------------------------------------------------

/** Message shape received from the webview. */
interface HubMessage {
  type: string;
  tab?: string;
  id?: string;
  fields?: Record<string, string>;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/'/g, '&#39;');
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
