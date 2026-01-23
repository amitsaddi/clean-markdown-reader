import * as vscode from 'vscode';
import { matchesGlob } from './globMatcher';

/**
 * Represents a node in the file tree
 */
export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
}

/**
 * Directories to exclude from scanning
 */
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  'coverage',
  '__pycache__',
  '.pytest_cache',
  '.venv',
  'venv',
  '.idea',
]);

/**
 * Scans a directory recursively for files matching the given pattern
 * @param rootUri - Root directory URI to scan
 * @param pattern - Glob pattern to match files (default: *.md)
 * @returns Promise resolving to array of TreeNodes
 */
export async function scanDirectory(
  rootUri: vscode.Uri,
  pattern = '*.md'
): Promise<TreeNode[]> {
  const result: TreeNode[] = [];

  try {
    const entries = await vscode.workspace.fs.readDirectory(rootUri);

    for (const [name, fileType] of entries) {
      if (EXCLUDED_DIRS.has(name)) {
        continue;
      }

      const entryUri = vscode.Uri.joinPath(rootUri, name);

      if (fileType === vscode.FileType.Directory) {
        const children = await scanDirectory(entryUri, pattern);

        // Only include folders that have matching files
        if (children.length > 0) {
          result.push({
            name,
            path: entryUri.fsPath,
            type: 'folder',
            children,
          });
        }
      } else if (fileType === vscode.FileType.File) {
        // Apply glob pattern matching
        if (matchesGlob(name, pattern)) {
          result.push({
            name,
            path: entryUri.fsPath,
            type: 'file',
          });
        }
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error scanning directory: ${message}`);
  }

  return sortTreeNodes(result);
}

/**
 * Sorts tree nodes: folders first, then files, alphabetically
 * @param nodes - Array of tree nodes to sort
 * @returns Sorted array of tree nodes
 */
function sortTreeNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes.sort((a, b) => {
    if (a.type === 'folder' && b.type === 'file') {
      return -1;
    }
    if (a.type === 'file' && b.type === 'folder') {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });
}
