import * as vscode from 'vscode';
import { MarkdownReaderPanel } from '../panels/MarkdownReaderPanel';

/**
 * Opens a folder picker dialog and creates the markdown reader panel
 * @param context - VS Code extension context
 */
export async function openWorkspace(
  context: vscode.ExtensionContext
): Promise<void> {
  const folderUri = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Select Folder',
    title: 'Select folder to browse markdown files',
  });

  if (folderUri === undefined || folderUri.length === 0) {
    return;
  }

  const selectedFolder = folderUri[0];

  if (selectedFolder === undefined) {
    return;
  }

  MarkdownReaderPanel.createOrShow(context.extensionUri, selectedFolder, context);
}
