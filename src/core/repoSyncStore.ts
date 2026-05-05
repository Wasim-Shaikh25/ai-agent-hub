import { randomUUID } from 'crypto';
import { Storage } from './storage';
import { RepoSyncTarget, ItemType } from './types';

const STORAGE_KEY = 'repoSyncTargets';

/**
 * Manages repo-level sync targets.
 *
 * Users can add multiple repository paths and configure which
 * content types and specific items get synced to each repo.
 */
export class RepoSyncStore {
  private targets: RepoSyncTarget[] = [];

  constructor(private readonly storage: Storage) {
    this.targets = this.storage.load<RepoSyncTarget>(STORAGE_KEY);
  }

  /** Returns all configured repo sync targets. */
  getAll(): readonly RepoSyncTarget[] {
    return this.targets;
  }

  /** Returns only enabled repo sync targets. */
  getEnabled(): readonly RepoSyncTarget[] {
    return this.targets.filter((t) => t.enabled);
  }

  /**
   * Adds a new repo sync target.
   *
   * @param name Display name for the repo.
   * @param repoPath Absolute local path to the repo root.
   * @param agentTargetId Which agent config to use for paths/layout.
   * @param enabledContentTypes Which content types to sync.
   * @param selectedItemIds Specific item IDs (empty = all enabled).
   */
  addTarget(
    name: string,
    repoPath: string,
    agentTargetId: string,
    enabledContentTypes: ItemType[],
    selectedItemIds: string[] = [],
  ): RepoSyncTarget {
    const now = new Date().toISOString();
    const target: RepoSyncTarget = {
      id: randomUUID(),
      name,
      repoPath,
      agentTargetId,
      enabledContentTypes,
      selectedItemIds,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };

    this.targets.push(target);
    this.persist();
    return target;
  }

  /** Updates an existing repo sync target. */
  updateTarget(id: string, fields: Partial<RepoSyncTarget>): RepoSyncTarget {
    const target = this.targets.find((t) => t.id === id);
    if (!target) {
      throw new Error(`Repo target with id "${id}" not found`);
    }
    Object.assign(target, fields, { updatedAt: new Date().toISOString() });
    this.persist();
    return target;
  }

  /** Removes a repo sync target. */
  removeTarget(id: string): void {
    const idx = this.targets.findIndex((t) => t.id === id);
    if (idx === -1) {
      throw new Error(`Repo target with id "${id}" not found`);
    }
    this.targets.splice(idx, 1);
    this.persist();
  }

  /** Toggles the enabled state of a repo target. */
  toggleTarget(id: string): RepoSyncTarget {
    const target = this.targets.find((t) => t.id === id);
    if (!target) {
      throw new Error(`Repo target with id "${id}" not found`);
    }
    target.enabled = !target.enabled;
    target.updatedAt = new Date().toISOString();
    this.persist();
    return target;
  }

  private persist(): void {
    this.storage.save(STORAGE_KEY, this.targets);
  }
}
