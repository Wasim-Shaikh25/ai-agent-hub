import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Registry } from './registry';
import { AgentConfigStore } from './agentConfig';
import { RepoSyncStore } from './repoSyncStore';
import { FileWriter } from './fileWriter';
import { Storage } from './storage';
import { HubUpdater } from './hubUpdater';
import { McpStore } from './mcpStore';
import { McpManager } from './mcpManager';
import { ItemType, SyncResult, AgentSyncResult, RepoSyncResult } from './types';

/** The three content categories processed during a sync. */
const ITEM_TYPES: readonly ItemType[] = ['skill', 'rule', 'hook', 'workflow', 'persona'];

/**
 * Orchestrates syncing enabled Hub items to all enabled
 * agent target locations.
 *
 * Iterates over every enabled {@link AgentTargetConfig},
 * checks each content-type target within it, and delegates
 * the actual file writing to {@link FileWriter}. Errors are
 * collected per agent/content-type rather than aborting the
 * entire sync.
 *
 * A simple boolean lock prevents concurrent syncs.
 */
export class SyncEngine {
  private syncing = false;

  constructor(
    private readonly registry: Registry,
    private readonly agentConfig: AgentConfigStore,
    private readonly fileWriter: FileWriter,
    private readonly storage: Storage,
    private readonly hubUpdater?: HubUpdater,
    private readonly extensionPath?: string,
    private readonly repoSyncStore?: RepoSyncStore,
    private readonly mcpStore?: McpStore,
    private readonly mcpManager?: McpManager,
  ) {}

  /**
   * Syncs all enabled items to all enabled agent targets.
   *
   * @returns A detailed {@link SyncResult} describing what
   *          was written and any errors encountered.
   */
  async sync(): Promise<SyncResult> {
    if (this.syncing) {
      vscode.window.showInformationMessage('A sync is already in progress.');
      return { timestamp: new Date().toISOString(), agentResults: [], repoResults: [] };
    }

    // Check confirmation setting
    const confirmSetting = vscode.workspace
      .getConfiguration('aiAgentHub')
      .get<boolean>('autoSync.confirmBeforeSync', true);

    if (confirmSetting) {
      const answer = await vscode.window.showWarningMessage(
        'Sync hub content to all configured agent targets?',
        { modal: true },
        'Sync',
      );
      if (answer !== 'Sync') {
        return { timestamp: new Date().toISOString(), agentResults: [], repoResults: [] };
      }
    }

    this.syncing = true;
    const agentResults: AgentSyncResult[] = [];
    const repoResults: RepoSyncResult[] = [];

    try {
      // Fetch latest hub content from remote before syncing
      if (this.hubUpdater && this.extensionPath) {
        const updated = await this.hubUpdater.fetchLatest(this.extensionPath);
        if (updated) {
          // Reload registry so new/changed builtin items are picked up
          this.registry.initialize(this.extensionPath);
        }
      }

      const enabledConfigs = this.agentConfig.getEnabled();

      for (const config of enabledConfigs) {
        for (const type of ITEM_TYPES) {
          const target = config.targets[type];
          if (!target || !target.enabled) {
            continue;
          }

          const enabledItems = this.registry.getEnabledItems(type);
          if (enabledItems.length === 0) {
            continue;
          }

          const result = await this.fileWriter.write(enabledItems, target, type);
          agentResults.push({
            agentName: config.displayName,
            contentType: type,
            filesWritten: result.filesWritten,
            errors: result.errors,
          });
        }
      }

      // Sync MCP-generated rules to each enabled agent target
      if (this.mcpStore && this.mcpManager) {
        const mcpServers = this.mcpStore.getAll();
        for (const config of enabledConfigs) {
          const ruleTarget = config.targets['rule'];
          if (!ruleTarget?.enabled || !ruleTarget.path) { continue; }

          for (const mcp of mcpServers) {
            const state = this.mcpManager.getState(mcp.id);
            if (state.status !== 'running') { continue; }

            const ruleContent = this.mcpManager.generateRuleMarkdown(mcp);
            const slug = mcp.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const fileName = `mcp-${slug}.md`;
            const targetPath = path.join(ruleTarget.path, fileName);

            try {
              const dir = path.dirname(targetPath);
              if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
              fs.writeFileSync(targetPath, ruleContent, 'utf-8');
              agentResults.push({
                agentName: config.displayName,
                contentType: 'rule',
                filesWritten: [targetPath],
                errors: [],
              });
            } catch (err) {
              agentResults.push({
                agentName: config.displayName,
                contentType: 'rule',
                filesWritten: [],
                errors: [`MCP rule write failed: ${err instanceof Error ? err.message : String(err)}`],
              });
            }
          }
        }
      }

      // Sync to repo-level targets
      if (this.repoSyncStore) {
        const enabledRepos = this.repoSyncStore.getEnabled();

        for (const repo of enabledRepos) {
          const agentCfg = enabledConfigs.find((c) => c.id === repo.agentTargetId);
          if (!agentCfg) {
            repoResults.push({
              repoName: repo.name,
              repoPath: repo.repoPath,
              filesWritten: [],
              errors: [`Agent target "${repo.agentTargetId}" not found`],
            });
            continue;
          }

          const filesWritten: string[] = [];
          const errors: string[] = [];

          for (const type of repo.enabledContentTypes) {
            const target = agentCfg.targets[type];
            if (!target || !target.enabled) {
              continue;
            }

            let items = this.registry.getEnabledItems(type);
            // Filter to selected items if specified
            if (repo.selectedItemIds.length > 0) {
              items = items.filter((i) => repo.selectedItemIds.includes(i.id));
            }
            if (items.length === 0) {
              continue;
            }

            const repoTarget = { ...target, path: `${repo.repoPath}/${target.path}` };
            const result = await this.fileWriter.write(items, repoTarget, type);
            filesWritten.push(...result.filesWritten);
            errors.push(...result.errors);
          }

          repoResults.push({
            repoName: repo.name,
            repoPath: repo.repoPath,
            filesWritten,
            errors,
          });
        }
      }
    } finally {
      this.syncing = false;
    }

    const syncResult: SyncResult = {
      timestamp: new Date().toISOString(),
      agentResults,
      repoResults,
    };

    // Persist last sync result for the Sync tab
    this.storage.saveSingle('lastSyncResult', syncResult);

    return syncResult;
  }
}
