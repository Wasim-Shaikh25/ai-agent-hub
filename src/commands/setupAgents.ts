import { AgentDetector } from '../core/agentDetector';
import { SetupPanel } from '../ui/setupPanel';

/**
 * Command handler that detects installed AI agent extensions
 * and opens the Setup panel with the results.
 *
 * @param agentDetector - Scans installed extensions for AI agents.
 * @param setupPanel    - The Setup panel to display candidates.
 */
export function setupAgents(agentDetector: AgentDetector, setupPanel: SetupPanel): void {
  const candidates = agentDetector.detect();
  setupPanel.open(candidates);
}
