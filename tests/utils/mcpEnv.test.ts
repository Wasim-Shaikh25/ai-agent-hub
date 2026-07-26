import { describe, it, expect } from 'vitest';
import {
  parseEnvString,
  parseArgsString,
  isValidNpmPackageName,
  isValidMcpArg,
  validateMcpServerFields,
} from '../../src/utils/mcpEnv';

describe('mcpEnv', () => {
  describe('parseEnvString', () => {
    it('parses simple KEY=VALUE pairs', () => {
      const result = parseEnvString('FOO=bar BAZ=qux');
      expect(result.errors).toHaveLength(0);
      expect(result.env).toEqual({ FOO: 'bar', BAZ: 'qux' });
    });

    it('handles quoted values with spaces', () => {
      const result = parseEnvString('FOO="hello world" BAZ=\'single quoted\'');
      expect(result.errors).toHaveLength(0);
      expect(result.env).toEqual({ FOO: 'hello world', BAZ: 'single quoted' });
    });

    it('rejects invalid keys', () => {
      const result = parseEnvString('123=value');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.env).toEqual({});
    });

    it('reports unbalanced quotes', () => {
      const result = parseEnvString('FOO="unclosed');
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('parseArgsString', () => {
    it('splits space-separated args', () => {
      const result = parseArgsString('--verbose --port 3000');
      expect(result.errors).toHaveLength(0);
      expect(result.args).toEqual(['--verbose', '--port', '3000']);
    });

    it('preserves quoted tokens', () => {
      const result = parseArgsString('--path="C:\\Program Files\\foo"');
      expect(result.errors).toHaveLength(0);
      expect(result.args).toEqual(['--path=C:\\Program Files\\foo']);
    });
  });

  describe('isValidNpmPackageName', () => {
    it('accepts valid unscoped names', () => {
      expect(isValidNpmPackageName('@modelcontextprotocol/server-github')).toBe(true);
      expect(isValidNpmPackageName('mcp-server-filesystem')).toBe(true);
    });

    it('rejects names with shell metacharacters', () => {
      expect(isValidNpmPackageName('foo; rm -rf /')).toBe(false);
      expect(isValidNpmPackageName('foo|bar')).toBe(false);
    });
  });

  describe('isValidMcpArg', () => {
    it('accepts ordinary flags', () => {
      expect(isValidMcpArg('--verbose')).toBe(true);
      expect(isValidMcpArg('--dir=/tmp/foo')).toBe(true);
    });

    it('rejects shell metacharacters', () => {
      expect(isValidMcpArg('foo;bar')).toBe(false);
      expect(isValidMcpArg('foo|bar')).toBe(false);
      expect(isValidMcpArg('foo`bar`')).toBe(false);
    });
  });

  describe('validateMcpServerFields', () => {
    it('returns no errors for a valid config', () => {
      const errors = validateMcpServerFields(
        'GitHub MCP',
        '@modelcontextprotocol/server-github',
        ['--verbose'],
        { GITHUB_TOKEN: 'abc' },
      );
      expect(errors).toHaveLength(0);
    });

    it('catches unsafe package names and arguments', () => {
      const errors = validateMcpServerFields('X', 'foo;bar', ['ok', 'bad;arg'], {});
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('package'))).toBe(true);
      expect(errors.some((e) => e.includes('argument'))).toBe(true);
    });
  });
});
