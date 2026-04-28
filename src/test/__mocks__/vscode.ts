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
  registerTreeDataProvider: jest.fn(),
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
  findFiles: jest.fn(),
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

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  label: string | undefined;
  collapsibleState: TreeItemCollapsibleState;
  tooltip: string | undefined;
  description: string | undefined;
  iconPath: unknown;
  command: unknown;

  constructor(label: string, collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export class ThemeIcon {
  constructor(public readonly id: string, public readonly color?: ThemeColor) {}
}

export class ThemeColor {
  constructor(public readonly id: string) {}
}

export class Range {
  constructor(
    public readonly startLine: number,
    public readonly startCharacter: number,
    public readonly endLine: number,
    public readonly endCharacter: number
  ) {}
}

export class EventEmitter<T> {
  private listeners: ((e: T) => void)[] = [];

  event = (listener: (e: T) => void): { dispose: () => void } => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        this.listeners = this.listeners.filter((l) => l !== listener);
      },
    };
  };

  fire(data: T): void {
    this.listeners.forEach((l) => { l(data); });
  }

  dispose(): void {
    this.listeners = [];
  }
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
