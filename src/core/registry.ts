import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Storage } from './storage';
import {
  ItemType,
  HubItem,
  AnyHubItem,
  HookTrigger,
  ContentFormat,
} from './types';

const VALID_HOOK_TRIGGERS: readonly HookTrigger[] = ['before', 'after', 'always'];
const ITEM_TYPES: readonly ItemType[] = ['skill', 'rule', 'hook'];

/**
 * In-memory item store for all Hub content.
 *
 * Manages three collections (skills, rules, hooks),
 * each containing both builtin items loaded from disk and
 * user items persisted via {@link Storage}.
 */
export class Registry {
  private readonly collections: Record<ItemType, AnyHubItem[]> = {
    skill: [],
    rule: [],
    hook: [],
  };

  constructor(private readonly storage: Storage) {}

  /**
   * Loads builtin content from `hub-content/` and user
   * items from storage.
   *
   * @param extensionPath - The root path of the extension on disk.
   */
  initialize(extensionPath: string): void {
    for (const type of ITEM_TYPES) {
      // Clear existing items to avoid duplicates on re-init
      this.collections[type] = [];

      const builtinDir = path.join(extensionPath, 'hub-content', `${type}s`);
      if (fs.existsSync(builtinDir)) {
        const files = fs
          .readdirSync(builtinDir)
          .filter(
            (f) =>
              f.endsWith('.md') ||
              f.endsWith('.json') ||
              f.endsWith('.yaml') ||
              f.endsWith('.yml') ||
              f.endsWith('.txt'),
          );
        for (const file of files) {
          const content = fs.readFileSync(path.join(builtinDir, file), 'utf-8');
          const item = this.parseBuiltinFile(content, file, type);
          if (item) {
            this.collections[type].push(item);
          }
        }
      }

      const userItems = this.storage.load<AnyHubItem>(type);
      this.collections[type].push(...userItems);
    }
  }

  /** Returns all items (builtin + user) for the given type. */
  getItems(type: ItemType): readonly AnyHubItem[] {
    return this.collections[type];
  }

  /** Returns only enabled items for the given type. */
  getEnabledItems(type: ItemType): readonly AnyHubItem[] {
    return this.collections[type].filter((i) => i.enabled);
  }

  /** Returns all enabled items across every type. */
  getAllEnabledItems(): readonly AnyHubItem[] {
    return ITEM_TYPES.flatMap((type) => this.getEnabledItems(type));
  }

  /**
   * Creates a new user item and persists it.
   *
   * @throws {Error} If the name is empty or, for hooks, the trigger is invalid.
   */
  addItem(
    type: ItemType,
    fields: Omit<AnyHubItem, 'id' | 'source' | 'createdAt' | 'updatedAt'>,
  ): AnyHubItem {
    this.validateFields(type, fields);

    const now = new Date().toISOString();
    const item = {
      ...fields,
      id: randomUUID(),
      source: 'user' as const,
      type,
      enabled: fields.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    } as AnyHubItem;

    this.collections[type].push(item);
    this.persist(type);
    return item;
  }

  /**
   * Updates a user item in-place and persists the change.
   *
   * @throws {Error} If the item is not found or is builtin.
   */
  updateItem(type: ItemType, id: string, fields: Partial<AnyHubItem>): AnyHubItem {
    const item = this.findOrThrow(type, id);
    if (item.source === 'builtin') {
      throw new Error('Cannot edit a built-in item');
    }
    Object.assign(item, fields, { updatedAt: new Date().toISOString() });
    this.persist(type);
    return item;
  }

  /**
   * Deletes a user item from the collection and persists.
   *
   * @throws {Error} If the item is not found or is builtin.
   */
  deleteItem(type: ItemType, id: string): void {
    const item = this.findOrThrow(type, id);
    if (item.source === 'builtin') {
      throw new Error('Cannot delete a built-in item');
    }
    const col = this.collections[type];
    col.splice(col.indexOf(item), 1);
    this.persist(type);
  }

  /**
   * Toggles the enabled flag of any item (builtin or user).
   * Only user items are persisted after toggling.
   */
  toggleItem(type: ItemType, id: string): AnyHubItem {
    const item = this.findOrThrow(type, id);
    item.enabled = !item.enabled;
    item.updatedAt = new Date().toISOString();
    if (item.source === 'user') {
      this.persist(type);
    }
    return item;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private validateFields(type: ItemType, fields: Record<string, unknown>): void {
    if (!fields.name || String(fields.name).trim().length === 0) {
      throw new Error('Name must not be empty');
    }
    if (type === 'hook') {
      const trigger = (fields as { trigger?: string }).trigger;
      if (!trigger || !VALID_HOOK_TRIGGERS.includes(trigger as HookTrigger)) {
        throw new Error('Trigger must be one of: before, after, always');
      }
    }
  }

  private findOrThrow(type: ItemType, id: string): AnyHubItem {
    const item = this.collections[type].find((i) => i.id === id);
    if (!item) {
      throw new Error(`Item with id "${id}" not found`);
    }
    return item;
  }

  /** Persists only user items for the given type. */
  private persist(type: ItemType): void {
    const userItems = this.collections[type].filter((i) => i.source === 'user');
    this.storage.save(type, userItems);
  }

  /**
   * Parses a builtin file with optional YAML-like frontmatter.
   *
   * Frontmatter is delimited by `---` lines at the start of
   * the file. Only simple `key: value` pairs are supported.
   */
  private parseBuiltinFile(
    content: string,
    fileName: string,
    type: ItemType,
  ): AnyHubItem | null {
    const frontmatter: Record<string, string> = {};
    let body = content;

    if (content.startsWith('---')) {
      const endIndex = content.indexOf('---', 3);
      if (endIndex !== -1) {
        const fmBlock = content.substring(3, endIndex).trim();
        body = content.substring(endIndex + 3).trim();
        for (const line of fmBlock.split('\n')) {
          const colonIdx = line.indexOf(':');
          if (colonIdx !== -1) {
            const key = line.substring(0, colonIdx).trim();
            const value = line.substring(colonIdx + 1).trim();
            frontmatter[key] = value;
          }
        }
      }
    }

    const id = frontmatter['id'] || fileName.replace(/\.[^.]+$/, '');
    const name = frontmatter['name'] || fileName;
    const description = frontmatter['description'] || '';
    const enabled = frontmatter['enabled'] !== 'false';
    const format: ContentFormat = fileName.endsWith('.json')
      ? 'json'
      : fileName.endsWith('.yaml') || fileName.endsWith('.yml')
        ? 'yaml'
        : fileName.endsWith('.md')
          ? 'markdown'
          : 'plaintext';

    const now = new Date().toISOString();
    const base: HubItem = {
      id,
      name,
      type,
      source: 'builtin',
      enabled,
      description,
      content: body,
      format,
      createdAt: now,
      updatedAt: now,
    };

    if (type === 'hook') {
      const trigger = (frontmatter['trigger'] as HookTrigger) || 'always';
      return { ...base, type: 'hook', trigger } as AnyHubItem;
    }

    return { ...base, type } as AnyHubItem;
  }
}
