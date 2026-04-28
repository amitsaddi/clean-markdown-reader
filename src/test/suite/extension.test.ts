import { activate, deactivate } from '../../extension';
import * as vscode from 'vscode';

// Mock vscode module
jest.mock('vscode');

describe('Extension', () => {
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

  describe('activate', () => {
    it('should register the open command', () => {
      activate(mockContext);

      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        'clean-markdown-reader.open',
        expect.any(Function)
      );
    });

    it('should register the webview view provider', () => {
      activate(mockContext);

      expect(vscode.window.registerWebviewViewProvider).toHaveBeenCalledWith(
        'clean-markdown-reader.launcher',
        expect.any(Object)
      );
    });

    it('should add command and view provider to subscriptions', () => {
      activate(mockContext);

      expect(mockContext.subscriptions.length).toBe(5);
    });
  });

  describe('deactivate', () => {
    it('should execute without error', () => {
      expect(() => {
        deactivate();
      }).not.toThrow();
    });
  });
});
