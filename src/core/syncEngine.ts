import * as vscode from 'vscode';
import { Registry } from './registry';
import { AgentConfigStore } from './agentConfig';
import { FileWriter } from './fileWriter';
import { Storage } from './storage';
import { ItemType, SyncResult, AgentSyncResult } from './types';

/** The three content categories processed during a sync. */
const ITEM_TYPES: readonly ItemType[] = ['skill', 'rule', 'hook'];

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
      return { timestamp: new Date().toISOString(), agentResults: [] };
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
        return { timestamp: new Date().toISOString(), agentResults: [] };
      }
    }

    this.syncing = true;
    const agentResults: AgentSyncResult[] = [];

    try {
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
    } finally {
      this.syncing = false;
    }

    const syncResult: SyncResult = {
      timestamp: new Date().toISOString(),
      agentResults,
    };

    // Persist last sync result for the Sync tab
    this.storage.saveSingle('lastSyncResult', syncResult);

    return syncResult;
  }
}
