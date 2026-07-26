import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Registry } from '../../src/core/registry';
import { Validator } from '../../src/core/validator';
import { Storage } from '../../src/core/storage';
import { AnyHubItem, ItemType } from '../../src/core/types';

vi.mock('vscode', async () => import('../../__mocks__/vscode'));

class FakeStorage {
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

describe('Registry', () => {
  let storage: FakeStorage;
  let registry: Registry;

  beforeEach(() => {
    storage = new FakeStorage();
    const validator = new Validator(process.cwd());
    registry = new Registry(storage as unknown as Storage, validator);
  });

  it('loads builtin demo skills from hub-content/', () => {
    registry.initialize(process.cwd());
    const skills = registry.getItems('skill');
    expect(skills.length).toBeGreaterThan(0);
    expect(skills[0].source).toBe('builtin');
  });

  it('adds and persists user items', () => {
    const item = registry.addItem('skill', {
      name: 'My Skill',
      type: 'skill',
      enabled: true,
      description: 'test',
      content: 'Do this.',
      format: 'markdown',
    });

    expect(item.name).toBe('My Skill');
    expect(item.source).toBe('user');
    expect(registry.getItems('skill')).toContainEqual(item);
  });

  it('rejects invalid items that fail schema validation', () => {
    expect(() =>
      registry.addItem('skill', {
        name: '',
        type: 'skill',
        enabled: true,
        description: '',
        content: '',
        format: 'markdown',
      }),
    ).toThrow('Name must not be empty');
  });

  it('validates hook triggers', () => {
    expect(() =>
      registry.addItem('hook', {
        name: 'My Hook',
        type: 'hook',
        enabled: true,
        description: '',
        content: '',
        format: 'markdown',
        trigger: 'invalid' as any,
      }),
    ).toThrow('Trigger must be one of');
  });
});
