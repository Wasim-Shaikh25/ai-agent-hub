import { randomUUID } from 'crypto';
import { Storage } from './storage';
import { McpServerConfig } from './types';

const STORAGE_KEY = 'mcpServers';

/**
 * CRUD store for {@link McpServerConfig} records.
 *
 * MCP servers are developer-only — only users who explicitly
 * add them can manage them. They are never written to IDE
 * config folders; the Hub runs them internally and exposes
 * them via generated rule files.
 */
export class McpStore {
  constructor(private readonly storage: Storage) {}

  getAll(): McpServerConfig[] {
    return this.storage.load<McpServerConfig>(STORAGE_KEY);
  }

  get(id: string): McpServerConfig | undefined {
    return this.getAll().find((s) => s.id === id);
  }

  add(fields: Omit<McpServerConfig, 'id' | 'developerOnly' | 'createdAt' | 'updatedAt'>): McpServerConfig {
    if (!fields.name?.trim()) throw new Error('MCP server name is required');
    if (!fields.packageName?.trim()) throw new Error('Package name is required');
    if (!fields.port || fields.port < 1024 || fields.port > 65535) {
      throw new Error('Port must be between 1024 and 65535');
    }

    const existing = this.getAll();
    if (existing.some((s) => s.port === fields.port)) {
      throw new Error(`Port ${fields.port} is already in use by another MCP server`);
    }

    const now = new Date().toISOString();
    const config: McpServerConfig = {
      ...fields,
      id: randomUUID(),
      developerOnly: true,
      createdAt: now,
      updatedAt: now,
    };

    const all = this.getAll();
    all.push(config);
    this.storage.save(STORAGE_KEY, all);
    return config;
  }

  update(id: string, fields: Partial<Omit<McpServerConfig, 'id' | 'developerOnly' | 'createdAt'>>): McpServerConfig {
    const all = this.getAll();
    const idx = all.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`MCP server "${id}" not found`);
    all[idx] = { ...all[idx], ...fields, updatedAt: new Date().toISOString() };
    this.storage.save(STORAGE_KEY, all);
    return all[idx];
  }

  remove(id: string): void {
    const all = this.getAll().filter((s) => s.id !== id);
    this.storage.save(STORAGE_KEY, all);
  }
}
