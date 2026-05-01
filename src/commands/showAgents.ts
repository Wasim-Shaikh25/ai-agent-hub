import * as vscode from 'vscode';
import { AgentConfigStore } from '../core/agentConfig';
import { SetupPanel } from '../ui/setupPanel';
import { AgentTargetConfig } from '../core/types';

/** Quick-pick item extended with the underlying config. */
interface AgentQuickPickItem extends vscode.QuickPickItem {
  config: AgentTargetConfig;
}

/**
 * Command handler that shows a quick-pick list of saved
 * agent configurations. Selecting an agent opens the Setup
 * panel pre-populated with that agent's config.
 */
export async function showAgents(
  agentConfig: AgentConfigStore,
  setupPanel: SetupPanel,
): Promise<void> {
  const configs = agentConfig.getAll();

  if (configs.length === 0) {
    vscode.window.showInformationMessage(
      'No agents configured. Run "AI Agent Hub: Setup" first.',
    );
    return;
  }

  const items: AgentQuickPickItem[] = configs.map((c) => ({
    label: c.displayName,
    description: c.extensionId,
    detail: c.enabled ? 'Enabled' : 'Disabled',
    config: c,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select an agent to configure',
  });

  if (selected) {
    setupPanel.openForAgent(selected.config);
  }
}
