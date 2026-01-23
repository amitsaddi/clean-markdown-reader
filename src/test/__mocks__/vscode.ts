/**
 * VS Code API mock for Jest testing
 */

const mockWebviewView = {
  webview: {
    options: {},
    html: '',
    onDidReceiveMessage: jest.fn(),
  },
};

const mockWebviewPanel = {
  webview: {
    html: '',
    options: {},
    onDidReceiveMessage: jest.fn(),
    postMessage: jest.fn(),
    asWebviewUri: jest.fn((uri: { fsPath: string }) => uri.fsPath),
    cspSource: 'https://test.vscode-resource.vscode-cdn.net',
  },
  reveal: jest.fn(),
  dispose: jest.fn(),
  onDidDispose: jest.fn(),
};

export const window = {
  showOpenDialog: jest.fn(),
  showInformationMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  showWarningMessage: jest.fn(),
  createWebviewPanel: jest.fn(() => mockWebviewPanel),
  registerWebviewViewProvider: jest.fn(),
};

export const commands = {
  registerCommand: jest.fn(),
  executeCommand: jest.fn(),
};

export const workspace = {
  fs: {
    readFile: jest.fn(),
    readDirectory: jest.fn(),
    stat: jest.fn(),
  },
  workspaceFolders: [],
};

export const Uri = {
  file: jest.fn((path: string) => ({ fsPath: path, path, scheme: 'file' })),
  parse: jest.fn((uri: string) => ({ fsPath: uri, path: uri, scheme: 'file' })),
  joinPath: jest.fn((base: { fsPath: string }, ...paths: string[]) => ({
    fsPath: [base.fsPath, ...paths].join('/'),
    path: [base.fsPath, ...paths].join('/'),
    scheme: 'file',
  })),
};

export enum ViewColumn {
  One = 1,
  Two = 2,
  Three = 3,
}

export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64,
}

export const ExtensionContext = jest.fn();

export const env = {
  openExternal: jest.fn(),
};

// Export for test access
export const __mocks__ = {
  mockWebviewView,
  mockWebviewPanel,
};
