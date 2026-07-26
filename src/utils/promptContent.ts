import * as vscode from 'vscode';

const HEADER = '<!-- Enter the content below this line, then close the editor. -->';

/**
 * Opens a temporary Markdown editor and returns the text the user
 * entered when the editor is closed.
 *
 * This is used by the command-palette "Add" flows so users can
 * author multi-line skills, rules, and hooks instead of being
 * constrained to VS Code's single-line `showInputBox`.
 */
export async function promptForContent(title: string): Promise<string | undefined> {
  const doc = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: `${HEADER}\n`,
  });

  await vscode.window.showTextDocument(doc, {
    preview: true,
    viewColumn: vscode.ViewColumn.One,
  });

  await vscode.window.showInformationMessage(
    `${title}: edit the temporary Markdown file, then close it to confirm.`,
    { modal: false },
    'OK',
  );

  return new Promise((resolve) => {
    const disposable = vscode.workspace.onDidCloseTextDocument((closed) => {
      if (closed === doc || closed.uri.toString() === doc.uri.toString()) {
        disposable.dispose();
        let text = closed.getText();
        if (text.startsWith(HEADER)) {
          text = text.slice(HEADER.length).replace(/^\r?\n/, '');
        }
        resolve(text);
      }
    });
  });
}
