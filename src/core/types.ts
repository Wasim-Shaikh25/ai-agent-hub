/**
 * Core type definitions for the AI Agent Hub extension.
 *
 * Defines all shared interfaces, type aliases, and union types
 * used across the extension's modules.
 */

// ---------------------------------------------------------------------------
// Item types
// ---------------------------------------------------------------------------

/** The three content categories managed by the Hub. */
export type ItemType = 'skill' | 'rule' | 'hook';

/** Where a Hub item originated. */
export type ItemSource = 'builtin' | 'user';

/** Supported content formats for Hub items. */
export type ContentFormat = 'markdown' | 'json' | 'yaml' | 'plaintext';

/** When a hook should fire relative to the associated action. */
export type HookTrigger = 'before' | 'after' | 'always';

/** Strategy used to write content into an agent's target path. */
export type MergeStrategy = 'copy-files' | 'single-bundle-file' | 'append';

// ---------------------------------------------------------------------------
// Tab types for the Hub UI (6 tabs)
// ---------------------------------------------------------------------------

/** The five tabs rendered in the main Hub webview panel. */
export type TabType = 'skills' | 'rules' | 'hooks' | 'agents' | 'sync';

// ---------------------------------------------------------------------------
// Hub items
// ---------------------------------------------------------------------------

/** Base interface for every piece of AI behavior content. */
export interface HubItem {
  readonly id: string;
  name: string;
  type: ItemType;
  source: ItemSource;
  enabled: boolean;
  description: string;
  content: string;
  format: ContentFormat;
  readonly createdAt: string; // ISO 8601
  updatedAt: string;         // ISO 8601
}

/** A skill item managed by the Hub. */
export interface SkillItem extends HubItem {
  type: 'skill';
}

/** A rule item managed by the Hub. */
export interface RuleItem extends HubItem {
  type: 'rule';
}

/** A hook item managed by the Hub. */
export interface HookItem extends HubItem {
  type: 'hook';
  trigger: HookTrigger;
}

/** Discriminated union of all concrete Hub item types. */
export type AnyHubItem = SkillItem | RuleItem | HookItem;

// ---------------------------------------------------------------------------
// Agent configuration
// ---------------------------------------------------------------------------

/**
 * How files are laid out in the target folder.
 * - 'flat': {path}/{item-name}.md
 * - 'subfolder': {path}/{item-name}/SKILL.md (or RULE.md, HOOK.md)
 */
export type FileLayout = 'flat' | 'subfolder';

/** Per-content-type target location settings within an agent config. */
export interface TargetLocationConfig {
  enabled: boolean;
  /** Folder path where files are written, e.g. ".kiro/steering" */
  path: string;
  /** How files are organized in the target folder. */
  fileLayout: FileLayout;
}

/** Full configuration record for a single agent target. */
export interface AgentTargetConfig {
  readonly id: string;
  displayName: string;
  extensionId: string;
  enabled: boolean;
  targets: Record<ItemType, TargetLocationConfig>;
  autoSync: boolean;
  readonly createdAt: string; // ISO 8601
  updatedAt: string;         // ISO 8601
}

/** Canonical .md file names used inside subfolders per content type. */
export const SUBFOLDER_FILENAMES: Record<ItemType, string> = {
  skill: 'SKILL.md',
  rule: 'RULE.md',
  hook: 'HOOK.md',
};

// ---------------------------------------------------------------------------
// Agent detection
// ---------------------------------------------------------------------------

/** A VS Code extension identified as a possible AI agent. */
export interface DetectedAgentCandidate {
  readonly extensionId: string;
  readonly displayName: string;
  readonly description: string;
  readonly confidence: 'high' | 'medium' | 'low';
}

// ---------------------------------------------------------------------------
// Sync results
// ---------------------------------------------------------------------------

/** Top-level result returned by the Sync Engine after a sync run. */
export interface SyncResult {
  readonly timestamp: string; // ISO 8601
  readonly agentResults: AgentSyncResult[];
}

/** Per-agent, per-content-type outcome of a sync operation. */
export interface AgentSyncResult {
  readonly agentName: string;
  readonly contentType: ItemType;
  readonly filesWritten: string[];
  readonly errors: string[];
}

// ---------------------------------------------------------------------------
// File writing
// ---------------------------------------------------------------------------

/** Result of a file-write operation performed by the FileWriter. */
export interface FileWriteResult {
  readonly filesWritten: string[];
  readonly errors: string[];
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** A single validation error produced by the schema Validator. */
export interface ValidationError {
  readonly path: string;
  readonly message: string;
}
