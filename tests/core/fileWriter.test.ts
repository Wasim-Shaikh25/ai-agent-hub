import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileWriter } from '../../src/core/fileWriter';
import { PathUtils } from '../../src/utils/pathUtils';
import { TargetLocationConfig } from '../../src/core/types';

vi.mock('vscode', async () => import('../../__mocks__/vscode'));

describe('FileWriter', () => {
  let tmpDir: string;
  let fileWriter: FileWriter;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-agent-hub-'));
    fileWriter = new FileWriter(new PathUtils());
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes enabled items to the target directory', async () => {
    const target: TargetLocationConfig = {
      enabled: true,
      path: '.cursor/rules',
      fileLayout: 'flat',
      fileExtension: 'md',
    };

    const result = await fileWriter.write(
      [{ id: '1', name: 'Clean Code', type: 'skill', source: 'builtin', enabled: true, description: '', content: 'Use good names.', format: 'markdown', createdAt: '', updatedAt: '' }],
      target,
      'skill',
      tmpDir,
    );

    expect(result.errors).toHaveLength(0);
    expect(result.filesWritten).toHaveLength(1);
    expect(fs.existsSync(path.join(tmpDir, '.cursor', 'rules', 'clean-code.md'))).toBe(true);
  });

  it('rejects paths that escape the base directory', async () => {
    const target: TargetLocationConfig = {
      enabled: true,
      path: '../outside',
      fileLayout: 'flat',
      fileExtension: 'md',
    };

    const result = await fileWriter.write(
      [{ id: '1', name: 'Clean Code', type: 'skill', source: 'builtin', enabled: true, description: '', content: '', format: 'markdown', createdAt: '', updatedAt: '' }],
      target,
      'skill',
      tmpDir,
    );

    expect(result.filesWritten).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(path.dirname(tmpDir), 'outside'))).toBe(false);
  });

  it('rejects unsafe target paths', async () => {
    const target: TargetLocationConfig = {
      enabled: true,
      path: 'node_modules/malicious',
      fileLayout: 'flat',
      fileExtension: 'md',
    };

    const result = await fileWriter.write(
      [{ id: '1', name: 'Bad', type: 'skill', source: 'builtin', enabled: true, description: '', content: '', format: 'markdown', createdAt: '', updatedAt: '' }],
      target,
      'skill',
      tmpDir,
    );

    expect(result.filesWritten).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('writes mdc files for Cursor when configured', async () => {
    const target: TargetLocationConfig = {
      enabled: true,
      path: '.cursor/rules',
      fileLayout: 'flat',
      fileExtension: 'mdc',
    };

    const result = await fileWriter.write(
      [{ id: '1', name: 'Naming', type: 'rule', source: 'builtin', enabled: true, description: '', content: 'Use camelCase.', format: 'markdown', createdAt: '', updatedAt: '' }],
      target,
      'rule',
      tmpDir,
    );

    expect(result.errors).toHaveLength(0);
    expect(fs.existsSync(path.join(tmpDir, '.cursor', 'rules', 'naming.mdc'))).toBe(true);
  });
});
