import * as vscode from 'vscode';
import * as path from 'path';
import { openWorkspace } from './commands/openWorkspace';
import { LauncherViewProvider } from './providers/LauncherViewProvider';
import { TasksViewProvider } from './providers/TasksViewProvider';
import { MarkdownReaderPanel } from './panels/MarkdownReaderPanel';

/**
 * Activates the Clean Markdown Reader extension
 * @param context - VS Code extension context
 */
export function activate(context: vscode.ExtensionContext): void {
  // Set context for persistence
  MarkdownReaderPanel.setContext(context);

  // Register the open workspace command
  const openCommand = vscode.commands.registerCommand(
    'clean-markdown-reader.open',
    () => openWorkspace(context)
  );

  // Register the open file command (for context menu)
  const openFileCommand = vscode.commands.registerCommand(
    'clean-markdown-reader.openFile',
    (uri: vscode.Uri) => {
      // Get the file's parent folder
      const folderPath = path.dirname(uri.fsPath);
      const folderUri = vscode.Uri.file(folderPath);

      // Open the panel with the folder and auto-select the file
      MarkdownReaderPanel.createOrShow(
        context.extensionUri,
        folderUri,
        context,
        uri.fsPath
      );
    }
  );

  // Register the open folder command (for folder context menu)
  const openFolderCommand = vscode.commands.registerCommand(
    'clean-markdown-reader.openFolder',
    (uri: vscode.Uri) => {
      MarkdownReaderPanel.createOrShow(
        context.extensionUri,
        uri,
        context
      );
    }
  );

  // Register the activity bar view provider
  const launcherProvider = new LauncherViewProvider(context.extensionUri, context);
  const viewProviderDisposable = vscode.window.registerWebviewViewProvider(
    LauncherViewProvider.viewType,
    launcherProvider
  );

  // Register the tasks view provider
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const tasksProvider = new TasksViewProvider(workspaceRoot);
  const tasksViewDisposable = vscode.window.registerTreeDataProvider(
    'clean-markdown-reader.tasks',
    tasksProvider
  );

  context.subscriptions.push(openCommand, openFileCommand, openFolderCommand, viewProviderDisposable, tasksViewDisposable);
}

/**
 * Deactivates the extension
 */
export function deactivate(): void {
  // Cleanup if needed
}
