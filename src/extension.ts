import * as vscode from 'vscode';
import { Logger } from './utils/logger';
import { PathUtils } from './utils/pathUtils';
import { Storage } from './core/storage';
import { Registry } from './core/registry';
import { Validator } from './core/validator';
import { AgentDetector } from './core/agentDetector';
import { AgentConfigStore } from './core/agentConfig';
import { FileWriter } from './core/fileWriter';
import { SyncEngine } from './core/syncEngine';
import { HubUpdater } from './core/hubUpdater';
import { HubPanel } from './ui/hubPanel';
import { SetupPanel } from './ui/setupPanel';
import { openHub } from './commands/openHub';
import { setupAgents } from './commands/setupAgents';
import { addSkill } from './commands/addSkill';
import { addRule } from './commands/addRule';
import { addHook } from './commands/addHook';
import { syncToAgents } from './commands/syncToAgents';
import { showAgents } from './commands/showAgents';

/**
 * Extension activation entry point.
 *
 * Creates all core services, wires dependencies, registers
 * the eight commands, and initialises the Registry with
 * builtin content from `hub-content/`.
 */
export function activate(context: vscode.ExtensionContext): void {
  const logger = new Logger();

  try {
    const storage = new Storage(context);
    const pathUtils = new PathUtils();
    const registry = new Registry(storage);
    const _validator = new Validator(context.extensionPath);
    const agentDetector = new AgentDetector();
    const agentConfig = new AgentConfigStore(storage);
    const fileWriter = new FileWriter(pathUtils);
    const hubUpdater = new HubUpdater(context.globalStorageUri.fsPath);
    const syncEngine = new SyncEngine(
      registry,
      agentConfig,
      fileWriter,
      storage,
      hubUpdater,
      context.extensionPath,
    );

    // Load builtin content from hub-content/
    registry.initialize(context.extensionPath);

    // Create UI panels
    const setupPanel = new SetupPanel(context.extensionUri, agentConfig, pathUtils);
    setupPanel.setSyncCallback(async () => {
      await syncEngine.sync();
    });
    const hubPanel = new HubPanel(
      context.extensionUri,
      registry,
      agentConfig,
      syncEngine,
      storage,
      () => setupAgents(agentDetector, setupPanel),
    );

    // Register all eight commands
    context.subscriptions.push(
      vscode.commands.registerCommand('aiAgentHub.open', () => openHub(hubPanel)),
      vscode.commands.registerCommand('aiAgentHub.setup', () =>
        setupAgents(agentDetector, setupPanel),
      ),
      vscode.commands.registerCommand('aiAgentHub.addSkill', () => addSkill(registry)),
      vscode.commands.registerCommand('aiAgentHub.addRule', () => addRule(registry)),
      vscode.commands.registerCommand('aiAgentHub.addHook', () => addHook(registry)),
      vscode.commands.registerCommand('aiAgentHub.syncToAgents', () =>
        syncToAgents(syncEngine),
      ),
      vscode.commands.registerCommand('aiAgentHub.showAgents', () =>
        showAgents(agentConfig, setupPanel),
      ),
    );

    // Dispose panels and logger when the extension deactivates
    context.subscriptions.push({
      dispose: () => {
        hubPanel.dispose();
        setupPanel.dispose();
        logger.dispose();
      },
    });

    logger.info('AI Agent Hub activated successfully.');
  } catch (err) {
    logger.error(
      `Activation failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    throw err;
  }
}

/** Extension deactivation hook. */
export function deactivate(): void {
  // Cleanup is handled by the disposable registered in activate().
}
