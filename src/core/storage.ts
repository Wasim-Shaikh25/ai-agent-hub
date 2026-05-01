import * as vscode from 'vscode';

/**
 * Persistence layer backed by VS Code Memento storage.
 *
 * Uses `workspaceState` when a workspace is open, falling
 * back to `globalState` when no workspace is available.
 * All keys are prefixed with `ai-agent-hub.` to avoid
 * collisions with other extensions.
 */
export class Storage {
  private readonly state: vscode.Memento;

  constructor(context: vscode.ExtensionContext) {
    const hasWorkspace =
      vscode.workspace.workspaceFolders !== undefined &&
      vscode.workspace.workspaceFolders.length > 0;
    this.state = hasWorkspace ? context.workspaceState : context.globalState;
  }

  /**
   * Loads an array of items from storage.
   *
   * @param key - Storage key (without the `ai-agent-hub.` prefix).
   * @returns The stored array, or an empty array when the key
   *          is missing or the stored value is not an array.
   */
  load<T>(key: string): T[] {
    const raw = this.state.get<unknown>(`ai-agent-hub.${key}`);
    if (raw === undefined) {
      return [];
    }
    if (!Array.isArray(raw)) {
      console.warn(`Storage: corrupt data for key "ai-agent-hub.${key}"`);
      return [];
    }
    return raw as T[];
  }

  /**
   * Persists an array of items to storage.
   *
   * @param key   - Storage key (without the `ai-agent-hub.` prefix).
   * @param items - The array to persist.
   */
  save<T>(key: string, items: T[]): Thenable<void> {
    return this.state.update(`ai-agent-hub.${key}`, items);
  }

  /**
   * Loads a single value from storage.
   *
   * @param key - Storage key (without the `ai-agent-hub.` prefix).
   * @returns The stored value, or `undefined` when the key is missing.
   */
  loadSingle<T>(key: string): T | undefined {
    return this.state.get<T>(`ai-agent-hub.${key}`);
  }

  /**
   * Persists a single value to storage.
   *
   * @param key   - Storage key (without the `ai-agent-hub.` prefix).
   * @param value - The value to persist.
   */
  saveSingle<T>(key: string, value: T): Thenable<void> {
    return this.state.update(`ai-agent-hub.${key}`, value);
  }
}
