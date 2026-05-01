import * as vscode from 'vscode';
import * as path from 'path';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import matter from 'gray-matter';
import mkdnKatex from 'markdown-it-katex';
import { scanDirectory, TreeNode } from '../utils/fileScanner';
import { LauncherViewProvider } from '../providers/LauncherViewProvider';

/**
 * Default glob pattern for markdown files
 * Supports: .md, .markdown, .mdown, .mkd, .mkdn, .mdwn
 */
const DEFAULT_MD_PATTERN = '*.{md,markdown,mdown,mkd,mkdn,mdwn}';

/**
 * Glob pattern for file watcher (VS Code RelativePattern format)
 */
const WATCHER_MD_PATTERN = '**/*.{md,markdown,mdown,mkd,mkdn,mdwn}';

/**
 * Markdown-it instance configured with syntax highlighting
 */
const md = new MarkdownIt({
  html: false, // Disable HTML tags for security
  linkify: true,
  typographer: true,
  highlight: (str: string, lang: string): string => {
    if (lang !== '' && hljs.getLanguage(lang) !== undefined) {
      try {
        return hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
      } catch {
        // Fall through to auto-detection
      }
    }
    // Auto-detect language
    try {
      return hljs.highlightAuto(str).value;
    } catch {
      return ''; // Return empty string to use default escaping
    }
  },
}).use(mkdnKatex);

/**
 * Markdown-it plugin to inject source line numbers into rendered HTML.
 * Uses token.map which contains [startLine, endLine] (0-indexed, endLine exclusive).
 * This enables the "source preview on hover" feature.
 */
function applySourceLinePlugin(): void {
  const rules = md.renderer.rules;

  // Block elements that support source mapping
  const blockElements = [
    'paragraph_open',
    'heading_open',
    'blockquote_open',
    'bullet_list_open',
    'ordered_list_open',
    'list_item_open',
    'table_open',
  ];

  for (const ruleName of blockElements) {
    const original = rules[ruleName];
    rules[ruleName] = (tokens, idx, options, env, self): string => {
      const token = tokens[idx];
      if (token !== undefined && token.map !== null) {
        token.attrSet('data-source-start', String(token.map[0]));
        token.attrSet('data-source-end', String(token.map[1]));
      }
      if (original !== undefined) {
        return original(tokens, idx, options, env, self);
      }
      return self.renderToken(tokens, idx, options);
    };
  }

  // Handle <hr> separately (self-closing, uses hr rule)
  const originalHr = rules.hr;
  rules.hr = (tokens, idx, options, env, self): string => {
    const token = tokens[idx];
    if (token !== undefined && token.map !== null) {
      token.attrSet('data-source-start', String(token.map[0]));
      token.attrSet('data-source-end', String(token.map[1]));
    }
    if (originalHr !== undefined) {
      return originalHr(tokens, idx, options, env, self);
    }
    return self.renderToken(tokens, idx, options);
  };
}

// Apply source line mapping plugin
applySourceLinePlugin();

/**
 * Markdown-it plugin for Wiki-style links [[Page Title]]
 */
function applyWikiLinksPlugin(): void {
  // Add inline rule for [[...]]
  md.inline.ruler.push('wiki_link', (state, silent) => {
    const max = state.posMax;
    const start = state.pos;
    
    // Check if it starts with [[
    if (state.src.charCodeAt(start) !== 0x5b /* [ */ || 
        start + 1 >= max || 
        state.src.charCodeAt(start + 1) !== 0x5b /* [ */) {
      return false;
    }
    
    let pos = start + 2;
    while (pos < max - 1) {
      if (state.src.charCodeAt(pos) === 0x5d /* ] */ && state.src.charCodeAt(pos + 1) === 0x5d /* ] */) {
        // Found end ]]
        const pageTitle = state.src.slice(start + 2, pos).trim();
        if (pageTitle.length > 0) {
          if (!silent) {
            const token = state.push('html_inline', '', 0);
            token.content = `<a href="javascript:void(0)" class="wiki-link" data-target="${md.utils.escapeHtml(pageTitle)}">${md.utils.escapeHtml(pageTitle)}</a>`;
          }
          state.pos = pos + 2;
          return true;
        }
      }
      pos++;
    }
    
    return false;
  });
}

// Apply wiki links plugin
applyWikiLinksPlugin();

/**
 * Generates line numbers HTML for code blocks
 * @param content - The code content
 * @param showLineNumbers - Whether to show line numbers
 * @returns Line numbers HTML or empty string for single-line code
 */
function generateLineNumbers(content: string, showLineNumbers: boolean): string {
  if (!showLineNumbers) {
    return '';
  }
  const lines = content.split('\n');
  // Don't show line numbers for single-line code (or empty trailing newline)
  const lineCount = lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
  if (lineCount <= 1) {
    return '';
  }

  const numbers: string[] = [];
  for (let i = 1; i <= lineCount; i++) {
    numbers.push(`<span class="line-number">${String(i)}</span>`);
  }
  return `<div class="line-numbers">${numbers.join('')}</div>`;
}

/**
 * Render environment type for passing config to markdown renderer
 */
interface RenderEnv {
  showLineNumbers?: boolean;
  renderMermaid?: boolean;
}

// Custom fence renderer to handle mermaid diagrams, copy button, line numbers, and source mapping
const defaultFence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, idx, options, env: RenderEnv, self): string => {
  const token = tokens[idx];
  if (token === undefined) {
    return '';
  }

  const info = token.info.trim();
  const showLineNumbers = env.showLineNumbers !== false;
  const renderMermaid = env.renderMermaid !== false;

  // Build source line attributes for hover preview feature
  const sourceAttrs = token.map !== null
    ? ` data-source-start="${String(token.map[0])}" data-source-end="${String(token.map[1])}"`
    : '';

  if (info === 'mermaid') {
    if (renderMermaid) {
      // Encode content for data attribute
      const encodedContent = Buffer.from(token.content).toString('base64');
      return `<div class="mermaid-diagram"${sourceAttrs} data-mermaid="${encodedContent}"></div>\n`;
    }
    // If mermaid rendering is disabled, show as code block
  }

  // Get the highlighted code from default renderer or escape manually
  let codeHtml: string;
  if (defaultFence !== undefined) {
    codeHtml = defaultFence(tokens, idx, options, env, self);
  } else {
    codeHtml = `<pre><code>${md.utils.escapeHtml(token.content)}</code></pre>\n`;
  }

  // Encode raw content for copy button data attribute
  const encodedContent = Buffer.from(token.content).toString('base64');

  // Generate line numbers for multi-line code
  const lineNumbersHtml = generateLineNumbers(token.content, showLineNumbers);

  // Wrap in container with copy button, line numbers, and source mapping attributes
  return `<div class="code-block-wrapper"${sourceAttrs}><button class="copy-btn" data-code="${encodedContent}" data-tooltip="Copy code">📋</button>${lineNumbersHtml}${codeHtml}</div>`;
};

/**
 * Message types sent from extension to webview
 */
/**
 * Extension configuration settings
 */
interface ExtensionConfig {
  defaultPattern: string;
  panelWidth: number;
  rememberLastFolder: boolean;
  autoRefreshOnChange: boolean;
  defaultView: 'rendered' | 'raw';
  syntaxHighlighting: boolean;
  renderMermaid: boolean;
  showLineNumbers: boolean;
  fontSize: number;
  fontFamily: string;
  customCSS: string;
  showReadingProgress: boolean;
  readingSpeed: number;
  enableSourcePreview: boolean;
}

interface InitMessage {
  type: 'init';
  payload: {
    rootPath: string;
    tree: TreeNode[];
    panelWidth?: number;
    zoomLevel?: number;
    wordWrap?: boolean;
    theme?: 'auto' | 'light' | 'dark';
    bookmarks?: string[];
    recentFiles?: string[];
    isEmptyFolder?: boolean;
    selectedFile?: string;
    sourcePreview?: boolean;
    mermaidUri?: string;
    katexUri?: string;
    hideFileTree?: boolean;
    config: ExtensionConfig;
  };
}

interface FileContentMessage {
  type: 'fileContent';
  payload: {
    path: string;
    content: string;
    html: string;
    lineCount: number;
    wordCount: number;
  };
}

interface UpdateTreeMessage {
  type: 'updateTree';
  payload: {
    tree: TreeNode[];
  };
}

interface UpdateBookmarksMessage {
  type: 'updateBookmarks';
  payload: {
    bookmarks: string[];
  };
}

interface UpdateRecentFilesMessage {
  type: 'updateRecentFiles';
  payload: {
    recentFiles: string[];
  };
}

interface UpdateCustomCSSMessage {
  type: 'updateCustomCSS';
  payload: {
    customCSS: string;
  };
}

interface UpdateReadingConfigMessage {
  type: 'updateReadingConfig';
  payload: {
    showReadingProgress?: boolean;
    readingSpeed?: number;
  };
}

type ExtensionMessage = InitMessage | FileContentMessage | UpdateTreeMessage | UpdateBookmarksMessage | UpdateRecentFilesMessage | UpdateCustomCSSMessage | UpdateReadingConfigMessage;

/**
 * Message types received from webview
 */
interface RequestFileMessage {
  type: 'requestFile';
  payload: {
    path: string;
  };
}

interface FilterChangedMessage {
  type: 'filterChanged';
  payload: {
    pattern: string;
  };
}

interface OpenExternalMessage {
  type: 'openExternal';
  payload: {
    url: string;
    type?: 'link' | 'editor' | 'explorer' | 'terminal' | 'copyRelativePath';
  };
}

interface SavePanelWidthMessage {
  type: 'savePanelWidth';
  payload: {
    width: number;
  };
}

interface SaveZoomLevelMessage {
  type: 'saveZoomLevel';
  payload: {
    zoomLevel: number;
  };
}

interface SaveWordWrapMessage {
  type: 'saveWordWrap';
  payload: {
    enabled: boolean;
  };
}

interface ToggleBookmarkMessage {
  type: 'toggleBookmark';
  payload: {
    path: string;
  };
}

interface ClearRecentFilesMessage {
  type: 'clearRecentFiles';
}

interface DeleteFileMessage {
  type: 'deleteFile';
  payload: {
    path: string;
  };
}

interface SaveThemeMessage {
  type: 'saveTheme';
  payload: {
    theme: 'auto' | 'light' | 'dark';
  };
}

interface WebviewReadyMessage {
  type: 'webviewReady';
}

interface SaveSourcePreviewMessage {
  type: 'saveSourcePreview';
  payload: {
    enabled: boolean;
  };
}

interface ExportHtmlMessage {
  type: 'exportHtml';
  payload: {
    html: string;
    fileName: string;
  };
}

interface OpenInEditorMessage {
  type: 'openInEditor';
  payload: {
    path: string;
    line: number;
  };
}

type WebviewMessage = RequestFileMessage | FilterChangedMessage | OpenExternalMessage | SavePanelWidthMessage | SaveZoomLevelMessage | SaveWordWrapMessage | ToggleBookmarkMessage | ClearRecentFilesMessage | DeleteFileMessage | SaveThemeMessage | WebviewReadyMessage | SaveSourcePreviewMessage | ExportHtmlMessage | OpenInEditorMessage;

/**
 * Storage keys for persistence
 */
const STORAGE_KEYS = {
  lastFolder: 'clean-markdown-reader.lastFolder',
  panelWidth: 'clean-markdown-reader.panelWidth',
  zoomLevel: 'clean-markdown-reader.zoomLevel',
  wordWrap: 'clean-markdown-reader.wordWrap',
  bookmarks: 'clean-markdown-reader.bookmarks',
  recentFiles: 'clean-markdown-reader.recentFiles',
  recentFolders: 'clean-markdown-reader.recentFolders',
  theme: 'clean-markdown-reader.theme',
  sourcePreview: 'clean-markdown-reader.sourcePreview',
} as const;

const MAX_RECENT_FILES = 10;
const MAX_RECENT_FOLDERS = 10;

/**
 * Sanitizes custom CSS to prevent script injection and XSS attacks
 * @param css - The CSS string to sanitize
 * @returns Sanitized CSS string
 */
function sanitizeCSS(css: string): string {
  if (!css || typeof css !== 'string') {
    return '';
  }

  // Normalize unicode escapes that could bypass filters (e.g., java\53cript → javascript)
  const normalizedCSS = css.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_: string, hex: string) => {
    const charCode = parseInt(hex, 16);
    return String.fromCharCode(charCode);
  });

  // Comprehensive sanitization patterns
  const sanitized = normalizedCSS
    // Block javascript: protocol (including variations)
    .replace(/j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/gi, '/* blocked */')
    // Block vbscript: protocol
    .replace(/v\s*b\s*s\s*c\s*r\s*i\s*p\s*t\s*:/gi, '/* blocked */')
    // Block data: URLs (can contain scripts)
    .replace(/data\s*:/gi, '/* blocked */')
    // Block expression() (old IE)
    .replace(/expression\s*\(/gi, '/* blocked */(')
    // Block -moz-binding (Firefox XBL)
    .replace(/-moz-binding\s*:/gi, '/* blocked */:')
    // Block behavior: (IE)
    .replace(/behavior\s*:/gi, '/* blocked */:')
    // Block @import with external URLs
    .replace(/@import\s+url\s*\(\s*["']?https?:/gi, '/* blocked external import */')
    .replace(/@import\s+["']https?:/gi, '/* blocked external import */')
    // Block @charset (can cause issues)
    .replace(/@charset\s/gi, '/* blocked charset */')
    // Remove HTML comments that could break out of style context
    .replace(/<!--/g, '/* blocked */')
    .replace(/-->/g, '/* blocked */')
    // Remove potential script tags
    .replace(/<\s*\/?\s*script/gi, '/* blocked */');

  return sanitized;
}

/**
 * Reads extension configuration from VS Code settings
 */
function getExtensionConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('clean-markdown-reader');
  return {
    defaultPattern: config.get<string>('defaultPattern', DEFAULT_MD_PATTERN),
    panelWidth: config.get<number>('panelWidth', 30),
    rememberLastFolder: config.get<boolean>('rememberLastFolder', true),
    autoRefreshOnChange: config.get<boolean>('autoRefreshOnChange', true),
    defaultView: config.get<'rendered' | 'raw'>('defaultView', 'rendered'),
    syntaxHighlighting: config.get<boolean>('syntaxHighlighting', true),
    renderMermaid: config.get<boolean>('renderMermaid', true),
    showLineNumbers: config.get<boolean>('showLineNumbers', true),
    fontSize: config.get<number>('fontSize', 14),
    fontFamily: config.get<string>('fontFamily', 'Segoe UI, SF Pro Text, system-ui, sans-serif'),
    customCSS: config.get<string>('customCSS', ''),
    showReadingProgress: config.get<boolean>('showReadingProgress', true),
    readingSpeed: config.get<number>('readingSpeed', 200),
    enableSourcePreview: config.get<boolean>('enableSourcePreview', false),
  };
}

/**
 * Manages the markdown reader webview panel
 */
export class MarkdownReaderPanel {
  public static currentPanel: MarkdownReaderPanel | undefined;
  private static readonly viewType = 'clean-markdown-reader.panel';
  private static context: vscode.ExtensionContext | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly folderUri: vscode.Uri;
  private readonly initialFile: string | undefined;
  private currentPattern = DEFAULT_MD_PATTERN;
  private currentFilePath: string | undefined;
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private folderWatcher: vscode.FileSystemWatcher | undefined;
  private folderWatcherDebounceTimer: NodeJS.Timeout | undefined;
  private disposables: vscode.Disposable[] = [];
  public hideFileTreeOnNextInit = false;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    folderUri: vscode.Uri,
    initialFile?: string
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.folderUri = folderUri;
    this.initialFile = initialFile;

    this.panel.webview.html = this.getHtmlContent();
    this.setupMessageListener();
    this.setupFolderWatcher();
    this.setupConfigChangeListener();

    this.panel.onDidDispose(() => { this.dispose(); }, null, this.disposables);

    // Add previous folder to recent folders before updating last folder
    const previousFolder = MarkdownReaderPanel.getLastFolder();
    if (previousFolder !== undefined && previousFolder !== folderUri.fsPath) {
      MarkdownReaderPanel.addToRecentFolders(previousFolder, folderUri.fsPath);
    }

    // Save last folder to persistence
    if (MarkdownReaderPanel.context !== undefined) {
      void MarkdownReaderPanel.context.globalState.update(
        STORAGE_KEYS.lastFolder,
        folderUri.fsPath
      );
    }

    // Update the launcher panel to show the new folder name and recent folders
    LauncherViewProvider.updateFolderDisplay(folderUri.fsPath);

    // Init data is sent in response to the webview's `webviewReady` message.
  }

  /**
   * Sets the extension context for persistence
   */
  public static setContext(context: vscode.ExtensionContext): void {
    MarkdownReaderPanel.context = context;
  }

  /**
   * Gets the last opened folder path, if any
   */
  public static getLastFolder(): string | undefined {
    if (MarkdownReaderPanel.context === undefined) {
      return undefined;
    }
    return MarkdownReaderPanel.context.globalState.get<string>(STORAGE_KEYS.lastFolder);
  }

  /**
   * Gets the current folder path of the panel
   */
  public getFolderPath(): string {
    return this.folderUri.fsPath;
  }

  /**
   * Gets the list of recent folders
   */
  public static getRecentFolders(): string[] {
    if (MarkdownReaderPanel.context === undefined) {
      return [];
    }
    return MarkdownReaderPanel.context.globalState.get<string[]>(STORAGE_KEYS.recentFolders) ?? [];
  }

  /**
   * Adds a folder to the recent folders list
   * @param folderPath - The folder path to add
   * @param currentFolder - The current folder to exclude from the list
   */
  public static addToRecentFolders(folderPath: string, currentFolder?: string): void {
    if (MarkdownReaderPanel.context === undefined) {
      return;
    }

    let recentFolders = MarkdownReaderPanel.getRecentFolders();

    // Remove if already exists (to move to top)
    recentFolders = recentFolders.filter(f => f !== folderPath);

    // Add to beginning
    recentFolders.unshift(folderPath);

    // Exclude current folder if provided
    if (currentFolder !== undefined) {
      recentFolders = recentFolders.filter(f => f !== currentFolder);
    }

    // Trim to max size
    if (recentFolders.length > MAX_RECENT_FOLDERS) {
      recentFolders.length = MAX_RECENT_FOLDERS;
    }

    void MarkdownReaderPanel.context.globalState.update(
      STORAGE_KEYS.recentFolders,
      recentFolders
    );
  }

  /**
   * Clears all recent folders
   */
  public static clearRecentFolders(): void {
    if (MarkdownReaderPanel.context === undefined) {
      return;
    }
    void MarkdownReaderPanel.context.globalState.update(
      STORAGE_KEYS.recentFolders,
      []
    );
  }

  /**
   * Gets recent folders excluding the current folder and filtering out non-existent ones
   * @param currentFolder - The current folder to exclude
   */
  public static async getValidRecentFolders(currentFolder?: string): Promise<string[]> {
    const recentFolders = MarkdownReaderPanel.getRecentFolders();
    const validFolders: string[] = [];
    const foldersToRemove: string[] = [];

    for (const folder of recentFolders) {
      // Skip current folder
      if (currentFolder !== undefined && folder === currentFolder) {
        continue;
      }

      // Check if folder exists
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(folder));
        validFolders.push(folder);
      } catch {
        // Folder doesn't exist, mark for removal
        foldersToRemove.push(folder);
      }
    }

    // Remove non-existent folders from storage
    if (foldersToRemove.length > 0 && MarkdownReaderPanel.context !== undefined) {
      const updatedFolders = recentFolders.filter(f => !foldersToRemove.includes(f));
      void MarkdownReaderPanel.context.globalState.update(
        STORAGE_KEYS.recentFolders,
        updatedFolders
      );
    }

    return validFolders;
  }

  /**
   * Creates or shows the markdown reader panel
   */
  public static createOrShow(
    extensionUri: vscode.Uri,
    folderUri: vscode.Uri,
    context?: vscode.ExtensionContext,
    initialFile?: string,
    openBeside?: boolean
  ): void {
    if (context !== undefined) {
      MarkdownReaderPanel.setContext(context);
    }

    const column = openBeside === true ? vscode.ViewColumn.Beside : vscode.ViewColumn.One;

    if (MarkdownReaderPanel.currentPanel !== undefined) {
      // Check if folder is different - if so, dispose and recreate
      const currentFolderPath = MarkdownReaderPanel.currentPanel.getFolderPath();
      const newFolderPath = folderUri.fsPath;

      if (currentFolderPath === newFolderPath) {
        // Same folder - just reveal and optionally load file
        MarkdownReaderPanel.currentPanel.panel.reveal(column);
        if (initialFile !== undefined) {
          void MarkdownReaderPanel.currentPanel.handleRequestFile(initialFile);
        }
        return;
      }

      // Different folder - dispose existing panel to create new one
      MarkdownReaderPanel.currentPanel.dispose();
    }

    const panel = vscode.window.createWebviewPanel(
      MarkdownReaderPanel.viewType,
      `Clean Markdown Reader - ${path.basename(folderUri.fsPath)}`,
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri, folderUri],
      }
    );

    MarkdownReaderPanel.currentPanel = new MarkdownReaderPanel(
      panel,
      extensionUri,
      folderUri,
      initialFile
    );

    // Save openBeside flag for init payload
    if (openBeside === true) {
      MarkdownReaderPanel.currentPanel.hideFileTreeOnNextInit = true;
    }

    // Move to separate window if setting is enabled
    const config = vscode.workspace.getConfiguration('clean-markdown-reader');
    const openInSeparateWindow = config.get<boolean>('openInSeparateWindow', false);
    if (openInSeparateWindow) {
      void vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow');
    }
  }

  /**
   * Handles webview ready signal - sends init data when webview is ready.
   *
   * The webview can post `webviewReady` more than once for the same panel:
   * VS Code reloads the webview HTML (and re-runs the script from scratch)
   * when the editor is moved to another window via "Move Editor to New Window".
   * The extension-side `MarkdownReaderPanel` instance survives that move, so
   * we must treat every ready signal — not just the first — as a re-init.
   * Otherwise the new window shows an empty file tree until the user types
   * in the filter input (which is the only message that triggers a tree refresh).
   */
  private handleWebviewReady(): void {
    void this.sendInitData();
  }

  /**
   * Sends init data to the webview
   */
  private async sendInitData(): Promise<void> {
    const config = getExtensionConfig();
    // Use configured default pattern
    this.currentPattern = config.defaultPattern;
    const tree = await scanDirectory(this.folderUri, this.currentPattern);
    const savedWidth = MarkdownReaderPanel.getSavedPanelWidth();
    const savedZoom = MarkdownReaderPanel.getSavedZoomLevel();
    const savedWordWrap = MarkdownReaderPanel.getSavedWordWrap();
    const savedTheme = MarkdownReaderPanel.getSavedTheme();
    const savedSourcePreview = MarkdownReaderPanel.getSavedSourcePreview();
    const bookmarks = this.getValidBookmarks();
    const recentFiles = this.getValidRecentFiles();

    // Get mermaid URI for offline support
    const mermaidUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'assets', 'mermaid.min.js')
    );

    // Get KaTeX CSS URI for offline support
    const katexUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'assets', 'katex', 'katex.min.css')
    );

    const payload: InitMessage['payload'] = {
      rootPath: this.folderUri.fsPath,
      tree,
      isEmptyFolder: tree.length === 0,
      mermaidUri: mermaidUri.toString(),
      katexUri: katexUri.toString(),
      hideFileTree: this.hideFileTreeOnNextInit,
      config,
    };
    // Reset the flag so it only applies on first init
    this.hideFileTreeOnNextInit = false;

    if (savedWidth !== undefined) {
      payload.panelWidth = savedWidth;
    }
    if (savedZoom !== undefined) {
      payload.zoomLevel = savedZoom;
    }
    if (savedWordWrap !== undefined) {
      payload.wordWrap = savedWordWrap;
    }
    if (savedTheme !== undefined) {
      payload.theme = savedTheme;
    }
    if (savedSourcePreview !== undefined) {
      payload.sourcePreview = savedSourcePreview;
    }
    if (bookmarks.length > 0) {
      payload.bookmarks = bookmarks;
    }
    if (recentFiles.length > 0) {
      payload.recentFiles = recentFiles;
    }
    // Prefer the currently-viewed file (set after a navigation) so a re-init
    // — e.g. after the editor was moved to a new window — restores what the
    // user was actually reading, not just whatever they opened the panel with.
    const fileToSelect = this.currentFilePath ?? this.initialFile;
    if (fileToSelect !== undefined) {
      payload.selectedFile = fileToSelect;
    }
    this.postMessage({
      type: 'init',
      payload,
    });
  }

  /**
   * Sets up the message listener for webview messages
   */
  private setupMessageListener(): void {
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => {
        switch (message.type) {
          case 'requestFile':
            void this.handleRequestFile(message.payload.path);
            break;
          case 'filterChanged':
            void this.handleFilterChanged(message.payload.pattern);
            break;
          case 'openExternal':
            void this.handleOpenExternal(message.payload.url, message.payload.type);
            break;
          case 'savePanelWidth':
            this.handleSavePanelWidth(message.payload.width);
            break;
          case 'saveZoomLevel':
            this.handleSaveZoomLevel(message.payload.zoomLevel);
            break;
          case 'saveWordWrap':
            this.handleSaveWordWrap(message.payload.enabled);
            break;
          case 'toggleBookmark':
            this.handleToggleBookmark(message.payload.path);
            break;
          case 'clearRecentFiles':
            this.handleClearRecentFiles();
            break;
          case 'deleteFile':
            void this.handleDeleteFile(message.payload.path);
            break;
          case 'saveTheme':
            this.handleSaveTheme(message.payload.theme);
            break;
          case 'webviewReady':
            this.handleWebviewReady();
            break;
          case 'saveSourcePreview':
            this.handleSaveSourcePreview(message.payload.enabled);
            break;
          case 'exportHtml':
            void this.handleExportHtml(message.payload.html, message.payload.fileName);
            break;
          case 'openInEditor':
            void this.handleOpenInEditor(message.payload.path, message.payload.line);
            break;
        }
      },
      null,
      this.disposables
    );
  }

  /**
   * Sets up file watcher for the folder to detect changes
   */
  private setupFolderWatcher(): void {
    // Watch for file changes in the folder (add/delete/rename)
    const pattern = new vscode.RelativePattern(this.folderUri, WATCHER_MD_PATTERN);
    this.folderWatcher = vscode.workspace.createFileSystemWatcher(pattern);

    // Refresh tree when files are created or deleted (with debounce)
    this.folderWatcher.onDidCreate(() => {
      this.debouncedRefreshTree();
    }, null, this.disposables);

    this.folderWatcher.onDidDelete(() => {
      this.debouncedRefreshTree();
    }, null, this.disposables);

    this.disposables.push(this.folderWatcher);
  }

  /**
   * Sets up listener for configuration changes to update settings live
   */
  private setupConfigChangeListener(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('clean-markdown-reader.customCSS')) {
          const config = getExtensionConfig();
          this.postMessage({
            type: 'updateCustomCSS',
            payload: { customCSS: sanitizeCSS(config.customCSS) },
          });
        }
        if (e.affectsConfiguration('clean-markdown-reader.showReadingProgress') ||
            e.affectsConfiguration('clean-markdown-reader.readingSpeed')) {
          const config = getExtensionConfig();
          this.postMessage({
            type: 'updateReadingConfig',
            payload: {
              showReadingProgress: config.showReadingProgress,
              readingSpeed: config.readingSpeed,
            },
          });
        }
      })
    );
  }

  /**
   * Debounced tree refresh to prevent excessive refreshes from rapid file changes
   */
  private debouncedRefreshTree(): void {
    if (this.folderWatcherDebounceTimer !== undefined) {
      clearTimeout(this.folderWatcherDebounceTimer);
    }
    this.folderWatcherDebounceTimer = setTimeout(() => {
      this.folderWatcherDebounceTimer = undefined;
      void this.refreshTree();
    }, 500);
  }

  /**
   * Sets up file watcher for the currently viewed file
   */
  private setupFileWatcher(filePath: string): void {
    // Dispose previous file watcher
    if (this.fileWatcher !== undefined) {
      this.fileWatcher.dispose();
    }

    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(path.dirname(filePath)),
      path.basename(filePath)
    );

    this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

    // Refresh content when file changes (only if autoRefreshOnChange is enabled)
    this.fileWatcher.onDidChange(() => {
      const config = getExtensionConfig();
      if (config.autoRefreshOnChange && this.currentFilePath === filePath) {
        void this.handleRequestFile(filePath);
      }
    }, null, this.disposables);

    // Handle file deletion
    this.fileWatcher.onDidDelete(() => {
      if (this.currentFilePath === filePath) {
        this.currentFilePath = undefined;
        void this.refreshTree();
      }
    }, null, this.disposables);
  }

  /**
   * Refreshes the file tree
   */
  private async refreshTree(): Promise<void> {
    const tree = await scanDirectory(this.folderUri, this.currentPattern);
    this.postMessage({
      type: 'updateTree',
      payload: { tree },
    });
  }

  /**
   * Saves the panel width to workspace state
   */
  private handleSavePanelWidth(width: number): void {
    if (MarkdownReaderPanel.context !== undefined) {
      void MarkdownReaderPanel.context.workspaceState.update(
        STORAGE_KEYS.panelWidth,
        width
      );
    }
  }

  /**
   * Gets the saved panel width, if any
   */
  private static getSavedPanelWidth(): number | undefined {
    if (MarkdownReaderPanel.context === undefined) {
      return undefined;
    }
    return MarkdownReaderPanel.context.workspaceState.get<number>(STORAGE_KEYS.panelWidth);
  }

  /**
   * Saves the zoom level to global state
   */
  private handleSaveZoomLevel(zoomLevel: number): void {
    if (MarkdownReaderPanel.context !== undefined) {
      void MarkdownReaderPanel.context.globalState.update(
        STORAGE_KEYS.zoomLevel,
        zoomLevel
      );
    }
  }

  /**
   * Gets the saved zoom level, if any
   */
  private static getSavedZoomLevel(): number | undefined {
    if (MarkdownReaderPanel.context === undefined) {
      return undefined;
    }
    return MarkdownReaderPanel.context.globalState.get<number>(STORAGE_KEYS.zoomLevel);
  }

  /**
   * Saves the word wrap setting to global state
   */
  private handleSaveWordWrap(enabled: boolean): void {
    if (MarkdownReaderPanel.context !== undefined) {
      void MarkdownReaderPanel.context.globalState.update(
        STORAGE_KEYS.wordWrap,
        enabled
      );
    }
  }

  /**
   * Gets the saved word wrap setting, if any
   */
  private static getSavedWordWrap(): boolean | undefined {
    if (MarkdownReaderPanel.context === undefined) {
      return undefined;
    }
    return MarkdownReaderPanel.context.globalState.get<boolean>(STORAGE_KEYS.wordWrap);
  }

  /**
   * Saves the theme preference to global state
   */
  private handleSaveTheme(theme: 'auto' | 'light' | 'dark'): void {
    if (MarkdownReaderPanel.context !== undefined) {
      void MarkdownReaderPanel.context.globalState.update(
        STORAGE_KEYS.theme,
        theme
      );
    }
  }

  /**
   * Gets the saved theme preference, if any
   */
  private static getSavedTheme(): 'auto' | 'light' | 'dark' | undefined {
    if (MarkdownReaderPanel.context === undefined) {
      return undefined;
    }
    return MarkdownReaderPanel.context.globalState.get<'auto' | 'light' | 'dark'>(STORAGE_KEYS.theme);
  }

  /**
   * Saves the source preview preference to global state
   */
  private handleSaveSourcePreview(enabled: boolean): void {
    if (MarkdownReaderPanel.context !== undefined) {
      void MarkdownReaderPanel.context.globalState.update(
        STORAGE_KEYS.sourcePreview,
        enabled
      );
    }
  }

  /**
   * Gets the saved source preview preference, if any
   */
  private static getSavedSourcePreview(): boolean | undefined {
    if (MarkdownReaderPanel.context === undefined) {
      return undefined;
    }
    return MarkdownReaderPanel.context.globalState.get<boolean>(STORAGE_KEYS.sourcePreview);
  }

  /**
   * Toggles bookmark for a file path
   */
  private handleToggleBookmark(filePath: string): void {
    if (MarkdownReaderPanel.context === undefined) {
      return;
    }

    const bookmarks = this.getBookmarks();
    const index = bookmarks.indexOf(filePath);

    if (index === -1) {
      // Add bookmark
      bookmarks.push(filePath);
    } else {
      // Remove bookmark
      bookmarks.splice(index, 1);
    }

    // Save and notify webview
    void MarkdownReaderPanel.context.globalState.update(
      STORAGE_KEYS.bookmarks,
      bookmarks
    );

    this.postMessage({
      type: 'updateBookmarks',
      payload: { bookmarks },
    });
  }

  /**
   * Gets the saved bookmarks list
   */
  private getBookmarks(): string[] {
    if (MarkdownReaderPanel.context === undefined) {
      return [];
    }
    return MarkdownReaderPanel.context.globalState.get<string[]>(STORAGE_KEYS.bookmarks) ?? [];
  }

  /**
   * Gets bookmarks filtered to only include existing files in the current folder
   */
  private getValidBookmarks(): string[] {
    const bookmarks = this.getBookmarks();
    const folderPath = this.folderUri.fsPath;

    // Filter to only bookmarks within current folder
    return bookmarks.filter(b => b.startsWith(folderPath));
  }

  /**
   * Adds a file to recent files list
   */
  private addToRecentFiles(filePath: string): void {
    if (MarkdownReaderPanel.context === undefined) {
      return;
    }

    const recentFiles = this.getRecentFiles();

    // Remove if already exists (to move to top)
    const index = recentFiles.indexOf(filePath);
    if (index !== -1) {
      recentFiles.splice(index, 1);
    }

    // Add to beginning
    recentFiles.unshift(filePath);

    // Trim to max size
    if (recentFiles.length > MAX_RECENT_FILES) {
      recentFiles.length = MAX_RECENT_FILES;
    }

    // Save and notify webview
    void MarkdownReaderPanel.context.globalState.update(
      STORAGE_KEYS.recentFiles,
      recentFiles
    );

    this.postMessage({
      type: 'updateRecentFiles',
      payload: { recentFiles },
    });
  }

  /**
   * Clears the recent files list
   */
  private handleClearRecentFiles(): void {
    if (MarkdownReaderPanel.context === undefined) {
      return;
    }

    void MarkdownReaderPanel.context.globalState.update(
      STORAGE_KEYS.recentFiles,
      []
    );

    this.postMessage({
      type: 'updateRecentFiles',
      payload: { recentFiles: [] },
    });
  }

  /**
   * Handles file deletion request from webview
   */
  private async handleDeleteFile(filePath: string): Promise<void> {
    const fileName = path.basename(filePath);

    const confirm = await vscode.window.showWarningMessage(
      `Are you sure you want to delete "${fileName}"?`,
      { modal: true },
      'Delete'
    );

    if (confirm !== 'Delete') {
      return;
    }

    try {
      const fileUri = vscode.Uri.file(filePath);
      await vscode.workspace.fs.delete(fileUri);
      // File tree will auto-refresh via folder watcher
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete file';
      void vscode.window.showErrorMessage(`Failed to delete file: ${errorMessage}`);
    }
  }

  /**
   * Gets the saved recent files list
   */
  private getRecentFiles(): string[] {
    if (MarkdownReaderPanel.context === undefined) {
      return [];
    }
    return MarkdownReaderPanel.context.globalState.get<string[]>(STORAGE_KEYS.recentFiles) ?? [];
  }

  /**
   * Gets recent files filtered to only include existing files in the current folder
   */
  private getValidRecentFiles(): string[] {
    const recentFiles = this.getRecentFiles();
    const folderPath = this.folderUri.fsPath;

    // Filter to only recent files within current folder
    return recentFiles.filter(f => f.startsWith(folderPath));
  }

  /**
   * Opens an external URL or performs file actions
   */
  private async handleOpenExternal(url: string, actionType?: 'link' | 'editor' | 'explorer' | 'terminal' | 'copyRelativePath'): Promise<void> {
    try {
      switch (actionType) {
        case 'editor': {
          const fileUri = vscode.Uri.file(url);
          await vscode.commands.executeCommand('vscode.open', fileUri);
          break;
        }
        case 'explorer': {
          const fileUri = vscode.Uri.file(url);
          await vscode.commands.executeCommand('revealFileInOS', fileUri);
          break;
        }
        case 'terminal': {
          const folderPath = path.dirname(url);
          await vscode.commands.executeCommand('openInTerminal', vscode.Uri.file(folderPath));
          break;
        }
        case 'copyRelativePath': {
          const relativePath = path.relative(this.folderUri.fsPath, url);
          await vscode.env.clipboard.writeText(relativePath);
          break;
        }
        default: {
          // Default: open as URL in browser
          const uri = vscode.Uri.parse(url);
          await vscode.env.openExternal(uri);
          break;
        }
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to perform action';
      void vscode.window.showErrorMessage(`Failed to perform action: ${errorMessage}`);
    }
  }

  /**
   * Handles file content request from webview
   */
  private async handleRequestFile(filePath: string): Promise<void> {
    // Track current file and set up watcher
    if (this.currentFilePath !== filePath) {
      this.currentFilePath = filePath;
      this.setupFileWatcher(filePath);
      // Add to recent files
      this.addToRecentFiles(filePath);
    }

    try {
      const fileUri = vscode.Uri.file(filePath);
      const fileContent = await vscode.workspace.fs.readFile(fileUri);
      const rawContent = new TextDecoder('utf-8').decode(fileContent);

      // Parse YAML front-matter
      const { content: markdownContent, data: frontMatter } = matter(rawContent);

      // Use full content for stats (including front-matter)
      const lineCount = rawContent.split('\n').length;
      const wordCount = this.countWords(rawContent);

      // Get config for rendering options
      const config = getExtensionConfig();

      // Render markdown without front-matter, passing config via env
      const renderEnv: RenderEnv = {
        showLineNumbers: config.showLineNumbers,
        renderMermaid: config.renderMermaid,
      };
      let html = md.render(markdownContent, renderEnv);

      // If front-matter has a title, prepend it as h1 (optional display)
      if (typeof frontMatter.title === 'string' && frontMatter.title !== '') {
        html = `<h1 class="frontmatter-title">${this.escapeHtml(frontMatter.title)}</h1>\n${html}`;
      }

      // Resolve relative image paths to webview URIs
      html = this.resolveImagePaths(html, filePath);

      this.postMessage({
        type: 'fileContent',
        payload: {
          path: filePath,
          content: rawContent,
          html,
          lineCount,
          wordCount,
        },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to read file';
      this.postMessage({
        type: 'fileContent',
        payload: {
          path: filePath,
          content: `Error loading file: ${errorMessage}`,
          html: `<p>Error loading file: ${this.escapeHtml(errorMessage)}</p>`,
          lineCount: 0,
          wordCount: 0,
        },
      });
    }
  }

  /**
   * Resolves relative image paths in HTML to webview URIs
   */
  private resolveImagePaths(html: string, filePath: string): string {
    const fileDir = path.dirname(filePath);

    // Match src attributes in img tags
    return html.replace(
      /<img([^>]*)\ssrc=["']([^"']+)["']([^>]*)>/gi,
      (match, before: string, src: string, after: string) => {
        // Skip if already an absolute URL or data URI
        if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
          return match;
        }

        // Resolve relative path
        const absolutePath = path.isAbsolute(src)
          ? src
          : path.resolve(fileDir, src);

        // Convert to webview URI
        const imageUri = vscode.Uri.file(absolutePath);
        const webviewUri = this.panel.webview.asWebviewUri(imageUri);

        return `<img${before} src="${webviewUri.toString()}"${after}>`;
      }
    );
  }

  /**
   * Escapes HTML special characters
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Handles filter pattern change from webview
   */
  private async handleFilterChanged(pattern: string): Promise<void> {
    this.currentPattern = pattern !== '' ? pattern : DEFAULT_MD_PATTERN;
    const tree = await scanDirectory(this.folderUri, this.currentPattern);
    this.postMessage({
      type: 'updateTree',
      payload: { tree },
    });
  }

  /**
   * Counts words in text content
   */
  private countWords(text: string): number {
    const trimmed = text.trim();
    if (trimmed === '') {
      return 0;
    }
    return trimmed.split(/\s+/).length;
  }

  /**
   * Posts a message to the webview
   */
  private postMessage(message: ExtensionMessage): void {
    void this.panel.webview.postMessage(message);
  }

  /**
   * Handles exporting HTML
   */
  private async handleExportHtml(htmlContent: string, fileName: string): Promise<void> {
    const baseName = path.basename(fileName, path.extname(fileName)) + '.html';
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(this.folderUri.fsPath, baseName)),
      filters: { 'HTML': ['html'] }
    });

    if (uri !== undefined) {
      try {
        const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${baseName}</title>
</head>
<body style="font-family: system-ui, sans-serif; padding: 20px; max-width: 900px; margin: 0 auto;">
  ${htmlContent}
</body>
</html>`;
        await vscode.workspace.fs.writeFile(uri, Buffer.from(fullHtml, 'utf8'));
        void vscode.window.showInformationMessage('Exported HTML successfully!');
      } catch {
        void vscode.window.showErrorMessage('Failed to export HTML');
      }
    }
  }

  /**
   * Handles opening a file in the editor synchronized with the scroll line
   */
  private async handleOpenInEditor(filePath: string, line: number): Promise<void> {
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      
      // Select the specific line
      const selection = new vscode.Range(line, 0, line, 0);
      
      await vscode.window.showTextDocument(doc, { 
        selection, 
        viewColumn: vscode.ViewColumn.Beside 
      });
    } catch (err: unknown) {
      void vscode.window.showErrorMessage(`Failed to open file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Returns the HTML content for the webview
   */
  private getHtmlContent(): string {
    const webview = this.panel.webview;
    const stylesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'styles.css')
    );
    const mainScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'src', 'webview', 'main.js')
    );
    const katexUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'assets', 'katex', 'katex.min.css')
    );

    const nonce = this.getNonce();
    const cspSource = webview.cspSource;

    // Get configuration
    const config = getExtensionConfig();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource} data:; script-src 'nonce-${nonce}' ${cspSource} 'unsafe-eval'; img-src ${cspSource} https: data: blob:;">
  <link href="${stylesUri.toString()}" rel="stylesheet">
  <link href="${katexUri.toString()}" rel="stylesheet">
  <style>:root { --yamr-reader-font: ${config.fontFamily}; --yamr-reader-font-size: ${String(config.fontSize)}px; }</style>
  <style id="yamr-custom-css">${sanitizeCSS(config.customCSS)}</style>
  <title>Clean Markdown Reader</title>
</head>
<body class="${config.defaultView === 'raw' ? 'raw-view-enabled' : ''}">
  <div class="container">
    <div class="left-panel">
      <div class="filter-box">
        <span class="filter-icon">🔍</span>
        <input type="text" id="filterInput" class="filter-input" value="${config.defaultPattern}" placeholder="${config.defaultPattern}">
      </div>
      <div class="filter-box" style="margin-top: 4px;">
        <select id="tagSelect" class="filter-input" style="appearance: none; padding-left: 8px;">
          <option value="">All Tags</option>
        </select>
      </div>
      <div id="fileTree" class="file-tree"></div>
    </div>
    <div class="divider" id="divider"></div>
    <div class="right-panel">
      <div class="toolbar" id="toolbar">
        <button class="toolbar-btn" id="toggleTreeBtn" data-tooltip="Toggle File Tree">
          <span id="fileTreeIcon">📁</span>
          <span id="fileTreeLabel">Tree</span>
        </button>
        <div class="zoom-controls" id="zoomControls">
          <button class="toolbar-btn zoom-btn" id="zoomOutBtn" data-tooltip="Zoom out (Ctrl+-)">−</button>
          <span class="zoom-level" id="zoomLevel">100%</span>
          <button class="toolbar-btn zoom-btn" id="zoomInBtn" data-tooltip="Zoom in (Ctrl++)">+</button>
        </div>
        <button class="toolbar-btn" id="tocBtn" data-tooltip="Table of Contents (Ctrl+Shift+O)">
          <span>📑</span>
          <span>TOC</span>
        </button>
        <button class="toolbar-btn" id="wordWrapBtn" data-tooltip="Toggle word wrap" style="display: none;">
          <span>↩️</span>
          <span>Wrap</span>
        </button>
        <button class="toolbar-btn" id="viewToggleBtn" data-tooltip="Toggle raw/rendered view (Ctrl+Shift+R)">
          <span id="viewToggleIcon">📝</span>
          <span id="viewToggleLabel">Raw</span>
        </button>
        <button class="toolbar-btn" id="themeBtn" data-tooltip="Toggle theme (Ctrl+Shift+T)">
          <span id="themeIcon">🌓</span>
          <span id="themeLabel">Auto</span>
        </button>
        <button class="toolbar-btn" id="splitBtn" data-tooltip="Toggle split view (Ctrl+\\)">
          <span id="splitIcon">⊞</span>
          <span id="splitLabel">Split</span>
        </button>
        <button class="toolbar-btn" id="sourcePreviewBtn" data-tooltip="Toggle source preview on hover">
          <span id="sourcePreviewIcon">👁️</span>
          <span id="sourcePreviewLabel">Source</span>
        </button>
        <button class="toolbar-btn" id="exportHtmlBtn" data-tooltip="Export as HTML">
          <span id="exportHtmlIcon">💾</span>
          <span id="exportHtmlLabel">Export</span>
        </button>
        <button class="toolbar-btn" id="printBtn" data-tooltip="Print / PDF">
          <span id="printIcon">🖨️</span>
          <span id="printLabel">Print</span>
        </button>
      </div>
      <div class="panels-container" id="panelsContainer">
        <div id="renderPanel1" class="render-panel panel-1 active" data-panel="panel1">
          <div class="panel-header" id="panelHeader1"></div>
          <div class="placeholder">
            <span class="placeholder-icon">📄</span>
            <p>Select a file from the left panel to preview its contents</p>
          </div>
        </div>
        <div class="panel-divider" id="panelDivider"></div>
        <div id="renderPanel2" class="render-panel panel-2" data-panel="panel2">
          <div class="panel-header" id="panelHeader2"></div>
          <div class="placeholder">
            <span class="placeholder-icon">📄</span>
            <p>Select a file to view in this panel</p>
          </div>
        </div>
      </div>
      <div id="tocPanel" class="toc-panel">
        <div class="toc-header">
          <span>Table of Contents</span>
          <button id="tocCloseBtn" class="toc-close-btn" data-tooltip="Close">✕</button>
        </div>
        <div id="tocList" class="toc-list"></div>
      </div>
      <div id="sourceTooltip" class="source-tooltip">
        <div class="source-tooltip-header">
          <span class="source-tooltip-title">Source (lines <span id="tooltipLineRange"></span>)</span>
        </div>
        <pre class="source-tooltip-content" id="tooltipContent"></pre>
      </div>
    </div>
  </div>
  <div class="status-bar" id="statusBar">
    <span id="statusText">No file selected</span>
    <div class="reading-progress" id="readingProgress">
      <div class="progress-bar" id="progressBar"></div>
      <span class="progress-text" id="progressText">0%</span>
    </div>
  </div>
  <div class="context-menu" id="contextMenu"></div>
  <script nonce="${nonce}" src="${mainScriptUri.toString()}"></script>
</body>
</html>`;
  }

  /**
   * Generates a random nonce for CSP
   */
  private getNonce(): string {
    let text = '';
    const possible =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * Disposes the panel and cleans up resources
   */
  public dispose(): void {
    MarkdownReaderPanel.currentPanel = undefined;

    // Clean up debounce timer
    if (this.folderWatcherDebounceTimer !== undefined) {
      clearTimeout(this.folderWatcherDebounceTimer);
    }

    // Clean up file watchers
    if (this.fileWatcher !== undefined) {
      this.fileWatcher.dispose();
    }
    if (this.folderWatcher !== undefined) {
      this.folderWatcher.dispose();
    }

    this.panel.dispose();
    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      if (disposable !== undefined) {
        disposable.dispose();
      }
    }
  }
}
