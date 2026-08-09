import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Validator } from '../../src/core/validator';

describe('Validator', () => {
  let emptyDir: string;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-agent-hub-validator-'));
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });

  it('returns a validation error when the schema is missing', () => {
    const validator = new Validator(emptyDir);
    const errors = validator.validate('skill', { name: 'Test' });

    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('/');
    expect(errors[0].message).toContain('Schema not loaded');
  });

  it('validates data when the schema is present', () => {
    const validator = new Validator(process.cwd());
    const errors = validator.validate('skill', {
      id: 'skill-1',
      name: 'Test Skill',
      type: 'skill',
      source: 'user',
      enabled: true,
      description: '',
      content: 'Use clear names.',
      format: 'markdown',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(errors).toHaveLength(0);
  });
});
