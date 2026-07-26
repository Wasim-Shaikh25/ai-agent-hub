import * as vscode from 'vscode';
import { Registry } from '../core/registry';
import { promptForContent } from '../utils/promptContent';

/**
 * Command handler that prompts the user for rule details
 * and adds a new rule item to the Registry.
 *
 * Uses a temporary Markdown editor so the rule body can be
 * multi-line, unlike `showInputBox`.
 */
export async function addRule(registry: Registry): Promise<void> {
  const name = await vscode.window.showInputBox({
    prompt: 'Rule name',
    placeHolder: 'Enter rule name',
  });
  if (!name) {
    return;
  }

  const description =
    (await vscode.window.showInputBox({
      prompt: 'Description',
      placeHolder: 'Enter description',
    })) ?? '';

  const content = await promptForContent('Add Rule');
  if (content === undefined) {
    return;
  }

  registry.addItem('rule', {
    name,
    type: 'rule',
    description,
    content,
    format: 'markdown',
    enabled: true,
  });

  vscode.window.showInformationMessage(`Rule "${name}" added.`);
}
