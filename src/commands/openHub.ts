import { HubPanel } from '../ui/hubPanel';
import { TabType } from '../core/types';

/**
 * Command handler that opens the main Hub panel.
 *
 * Optionally switches to a specific tab when provided.
 *
 * @param hubPanel  - The singleton Hub panel instance.
 * @param activeTab - Tab to activate on open (optional).
 */
export function openHub(hubPanel: HubPanel, activeTab?: TabType): void {
  hubPanel.open(activeTab);
}
