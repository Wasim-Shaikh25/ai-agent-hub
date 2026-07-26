import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SyncEngine } from '../../src/core/syncEngine';
import { Registry } from '../../src/core/registry';
import { Validator } from '../../src/core/validator';
import { AgentConfigStore } from '../../src/core/agentConfig';
import { FileWriter } from '../../src/core/fileWriter';
import { PathUtils } from '../../src/utils/pathUtils';
import { Storage } from '../../src/core/storage';
import { AgentTargetConfig, TargetLocationConfig, ItemType } from '../../src/core/types';
import { setWorkspaceFolders, setConfiguration, resetVscodeMocks } from '../../__mocks__/vscode';

vi.mock('vscode', async () => import('../../__mocks__/vscode'));

class FakeStorage implements Storage {
  private data: Record<string, unknown> = {};

  load<T>(key: string): T[] {
    const raw = this.data[key];
    return Array.isArray(raw) ? (raw as T[]) : [];
  }

  save<T>(key: string, items: T[]) {
    this.data[key] = items;
    return Promise.resolve();
  }

  loadSingle<T>(key: string): T | undefined {
    return this.data[key] as T | undefined;
  }

  saveSingle<T>(key: string, value: T) {
    this.data[key] = value;
    return Promise.resolve();
  }
}

function buildTargets(skillPath: string, enabled = true): Record<ItemType, TargetLocationConfig> {
  const base: TargetLocationConfig = {
    enabled,
    path: skillPath,
    fileLayout: 'flat',
    fileExtension: 'md',
  };
  return {
    skill: { ...base },
    rule: { ...base },
    hook: { ...base, fileLayout: 'subfolder' },
    workflow: { ...base },
    persona: { ...base },
  };
}

describe('SyncEngine', () => {
  let tmpDir: string;
  let storage: FakeStorage;
  let registry: Registry;
  let agentConfig: AgentConfigStore;
  let syncEngine: SyncEngine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-agent-hub-sync-'));
    storage = new FakeStorage();
    registry = new Registry(storage as unknown as Storage, new Validator(process.cwd()));
    registry.initialize(process.cwd());
    agentConfig = new AgentConfigStore(storage as unknown as Storage);
    const fileWriter = new FileWriter(new PathUtils());
    syncEngine = new SyncEngine(
      registry,
      agentConfig,
      fileWriter,
      storage as unknown as Storage,
      undefined,
      process.cwd(),
      undefined,
      undefined,
      undefined,
      new PathUtils(),
    );
    setWorkspaceFolders([{ uri: { fsPath: tmpDir }, index: 0, name: 'project' }]);
    setConfiguration({ 'autoSync.confirmBeforeSync': false });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    resetVscodeMocks();
  });

  it('syncs an enabled item to the configured agent target', async () => {
    registry.addItem('skill', {
      name: 'Test Skill',
      type: 'skill',
      description: '',
      content: 'Use clear names.',
      format: 'markdown',
      enabled: true,
    });

    const config: AgentTargetConfig = {
      id: 'cursor',
      displayName: 'Cursor',
      extensionId: 'cursor.cursor',
      enabled: true,
      autoSync: false,
      targets: buildTargets('.cursor/rules'),
    };
    agentConfig.save(config);

    const result = await syncEngine.sync();

    const agent = result.agentResults.find((r) => r.agentName === 'Cursor');
    expect(agent).toBeDefined();
    expect(agent?.filesWritten.length).toBeGreaterThan(0);
    expect(agent?.errors).toHaveLength(0);
    expect(fs.existsSync(path.join(tmpDir, '.cursor', 'rules', 'test-skill.md'))).toBe(true);
  });

  it('skips disabled items and disabled agent targets', async () => {
    registry.addItem('rule', {
      name: 'Disabled Rule',
      type: 'rule',
      description: '',
      content: '',
      format: 'markdown',
      enabled: false,
    });

    const config: AgentTargetConfig = {
      id: 'kiro',
      displayName: 'Kiro',
      extensionId: 'kiro.kiro',
      enabled: false,
      autoSync: false,
      targets: buildTargets('.kiro/steering'),
    };
    agentConfig.save(config);

    const result = await syncEngine.sync();

    expect(result.agentResults).toHaveLength(0);
    expect(fs.existsSync(path.join(tmpDir, '.kiro', 'steering'))).toBe(false);
  });

  it('reports unsafe target paths as errors instead of writing outside the workspace', async () => {
    registry.addItem('skill', {
      name: 'Bad Skill',
      type: 'skill',
      description: '',
      content: '',
      format: 'markdown',
      enabled: true,
    });

    const config: AgentTargetConfig = {
      id: 'malicious',
      displayName: 'Malicious',
      extensionId: 'x.y',
      enabled: true,
      autoSync: false,
      targets: buildTargets('../outside'),
    };
    agentConfig.save(config);

    const result = await syncEngine.sync();

    const agent = result.agentResults.find((r) => r.agentName === 'Malicious');
    expect(agent?.filesWritten).toHaveLength(0);
    expect(agent?.errors.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(path.dirname(tmpDir), 'outside'))).toBe(false);
  });
});
