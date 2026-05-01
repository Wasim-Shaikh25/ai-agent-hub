import * as vscode from 'vscode';
import { Registry } from '../core/registry';

/**
 * Command handler that prompts the user for rule details
 * and adds a new rule item to the Registry.
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

  const content =
    (await vscode.window.showInputBox({
      prompt: 'Content',
      placeHolder: 'Enter rule content',
    })) ?? '';

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
