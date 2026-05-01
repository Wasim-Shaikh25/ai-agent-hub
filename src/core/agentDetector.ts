import * as vscode from 'vscode';
import { DetectedAgentCandidate } from './types';

/**
 * Known AI agent extension IDs mapped to their display names.
 * These are checked when running in standard VS Code to see
 * if a known AI agent extension is installed.
 */
const KNOWN_AGENT_EXTENSIONS: ReadonlyArray<{
  extensionId: string;
  displayName: string;
}> = [
  { extensionId: 'github.copilot', displayName: 'GitHub Copilot' },
  { extensionId: 'github.copilot-chat', displayName: 'GitHub Copilot Chat' },
  { extensionId: 'amazonwebservices.amazon-q-vscode', displayName: 'Amazon Q' },
  { extensionId: 'amazonwebservices.aws-toolkit-vscode', displayName: 'AWS Toolkit (Amazon Q)' },
];

/**
 * IDE name patterns mapped to the AI agent they ship with.
 * Detected via `vscode.env.appName`.
 */
const IDE_AGENTS: ReadonlyArray<{
  pattern: RegExp;
  displayName: string;
  extensionId: string;
}> = [
  { pattern: /kiro/i, displayName: 'Kiro', extensionId: 'kiro.kiroAgent' },
  { pattern: /cursor/i, displayName: 'Cursor', extensionId: 'cursor.cursor' },
  { pattern: /windsurf/i, displayName: 'Windsurf', extensionId: 'windsurf.windsurf' },
];

/**
 * Detects the AI agent running in the current IDE.
 *
 * Strategy:
 * 1. Check `vscode.env.appName` to identify the IDE
 *    (Kiro, Cursor, Windsurf). If matched, return that
 *    agent — it's guaranteed to be present.
 * 2. If running in standard VS Code, scan installed
 *    extensions for known AI agents (Copilot, Amazon Q).
 * 3. Only return very high probability matches.
 */
export class AgentDetector {
  private readonly ownExtensionId: string;

  constructor(ownExtensionId = 'ai-agent-hub') {
    this.ownExtensionId = ownExtensionId;
  }

  detect(): DetectedAgentCandidate[] {
    const candidates: DetectedAgentCandidate[] = [];
    const appName = vscode.env.appName ?? '';

    // 1. Check if the IDE itself is an AI agent
    for (const ide of IDE_AGENTS) {
      if (ide.pattern.test(appName)) {
        candidates.push({
          extensionId: ide.extensionId,
          displayName: ide.displayName,
          description: `Detected as the native AI agent for ${appName}`,
          confidence: 'high',
        });
        // IDE-native agent found — this is the primary one
        break;
      }
    }

    // 2. Check for known AI agent extensions installed in this IDE
    for (const known of KNOWN_AGENT_EXTENSIONS) {
      if (known.extensionId === this.ownExtensionId) {
        continue;
      }
      const ext = vscode.extensions.getExtension(known.extensionId);
      if (ext) {
        // Avoid duplicates if IDE agent was already added
        if (!candidates.some((c) => c.extensionId === known.extensionId)) {
          const pkg = ext.packageJSON as Record<string, unknown> | undefined;
          const desc = String(pkg?.description ?? '');
          candidates.push({
            extensionId: known.extensionId,
            displayName: known.displayName,
            description: desc || 'Installed AI agent extension',
            confidence: 'high',
          });
        }
      }
    }

    return candidates;
  }
}
