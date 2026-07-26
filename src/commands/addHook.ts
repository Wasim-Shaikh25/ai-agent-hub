import * as vscode from 'vscode';
import { Registry } from '../core/registry';
import { AnyHubItem, HookTrigger } from '../core/types';
import { promptForContent } from '../utils/promptContent';

/** Quick-pick items for hook trigger selection. */
const TRIGGER_OPTIONS: readonly vscode.QuickPickItem[] = [
  { label: 'before', description: 'Run before the associated action' },
  { label: 'after', description: 'Run after the associated action' },
  { label: 'always', description: 'Run regardless of timing' },
];

/**
 * Command handler that prompts the user for hook details
 * (including trigger) and adds a new hook item to the Registry.
 *
 * Uses a temporary Markdown editor so the hook body can be
 * multi-line, unlike `showInputBox`.
 */
export async function addHook(registry: Registry): Promise<void> {
  const name = await vscode.window.showInputBox({
    prompt: 'Hook name',
    placeHolder: 'Enter hook name',
  });
  if (!name) {
    return;
  }

  const description =
    (await vscode.window.showInputBox({
      prompt: 'Description',
      placeHolder: 'Enter description',
    })) ?? '';

  const triggerPick = await vscode.window.showQuickPick(TRIGGER_OPTIONS, {
    placeHolder: 'Select trigger timing',
  });
  const trigger: HookTrigger = (triggerPick?.label as HookTrigger) ?? 'always';

  const content = await promptForContent('Add Hook');
  if (content === undefined) {
    return;
  }

  registry.addItem('hook', {
    name,
    type: 'hook',
    description,
    content,
    format: 'markdown',
    enabled: true,
    trigger,
  } as Omit<AnyHubItem, 'id' | 'source' | 'createdAt' | 'updatedAt'>);

  vscode.window.showInformationMessage(`Hook "${name}" added.`);
}
