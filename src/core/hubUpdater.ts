import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';

/**
 * Handles fetching the latest hub content from the remote
 * GitHub repository before a sync operation.
 *
 * Clones or pulls the repo into a temp directory inside the
 * extension's global storage, then copies updated hub-content
 * files into the extension's local hub-content folder.
 */
export class HubUpdater {
  private static readonly REPO_URL = 'https://github.com/Wasim-Shaikh25/ai-agent-hub.git';

  private static readonly HUB_CONTENT_DIR = 'hub-content';

  private readonly cacheDir: string;

  constructor(globalStoragePath: string) {
    this.cacheDir = path.join(globalStoragePath, 'repo-cache');
  }

  /**
   * Fetches the latest hub content from the remote repository.
   *
   * If the repo has already been cloned, it pulls the latest
   * changes. Otherwise it performs a fresh shallow clone.
   *
   * @param extensionPath Root path of the installed extension.
   * @returns true if content was updated, false if skipped or
   *          failed.
   */
  async fetchLatest(
    extensionPath: string,
    timeoutMs = 30_000,
  ): Promise<boolean> {
    try {
      await this.ensureCacheDir();

      const repoDir = path.join(this.cacheDir, 'ai-agent-hub');
      const isCloned = fs.existsSync(path.join(repoDir, '.git'));

      if (isCloned) {
        await this.gitPull(repoDir, timeoutMs);
      } else {
        await this.gitClone(repoDir, timeoutMs);
      }

      const updated = this.copyHubContent(repoDir, extensionPath);
      return updated;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showWarningMessage(`Hub update failed (sync will use local content): ${msg}`);
      return false;
    }
  }

  private async ensureCacheDir(): Promise<void> {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private gitClone(targetDir: string, timeoutMs: number): Promise<void> {
    return this.runGit(
      [
        'clone',
        '--depth',
        '1',
        '--single-branch',
        '--branch',
        'main',
        HubUpdater.REPO_URL,
        targetDir,
      ],
      undefined,
      timeoutMs,
    );
  }

  private gitPull(repoDir: string, timeoutMs: number): Promise<void> {
    return this.runGit(['pull', '--ff-only'], repoDir, timeoutMs);
  }

  /**
   * Copies hub-content files from the cloned repo into the
   * extension's local hub-content directory, overwriting
   * existing builtin files.
   *
   * @returns true if any files were copied.
   */
  private copyHubContent(repoDir: string, extensionPath: string): boolean {
    const srcBase = path.join(repoDir, HubUpdater.HUB_CONTENT_DIR);
    const destBase = path.join(extensionPath, HubUpdater.HUB_CONTENT_DIR);

    if (!fs.existsSync(srcBase)) {
      return false;
    }

    let copied = 0;
    const subdirs = ['skills', 'rules', 'hooks', 'workflows', 'personas'];

    for (const sub of subdirs) {
      const srcDir = path.join(srcBase, sub);
      const destDir = path.join(destBase, sub);

      if (!fs.existsSync(srcDir)) {
        continue;
      }

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const files = fs.readdirSync(srcDir).filter((f) => !f.startsWith('.'));

      for (const file of files) {
        const srcFile = path.join(srcDir, file);
        const destFile = path.join(destDir, file);

        if (!fs.statSync(srcFile).isFile()) {
          continue;
        }

        const srcContent = fs.readFileSync(srcFile, 'utf-8');
        const destExists = fs.existsSync(destFile);
        const destContent = destExists ? fs.readFileSync(destFile, 'utf-8') : '';

        if (srcContent !== destContent) {
          fs.writeFileSync(destFile, srcContent, 'utf-8');
          copied++;
        }
      }
    }

    return copied > 0;
  }

  private runGit(
    args: readonly string[],
    cwd?: string,
    timeoutMs = 30_000,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const options = cwd ? { cwd, timeout: timeoutMs } : { timeout: timeoutMs };
      execFile('git', args as string[], options, (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(`git ${args[0]} failed: ${stderr || error.message}`));
        } else {
          resolve();
        }
      });
    });
  }
}
