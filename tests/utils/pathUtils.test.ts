import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PathUtils } from '../../src/utils/pathUtils';
import { setWorkspaceFolders, resetVscodeMocks } from '../../__mocks__/vscode';

vi.mock('vscode', async () => import('../../__mocks__/vscode'));

describe('PathUtils', () => {
  beforeEach(() => {
    resetVscodeMocks();
  });

  describe('isUnsafePath', () => {
    it('rejects empty paths', () => {
      const utils = new PathUtils();
      expect(utils.isUnsafePath('')).toBe(true);
      expect(utils.isUnsafePath('   ')).toBe(true);
    });

    it('rejects .git and node_modules segments', () => {
      const utils = new PathUtils();
      expect(utils.isUnsafePath('.git/config')).toBe(true);
      expect(utils.isUnsafePath('foo/node_modules/bar')).toBe(true);
    });

    it('rejects paths with parent directory segments', () => {
      const utils = new PathUtils();
      expect(utils.isUnsafePath('../foo')).toBe(true);
      expect(utils.isUnsafePath('foo/../../bar')).toBe(true);
    });

    it('rejects system directories', () => {
      const utils = new PathUtils();
      expect(utils.isUnsafePath('/usr/bin')).toBe(true);
      expect(utils.isUnsafePath('C:/windows/system32')).toBe(true);
    });

    it('accepts ordinary relative paths', () => {
      const utils = new PathUtils();
      expect(utils.isUnsafePath('.cursor/rules')).toBe(false);
      expect(utils.isUnsafePath('.kiro/steering')).toBe(false);
    });
  });

  describe('resolveSafeTarget', () => {
    it('resolves a relative path within the base directory', () => {
      const utils = new PathUtils();
      const result = utils.resolveSafeTarget('/workspace', '.cursor/rules');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.absolutePath).toBe('/workspace/.cursor/rules');
      }
    });

    it('rejects a path that escapes the base directory', () => {
      const utils = new PathUtils();
      const result = utils.resolveSafeTarget('/workspace', '../etc/passwd');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('escapes');
      }
    });

    it('rejects an absolute path outside the base', () => {
      const utils = new PathUtils();
      const result = utils.resolveSafeTarget('/workspace', '/etc/passwd');
      expect(result.ok).toBe(false);
    });

    it('rejects unsafe resolved paths', () => {
      const utils = new PathUtils();
      const result = utils.resolveSafeTarget('/workspace', 'node_modules/foo');
      expect(result.ok).toBe(false);
    });
  });

  describe('resolveWorkspaceTarget', () => {
    it('uses the first workspace folder as the base', () => {
      setWorkspaceFolders([{ uri: { fsPath: '/home/user/project' }, index: 0, name: 'project' }]);
      const utils = new PathUtils();
      const result = utils.resolveWorkspaceTarget('.cursor/rules');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.absolutePath).toBe('/home/user/project/.cursor/rules');
      }
    });

    it('fails when no workspace is open', () => {
      setWorkspaceFolders(undefined);
      const utils = new PathUtils();
      const result = utils.resolveWorkspaceTarget('.cursor/rules');
      expect(result.ok).toBe(false);
    });
  });
});
