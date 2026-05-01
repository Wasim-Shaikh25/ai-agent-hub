import * as vscode from 'vscode';
import { SyncEngine } from '../core/syncEngine';

/**
 * Command handler that triggers a full sync and displays
 * a summary notification with the result.
 */
export async function syncToAgents(syncEngine: SyncEngine): Promise<void> {
  const result = await syncEngine.sync();

  const totalFiles = result.agentResults.reduce(
    (sum, r) => sum + r.filesWritten.length,
    0,
  );
  const totalErrors = result.agentResults.reduce(
    (sum, r) => sum + r.errors.length,
    0,
  );

  if (totalErrors > 0) {
    vscode.window.showWarningMessage(
      `Sync complete: ${totalFiles} files written, ${totalErrors} errors.`,
    );
  } else if (totalFiles > 0) {
    vscode.window.showInformationMessage(
      `Sync complete: ${totalFiles} files written.`,
    );
  } else {
    vscode.window.showInformationMessage('Sync complete: no files to write.');
  }
}
