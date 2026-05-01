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
   * `node_modules`, or OS system directories.
   * Also returns `true` for empty or whitespace-only strings.
   *
   * @param targetPath - The path to evaluate.
   */
  isUnsafePath(targetPath: string): boolean {
    if (!targetPath || targetPath.trim().length === 0) {
      return true;
    }

    const normalized = this.normalize(targetPath);

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
