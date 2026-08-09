import { describe, it, expect, beforeEach } from 'vitest';
import { Registry } from '../../src/core/registry';
import { Validator } from '../../src/core/validator';

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

  it('trims names and rejects whitespace-only duplicates', () => {
    registry.addItem('skill', {
      name: '  My Skill  ',
      type: 'skill',
      enabled: true,
      description: 'test',
      content: 'Do this.',
      format: 'markdown',
    });

    expect(() =>
      registry.addItem('skill', {
        name: 'my skill',
        type: 'skill',
        enabled: true,
        description: 'test',
        content: 'Do that.',
        format: 'markdown',
      }),
    ).toThrow('A skill named "my skill" already exists');
  });

  it('rejects duplicate names when adding', () => {
    registry.addItem('skill', {
      name: 'My Skill',
      type: 'skill',
      enabled: true,
      description: 'test',
      content: 'Do this.',
      format: 'markdown',
    });

    expect(() =>
      registry.addItem('skill', {
        name: 'My Skill',
        type: 'skill',
        enabled: true,
        description: 'test',
        content: 'Do that.',
        format: 'markdown',
      }),
    ).toThrow('A skill named "My Skill" already exists');
  });

  it('rejects duplicate names when updating', () => {
    const first = registry.addItem('skill', {
      name: 'First Skill',
      type: 'skill',
      enabled: true,
      description: 'test',
      content: 'Do this.',
      format: 'markdown',
    });

    registry.addItem('skill', {
      name: 'Second Skill',
      type: 'skill',
      enabled: true,
      description: 'test',
      content: 'Do that.',
      format: 'markdown',
    });

    expect(() => registry.updateItem('skill', first.id, { name: 'Second Skill' })).toThrow(
      'A skill named "Second Skill" already exists',
    );
  });

  it('allows updating an item to its own current name', () => {
    const item = registry.addItem('skill', {
      name: 'My Skill',
      type: 'skill',
      enabled: true,
      description: 'test',
      content: 'Do this.',
      format: 'markdown',
    });

    const updated = registry.updateItem('skill', item.id, { name: 'My Skill' });
    expect(updated.name).toBe('My Skill');
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
