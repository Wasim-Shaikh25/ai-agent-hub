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
import { RepoSyncStore } from './core/repoSyncStore';
import { McpStore } from './core/mcpStore';
import { McpManager } from './core/mcpManager';
import { HubClient } from './core/hubClient';
import { UniversalMcpProxy } from './core/universalMcpProxy';
import {
  connectServer,
  connectAgentsToHub,
  pullFromHub,
  startUniversalMcpProxy,
} from './commands/hubServer';
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
    const validator = new Validator(context.extensionPath);
    const registry = new Registry(storage, validator);
    const agentDetector = new AgentDetector();
    const agentConfig = new AgentConfigStore(storage);
    const fileWriter = new FileWriter(pathUtils);
    const hubUpdater = new HubUpdater(context.globalStorageUri.fsPath);
    const repoSyncStore = new RepoSyncStore(storage);
    const mcpStore = new McpStore(storage);
    const mcpManager = new McpManager();
    const hubClient = new HubClient(context);
    const universalProxy = new UniversalMcpProxy();
    const syncEngine = new SyncEngine(
      registry,
      agentConfig,
      fileWriter,
      storage,
      hubUpdater,
      context.extensionPath,
      repoSyncStore,
      mcpStore,
      mcpManager,
      pathUtils,
      context.globalStorageUri.fsPath,
    );

    // Load builtin content from hub-content/ (bundled + global storage overrides)
    registry.initialize(context.extensionPath, context.globalStorageUri.fsPath);

    // Auto-start MCP servers configured for auto-start
    for (const mcpConfig of mcpStore.getAll().filter((s) => s.autoStart)) {
      mcpManager
        .start(mcpConfig)
        .catch((err) =>
          logger.error(
            `Failed to auto-start MCP "${mcpConfig.name}": ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    }

    // Create UI panels
    const setupPanel = new SetupPanel(
      context.extensionUri,
      agentConfig,
      pathUtils,
      repoSyncStore,
      validator,
    );
    setupPanel.setSyncCallback(async () => {
      await syncEngine.sync();
    });
    const hubPanel = new HubPanel(
      context.extensionUri,
      registry,
      agentConfig,
      syncEngine,
      storage,
      mcpStore,
      mcpManager,
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
      vscode.commands.registerCommand('aiAgentHub.syncToAgents', () => syncToAgents(syncEngine)),
      vscode.commands.registerCommand('aiAgentHub.showAgents', () =>
        showAgents(agentConfig, setupPanel),
      ),
      vscode.commands.registerCommand('aiAgentHub.connectServer', () => connectServer(hubClient)),
      vscode.commands.registerCommand('aiAgentHub.connectAgentsToHub', () =>
        connectAgentsToHub(hubClient),
      ),
      vscode.commands.registerCommand('aiAgentHub.startUniversalMcpProxy', () =>
        startUniversalMcpProxy(universalProxy, hubClient, agentConfig, fileWriter),
      ),
      vscode.commands.registerCommand('aiAgentHub.pullFromHub', () => pullFromHub(hubClient)),
    );

    // Dispose panels and logger when the extension deactivates
    context.subscriptions.push({
      dispose: () => {
        hubPanel.dispose();
        setupPanel.dispose();
        universalProxy.stop();
        mcpManager.stopAll();
        logger.dispose();
      },
    });

    logger.info('AI Agent Hub activated successfully.');
  } catch (err) {
    logger.error(`Activation failed: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

/** Extension deactivation hook. */
export function deactivate(): void {
  // Cleanup is handled by the disposable registered in activate().
}
