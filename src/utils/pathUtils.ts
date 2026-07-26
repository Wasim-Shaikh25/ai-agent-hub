import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Unsafe path segment patterns that the Hub must never write to.
 *
 * Each entry is tested against the **normalized** (forward-slash)
 * representation of the path so that a single set of patterns
 * covers both POSIX and Windows separators.
 */
const UNSAFE_SEGMENTS: readonly RegExp[] = [
  // .git — exact match, prefix, or embedded segment
  /(?:^|\/)\.(g|G)(i|I)(t|T)(?:\/|$)/,

  // node_modules — exact match, prefix, or embedded segment
  /(?:^|\/)node_modules(?:\/|$)/,
];

/**
 * OS-level system directories that should never be written to.
 * Checked as case-insensitive prefix matches against the
 * normalized path.
 */
const SYSTEM_DIR_PREFIXES: readonly string[] = [
  '/system',
  '/windows',
  'c:/windows',
  '/usr/bin',
  '/usr/sbin',
  '/sbin',
  '/bin',
];

/**
 * Utility class for path validation, resolution, and
 * normalization used throughout the Hub extension.
 */
export class PathUtils {
  /**
   * Returns `true` if the path resolves inside `.git`,
   * `node_modules`, OS system directories, or contains a `..`
   * segment (after normalization).
   *
   * Also returns `true` for empty or whitespace-only strings.
   *
   * @param targetPath - The path to evaluate.
   */
  isUnsafePath(targetPath: string): boolean {
    if (!targetPath || targetPath.trim().length === 0) {
      return true;
    }

    const normalized = this.normalize(targetPath);

    // Reject any path that still contains a parent-directory segment.
    if (/(?:^|\/)\.\.(?:\/|$)/.test(normalized)) {
      return true;
    }

    for (const pattern of UNSAFE_SEGMENTS) {
      if (pattern.test(normalized)) {
        return true;
      }
    }

    const lower = normalized.toLowerCase();
    for (const prefix of SYSTEM_DIR_PREFIXES) {
      if (lower === prefix || lower.startsWith(prefix + '/')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Resolves a relative target path against a base directory and
   * ensures the final absolute path cannot escape the base or
   * land in a protected directory.
   *
   * @param basePath - The trusted base directory (e.g. workspace root or repo root).
   * @param targetPath - The user-supplied path, which may be relative or absolute.
   * @returns Either the safe absolute path, or a reason why it was rejected.
   */
  resolveSafeTarget(
    basePath: string,
    targetPath: string,
  ): { ok: true; absolutePath: string } | { ok: false; reason: string } {
    if (!basePath || !targetPath || targetPath.trim().length === 0) {
      return { ok: false, reason: 'Base path and target path are required' };
    }

    const resolvedBase = path.resolve(basePath);
    const resolvedTarget = path.resolve(resolvedBase, targetPath);

    const normBase = this.normalize(resolvedBase);
    const normTarget = this.normalize(resolvedTarget);

    if (!normTarget.startsWith(normBase + '/') && normTarget !== normBase) {
      return { ok: false, reason: 'Target path escapes the allowed base directory' };
    }

    if (this.isUnsafePath(resolvedTarget)) {
      return { ok: false, reason: 'Target path resolves to an unsafe location' };
    }

    return { ok: true, absolutePath: resolvedTarget };
  }

  /**
   * Convenience overload that uses the first open workspace folder
   * as the base directory.
   */
  resolveWorkspaceTarget(
    targetPath: string,
  ): { ok: true; absolutePath: string } | { ok: false; reason: string } {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return { ok: false, reason: 'No workspace folder is open' };
    }
    return this.resolveSafeTarget(folders[0].uri.fsPath, targetPath);
  }

  /**
   * Resolves a relative path against the first open workspace
   * folder and returns the absolute path.
   *
   * @param relativePath - A workspace-relative path.
   * @returns The resolved absolute path string.
   * @throws {Error} When no workspace folder is open.
   */
  resolveWorkspacePath(relativePath: string): string {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      throw new Error('No workspace folder is open');
    }

    return path.resolve(folders[0].uri.fsPath, relativePath);
  }

  /**
   * Normalizes a path for consistent comparison by resolving
   * `.` / `..` segments and converting all separators to
   * forward slashes.
   *
   * @param inputPath - The raw path to normalize.
   */
  normalize(inputPath: string): string {
    return path.normalize(inputPath).split(path.sep).join('/');
  }
}
