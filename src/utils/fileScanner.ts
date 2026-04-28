import * as vscode from 'vscode';
import matter from 'gray-matter';
import { matchesGlob } from './globMatcher';

/**
 * Represents a node in the file tree
 */
export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
  tags?: string[];
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
          let tags: string[] | undefined;
          try {
            // Read file content to extract tags from frontmatter
            const fileContent = await vscode.workspace.fs.readFile(entryUri);
            const rawContent = new TextDecoder('utf-8').decode(fileContent);
            // Read only frontmatter (gray-matter handles this efficiently enough for our needs)
            const parsed: { data: Record<string, unknown> } = matter(rawContent);
            const rawTags: unknown = parsed.data.tags;
            if (Array.isArray(rawTags)) {
              tags = rawTags.filter((t: unknown): t is string => typeof t === 'string');
            } else if (typeof rawTags === 'string') {
              tags = [rawTags];
            }
          } catch {
            // Ignore read errors
          }

          const fileNode: TreeNode = {
            name,
            path: entryUri.fsPath,
            type: 'file',
          };
          if (tags !== undefined) {
            fileNode.tags = tags;
          }
          result.push(fileNode);
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
