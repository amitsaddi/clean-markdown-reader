import { openWorkspace } from '../../commands/openWorkspace';
import * as vscode from 'vscode';

// Mock vscode module
jest.mock('vscode');

// Mock MarkdownReaderPanel
jest.mock('../../panels/MarkdownReaderPanel', () => ({
  MarkdownReaderPanel: {
    createOrShow: jest.fn(),
  },
}));

import { MarkdownReaderPanel } from '../../panels/MarkdownReaderPanel';

describe('openWorkspace', () => {
  const mockShowOpenDialog = vscode.window.showOpenDialog as jest.Mock;
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    mockContext = {
      subscriptions: [],
      extensionPath: '/test/path',
      extensionUri: { fsPath: '/test/path', path: '/test/path', scheme: 'file' },
      globalState: {
        get: jest.fn(),
        update: jest.fn(),
      },
      workspaceState: {
        get: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as vscode.ExtensionContext;
  });

  it('should open folder picker dialog', async () => {
    mockShowOpenDialog.mockResolvedValue(undefined);

    await openWorkspace(mockContext);

    expect(mockShowOpenDialog).toHaveBeenCalledWith({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select Folder',
      title: 'Select folder to browse markdown files',
    });
  });

  it('should not create panel when user cancels dialog', async () => {
    mockShowOpenDialog.mockResolvedValue(undefined);

    await openWorkspace(mockContext);

    expect(jest.mocked(MarkdownReaderPanel.createOrShow)).not.toHaveBeenCalled();
  });

  it('should not create panel when empty array is returned', async () => {
    mockShowOpenDialog.mockResolvedValue([]);

    await openWorkspace(mockContext);

    expect(jest.mocked(MarkdownReaderPanel.createOrShow)).not.toHaveBeenCalled();
  });

  it('should create panel when folder is selected', async () => {
    const mockFolderUri = {
      fsPath: '/test/selected-folder',
      path: '/test/selected-folder',
      scheme: 'file',
    };
    mockShowOpenDialog.mockResolvedValue([mockFolderUri]);

    await openWorkspace(mockContext);

    expect(jest.mocked(MarkdownReaderPanel.createOrShow)).toHaveBeenCalledWith(
      mockContext.extensionUri,
      mockFolderUri,
      mockContext
    );
  });
});
