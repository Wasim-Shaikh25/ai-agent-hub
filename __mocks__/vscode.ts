import { vi } from 'vitest';

const mockOutputChannel = {
  appendLine: vi.fn(),
  dispose: vi.fn(),
};

function createMockDocument(content = '') {
  const uri = { scheme: 'untitled', path: 'mock', toString: () => 'untitled:mock' };
  return {
    uri,
    languageId: 'markdown',
    getText: () => content,
  };
}

export const workspace = {
  workspaceFolders: undefined as { uri: { fsPath: string }; index: number; name: string }[] | undefined,
  getConfiguration: vi.fn(() => ({
    get: vi.fn((key: string, defaultValue?: unknown) => defaultValue),
  })),
  openTextDocument: vi.fn((options?: { content?: string; language?: string }) =>
    Promise.resolve(createMockDocument(options?.content ?? '')),
  ),
  onDidCloseTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
};

export const extensions = {
  getExtension: vi.fn(),
};

export const env = {
  appName: '',
};

export const window = {
  createOutputChannel: vi.fn(() => mockOutputChannel),
  showInformationMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  setStatusBarMessage: vi.fn(),
  showInputBox: vi.fn(),
  showQuickPick: vi.fn(),
  showTextDocument: vi.fn(() => Promise.resolve({})),
};

export const commands = {
  registerCommand: vi.fn(),
};

export const Uri = {
  file: (p: string) => ({ fsPath: p, path: p }),
};

export const ViewColumn = { One: 1 };

export function setWorkspaceFolders(
  folders: { uri: { fsPath: string }; index: number; name: string }[] | undefined,
): void {
  workspace.workspaceFolders = folders;
}

export function setConfiguration(config: Record<string, unknown>): void {
  workspace.getConfiguration.mockReturnValue({
    get: vi.fn((key: string, defaultValue?: unknown) => {
      if (key in config) return config[key];
      return defaultValue;
    }),
  });
}

export function setAppName(name: string): void {
  env.appName = name;
}

export function setExtension(extensionId: string, exists: boolean): void {
  extensions.getExtension.mockImplementation((id: string) => {
    if (id === extensionId && exists) {
      return { packageJSON: { description: 'mocked extension' } };
    }
    return undefined;
  });
}

export function resetVscodeMocks(): void {
  workspace.workspaceFolders = undefined;
  env.appName = '';
  extensions.getExtension.mockReset();
  window.showInformationMessage.mockReset();
  window.showErrorMessage.mockReset();
  window.showWarningMessage.mockReset();
}

export default {};
