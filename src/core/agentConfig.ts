import { Storage } from './storage';
import { AgentTargetConfig } from './types';

/**
 * CRUD store for {@link AgentTargetConfig} records.
 *
 * Persists the full list under the `agentConfigs` key
 * via {@link Storage} (which prefixes it with
 * `ai-agent-hub.`).
 */
export class AgentConfigStore {
  private static readonly STORAGE_KEY = 'agentConfigs';

  constructor(private readonly storage: Storage) {}

  /** Returns every saved agent configuration. */
  getAll(): AgentTargetConfig[] {
    return this.storage.load<AgentTargetConfig>(
      AgentConfigStore.STORAGE_KEY,
    );
  }

  /** Returns only the configurations whose `enabled` flag is `true`. */
  getEnabled(): AgentTargetConfig[] {
    return this.getAll().filter((c) => c.enabled);
  }

  /** Finds a single configuration by `id`, or `undefined`. */
  get(id: string): AgentTargetConfig | undefined {
    return this.getAll().find((c) => c.id === id);
  }

  /**
   * Creates or updates a configuration.
   *
   * If a config with the same `id` already exists it is
   * replaced; otherwise the new config is appended.
   */
  save(config: AgentTargetConfig): void {
    const all = this.getAll();
    const index = all.findIndex((c) => c.id === config.id);
    if (index >= 0) {
      all[index] = config;
    } else {
      all.push(config);
    }
    this.storage.save(AgentConfigStore.STORAGE_KEY, all);
  }

  /** Removes the configuration with the given `id`. */
  delete(id: string): void {
    const all = this.getAll().filter((c) => c.id !== id);
    this.storage.save(AgentConfigStore.STORAGE_KEY, all);
  }
}
