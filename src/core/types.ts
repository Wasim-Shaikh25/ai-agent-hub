/**
 * Core type definitions for the AI Agent Hub extension.
 *
 * Defines all shared interfaces, type aliases, and union types
 * used across the extension's modules.
 */

// ---------------------------------------------------------------------------
// Item types
// ---------------------------------------------------------------------------

/** The five content categories managed by the Hub. */
export type ItemType = 'skill' | 'rule' | 'hook' | 'workflow' | 'persona';

/** Where a Hub item originated. */
export type ItemSource = 'builtin' | 'user';

/** Supported content formats for Hub items. */
export type ContentFormat = 'markdown' | 'json' | 'yaml' | 'plaintext';

/** When a hook should fire relative to the associated action. */
export type HookTrigger = 'before' | 'after' | 'always';

/** Strategy used to write content into an agent's target path. */
export type MergeStrategy = 'copy-files' | 'single-bundle-file' | 'append';

/**
 * File extension conventions used by different AI agent targets.
 *
 * - 'md': Standard markdown (e.g., Kiro steering files)
 * - 'instructions-md': Suffixed with -instructions.md (e.g., GitHub Copilot)
 * - 'mdc': Cursor rule format (.mdc)
 * - 'prompt-md': Suffixed with .prompt.md (e.g., GitHub Copilot prompts)
 */
export type FileExtensionFormat = 'md' | 'instructions-md' | 'mdc' | 'prompt-md';

// ---------------------------------------------------------------------------
// Tab types for the Hub UI
// ---------------------------------------------------------------------------

/** The tabs rendered in the main Hub webview panel. */
export type TabType =
  | 'skills'
  | 'rules'
  | 'hooks'
  | 'workflows'
  | 'personas'
  | 'agents'
  | 'mcps'
  | 'sync';

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

/** A workflow item managed by the Hub. */
export interface WorkflowItem extends HubItem {
  type: 'workflow';
}

/** An agent persona item managed by the Hub. */
export interface PersonaItem extends HubItem {
  type: 'persona';
}

/** Discriminated union of all concrete Hub item types. */
export type AnyHubItem = SkillItem | RuleItem | HookItem | WorkflowItem | PersonaItem;

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
  /** File extension format for this target. */
  fileExtension: FileExtensionFormat;
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
  workflow: 'WORKFLOW.md',
  persona: 'PERSONA.md',
};

// ---------------------------------------------------------------------------
// Repo-level sync configuration
// ---------------------------------------------------------------------------

/** A repository target where specific content can be synced. */
export interface RepoSyncTarget {
  readonly id: string;
  /** Display name for the repo (e.g., "my-frontend-app") */
  name: string;
  /** Absolute local path to the repository root. */
  repoPath: string;
  /** Which agent target config to use for file layout/paths. */
  agentTargetId: string;
  /** Which content types to sync to this repo. */
  enabledContentTypes: ItemType[];
  /** Optional: specific item IDs to sync (empty = all enabled). */
  selectedItemIds: string[];
  enabled: boolean;
  readonly createdAt: string; // ISO 8601
  updatedAt: string;         // ISO 8601
}

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
  readonly repoResults: RepoSyncResult[];
}

/** Per-agent, per-content-type outcome of a sync operation. */
export interface AgentSyncResult {
  readonly agentName: string;
  readonly contentType: ItemType;
  readonly filesWritten: string[];
  readonly errors: string[];
}

/** Per-repo outcome of a sync operation. */
export interface RepoSyncResult {
  readonly repoName: string;
  readonly repoPath: string;
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

// ---------------------------------------------------------------------------
// MCP (Model Context Protocol) server configuration
// ---------------------------------------------------------------------------

/** Status of a managed MCP server process. */
export type McpServerStatus = 'stopped' | 'starting' | 'running' | 'error';

/**
 * Configuration for a single MCP server managed by the Hub.
 *
 * The Hub starts the server as a child process and exposes it
 * over a local HTTP/SSE endpoint so any IDE can connect to it.
 */
export interface McpServerConfig {
  readonly id: string;
  /** Human-readable name, e.g. "GitHub MCP" */
  name: string;
  /**
   * The npx package to run, e.g.
   * "@modelcontextprotocol/server-github"
   */
  packageName: string;
  /** Additional CLI args passed after the package name. */
  args: string[];
  /** Environment variables injected into the server process. */
  env: Record<string, string>;
  /** Local port the Hub will bind the HTTP/SSE proxy to. */
  port: number;
  /** Whether this server should auto-start when the Hub activates. */
  autoStart: boolean;
  /** Developer-only flag — only devs can add/edit MCP servers. */
  readonly developerOnly: true;
  readonly createdAt: string; // ISO 8601
  updatedAt: string;         // ISO 8601
}

/** Runtime state of a running MCP server (not persisted). */
export interface McpServerState {
  readonly configId: string;
  status: McpServerStatus;
  /** The local URL the server is reachable at. */
  url?: string;
  /** Last error message if status is 'error'. */
  error?: string;
  /** PID of the child process, if running. */
  pid?: number;
}
