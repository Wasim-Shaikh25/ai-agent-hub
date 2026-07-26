import { describe, it, expect, beforeEach } from 'vitest';
import { AgentDetector } from '../../src/core/agentDetector';
import { setAppName, setExtension, resetVscodeMocks } from '../../__mocks__/vscode';

vi.mock('vscode', async () => import('../../__mocks__/vscode'));

describe('AgentDetector', () => {
  beforeEach(() => {
    resetVscodeMocks();
  });

  it('detects Cursor when the IDE name matches', () => {
    setAppName('Cursor 0.42.0');
    const detector = new AgentDetector();
    const candidates = detector.detect();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].displayName).toBe('Cursor');
    expect(candidates[0].confidence).toBe('high');
  });

  it('detects installed AI agent extensions in VS Code', () => {
    setAppName('Visual Studio Code');
    setExtension('github.copilot', true);
    const detector = new AgentDetector();
    const candidates = detector.detect();
    expect(candidates.some((c) => c.displayName === 'GitHub Copilot')).toBe(true);
  });

  it('skips the Hub extension itself', () => {
    setAppName('Visual Studio Code');
    setExtension('ai-agent-hub', true);
    const detector = new AgentDetector('ai-agent-hub');
    const candidates = detector.detect();
    expect(candidates.some((c) => c.extensionId === 'ai-agent-hub')).toBe(false);
  });

  it('does not duplicate an IDE-native agent and its extension', () => {
    setAppName('Cursor');
    setExtension('cursor.cursor', true);
    const detector = new AgentDetector();
    const candidates = detector.detect();
    const cursorCandidates = candidates.filter((c) => c.displayName === 'Cursor');
    expect(cursorCandidates).toHaveLength(1);
  });
});
