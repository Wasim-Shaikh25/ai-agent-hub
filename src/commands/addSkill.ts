import * as vscode from 'vscode';
import { Registry } from '../core/registry';

/**
 * Command handler that prompts the user for skill details
 * and adds a new skill item to the Registry.
 */
export async function addSkill(registry: Registry): Promise<void> {
  const name = await vscode.window.showInputBox({
    prompt: 'Skill name',
    placeHolder: 'Enter skill name',
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
      placeHolder: 'Enter skill content',
    })) ?? '';

  registry.addItem('skill', {
    name,
    type: 'skill',
    description,
    content,
    format: 'markdown',
    enabled: true,
  });

  vscode.window.showInformationMessage(`Skill "${name}" added.`);
}
