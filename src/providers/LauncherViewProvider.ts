import * as vscode from 'vscode';
import { MarkdownReaderPanel } from '../panels/MarkdownReaderPanel';

/**
 * Message types from webview
 */
interface WebviewMessage {
  command: string;
  folderPath?: string;
}

/**
 * Provides a webview view for the activity bar sidebar
 * Shows a simple launcher button to open the markdown reader
 */
export class LauncherViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'clean-markdown-reader.launcher';
  private static instance: LauncherViewProvider | undefined;
  private webviewView: vscode.WebviewView | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext
  ) {
    LauncherViewProvider.instance = this;
  }

  /**
   * Updates the folder display and recent folders in the launcher panel
   * Called when the folder changes in MarkdownReaderPanel
   */
  public static updateFolderDisplay(folderPath: string): void {
    if (LauncherViewProvider.instance !== undefined) {
      void LauncherViewProvider.instance.refreshFolderDisplay(folderPath);
    }
  }

  /**
   * Refreshes the folder display and recent folders in the webview
   */
  private async refreshFolderDisplay(folderPath: string): Promise<void> {
    if (this.webviewView === undefined) {
      return;
    }
    const folderName = folderPath.split(/[/\\]/).pop() ?? folderPath;
    const recentFolders = await MarkdownReaderPanel.getValidRecentFolders(folderPath);

    void this.webviewView.webview.postMessage({
      type: 'updateFolder',
      folderName,
      folderPath,
      recentFolders: recentFolders.map(f => ({
        path: f,
        name: f.split(/[/\\]/).pop() ?? f,
      })),
    });
  }

  /**
   * Resolves the webview view when it becomes visible
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.webviewView = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    void this.initializeWebview(webviewView);

    webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
      if (message.command === 'openWorkspace') {
        void this.handleOpenWorkspace();
      } else if (message.command === 'openNewFolder') {
        void vscode.commands.executeCommand('clean-markdown-reader.open');
      } else if (message.command === 'openRecentFolder' && message.folderPath !== undefined) {
        void this.handleOpenRecentFolder(message.folderPath);
      } else if (message.command === 'clearRecentFolders') {
        this.handleClearRecentFolders();
      }
    });

    // Clear reference when view is disposed
    webviewView.onDidDispose(() => {
      this.webviewView = undefined;
    });
  }

  /**
   * Initializes the webview with HTML and recent folders data
   */
  private async initializeWebview(webviewView: vscode.WebviewView): Promise<void> {
    const lastFolder = MarkdownReaderPanel.getLastFolder();
    const recentFolders = await MarkdownReaderPanel.getValidRecentFolders(lastFolder);
    webviewView.webview.html = this.getHtmlContent(recentFolders);
  }

  /**
   * Handles the open workspace command - auto-opens last folder if available
   */
  private async handleOpenWorkspace(): Promise<void> {
    const lastFolder = MarkdownReaderPanel.getLastFolder();

    if (lastFolder !== undefined) {
      // Check if the folder still exists
      try {
        const folderUri = vscode.Uri.file(lastFolder);
        await vscode.workspace.fs.stat(folderUri);
        // Folder exists, open it directly
        MarkdownReaderPanel.createOrShow(this.extensionUri, folderUri, this.context);
        return;
      } catch {
        // Folder no longer exists, fall through to picker
      }
    }

    // No last folder or it doesn't exist, show picker
    await vscode.commands.executeCommand('clean-markdown-reader.open');
  }

  /**
   * Opens a folder from the recent folders list
   */
  private async handleOpenRecentFolder(folderPath: string): Promise<void> {
    try {
      const folderUri = vscode.Uri.file(folderPath);
      await vscode.workspace.fs.stat(folderUri);
      MarkdownReaderPanel.createOrShow(this.extensionUri, folderUri, this.context);
    } catch {
      // Folder doesn't exist, refresh the list
      void this.refreshRecentFolders();
    }
  }

  /**
   * Clears all recent folders
   */
  private handleClearRecentFolders(): void {
    MarkdownReaderPanel.clearRecentFolders();
    void this.refreshRecentFolders();
  }

  /**
   * Refreshes only the recent folders list
   */
  private async refreshRecentFolders(): Promise<void> {
    if (this.webviewView === undefined) {
      return;
    }
    const lastFolder = MarkdownReaderPanel.getLastFolder();
    const recentFolders = await MarkdownReaderPanel.getValidRecentFolders(lastFolder);

    void this.webviewView.webview.postMessage({
      type: 'updateRecentFolders',
      recentFolders: recentFolders.map(f => ({
        path: f,
        name: f.split(/[/\\]/).pop() ?? f,
      })),
    });
  }

  /**
   * Returns the HTML content for the launcher view
   */
  private getHtmlContent(recentFolders: string[]): string {
    const lastFolder = MarkdownReaderPanel.getLastFolder();
    const lastFolderName = lastFolder !== undefined
      ? lastFolder.split(/[/\\]/).pop() ?? lastFolder
      : undefined;

    const buttonText = lastFolderName !== undefined
      ? `📂 ${lastFolderName}`
      : '📂 Open Folder';

    const recentFoldersData = recentFolders.map(f => ({
      path: f,
      name: f.split(/[/\\]/).pop() ?? f,
    }));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      padding: 6px 8px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
    }
    .launcher-btn {
      width: 100%;
      padding: 4px 8px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
    }
    .launcher-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .new-folder-link {
      display: inline-block;
      margin-top: 4px;
      font-size: 11px;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      text-decoration: none;
    }
    .new-folder-link:hover {
      text-decoration: underline;
    }
    .recent-section {
      margin-top: 12px;
      border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.35));
      padding-top: 8px;
    }
    .recent-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      user-select: none;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
    }
    .recent-header:hover {
      color: var(--vscode-foreground);
    }
    .recent-title {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .collapse-icon {
      font-size: 10px;
      transition: transform 0.2s;
    }
    .recent-header.collapsed .collapse-icon {
      transform: rotate(-90deg);
    }
    .clear-btn {
      font-size: 10px;
      color: var(--vscode-textLink-foreground);
      cursor: pointer;
      background: none;
      border: none;
      padding: 0;
    }
    .clear-btn:hover {
      text-decoration: underline;
    }
    .recent-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .recent-list.hidden {
      display: none;
    }
    .recent-item {
      padding: 3px 4px;
      font-size: 11px;
      cursor: pointer;
      border-radius: 3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .recent-item:hover {
      background: var(--vscode-list-hoverBackground);
    }
    .recent-item .folder-icon {
      flex-shrink: 0;
    }
    .recent-item .folder-name {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .empty-message {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      padding: 4px;
    }
  </style>
</head>
<body>
  <button class="launcher-btn" id="openBtn" title="${lastFolder ?? 'Open folder picker'}">${buttonText}</button>
  ${lastFolderName !== undefined ? '<a class="new-folder-link" id="newFolderBtn">Change folder...</a>' : ''}

  <div class="recent-section" id="recentSection">
    <div class="recent-header" id="recentHeader">
      <span class="recent-title">
        <span class="collapse-icon">▼</span>
        <span>Recent Folders</span>
      </span>
      <button class="clear-btn" id="clearBtn" title="Clear recent folders">Clear</button>
    </div>
    <ul class="recent-list" id="recentList"></ul>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const openBtn = document.getElementById('openBtn');
    const recentSection = document.getElementById('recentSection');
    const recentHeader = document.getElementById('recentHeader');
    const recentList = document.getElementById('recentList');
    const clearBtn = document.getElementById('clearBtn');

    let recentFolders = ${JSON.stringify(recentFoldersData)};
    let isCollapsed = false;

    // Render recent folders list using safe DOM methods
    function renderRecentFolders() {
      // Clear existing items safely
      while (recentList.firstChild) {
        recentList.removeChild(recentList.firstChild);
      }

      if (recentFolders.length === 0) {
        recentSection.style.display = 'none';
        return;
      }

      recentSection.style.display = 'block';

      recentFolders.forEach(folder => {
        const li = document.createElement('li');
        li.className = 'recent-item';
        li.title = folder.path;

        const iconSpan = document.createElement('span');
        iconSpan.className = 'folder-icon';
        iconSpan.textContent = '📁';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'folder-name';
        nameSpan.textContent = folder.name;

        li.appendChild(iconSpan);
        li.appendChild(nameSpan);

        li.addEventListener('click', () => {
          vscode.postMessage({ command: 'openRecentFolder', folderPath: folder.path });
        });

        recentList.appendChild(li);
      });
    }

    // Initial render
    renderRecentFolders();

    // Open button click
    openBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'openWorkspace' });
    });

    // New folder link
    const newFolderBtn = document.getElementById('newFolderBtn');
    if (newFolderBtn) {
      newFolderBtn.addEventListener('click', () => {
        vscode.postMessage({ command: 'openNewFolder' });
      });
    }

    // Collapse/expand toggle
    recentHeader.addEventListener('click', (e) => {
      if (e.target === clearBtn) return;
      isCollapsed = !isCollapsed;
      recentHeader.classList.toggle('collapsed', isCollapsed);
      recentList.classList.toggle('hidden', isCollapsed);
    });

    // Clear button
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      vscode.postMessage({ command: 'clearRecentFolders' });
    });

    // Handle messages from extension
    window.addEventListener('message', (event) => {
      const message = event.data;

      if (message.type === 'updateFolder') {
        openBtn.textContent = '📂 ' + message.folderName;
        openBtn.title = message.folderPath;

        // Add "Change folder..." link if not present
        if (!document.getElementById('newFolderBtn')) {
          const link = document.createElement('a');
          link.id = 'newFolderBtn';
          link.className = 'new-folder-link';
          link.textContent = 'Change folder...';
          link.addEventListener('click', () => {
            vscode.postMessage({ command: 'openNewFolder' });
          });
          openBtn.insertAdjacentElement('afterend', link);
        }

        // Update recent folders if provided
        if (message.recentFolders) {
          recentFolders = message.recentFolders;
          renderRecentFolders();
        }
      }

      if (message.type === 'updateRecentFolders') {
        recentFolders = message.recentFolders;
        renderRecentFolders();
      }
    });
  </script>
</body>
</html>`;
  }
}
