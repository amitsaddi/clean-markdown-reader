import { scanDirectory } from '../../utils/fileScanner';
import * as vscode from 'vscode';

// Mock vscode module
jest.mock('vscode');

describe('fileScanner', () => {
  let mockReadDirectory: jest.Mock;

  beforeAll(() => {
    mockReadDirectory = vscode.workspace.fs.readDirectory as jest.Mock;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('scanDirectory', () => {
    it('should return empty array for empty directory', async () => {
      mockReadDirectory.mockResolvedValue([]);

      const result = await scanDirectory(
        { fsPath: '/test', path: '/test', scheme: 'file' } as vscode.Uri
      );

      expect(result).toEqual([]);
    });

    it('should return markdown files matching default pattern', async () => {
      mockReadDirectory.mockResolvedValue([
        ['readme.md', vscode.FileType.File],
        ['index.ts', vscode.FileType.File],
        ['notes.md', vscode.FileType.File],
      ]);

      const result = await scanDirectory(
        { fsPath: '/test', path: '/test', scheme: 'file' } as vscode.Uri
      );

      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe('notes.md');
      expect(result[1]?.name).toBe('readme.md');
    });

    it('should exclude node_modules directory', async () => {
      mockReadDirectory.mockResolvedValue([
        ['node_modules', vscode.FileType.Directory],
        ['readme.md', vscode.FileType.File],
      ]);

      const result = await scanDirectory(
        { fsPath: '/test', path: '/test', scheme: 'file' } as vscode.Uri
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('readme.md');
    });

    it('should exclude .git directory', async () => {
      mockReadDirectory.mockResolvedValue([
        ['.git', vscode.FileType.Directory],
        ['readme.md', vscode.FileType.File],
      ]);

      const result = await scanDirectory(
        { fsPath: '/test', path: '/test', scheme: 'file' } as vscode.Uri
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('readme.md');
    });

    it('should sort folders before files', async () => {
      mockReadDirectory
        .mockResolvedValueOnce([
          ['zebra.md', vscode.FileType.File],
          ['docs', vscode.FileType.Directory],
          ['alpha.md', vscode.FileType.File],
        ])
        .mockResolvedValueOnce([['nested.md', vscode.FileType.File]]);

      const result = await scanDirectory(
        { fsPath: '/test', path: '/test', scheme: 'file' } as vscode.Uri
      );

      expect(result).toHaveLength(3);
      expect(result[0]?.type).toBe('folder');
      expect(result[0]?.name).toBe('docs');
      expect(result[1]?.type).toBe('file');
      expect(result[2]?.type).toBe('file');
    });

    it('should sort files alphabetically', async () => {
      mockReadDirectory.mockResolvedValue([
        ['zebra.md', vscode.FileType.File],
        ['alpha.md', vscode.FileType.File],
        ['middle.md', vscode.FileType.File],
      ]);

      const result = await scanDirectory(
        { fsPath: '/test', path: '/test', scheme: 'file' } as vscode.Uri
      );

      expect(result).toHaveLength(3);
      expect(result[0]?.name).toBe('alpha.md');
      expect(result[1]?.name).toBe('middle.md');
      expect(result[2]?.name).toBe('zebra.md');
    });

    it('should not include empty folders', async () => {
      mockReadDirectory
        .mockResolvedValueOnce([
          ['docs', vscode.FileType.Directory],
          ['readme.md', vscode.FileType.File],
        ])
        .mockResolvedValueOnce([]);

      const result = await scanDirectory(
        { fsPath: '/test', path: '/test', scheme: 'file' } as vscode.Uri
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.type).toBe('file');
      expect(result[0]?.name).toBe('readme.md');
    });

    it('should match custom glob pattern', async () => {
      mockReadDirectory.mockResolvedValue([
        ['readme.md', vscode.FileType.File],
        ['config.json', vscode.FileType.File],
        ['data.json', vscode.FileType.File],
      ]);

      const result = await scanDirectory(
        { fsPath: '/test', path: '/test', scheme: 'file' } as vscode.Uri,
        '*.json'
      );

      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe('config.json');
      expect(result[1]?.name).toBe('data.json');
    });

    it('should handle nested directories', async () => {
      mockReadDirectory
        .mockResolvedValueOnce([['docs', vscode.FileType.Directory]])
        .mockResolvedValueOnce([['guide', vscode.FileType.Directory]])
        .mockResolvedValueOnce([['intro.md', vscode.FileType.File]]);

      const result = await scanDirectory(
        { fsPath: '/test', path: '/test', scheme: 'file' } as vscode.Uri
      );

      expect(result).toHaveLength(1);
      const docsFolder = result[0]!;
      expect(docsFolder.type).toBe('folder');
      expect(docsFolder.children).toHaveLength(1);

      const guideFolder = docsFolder.children![0]!;
      expect(guideFolder.type).toBe('folder');
      expect(guideFolder.children).toHaveLength(1);
      expect(guideFolder.children?.[0]?.name).toBe('intro.md');
    });

    it('should handle read errors gracefully', async () => {
      mockReadDirectory.mockRejectedValue(new Error('Permission denied'));

      const result = await scanDirectory(
        { fsPath: '/test', path: '/test', scheme: 'file' } as vscode.Uri
      );

      expect(result).toEqual([]);
    });
  });
});
