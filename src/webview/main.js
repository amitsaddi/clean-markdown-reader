// @ts-check

/**
 * Clean Markdown Reader Webview Main Script
 * Combines messaging, file tree rendering, and markdown rendering
 *
 * Security note: This renders markdown from local files selected by the user.
 * HTML is escaped before markdown conversion to prevent XSS from file content.
 */

(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  /** @type {string} */
  let rootPath = '';

  /** @type {string|null} */
  let selectedFilePath = null;

  /** @type {number|null} */
  let filterDebounceTimer = null;

  /** @type {boolean} */
  let isEmptyFolder = false;

  /** @type {number} */
  let zoomLevel = 100;

  /** @type {boolean} */
  let tocVisible = false;

  /** @type {'auto'|'light'|'dark'} */
  let currentTheme = 'auto';

  /** @type {boolean} */
  let showReadingProgress = true;

  /** @type {number} */
  let readingSpeed = 200;

  /** @type {boolean} */
  let sourcePreviewEnabled = false;

  // ============================================
  // SPLIT VIEW STATE
  // ============================================

  /**
   * @typedef {'none'|'vertical'|'horizontal'} SplitMode
   */

  /**
   * @typedef {'panel1'|'panel2'} PanelId
   */

  /**
   * @typedef {Object} PanelState
   * @property {HTMLElement|null} element
   * @property {string|null} filePath
   * @property {string} rawContent
   * @property {string} htmlContent
   * @property {boolean} isRawView
   * @property {boolean} wordWrapEnabled
   */

  /** @type {Record<PanelId, PanelState>} */
  const panels = {
    panel1: {
      element: null,
      filePath: null,
      rawContent: '',
      htmlContent: '',
      isRawView: false,
      wordWrapEnabled: true,
    },
    panel2: {
      element: null,
      filePath: null,
      rawContent: '',
      htmlContent: '',
      isRawView: false,
      wordWrapEnabled: true,
    },
  };

  /** @type {PanelId} */
  let activePanel = 'panel1';

  /** @type {SplitMode} */
  let splitMode = 'none';

  /** @type {PanelId|null} - Tracks which panel requested the pending file */
  let pendingFileRequest = null;

  /**
   * @typedef {Object} TocEntry
   * @property {number} level
   * @property {string} text
   * @property {string} id
   * @property {HTMLElement} element
   */

  /** @type {TocEntry[]} */
  let tocEntries = [];

  /** @type {string[]} */
  let bookmarks = [];

  /** @type {string[]} */
  let recentFiles = [];

  // Zoom constants
  const ZOOM_MIN = 50;
  const ZOOM_MAX = 200;
  const ZOOM_STEP = 10;

  // DOM Elements
  const fileTreeEl = /** @type {HTMLElement} */ (document.getElementById('fileTree'));
  const statusBarEl = /** @type {HTMLElement} */ (document.getElementById('statusBar'));
  const filterInputEl = /** @type {HTMLInputElement} */ (document.getElementById('filterInput'));
  const dividerEl = /** @type {HTMLElement} */ (document.getElementById('divider'));
  const toolbarEl = /** @type {HTMLElement} */ (document.getElementById('toolbar'));
  const viewToggleBtnEl = /** @type {HTMLButtonElement} */ (document.getElementById('viewToggleBtn'));
  const viewToggleIconEl = /** @type {HTMLElement} */ (document.getElementById('viewToggleIcon'));
  const viewToggleLabelEl = /** @type {HTMLElement} */ (document.getElementById('viewToggleLabel'));
  const zoomInBtnEl = /** @type {HTMLButtonElement} */ (document.getElementById('zoomInBtn'));
  const zoomOutBtnEl = /** @type {HTMLButtonElement} */ (document.getElementById('zoomOutBtn'));
  const zoomLevelEl = /** @type {HTMLElement} */ (document.getElementById('zoomLevel'));
  const leftPanel = /** @type {HTMLElement} */ (document.querySelector('.left-panel'));
  const tocBtnEl = /** @type {HTMLButtonElement} */ (document.getElementById('tocBtn'));
  const tocPanelEl = /** @type {HTMLElement} */ (document.getElementById('tocPanel'));
  const tocListEl = /** @type {HTMLElement} */ (document.getElementById('tocList'));
  const tocCloseBtnEl = /** @type {HTMLButtonElement} */ (document.getElementById('tocCloseBtn'));
  const wordWrapBtnEl = /** @type {HTMLButtonElement} */ (document.getElementById('wordWrapBtn'));
  const statusTextEl = /** @type {HTMLElement} */ (document.getElementById('statusText'));
  const readingProgressEl = /** @type {HTMLElement} */ (document.getElementById('readingProgress'));
  const progressBarEl = /** @type {HTMLElement} */ (document.getElementById('progressBar'));
  const progressTextEl = /** @type {HTMLElement} */ (document.getElementById('progressText'));
  const themeBtnEl = /** @type {HTMLButtonElement} */ (document.getElementById('themeBtn'));
  const themeIconEl = /** @type {HTMLElement} */ (document.getElementById('themeIcon'));
  const themeLabelEl = /** @type {HTMLElement} */ (document.getElementById('themeLabel'));

  // Split view elements
  const panelsContainerEl = /** @type {HTMLElement} */ (document.getElementById('panelsContainer'));
  const renderPanel1El = /** @type {HTMLElement} */ (document.getElementById('renderPanel1'));
  const renderPanel2El = /** @type {HTMLElement} */ (document.getElementById('renderPanel2'));
  const panelDividerEl = /** @type {HTMLElement} */ (document.getElementById('panelDivider'));
  const panelHeader1El = /** @type {HTMLElement} */ (document.getElementById('panelHeader1'));
  const panelHeader2El = /** @type {HTMLElement} */ (document.getElementById('panelHeader2'));
  const splitBtnEl = /** @type {HTMLButtonElement} */ (document.getElementById('splitBtn'));
  const splitIconEl = /** @type {HTMLElement} */ (document.getElementById('splitIcon'));
  const splitLabelEl = /** @type {HTMLElement} */ (document.getElementById('splitLabel'));

  // Source preview elements
  const sourcePreviewBtnEl = /** @type {HTMLButtonElement} */ (document.getElementById('sourcePreviewBtn'));
  const sourcePreviewIconEl = /** @type {HTMLElement} */ (document.getElementById('sourcePreviewIcon'));
  const sourcePreviewLabelEl = /** @type {HTMLElement} */ (document.getElementById('sourcePreviewLabel'));
  const sourceTooltipEl = /** @type {HTMLElement} */ (document.getElementById('sourceTooltip'));
  const tooltipLineRangeEl = /** @type {HTMLElement} */ (document.getElementById('tooltipLineRange'));
  const tooltipContentEl = /** @type {HTMLElement} */ (document.getElementById('tooltipContent'));

  // Context menu element
  const contextMenuEl = /** @type {HTMLElement} */ (document.getElementById('contextMenu'));

  // Initialize panel state elements
  panels.panel1.element = renderPanel1El;
  panels.panel2.element = renderPanel2El;

  // Backward compatibility - reference to active panel's element
  /** @returns {HTMLElement} */
  function getRenderPanelEl() {
    return panels[activePanel].element || renderPanel1El;
  }

  // ============================================
  // MESSAGING
  // ============================================

  /**
   * Send message to extension
   * @param {string} type
   * @param {object} payload
   */
  function postMessage(type, payload) {
    vscode.postMessage({ type, payload });
  }

  /**
   * Request file content from extension
   * @param {string} filePath
   */
  function requestFile(filePath) {
    postMessage('requestFile', { path: filePath });
  }

  /**
   * Notify extension of filter change
   * @param {string} pattern
   */
  function notifyFilterChanged(pattern) {
    postMessage('filterChanged', { pattern });
  }

  // Listen for messages from extension
  window.addEventListener('message', (event) => {
    const message = event.data;
    switch (message.type) {
      case 'init':
        handleInit(message.payload);
        break;
      case 'fileContent':
        handleFileContent(message.payload);
        break;
      case 'updateTree':
        handleUpdateTree(message.payload);
        break;
      case 'updateBookmarks':
        handleUpdateBookmarks(message.payload);
        break;
      case 'updateRecentFiles':
        handleUpdateRecentFiles(message.payload);
        break;
      case 'updateCustomCSS':
        applyCustomCSS(message.payload.customCSS);
        break;
      case 'updateReadingConfig':
        handleUpdateReadingConfig(message.payload);
        break;
    }
  });

  /**
   * @typedef {Object} ExtensionConfig
   * @property {string} defaultPattern
   * @property {number} panelWidth
   * @property {boolean} rememberLastFolder
   * @property {boolean} autoRefreshOnChange
   * @property {'rendered'|'raw'} defaultView
   * @property {boolean} syntaxHighlighting
   * @property {boolean} renderMermaid
   * @property {boolean} showLineNumbers
   * @property {number} fontSize
   * @property {string} fontFamily
   * @property {boolean} showReadingProgress
   * @property {number} readingSpeed
   */

  /** @type {string|undefined} */
  let mermaidUri;

  /**
   * Handle init message
   * @param {{ rootPath: string, tree: TreeNode[], isEmptyFolder?: boolean, panelWidth?: number, zoomLevel?: number, wordWrap?: boolean, theme?: 'auto'|'light'|'dark', sourcePreview?: boolean, mermaidUri?: string, bookmarks?: string[], recentFiles?: string[], selectedFile?: string, config: ExtensionConfig }} payload
   */
  function handleInit(payload) {
    rootPath = payload.rootPath;
    isEmptyFolder = payload.isEmptyFolder === true;

    // Apply saved panel width if available
    if (payload.panelWidth !== undefined && payload.panelWidth > 0) {
      leftPanel.style.width = `${payload.panelWidth}px`;
      leftPanel.style.flex = 'none';
    }

    // Apply saved zoom level if available
    if (payload.zoomLevel !== undefined && payload.zoomLevel >= ZOOM_MIN && payload.zoomLevel <= ZOOM_MAX) {
      zoomLevel = payload.zoomLevel;
      applyZoom(false); // Don't save on initial load
    }

    // Apply default view from config to both panels
    if (payload.config !== undefined && payload.config.defaultView === 'raw') {
      panels.panel1.isRawView = true;
      panels.panel2.isRawView = true;
      updateViewToggleUI();
    }

    // Apply reading progress config
    if (payload.config !== undefined) {
      showReadingProgress = payload.config.showReadingProgress !== false;
      readingSpeed = payload.config.readingSpeed || 200;
    }

    // Apply saved word wrap setting to both panels
    if (payload.wordWrap !== undefined) {
      panels.panel1.wordWrapEnabled = payload.wordWrap;
      panels.panel2.wordWrapEnabled = payload.wordWrap;
      if (!payload.wordWrap) {
        wordWrapBtnEl.classList.add('active');
      }
    }

    // Apply saved theme setting
    if (payload.theme !== undefined) {
      currentTheme = payload.theme;
      applyTheme(false); // Don't save on initial load
    }

    // Apply saved source preview setting
    if (payload.sourcePreview !== undefined) {
      sourcePreviewEnabled = payload.sourcePreview;
      updateSourcePreviewUI();
    }

    // Store mermaid URI for offline loading
    if (payload.mermaidUri !== undefined) {
      mermaidUri = payload.mermaidUri;
    }

    // Apply bookmarks
    if (payload.bookmarks !== undefined) {
      bookmarks = payload.bookmarks;
    }

    // Apply recent files
    if (payload.recentFiles !== undefined) {
      recentFiles = payload.recentFiles;
    }

    renderTree(payload.tree);

    // Auto-select initial file if specified
    if (payload.selectedFile !== undefined) {
      selectedFilePath = payload.selectedFile;
      requestFile(payload.selectedFile);
    }
  }

  /**
   * Handle file content message
   * @param {{ path: string, content: string, html: string, lineCount: number, wordCount: number }} payload
   */
  function handleFileContent(payload) {
    // Determine target panel (use pending request or active panel)
    const targetPanel = pendingFileRequest || activePanel;
    pendingFileRequest = null;

    const panel = panels[targetPanel];

    // Store both raw and rendered content in panel state
    panel.rawContent = payload.content;
    panel.htmlContent = payload.html;
    panel.filePath = payload.path;

    // Show toolbar when file is loaded
    toolbarEl.classList.add('visible');

    // Render based on panel's view mode
    if (panel.isRawView) {
      renderRaw(panel.rawContent, targetPanel);
    } else {
      renderHtml(panel.htmlContent, targetPanel);
    }

    // Update panel header with filename
    updatePanelHeader(targetPanel, payload.path);

    // Update status bar only for active panel
    if (targetPanel === activePanel) {
      updateStatusBar(payload.path, payload.lineCount, payload.wordCount);
      // Update view toggle button to reflect active panel's state
      updateViewToggleUI();
    }
  }

  /**
   * Handle tree update message
   * @param {{ tree: TreeNode[] }} payload
   */
  function handleUpdateTree(payload) {
    renderTree(payload.tree);
  }

  /**
   * Handle bookmarks update message
   * @param {{ bookmarks: string[] }} payload
   */
  function handleUpdateBookmarks(payload) {
    bookmarks = payload.bookmarks;
    // Update bookmark icons in tree
    updateBookmarkIcons();
    // Update bookmarks section
    renderBookmarksSection();
  }

  /**
   * Check if a file is bookmarked
   * @param {string} filePath
   * @returns {boolean}
   */
  function isBookmarked(filePath) {
    return bookmarks.includes(filePath);
  }

  /**
   * Toggle bookmark for a file
   * @param {string} filePath
   */
  function toggleBookmark(filePath) {
    postMessage('toggleBookmark', { path: filePath });
  }

  /**
   * Update bookmark icons in the file tree
   */
  function updateBookmarkIcons() {
    const fileItems = fileTreeEl.querySelectorAll('.tree-file');
    for (const item of fileItems) {
      const filePath = /** @type {HTMLElement} */ (item).dataset.path;
      if (filePath === undefined) {
        continue;
      }

      const bookmarkBtn = item.querySelector('.bookmark-btn');
      if (bookmarkBtn !== null) {
        if (isBookmarked(filePath)) {
          bookmarkBtn.classList.add('bookmarked');
          bookmarkBtn.textContent = '★';
          bookmarkBtn.setAttribute('title', 'Remove bookmark');
        } else {
          bookmarkBtn.classList.remove('bookmarked');
          bookmarkBtn.textContent = '☆';
          bookmarkBtn.setAttribute('title', 'Add bookmark (Ctrl+D)');
        }
      }
    }
  }

  /**
   * Handle recent files update message
   * @param {{ recentFiles: string[] }} payload
   */
  function handleUpdateRecentFiles(payload) {
    recentFiles = payload.recentFiles;
    renderRecentFilesSection();
  }

  /**
   * Handle reading config update message
   * @param {{ showReadingProgress?: boolean, readingSpeed?: number }} payload
   */
  function handleUpdateReadingConfig(payload) {
    if (payload.showReadingProgress !== undefined) {
      showReadingProgress = payload.showReadingProgress;
      if (showReadingProgress) {
        // Only show if a file is loaded
        if (panels[activePanel].filePath !== null) {
          readingProgressEl.classList.add('visible');
        }
      } else {
        readingProgressEl.classList.remove('visible');
      }
    }
    if (payload.readingSpeed !== undefined) {
      readingSpeed = payload.readingSpeed;
      // Recalculate reading time for current file
      recalculateReadingTime();
    }
  }

  /**
   * Recalculate and update reading time in status bar
   */
  function recalculateReadingTime() {
    const panel = panels[activePanel];
    if (panel.filePath !== null && panel.rawContent !== '') {
      const lines = panel.rawContent.split('\n').length;
      const words = countWords(panel.rawContent);
      updateStatusBar(panel.filePath, lines, words);
    }
  }

  /**
   * Clear all recent files
   */
  function clearRecentFiles() {
    postMessage('clearRecentFiles', {});
  }

  // ============================================
  // FILE TREE RENDERING
  // ============================================

  /**
   * @typedef {object} TreeNode
   * @property {string} name
   * @property {string} path
   * @property {'file'|'folder'} type
   * @property {TreeNode[]} [children]
   */

  /**
   * Show empty state in both panels
   * @param {string} icon
   * @param {string} message
   * @param {string} [hint]
   */
  function showRightPanelEmptyState(icon, message, hint) {
    // Show empty state in panel 1
    showPanelEmptyState('panel1', icon, message, hint);
    // Show empty state in panel 2
    showPanelEmptyState('panel2', icon, message, hint);
  }

  /**
   * Show empty state in a specific panel
   * @param {PanelId} panelId
   * @param {string} icon
   * @param {string} message
   * @param {string} [hint]
   */
  function showPanelEmptyState(panelId, icon, message, hint) {
    const panelEl = panels[panelId].element;
    if (panelEl === null) {
      return;
    }

    // Preserve panel header
    const headerEl = panelEl.querySelector('.panel-header');

    while (panelEl.firstChild) {
      panelEl.removeChild(panelEl.firstChild);
    }

    // Re-add header
    if (headerEl !== null) {
      panelEl.appendChild(headerEl);
    }

    const placeholder = document.createElement('div');
    placeholder.className = 'placeholder';

    const iconEl = document.createElement('div');
    iconEl.className = 'placeholder-icon';
    iconEl.textContent = icon;

    const textEl = document.createElement('p');
    textEl.textContent = message;

    placeholder.appendChild(iconEl);
    placeholder.appendChild(textEl);

    if (hint) {
      const hintEl = document.createElement('p');
      hintEl.style.fontSize = '12px';
      hintEl.style.marginTop = '8px';
      hintEl.textContent = hint;
      placeholder.appendChild(hintEl);
    }

    panelEl.appendChild(placeholder);
  }

  /** @type {TreeNode[]} */
  let currentTree = [];

  /**
   * Render the file tree
   * @param {TreeNode[]} tree
   */
  function renderTree(tree) {
    currentTree = tree;

    // Clear existing content safely
    while (fileTreeEl.firstChild) {
      fileTreeEl.removeChild(fileTreeEl.firstChild);
    }

    if (tree.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';

      const icon = document.createElement('span');
      icon.className = 'empty-state-icon';

      const text = document.createElement('p');
      const hint = document.createElement('p');
      hint.style.fontSize = '11px';
      hint.style.marginTop = '4px';

      if (isEmptyFolder) {
        // Empty folder state (no markdown files at all)
        icon.textContent = '📁';
        text.textContent = 'No markdown files found';
        hint.textContent = 'This folder contains no markdown files';
        showRightPanelEmptyState('📁', 'This folder contains no markdown files');
      } else {
        // No filter matches state
        icon.textContent = '🔍';
        text.textContent = 'No matching files';
        hint.textContent = 'Try adjusting your search pattern';
        showRightPanelEmptyState('🔍', 'No files match the current filter', 'Try adjusting your search pattern');
      }

      emptyState.appendChild(icon);
      emptyState.appendChild(text);
      emptyState.appendChild(hint);
      fileTreeEl.appendChild(emptyState);

      statusTextEl.textContent = 'No file selected';
      resetReadingProgress();
      return;
    }

    const fragment = document.createDocumentFragment();

    // Render bookmarks section first
    renderBookmarksSectionInto(fragment);

    // Render recent files section after bookmarks
    renderRecentFilesSectionInto(fragment);

    for (const node of tree) {
      fragment.appendChild(createTreeNode(node, 0));
    }

    fileTreeEl.appendChild(fragment);
  }

  /**
   * Render the bookmarks section into a fragment
   * @param {DocumentFragment} fragment
   */
  function renderBookmarksSectionInto(fragment) {
    // Filter bookmarks to only include files that exist in current tree
    const validBookmarks = getValidBookmarksFromTree();
    if (validBookmarks.length === 0) {
      return;
    }

    const section = document.createElement('div');
    section.className = 'bookmarks-section';
    section.id = 'bookmarksSection';

    const header = document.createElement('div');
    header.className = 'bookmarks-header tree-item';

    const toggleEl = document.createElement('span');
    toggleEl.className = 'folder-toggle';
    toggleEl.textContent = '▼';

    const iconEl = document.createElement('span');
    iconEl.className = 'tree-item-icon';
    iconEl.textContent = '⭐';

    const labelEl = document.createElement('span');
    labelEl.className = 'tree-item-name';
    labelEl.textContent = `Bookmarks (${validBookmarks.length})`;

    header.appendChild(toggleEl);
    header.appendChild(iconEl);
    header.appendChild(labelEl);

    header.addEventListener('click', () => {
      section.classList.toggle('collapsed');
      toggleEl.textContent = section.classList.contains('collapsed') ? '▶' : '▼';
    });

    section.appendChild(header);

    const listEl = document.createElement('div');
    listEl.className = 'bookmarks-list';

    for (const bookmark of validBookmarks) {
      const fileName = bookmark.split(/[/\\]/).pop() || bookmark;
      const node = { name: fileName, path: bookmark, type: /** @type {'file'} */ ('file') };
      const itemEl = createFileNode(node, 0, true);
      // Add remove button for bookmarks
      const removeBtn = document.createElement('span');
      removeBtn.className = 'bookmark-remove-btn';
      removeBtn.textContent = '✕';
      removeBtn.title = 'Remove bookmark';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleBookmark(bookmark);
      });
      itemEl.appendChild(removeBtn);
      listEl.appendChild(itemEl);
    }

    section.appendChild(listEl);
    fragment.appendChild(section);
  }

  /**
   * Get valid bookmarks that exist in the current tree
   * @returns {string[]}
   */
  function getValidBookmarksFromTree() {
    const treePaths = getAllFilePathsFromTree(currentTree);
    return bookmarks.filter(b => treePaths.includes(b));
  }

  /**
   * Get all file paths from tree recursively
   * @param {TreeNode[]} tree
   * @returns {string[]}
   */
  function getAllFilePathsFromTree(tree) {
    const paths = [];
    for (const node of tree) {
      if (node.type === 'file') {
        paths.push(node.path);
      } else if (node.children !== undefined) {
        paths.push(...getAllFilePathsFromTree(node.children));
      }
    }
    return paths;
  }

  /**
   * Re-render the bookmarks section (called when bookmarks change)
   */
  function renderBookmarksSection() {
    // Remove existing bookmarks section
    const existing = document.getElementById('bookmarksSection');
    if (existing !== null) {
      existing.remove();
    }

    // Re-render at the top of file tree
    const fragment = document.createDocumentFragment();
    renderBookmarksSectionInto(fragment);

    if (fileTreeEl.firstChild !== null) {
      fileTreeEl.insertBefore(fragment, fileTreeEl.firstChild);
    } else {
      fileTreeEl.appendChild(fragment);
    }
  }

  /**
   * Render the recent files section into a fragment
   * @param {DocumentFragment} fragment
   */
  function renderRecentFilesSectionInto(fragment) {
    // Filter recent files to only include files that exist in current tree
    const validRecentFiles = getValidRecentFilesFromTree();
    if (validRecentFiles.length === 0) {
      return;
    }

    const section = document.createElement('div');
    section.className = 'recent-files-section';
    section.id = 'recentFilesSection';

    const header = document.createElement('div');
    header.className = 'recent-files-header tree-item';

    const toggleEl = document.createElement('span');
    toggleEl.className = 'folder-toggle';
    toggleEl.textContent = '▼';

    const iconEl = document.createElement('span');
    iconEl.className = 'tree-item-icon';
    iconEl.textContent = '🕐';

    const labelEl = document.createElement('span');
    labelEl.className = 'tree-item-name';
    labelEl.textContent = `Recent (${validRecentFiles.length})`;

    const clearBtn = document.createElement('span');
    clearBtn.className = 'recent-clear-btn';
    clearBtn.textContent = '✕';
    clearBtn.title = 'Clear recent files';
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearRecentFiles();
    });

    header.appendChild(toggleEl);
    header.appendChild(iconEl);
    header.appendChild(labelEl);
    header.appendChild(clearBtn);

    header.addEventListener('click', () => {
      section.classList.toggle('collapsed');
      toggleEl.textContent = section.classList.contains('collapsed') ? '▶' : '▼';
    });

    section.appendChild(header);

    const listEl = document.createElement('div');
    listEl.className = 'recent-files-list';

    for (const filePath of validRecentFiles) {
      const fileName = filePath.split(/[/\\]/).pop() || filePath;
      const node = { name: fileName, path: filePath, type: /** @type {'file'} */ ('file') };
      const itemEl = createFileNode(node, 0, true);
      listEl.appendChild(itemEl);
    }

    section.appendChild(listEl);
    fragment.appendChild(section);
  }

  /**
   * Get valid recent files that exist in the current tree
   * @returns {string[]}
   */
  function getValidRecentFilesFromTree() {
    const treePaths = getAllFilePathsFromTree(currentTree);
    return recentFiles.filter(f => treePaths.includes(f));
  }

  /**
   * Re-render the recent files section (called when recent files change)
   */
  function renderRecentFilesSection() {
    // Remove existing recent files section
    const existing = document.getElementById('recentFilesSection');
    if (existing !== null) {
      existing.remove();
    }

    // Re-render after bookmarks section (or at top if no bookmarks)
    const fragment = document.createDocumentFragment();
    renderRecentFilesSectionInto(fragment);

    const bookmarksSection = document.getElementById('bookmarksSection');
    if (bookmarksSection !== null && bookmarksSection.nextSibling !== null) {
      fileTreeEl.insertBefore(fragment, bookmarksSection.nextSibling);
    } else if (bookmarksSection !== null) {
      fileTreeEl.appendChild(fragment);
    } else if (fileTreeEl.firstChild !== null) {
      fileTreeEl.insertBefore(fragment, fileTreeEl.firstChild);
    } else {
      fileTreeEl.appendChild(fragment);
    }
  }

  /**
   * Create a tree node element
   * @param {TreeNode} node
   * @param {number} depth
   * @returns {HTMLElement}
   */
  function createTreeNode(node, depth) {
    if (node.type === 'folder') {
      return createFolderNode(node, depth);
    }
    return createFileNode(node, depth);
  }

  /**
   * Create a folder node element
   * @param {TreeNode} node
   * @param {number} depth
   * @returns {HTMLElement}
   */
  function createFolderNode(node, depth) {
    const container = document.createElement('div');
    container.className = 'tree-folder';
    container.dataset.path = node.path;

    const itemEl = document.createElement('div');
    itemEl.className = 'tree-item';
    itemEl.style.paddingLeft = `${8 + depth * 16}px`;
    itemEl.title = node.path;

    const toggleEl = document.createElement('span');
    toggleEl.className = 'folder-toggle';
    toggleEl.textContent = '▼';

    const iconEl = document.createElement('span');
    iconEl.className = 'tree-item-icon';
    iconEl.textContent = '📁';

    const nameEl = document.createElement('span');
    nameEl.className = 'tree-item-name';
    nameEl.textContent = node.name;

    itemEl.appendChild(toggleEl);
    itemEl.appendChild(iconEl);
    itemEl.appendChild(nameEl);

    itemEl.addEventListener('click', () => {
      container.classList.toggle('collapsed');
      toggleEl.textContent = container.classList.contains('collapsed') ? '▶' : '▼';
    });

    container.appendChild(itemEl);

    if (node.children && node.children.length > 0) {
      const childrenEl = document.createElement('div');
      childrenEl.className = 'tree-children';

      for (const child of node.children) {
        childrenEl.appendChild(createTreeNode(child, depth + 1));
      }

      container.appendChild(childrenEl);
    }

    return container;
  }

  /**
   * Create a file node element
   * @param {TreeNode} node
   * @param {number} depth
   * @param {boolean} [isBookmarkItem=false] - Whether this is in the bookmarks section
   * @returns {HTMLElement}
   */
  function createFileNode(node, depth, isBookmarkItem = false) {
    const itemEl = document.createElement('div');
    itemEl.className = 'tree-item tree-file';
    itemEl.style.paddingLeft = `${8 + depth * 16 + 14}px`;
    itemEl.dataset.path = node.path;
    itemEl.title = node.path;

    const iconEl = document.createElement('span');
    iconEl.className = 'tree-item-icon';
    iconEl.textContent = '📄';

    const nameEl = document.createElement('span');
    nameEl.className = 'tree-item-name';
    nameEl.textContent = node.name;

    itemEl.appendChild(iconEl);
    itemEl.appendChild(nameEl);

    // Add bookmark button (not for items in bookmark section)
    if (!isBookmarkItem) {
      const bookmarkBtn = document.createElement('span');
      bookmarkBtn.className = 'bookmark-btn';
      if (isBookmarked(node.path)) {
        bookmarkBtn.classList.add('bookmarked');
        bookmarkBtn.textContent = '★';
        bookmarkBtn.title = 'Remove bookmark';
      } else {
        bookmarkBtn.textContent = '☆';
        bookmarkBtn.title = 'Add bookmark (Ctrl+D)';
      }

      bookmarkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleBookmark(node.path);
      });

      itemEl.appendChild(bookmarkBtn);
    }

    itemEl.addEventListener('click', () => {
      selectFile(node.path, itemEl);
    });

    // Restore selection if this was the selected file
    if (node.path === selectedFilePath) {
      itemEl.classList.add('selected');
    }

    return itemEl;
  }

  /**
   * Select a file and request its content for the appropriate panel
   * In split mode, auto-fills empty panel2 first, then uses active panel
   * @param {string} filePath
   * @param {HTMLElement} element
   */
  function selectFile(filePath, element) {
    // Remove previous selection
    const previousSelected = fileTreeEl.querySelector('.tree-item.selected');
    if (previousSelected) {
      previousSelected.classList.remove('selected');
    }

    // Add selection to current item
    element.classList.add('selected');
    selectedFilePath = filePath;

    // Determine which panel should receive the file
    let targetPanel = activePanel;

    // In split mode, auto-fill empty panel2 first
    if (splitMode !== 'none' && panels.panel2.filePath === null) {
      targetPanel = 'panel2';
      setActivePanel('panel2');
    }

    // Track which panel will receive this file
    pendingFileRequest = targetPanel;

    // Request file content
    requestFile(filePath);
  }

  // ============================================
  // HTML RENDERING
  // ============================================

  /**
   * Render pre-processed HTML content to a panel.
   *
   * Security context:
   * - HTML is generated server-side by markdown-it with html:false (raw HTML disabled)
   * - Source files are local files explicitly selected by the user
   * - VS Code webview runs in sandboxed iframe with strict CSP
   *
   * @param {string} html - Pre-rendered HTML from extension
   * @param {PanelId} [panelId] - Target panel ID (defaults to active panel)
   */
  function renderHtml(html, panelId = activePanel) {
    const panelEl = panels[panelId].element;
    if (panelEl === null) {
      return;
    }

    // Preserve panel header
    const headerEl = panelEl.querySelector('.panel-header');

    // Clear existing content safely (except header)
    while (panelEl.firstChild) {
      panelEl.removeChild(panelEl.firstChild);
    }

    // Re-add header
    if (headerEl !== null) {
      panelEl.appendChild(headerEl);
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'markdown-content';

    // Use template for DOM insertion - HTML is pre-sanitized by markdown-it
    const template = document.createElement('template');
    template.innerHTML = html;
    contentDiv.appendChild(template.content);

    panelEl.appendChild(contentDiv);
    panelEl.scrollTop = 0;

    // Render any mermaid diagrams in this panel
    renderMermaidDiagramsInPanel(panelId);

    // Refresh TOC if visible and this is the active panel
    if (tocVisible && panelId === activePanel) {
      parseTocEntries();
      renderTocList();
      updateTocHighlight();
    }
  }

  /**
   * Render raw markdown content to a panel
   * @param {string} content - Raw markdown text
   * @param {PanelId} [panelId] - Target panel ID (defaults to active panel)
   */
  function renderRaw(content, panelId = activePanel) {
    const panel = panels[panelId];
    const panelEl = panel.element;
    if (panelEl === null) {
      return;
    }

    // Preserve panel header
    const headerEl = panelEl.querySelector('.panel-header');

    // Clear existing content safely (except header)
    while (panelEl.firstChild) {
      panelEl.removeChild(panelEl.firstChild);
    }

    // Re-add header
    if (headerEl !== null) {
      panelEl.appendChild(headerEl);
    }

    const preEl = document.createElement('pre');
    preEl.className = 'raw-content';
    if (!panel.wordWrapEnabled) {
      preEl.classList.add('no-wrap');
    }
    preEl.textContent = content;

    panelEl.appendChild(preEl);
    panelEl.scrollTop = 0;
  }

  /**
   * Toggle between raw and rendered view for the active panel
   */
  function toggleViewMode() {
    const panel = panels[activePanel];
    if (panel.rawContent === '') {
      return; // No file loaded in active panel
    }

    panel.isRawView = !panel.isRawView;
    updateToggleButton();

    if (panel.isRawView) {
      renderRaw(panel.rawContent, activePanel);
    } else {
      renderHtml(panel.htmlContent, activePanel);
    }
  }

  /**
   * Update toggle button appearance based on active panel's state
   */
  function updateToggleButton() {
    const panel = panels[activePanel];
    if (panel.isRawView) {
      viewToggleIconEl.textContent = '👁️';
      viewToggleLabelEl.textContent = 'Rendered';
      viewToggleBtnEl.classList.add('active');
    } else {
      viewToggleIconEl.textContent = '📝';
      viewToggleLabelEl.textContent = 'Raw';
      viewToggleBtnEl.classList.remove('active');
    }
    updateWordWrapButtonVisibility();
  }

  /**
   * Update view toggle UI (for init)
   */
  function updateViewToggleUI() {
    updateToggleButton();
  }

  // Toggle button click handler
  viewToggleBtnEl.addEventListener('click', toggleViewMode);

  // ============================================
  // ZOOM CONTROLS
  // ============================================

  /**
   * Apply zoom level to render panel content
   * @param {boolean} [save=true] - Whether to save to persistence
   */
  function applyZoom(save = true) {
    const scale = zoomLevel / 100;
    // Apply zoom to both panels
    renderPanel1El.style.fontSize = `${scale}em`;
    renderPanel2El.style.fontSize = `${scale}em`;
    zoomLevelEl.textContent = `${zoomLevel}%`;

    // Save zoom level to extension state
    if (save) {
      postMessage('saveZoomLevel', { zoomLevel });
    }
  }

  /**
   * Apply custom CSS to the webview
   * @param {string} css - The CSS to apply
   */
  function applyCustomCSS(css) {
    let styleEl = document.getElementById('yamr-custom-css');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'yamr-custom-css';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
  }

  /**
   * Zoom in by one step
   */
  function zoomIn() {
    if (zoomLevel < ZOOM_MAX) {
      zoomLevel = Math.min(zoomLevel + ZOOM_STEP, ZOOM_MAX);
      applyZoom();
    }
  }

  /**
   * Zoom out by one step
   */
  function zoomOut() {
    if (zoomLevel > ZOOM_MIN) {
      zoomLevel = Math.max(zoomLevel - ZOOM_STEP, ZOOM_MIN);
      applyZoom();
    }
  }

  /**
   * Reset zoom to 100%
   */
  function zoomReset() {
    zoomLevel = 100;
    applyZoom();
  }

  // Zoom button click handlers
  zoomInBtnEl.addEventListener('click', zoomIn);
  zoomOutBtnEl.addEventListener('click', zoomOut);
  zoomLevelEl.addEventListener('click', zoomReset);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac) - toggle view
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      toggleViewMode();
      return;
    }

    // Ctrl+Shift+O (Windows/Linux) or Cmd+Shift+O (Mac) - toggle TOC
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      toggleToc();
      return;
    }

    // Ctrl+Shift+T (Windows/Linux) or Cmd+Shift+T (Mac) - cycle theme
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 't') {
      e.preventDefault();
      cycleTheme();
      return;
    }

    // Ctrl+\ (Windows/Linux) or Cmd+\ (Mac) - toggle split view
    if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
      e.preventDefault();
      cycleSplitMode();
      return;
    }

    // Ctrl+1 - switch to panel 1
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === '1') {
      e.preventDefault();
      setActivePanel('panel1');
      return;
    }

    // Ctrl+2 - switch to panel 2 (only in split mode)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === '2') {
      e.preventDefault();
      if (splitMode !== 'none') {
        setActivePanel('panel2');
      }
      return;
    }

    // Ctrl+D (Windows/Linux) or Cmd+D (Mac) - toggle bookmark for selected file
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      if (selectedFilePath !== null) {
        toggleBookmark(selectedFilePath);
      }
      return;
    }

    // Escape - close TOC if open
    if (e.key === 'Escape' && tocVisible) {
      e.preventDefault();
      closeToc();
      return;
    }

    // Zoom keyboard shortcuts (Ctrl/Cmd + key)
    if (e.ctrlKey || e.metaKey) {
      // Zoom in: Ctrl/Cmd + Plus (= key or numpad +)
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        zoomIn();
        return;
      }

      // Zoom out: Ctrl/Cmd + Minus
      if (e.key === '-') {
        e.preventDefault();
        zoomOut();
        return;
      }

      // Zoom reset: Ctrl/Cmd + 0
      if (e.key === '0') {
        e.preventDefault();
        zoomReset();
        return;
      }
    }
  });

  // ============================================
  // STATUS BAR
  // ============================================

  /**
   * Calculate reading time from word count
   * @param {number} wordCount
   * @returns {string} Formatted reading time
   */
  function calculateReadingTime(wordCount) {
    if (wordCount === 0) {
      return '0 min read';
    }

    const minutes = wordCount / readingSpeed;

    if (minutes < 1) {
      return '< 1 min read';
    }

    const roundedMinutes = Math.ceil(minutes);

    if (roundedMinutes >= 60) {
      const hours = Math.floor(roundedMinutes / 60);
      const remainingMinutes = roundedMinutes % 60;
      if (remainingMinutes === 0) {
        return `${hours} hr read`;
      }
      return `${hours} hr ${remainingMinutes} min read`;
    }

    return `${roundedMinutes} min read`;
  }

  /**
   * Update the status bar with file info
   * @param {string} filePath
   * @param {number} lineCount
   * @param {number} wordCount
   */
  function updateStatusBar(filePath, lineCount, wordCount) {
    const relativePath = filePath.replace(rootPath, '').replace(/^[/\\]/, '');
    const readingTime = calculateReadingTime(wordCount);
    statusTextEl.textContent = `${relativePath}  •  ${lineCount} lines  •  ${wordCount} words  •  ${readingTime}`;
    // Show progress indicator when file is loaded (if enabled)
    if (showReadingProgress) {
      readingProgressEl.classList.add('visible');
    }
    // Reset scroll progress
    updateReadingProgress();
  }

  // ============================================
  // READING PROGRESS
  // ============================================

  /**
   * Calculate and update the reading progress indicator for active panel
   */
  function updateReadingProgress() {
    // Don't show if disabled
    if (!showReadingProgress) {
      readingProgressEl.classList.remove('visible');
      return;
    }

    const panelEl = panels[activePanel].element;
    if (panelEl === null) {
      return;
    }

    const scrollTop = panelEl.scrollTop;
    const scrollHeight = panelEl.scrollHeight;
    const clientHeight = panelEl.clientHeight;

    // Calculate scrollable area
    const scrollableHeight = scrollHeight - clientHeight;

    // Calculate percentage (handle case where content fits without scrolling)
    let percentage = 0;
    if (scrollableHeight > 0) {
      percentage = Math.round((scrollTop / scrollableHeight) * 100);
    } else if (scrollHeight > 0) {
      // Content fits, so we're at 100%
      percentage = 100;
    }

    // Clamp to 0-100
    percentage = Math.max(0, Math.min(100, percentage));

    // Update UI
    progressBarEl.style.width = `${percentage}%`;
    progressTextEl.textContent = `${percentage}%`;
  }

  /**
   * Reset reading progress (called when no file is selected)
   */
  function resetReadingProgress() {
    readingProgressEl.classList.remove('visible');
    progressBarEl.style.width = '0%';
    progressTextEl.textContent = '0%';
  }

  // Update reading progress on scroll for both panels
  renderPanel1El.addEventListener('scroll', () => {
    if (activePanel === 'panel1') {
      updateReadingProgress();
      updateTocHighlight();
    }
  });
  renderPanel2El.addEventListener('scroll', () => {
    if (activePanel === 'panel2') {
      updateReadingProgress();
      updateTocHighlight();
    }
  });

  // ============================================
  // TABLE OF CONTENTS
  // ============================================

  /**
   * Parse headings from rendered content in active panel and build TOC entries
   */
  function parseTocEntries() {
    tocEntries = [];
    const panelEl = panels[activePanel].element;
    if (panelEl === null) {
      return;
    }

    const contentEl = panelEl.querySelector('.markdown-content');
    if (contentEl === null) {
      return;
    }

    const headings = contentEl.querySelectorAll('h1, h2, h3, h4, h5, h6');
    let idCounter = 0;

    for (const heading of headings) {
      const level = parseInt(heading.tagName.charAt(1), 10);
      const text = heading.textContent || '';

      // Generate or use existing ID
      let id = heading.id;
      if (id === '') {
        id = `toc-heading-${idCounter++}`;
        heading.id = id;
      }

      tocEntries.push({
        level,
        text,
        id,
        element: /** @type {HTMLElement} */ (heading),
      });
    }
  }

  /**
   * Render the TOC list
   */
  function renderTocList() {
    // Clear existing content
    while (tocListEl.firstChild) {
      tocListEl.removeChild(tocListEl.firstChild);
    }

    if (tocEntries.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'toc-empty';
      emptyEl.textContent = 'No headings found';
      tocListEl.appendChild(emptyEl);
      return;
    }

    // Find minimum level for proper indentation
    const minLevel = Math.min(...tocEntries.map((e) => e.level));

    for (const entry of tocEntries) {
      const itemEl = document.createElement('div');
      itemEl.className = 'toc-item';
      itemEl.dataset.id = entry.id;
      itemEl.style.paddingLeft = `${(entry.level - minLevel) * 12 + 8}px`;
      itemEl.textContent = entry.text;
      itemEl.title = entry.text;

      itemEl.addEventListener('click', () => {
        scrollToHeading(entry.id);
      });

      tocListEl.appendChild(itemEl);
    }
  }

  /**
   * Scroll to a heading by ID in the active panel
   * @param {string} id
   */
  function scrollToHeading(id) {
    const panelEl = panels[activePanel].element;
    if (panelEl === null) {
      return;
    }

    const heading = panelEl.querySelector(`#${id}`);
    if (heading !== null) {
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      highlightTocItem(id);
    }
  }

  /**
   * Highlight the current TOC item
   * @param {string} id
   */
  function highlightTocItem(id) {
    // Remove previous highlight
    const previous = tocListEl.querySelector('.toc-item.active');
    if (previous !== null) {
      previous.classList.remove('active');
    }

    // Add highlight to current
    const current = tocListEl.querySelector(`.toc-item[data-id="${id}"]`);
    if (current !== null) {
      current.classList.add('active');
    }
  }

  /**
   * Update TOC highlight based on scroll position in active panel
   */
  function updateTocHighlight() {
    if (tocEntries.length === 0 || !tocVisible) {
      return;
    }

    const panelEl = panels[activePanel].element;
    if (panelEl === null) {
      return;
    }

    const panelTop = panelEl.getBoundingClientRect().top;
    let activeId = null;

    // Find the heading closest to the top of the viewport
    for (const entry of tocEntries) {
      const rect = entry.element.getBoundingClientRect();
      const relativeTop = rect.top - panelTop;

      if (relativeTop <= 20) {
        activeId = entry.id;
      } else {
        break;
      }
    }

    // If no heading is above viewport, use first one
    if (activeId === null && tocEntries.length > 0) {
      activeId = tocEntries[0].id;
    }

    if (activeId !== null) {
      highlightTocItem(activeId);
    }
  }

  /**
   * Toggle TOC panel visibility
   */
  function toggleToc() {
    tocVisible = !tocVisible;

    if (tocVisible) {
      tocPanelEl.classList.add('visible');
      tocBtnEl.classList.add('active');
      parseTocEntries();
      renderTocList();
      updateTocHighlight();
    } else {
      tocPanelEl.classList.remove('visible');
      tocBtnEl.classList.remove('active');
    }
  }

  /**
   * Close TOC panel
   */
  function closeToc() {
    tocVisible = false;
    tocPanelEl.classList.remove('visible');
    tocBtnEl.classList.remove('active');
  }

  // TOC button click handler
  tocBtnEl.addEventListener('click', toggleToc);
  tocCloseBtnEl.addEventListener('click', closeToc);

  // ============================================
  // WORD WRAP TOGGLE
  // ============================================

  /**
   * Update word wrap button visibility (only shown in raw view)
   */
  function updateWordWrapButtonVisibility() {
    const panel = panels[activePanel];
    if (panel.isRawView) {
      wordWrapBtnEl.style.display = 'flex';
      // Update button state based on active panel's setting
      if (panel.wordWrapEnabled) {
        wordWrapBtnEl.classList.remove('active');
      } else {
        wordWrapBtnEl.classList.add('active');
      }
    } else {
      wordWrapBtnEl.style.display = 'none';
    }
  }

  /**
   * Apply word wrap setting to raw content in active panel
   */
  function applyWordWrap() {
    const panel = panels[activePanel];
    const panelEl = panel.element;
    if (panelEl === null) {
      return;
    }

    const rawContentEl = panelEl.querySelector('.raw-content');
    if (rawContentEl !== null) {
      if (panel.wordWrapEnabled) {
        rawContentEl.classList.remove('no-wrap');
      } else {
        rawContentEl.classList.add('no-wrap');
      }
    }
  }

  /**
   * Toggle word wrap for active panel
   */
  function toggleWordWrap() {
    const panel = panels[activePanel];
    panel.wordWrapEnabled = !panel.wordWrapEnabled;

    // Update button state
    if (panel.wordWrapEnabled) {
      wordWrapBtnEl.classList.remove('active');
    } else {
      wordWrapBtnEl.classList.add('active');
    }

    applyWordWrap();

    // Save preference (saves the active panel's setting)
    postMessage('saveWordWrap', { enabled: panel.wordWrapEnabled });
  }

  // Word wrap button click handler
  wordWrapBtnEl.addEventListener('click', toggleWordWrap);

  // ============================================
  // THEME TOGGLE
  // ============================================

  /**
   * Apply the current theme to the document
   * @param {boolean} [save=true] - Whether to save to persistence
   */
  function applyTheme(save = true) {
    // Remove existing theme classes
    document.body.classList.remove('theme-light', 'theme-dark');

    // Apply theme class (auto means no class, uses VS Code theme)
    if (currentTheme === 'light') {
      document.body.classList.add('theme-light');
    } else if (currentTheme === 'dark') {
      document.body.classList.add('theme-dark');
    }

    // Update button UI
    updateThemeButtonUI();

    // Save preference
    if (save) {
      postMessage('saveTheme', { theme: currentTheme });
    }
  }

  /**
   * Update theme button appearance
   */
  function updateThemeButtonUI() {
    switch (currentTheme) {
      case 'auto':
        themeIconEl.textContent = '🌓';
        themeLabelEl.textContent = 'Auto';
        themeBtnEl.classList.remove('active');
        themeBtnEl.title = 'Theme: Auto (follows VS Code) - Ctrl+Shift+T';
        break;
      case 'light':
        themeIconEl.textContent = '☀️';
        themeLabelEl.textContent = 'Light';
        themeBtnEl.classList.add('active');
        themeBtnEl.title = 'Theme: Light - Ctrl+Shift+T';
        break;
      case 'dark':
        themeIconEl.textContent = '🌙';
        themeLabelEl.textContent = 'Dark';
        themeBtnEl.classList.add('active');
        themeBtnEl.title = 'Theme: Dark - Ctrl+Shift+T';
        break;
    }
  }

  /**
   * Cycle through themes: auto -> light -> dark -> auto
   */
  function cycleTheme() {
    switch (currentTheme) {
      case 'auto':
        currentTheme = 'light';
        break;
      case 'light':
        currentTheme = 'dark';
        break;
      case 'dark':
        currentTheme = 'auto';
        break;
    }
    applyTheme();
  }

  // Theme button click handler
  themeBtnEl.addEventListener('click', cycleTheme);

  // ============================================
  // SPLIT VIEW
  // ============================================

  /**
   * Update panel header with filename
   * @param {PanelId} panelId
   * @param {string} filePath
   */
  function updatePanelHeader(panelId, filePath) {
    const headerEl = panelId === 'panel1' ? panelHeader1El : panelHeader2El;
    const fileName = filePath.split(/[/\\]/).pop() || filePath;
    headerEl.textContent = fileName;
    headerEl.title = filePath;
  }

  /**
   * Cycle split mode: none -> vertical -> horizontal -> none
   */
  function cycleSplitMode() {
    switch (splitMode) {
      case 'none':
        splitMode = 'vertical';
        break;
      case 'vertical':
        splitMode = 'horizontal';
        break;
      case 'horizontal':
        splitMode = 'none';
        break;
    }
    applySplitMode();
  }

  /**
   * Apply the current split mode to the DOM
   */
  function applySplitMode() {
    // Remove existing split classes
    panelsContainerEl.classList.remove('split-vertical', 'split-horizontal');

    // Apply new split class
    if (splitMode !== 'none') {
      panelsContainerEl.classList.add(`split-${splitMode}`);
    }

    // Update split button UI
    updateSplitButtonUI();

    // If returning to single-panel mode, make panel1 active and reset flex styles
    if (splitMode === 'none') {
      setActivePanel('panel1');
      // Reset flex styles that may have been set during panel divider resizing
      renderPanel1El.style.flex = '';
      renderPanel2El.style.flex = '';
    }
  }

  /**
   * Update split button appearance
   */
  function updateSplitButtonUI() {
    switch (splitMode) {
      case 'none':
        splitIconEl.textContent = '⊞';
        splitLabelEl.textContent = 'Split';
        splitBtnEl.classList.remove('active');
        splitBtnEl.title = 'Split view (Ctrl+\\)';
        break;
      case 'vertical':
        splitIconEl.textContent = '◫';
        splitLabelEl.textContent = 'Vertical';
        splitBtnEl.classList.add('active');
        splitBtnEl.title = 'Horizontal split (Ctrl+\\)';
        break;
      case 'horizontal':
        splitIconEl.textContent = '⊟';
        splitLabelEl.textContent = 'Horizontal';
        splitBtnEl.classList.add('active');
        splitBtnEl.title = 'Exit split (Ctrl+\\)';
        break;
    }
  }

  /**
   * Set the active panel
   * @param {PanelId} panelId
   */
  function setActivePanel(panelId) {
    // Don't switch to panel2 if not in split mode
    if (panelId === 'panel2' && splitMode === 'none') {
      return;
    }

    activePanel = panelId;

    // Update visual indicator
    renderPanel1El.classList.toggle('active', panelId === 'panel1');
    renderPanel2El.classList.toggle('active', panelId === 'panel2');

    // Update toolbar buttons to reflect active panel's state
    updateViewToggleUI();

    // Update TOC if visible
    if (tocVisible) {
      parseTocEntries();
      renderTocList();
      updateTocHighlight();
    }

    // Update reading progress for active panel
    updateReadingProgress();

    // Update status bar with active panel's file info
    const panel = panels[panelId];
    if (panel.filePath !== null) {
      const lines = panel.rawContent.split('\n').length;
      const words = countWords(panel.rawContent);
      updateStatusBar(panel.filePath, lines, words);
    }
  }

  /**
   * Count words in text
   * @param {string} text
   * @returns {number}
   */
  function countWords(text) {
    const trimmed = text.trim();
    if (trimmed === '') {
      return 0;
    }
    return trimmed.split(/\s+/).length;
  }

  // Click handlers for panel activation
  renderPanel1El.addEventListener('click', () => setActivePanel('panel1'));
  renderPanel2El.addEventListener('click', () => setActivePanel('panel2'));

  // Split button click handler
  splitBtnEl.addEventListener('click', cycleSplitMode);

  // ============================================
  // SOURCE PREVIEW ON HOVER
  // ============================================

  /** @type {HTMLElement|null} */
  let currentHoverElement = null;

  /** @type {number|null} */
  let tooltipShowTimer = null;

  /**
   * Toggle source preview feature
   */
  function toggleSourcePreview() {
    sourcePreviewEnabled = !sourcePreviewEnabled;
    updateSourcePreviewUI();
    postMessage('saveSourcePreview', { enabled: sourcePreviewEnabled });
  }

  /**
   * Update source preview button UI
   */
  function updateSourcePreviewUI() {
    if (sourcePreviewEnabled) {
      sourcePreviewBtnEl.classList.add('active');
      document.body.classList.add('source-preview-enabled');
    } else {
      sourcePreviewBtnEl.classList.remove('active');
      document.body.classList.remove('source-preview-enabled');
      hideSourceTooltip();
    }
  }

  /**
   * Handle mouseover for source preview
   * @param {MouseEvent} e
   */
  function handleSourcePreviewMouseOver(e) {
    if (!sourcePreviewEnabled) {
      return;
    }

    const target = /** @type {HTMLElement} */ (e.target);
    const sourceElement = /** @type {HTMLElement|null} */ (target.closest('[data-source-start]'));

    if (sourceElement === null || sourceElement === currentHoverElement) {
      return;
    }

    currentHoverElement = sourceElement;

    // Delay showing tooltip to avoid flicker
    if (tooltipShowTimer !== null) {
      clearTimeout(tooltipShowTimer);
    }

    tooltipShowTimer = window.setTimeout(() => {
      if (currentHoverElement !== null) {
        showSourceTooltip(currentHoverElement, e);
      }
    }, 300);
  }

  /**
   * Handle mouseout for source preview
   * @param {MouseEvent} e
   */
  function handleSourcePreviewMouseOut(e) {
    const relatedTarget = /** @type {HTMLElement|null} */ (e.relatedTarget);

    // Check if mouse moved to tooltip or another source element
    if (relatedTarget !== null) {
      if (sourceTooltipEl.contains(relatedTarget)) {
        return; // Mouse moved to tooltip, keep it open
      }
      const newSourceElement = relatedTarget.closest('[data-source-start]');
      if (newSourceElement === currentHoverElement) {
        return; // Still within same element
      }
    }

    if (tooltipShowTimer !== null) {
      clearTimeout(tooltipShowTimer);
      tooltipShowTimer = null;
    }

    currentHoverElement = null;
    hideSourceTooltip();
  }

  /**
   * Show source tooltip for an element
   * @param {HTMLElement} element
   * @param {MouseEvent} e
   */
  function showSourceTooltip(element, e) {
    const startLine = parseInt(element.getAttribute('data-source-start') || '0', 10);
    const endLine = parseInt(element.getAttribute('data-source-end') || '0', 10);

    // Determine which panel the hovered element belongs to
    const panelId = renderPanel2El.contains(element) ? 'panel2' : 'panel1';
    const panel = panels[panelId];
    if (panel.rawContent === '') {
      return;
    }

    // Extract source lines (map is 0-indexed, endLine is exclusive)
    const lines = panel.rawContent.split('\n');
    const sourceLines = lines.slice(startLine, endLine);
    const sourceText = sourceLines.join('\n').trim();

    if (sourceText === '') {
      return;
    }

    // Update tooltip content
    tooltipLineRangeEl.textContent = startLine === endLine - 1
      ? String(startLine + 1)  // Single line (convert to 1-indexed)
      : `${startLine + 1}-${endLine}`;  // Range (1-indexed)
    tooltipContentEl.textContent = sourceText;

    // Position tooltip near mouse
    positionTooltip(e.clientX, e.clientY);
    sourceTooltipEl.classList.add('visible');
  }

  /**
   * Position tooltip avoiding viewport edges
   * @param {number} mouseX
   * @param {number} mouseY
   */
  function positionTooltip(mouseX, mouseY) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = mouseX + 15;
    let top = mouseY + 15;

    // Adjust if would overflow right
    if (left + 500 > viewportWidth) {
      left = mouseX - 515;
    }

    // Adjust if would overflow bottom
    if (top + 300 > viewportHeight) {
      top = mouseY - 315;
    }

    // Clamp to viewport
    left = Math.max(10, Math.min(left, viewportWidth - 510));
    top = Math.max(10, Math.min(top, viewportHeight - 310));

    sourceTooltipEl.style.left = `${left}px`;
    sourceTooltipEl.style.top = `${top}px`;
  }

  /**
   * Hide source tooltip
   */
  function hideSourceTooltip() {
    sourceTooltipEl.classList.remove('visible');
  }

  // Source preview button click handler
  sourcePreviewBtnEl.addEventListener('click', toggleSourcePreview);

  // Hover listeners for both panels
  renderPanel1El.addEventListener('mouseover', handleSourcePreviewMouseOver);
  renderPanel1El.addEventListener('mouseout', handleSourcePreviewMouseOut);
  renderPanel2El.addEventListener('mouseover', handleSourcePreviewMouseOver);
  renderPanel2El.addEventListener('mouseout', handleSourcePreviewMouseOut);

  // Hide tooltip when mouse leaves tooltip itself
  sourceTooltipEl.addEventListener('mouseleave', hideSourceTooltip);

  // ============================================
  // FILTER INPUT
  // ============================================

  filterInputEl.addEventListener('input', () => {
    if (filterDebounceTimer !== null) {
      clearTimeout(filterDebounceTimer);
    }

    filterDebounceTimer = setTimeout(() => {
      const pattern = filterInputEl.value.trim();
      notifyFilterChanged(pattern || '*.md');
    }, 300);
  });

  // ============================================
  // PANEL RESIZING
  // ============================================

  let isResizing = false;

  dividerEl.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) {
      return;
    }

    const containerWidth = document.body.clientWidth;
    let newWidth = e.clientX;

    // Enforce minimum widths
    if (newWidth < 200) {
      newWidth = 200;
    }
    if (containerWidth - newWidth < 300) {
      newWidth = containerWidth - 300;
    }

    leftPanel.style.width = `${newWidth}px`;
    leftPanel.style.flex = 'none';
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';

      // Save the new panel width
      const width = leftPanel.offsetWidth;
      postMessage('savePanelWidth', { width });
    }

    // Handle panel divider resize end
    if (isPanelResizing) {
      isPanelResizing = false;
      document.body.style.cursor = '';
    }
  });

  // ============================================
  // SPLIT VIEW PANEL DIVIDER RESIZING
  // ============================================

  let isPanelResizing = false;

  panelDividerEl.addEventListener('mousedown', (e) => {
    if (splitMode === 'none') {
      return;
    }
    isPanelResizing = true;
    document.body.style.cursor = splitMode === 'vertical' ? 'col-resize' : 'row-resize';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isPanelResizing) {
      return;
    }

    const containerRect = panelsContainerEl.getBoundingClientRect();

    if (splitMode === 'vertical') {
      let ratio = (e.clientX - containerRect.left) / containerRect.width;
      ratio = Math.max(0.2, Math.min(0.8, ratio)); // Constrain 20%-80%
      renderPanel1El.style.flex = String(ratio);
      renderPanel2El.style.flex = String(1 - ratio);
    } else if (splitMode === 'horizontal') {
      let ratio = (e.clientY - containerRect.top) / containerRect.height;
      ratio = Math.max(0.2, Math.min(0.8, ratio)); // Constrain 20%-80%
      renderPanel1El.style.flex = String(ratio);
      renderPanel2El.style.flex = String(1 - ratio);
    }
  });

  // ============================================
  // KEYBOARD NAVIGATION
  // ============================================

  /** @type {HTMLElement|null} */
  let focusedElement = null;

  /**
   * Get all navigable items in the tree (visible files and folders)
   * @returns {HTMLElement[]}
   */
  function getNavigableItems() {
    const items = [];
    const allItems = fileTreeEl.querySelectorAll('.tree-item');
    for (const item of allItems) {
      // Check if item is visible (not inside collapsed folder)
      const parent = item.closest('.tree-folder.collapsed > .tree-children');
      if (parent === null) {
        items.push(/** @type {HTMLElement} */ (item));
      }
    }
    return items;
  }

  /**
   * Set focus on a tree item
   * @param {HTMLElement|null} element
   */
  function setTreeFocus(element) {
    // Remove previous focus
    if (focusedElement !== null) {
      focusedElement.classList.remove('focused');
    }

    focusedElement = element;

    if (element !== null) {
      element.classList.add('focused');
      element.scrollIntoView({ block: 'nearest' });
    }
  }

  /**
   * Handle keyboard navigation in the tree
   * @param {KeyboardEvent} e
   */
  function handleTreeKeydown(e) {
    const items = getNavigableItems();
    if (items.length === 0) {
      return;
    }

    // Initialize focus if not set
    if (focusedElement === null || !items.includes(focusedElement)) {
      const selected = fileTreeEl.querySelector('.tree-item.selected');
      if (selected !== null) {
        setTreeFocus(/** @type {HTMLElement} */ (selected));
      } else {
        setTreeFocus(items[0]);
      }
    }

    const currentIndex = focusedElement !== null ? items.indexOf(focusedElement) : -1;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        if (currentIndex > 0) {
          setTreeFocus(items[currentIndex - 1]);
        }
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (currentIndex < items.length - 1) {
          setTreeFocus(items[currentIndex + 1]);
        }
        break;

      case 'ArrowRight':
        e.preventDefault();
        if (focusedElement !== null) {
          const folder = focusedElement.closest('.tree-folder');
          if (folder !== null && folder.classList.contains('collapsed')) {
            folder.classList.remove('collapsed');
            const toggle = focusedElement.querySelector('.folder-toggle');
            if (toggle !== null) {
              toggle.textContent = '▼';
            }
          }
        }
        break;

      case 'ArrowLeft':
        e.preventDefault();
        if (focusedElement !== null) {
          const folder = focusedElement.closest('.tree-folder');
          if (folder !== null && !folder.classList.contains('collapsed')) {
            folder.classList.add('collapsed');
            const toggle = focusedElement.querySelector('.folder-toggle');
            if (toggle !== null) {
              toggle.textContent = '▶';
            }
          }
        }
        break;

      case 'Enter':
        e.preventDefault();
        if (focusedElement !== null && focusedElement.classList.contains('tree-file')) {
          const filePath = focusedElement.dataset.path;
          if (filePath !== undefined) {
            selectFile(filePath, focusedElement);
          }
        }
        break;
    }
  }

  // Make file tree focusable and add keyboard listener
  fileTreeEl.setAttribute('tabindex', '0');
  fileTreeEl.addEventListener('keydown', handleTreeKeydown);

  // Set focus when clicking in tree
  fileTreeEl.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const treeItem = target.closest('.tree-item');
    if (treeItem !== null) {
      setTreeFocus(/** @type {HTMLElement} */ (treeItem));
    }
  });

  // ============================================
  // CONTEXT MENU
  // ============================================

  /** @type {string|null} */
  let contextMenuFilePath = null;

  /**
   * @typedef {Object} ContextMenuItem
   * @property {string} icon
   * @property {string} label
   * @property {string} action
   * @property {string} [shortcut]
   * @property {boolean} [separator]
   */

  /**
   * Build context menu items for a file
   * @param {string} filePath
   * @param {boolean} bookmarked
   * @returns {ContextMenuItem[]}
   */
  function buildContextMenuItems(filePath, bookmarked) {
    return [
      { icon: '📄', label: 'Open in Panel 1', action: 'openPanel1' },
      { icon: '📑', label: 'Open in Panel 2', action: 'openPanel2' },
      { icon: bookmarked ? '★' : '☆', label: bookmarked ? 'Remove Bookmark' : 'Add Bookmark', action: 'toggleBookmark', shortcut: 'Ctrl+D' },
      { icon: '', label: '', action: '', separator: true },
      { icon: '📝', label: 'Open in Editor', action: 'openInEditor' },
      { icon: '📂', label: 'Reveal in Explorer', action: 'revealInExplorer' },
      { icon: '💻', label: 'Open in Terminal', action: 'openInTerminal' },
      { icon: '', label: '', action: '', separator: true },
      { icon: '📋', label: 'Copy Path', action: 'copyPath' },
      { icon: '📋', label: 'Copy Relative Path', action: 'copyRelativePath' },
      { icon: '📋', label: 'Copy File Name', action: 'copyFileName' },
      { icon: '', label: '', action: '', separator: true },
      { icon: '🗑️', label: 'Delete', action: 'deleteFile' },
    ];
  }

  /**
   * Show context menu at specified position
   * @param {number} x
   * @param {number} y
   * @param {string} filePath
   */
  function showContextMenu(x, y, filePath) {
    contextMenuFilePath = filePath;
    const bookmarked = isBookmarked(filePath);
    const items = buildContextMenuItems(filePath, bookmarked);

    // Clear existing menu items safely
    while (contextMenuEl.firstChild) {
      contextMenuEl.removeChild(contextMenuEl.firstChild);
    }

    // Build menu items using DOM methods
    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'context-menu-separator';
        contextMenuEl.appendChild(sep);
      } else {
        const menuItem = document.createElement('div');
        menuItem.className = 'context-menu-item';
        menuItem.dataset.action = item.action;

        const iconSpan = document.createElement('span');
        iconSpan.className = 'context-menu-item-icon';
        iconSpan.textContent = item.icon;

        const labelSpan = document.createElement('span');
        labelSpan.className = 'context-menu-item-label';
        labelSpan.textContent = item.label;

        menuItem.appendChild(iconSpan);
        menuItem.appendChild(labelSpan);

        if (item.shortcut) {
          const shortcutSpan = document.createElement('span');
          shortcutSpan.className = 'context-menu-item-shortcut';
          shortcutSpan.textContent = item.shortcut;
          menuItem.appendChild(shortcutSpan);
        }

        menuItem.addEventListener('click', () => {
          hideContextMenu();
          handleContextMenuAction(item.action, filePath);
        });

        contextMenuEl.appendChild(menuItem);
      }
    }

    // Position the menu
    contextMenuEl.style.left = `${x}px`;
    contextMenuEl.style.top = `${y}px`;
    contextMenuEl.classList.add('visible');

    // Adjust position if menu goes off screen
    requestAnimationFrame(() => {
      const rect = contextMenuEl.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (rect.right > viewportWidth) {
        contextMenuEl.style.left = `${viewportWidth - rect.width - 8}px`;
      }
      if (rect.bottom > viewportHeight) {
        contextMenuEl.style.top = `${viewportHeight - rect.height - 8}px`;
      }
    });
  }

  /**
   * Hide the context menu
   */
  function hideContextMenu() {
    contextMenuEl.classList.remove('visible');
    contextMenuFilePath = null;
  }

  /**
   * Handle context menu action
   * @param {string} action
   * @param {string} filePath
   */
  function handleContextMenuAction(action, filePath) {
    const fileName = filePath.split(/[/\\]/).pop() || filePath;

    switch (action) {
      case 'openPanel1':
        pendingFileRequest = 'panel1';
        setActivePanel('panel1');
        requestFile(filePath);
        break;
      case 'openPanel2':
        // Enable split mode if not already enabled
        if (splitMode === 'none') {
          cycleSplitMode(); // Enables vertical split
        }
        pendingFileRequest = 'panel2';
        setActivePanel('panel2');
        requestFile(filePath);
        break;
      case 'toggleBookmark':
        toggleBookmark(filePath);
        break;
      case 'openInEditor':
        postMessage('openExternal', { url: filePath, type: 'editor' });
        break;
      case 'revealInExplorer':
        postMessage('openExternal', { url: filePath, type: 'explorer' });
        break;
      case 'openInTerminal':
        postMessage('openExternal', { url: filePath, type: 'terminal' });
        break;
      case 'copyPath':
        navigator.clipboard.writeText(filePath);
        break;
      case 'copyRelativePath':
        postMessage('openExternal', { url: filePath, type: 'copyRelativePath' });
        break;
      case 'copyFileName':
        navigator.clipboard.writeText(fileName);
        break;
      case 'deleteFile':
        postMessage('deleteFile', { path: filePath });
        break;
    }
  }

  // Close context menu on click outside or Escape
  document.addEventListener('click', (e) => {
    if (!contextMenuEl.contains(/** @type {Node} */ (e.target))) {
      hideContextMenu();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideContextMenu();
    }
  });

  // Right-click context menu for files
  fileTreeEl.addEventListener('contextmenu', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const fileItem = /** @type {HTMLElement|null} */ (target.closest('.tree-file'));

    if (fileItem === null) {
      return; // Only handle files, not folders
    }

    e.preventDefault();

    const filePath = fileItem.dataset.path;
    if (filePath === undefined) {
      return;
    }

    showContextMenu(e.clientX, e.clientY, filePath);
  });

  // ============================================
  // MERMAID DIAGRAM RENDERING
  // ============================================

  /** @type {boolean} */
  let mermaidLoaded = false;

  /** @type {boolean} */
  let mermaidLoading = false;

  /** @type {Array<() => void>} */
  let mermaidPendingCallbacks = [];

  /**
   * Load mermaid library from CDN (lazy-loaded on first diagram)
   * @param {() => void} callback
   */
  function loadMermaid(callback) {
    if (mermaidLoaded) {
      callback();
      return;
    }

    mermaidPendingCallbacks.push(callback);

    if (mermaidLoading) {
      return;
    }

    mermaidLoading = true;

    // Use local mermaid URI if available, otherwise skip loading
    if (mermaidUri === undefined) {
      mermaidLoading = false;
      console.error('Mermaid URI not available');
      return;
    }

    const script = document.createElement('script');
    script.src = mermaidUri;
    script.onload = () => {
      mermaidLoaded = true;
      mermaidLoading = false;

      // @ts-ignore - mermaid is loaded from CDN
      window.mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'strict',
        flowchart: {
          useMaxWidth: false,
        },
      });

      // Execute all pending callbacks
      const callbacks = mermaidPendingCallbacks;
      mermaidPendingCallbacks = [];
      for (const cb of callbacks) {
        cb();
      }
    };
    script.onerror = () => {
      mermaidLoading = false;
      console.error('Failed to load mermaid library');
    };

    document.head.appendChild(script);
  }

  /**
   * Creates zoom and copy controls for Mermaid diagrams
   * @param {string} content - The Mermaid source code to copy
   * @param {HTMLElement} wrapper - The SVG wrapper element to apply zoom to
   * @returns {HTMLElement}
   */
  function createMermaidControls(content, wrapper) {
    const controls = document.createElement('div');
    controls.className = 'mermaid-controls';

    let zoomLevel = 100;
    const minZoom = 50;
    const maxZoom = 300;
    const zoomStep = 25;

    // Zoom level display
    const zoomDisplay = document.createElement('span');
    zoomDisplay.className = 'mermaid-zoom-level';
    zoomDisplay.textContent = '100%';

    /**
     * Updates the zoom level and applies transform
     * @param {number} newZoom
     */
    function updateZoom(newZoom) {
      zoomLevel = Math.min(maxZoom, Math.max(minZoom, newZoom));
      wrapper.style.transform = `scale(${zoomLevel / 100})`;
      zoomDisplay.textContent = `${zoomLevel}%`;
    }

    // Zoom out button
    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.textContent = '−';
    zoomOutBtn.dataset.tooltip = 'Zoom out';
    zoomOutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      updateZoom(zoomLevel - zoomStep);
    });

    // Zoom in button
    const zoomInBtn = document.createElement('button');
    zoomInBtn.textContent = '+';
    zoomInBtn.dataset.tooltip = 'Zoom in';
    zoomInBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      updateZoom(zoomLevel + zoomStep);
    });

    // Reset zoom button
    const resetBtn = document.createElement('button');
    resetBtn.textContent = '🔄';
    resetBtn.dataset.tooltip = 'Reset zoom (100%)';
    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      updateZoom(100);
    });

    // Copy button
    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋';
    copyBtn.dataset.tooltip = 'Copy Mermaid code';
    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(content);
        copyBtn.textContent = '✓';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.textContent = '📋';
          copyBtn.classList.remove('copied');
        }, 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    });

    controls.appendChild(zoomOutBtn);
    controls.appendChild(zoomDisplay);
    controls.appendChild(zoomInBtn);
    controls.appendChild(resetBtn);
    controls.appendChild(copyBtn);

    // Mouse wheel zoom (Ctrl/Cmd + wheel)
    wrapper.parentElement?.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -zoomStep : zoomStep;
        updateZoom(zoomLevel + delta);
      }
    }, { passive: false });

    return controls;
  }

  /**
   * Render all mermaid diagrams in a specific panel
   * @param {PanelId} [panelId] - Target panel ID (defaults to active panel)
   */
  function renderMermaidDiagramsInPanel(panelId = activePanel) {
    const panelEl = panels[panelId].element;
    if (panelEl === null) {
      return;
    }

    const diagrams = panelEl.querySelectorAll('.mermaid-diagram');
    if (diagrams.length === 0) {
      return;
    }

    loadMermaid(() => {
      let diagramId = 0;
      for (const diagram of diagrams) {
        const encoded = diagram.getAttribute('data-mermaid');
        if (encoded === null) {
          continue;
        }

        try {
          const content = atob(encoded);
          const id = `mermaid-${Date.now()}-${diagramId++}`;

          // @ts-ignore - mermaid is loaded from CDN
          window.mermaid.render(id, content).then((result) => {
            // Clear diagram and insert SVG using DOMParser for safe HTML handling
            // Mermaid output is sanitized (securityLevel: 'strict'), but we parse it safely
            // Parse as text/html to handle HTML-style tags like <br> inside foreignObject
            const parser = new DOMParser();
            const htmlDoc = parser.parseFromString(result.svg, 'text/html');
            const svgElement = htmlDoc.querySelector('svg');

            if (svgElement === null) {
              throw new Error('Failed to parse SVG from Mermaid output');
            }

            // Clear existing content safely
            while (diagram.firstChild) {
              diagram.removeChild(diagram.firstChild);
            }

            // Create container for scrolling when zoomed
            const container = document.createElement('div');
            container.className = 'mermaid-svg-container';

            // Create wrapper for zoom transform
            const wrapper = document.createElement('div');
            wrapper.className = 'mermaid-svg-wrapper';
            wrapper.appendChild(document.importNode(svgElement, true));
            container.appendChild(wrapper);

            diagram.appendChild(container);
            diagram.classList.add('mermaid-rendered');

            // Add zoom and copy controls
            const controls = createMermaidControls(content, wrapper);
            diagram.appendChild(controls);
          }).catch((err) => {
            // Use textContent to prevent XSS from error messages
            const errorPre = document.createElement('pre');
            errorPre.className = 'mermaid-error';
            errorPre.textContent = `Mermaid error: ${err instanceof Error ? err.message : 'Unknown error'}`;
            while (diagram.firstChild) {
              diagram.removeChild(diagram.firstChild);
            }
            diagram.appendChild(errorPre);
            diagram.classList.add('mermaid-error');
          });
        } catch (err) {
          // Use textContent to prevent XSS
          const errorPre = document.createElement('pre');
          errorPre.className = 'mermaid-error';
          errorPre.textContent = 'Failed to decode diagram';
          while (diagram.firstChild) {
            diagram.removeChild(diagram.firstChild);
          }
          diagram.appendChild(errorPre);
          diagram.classList.add('mermaid-error');
        }
      }
    });
  }

  /**
   * Render all mermaid diagrams in the content (legacy function for compatibility)
   */
  function renderMermaidDiagrams() {
    renderMermaidDiagramsInPanel(activePanel);
  }

  // ============================================
  // LINK HANDLING (for both panels)
  // ============================================

  /**
   * Handle link clicks in a panel
   * @param {MouseEvent} e
   */
  function handleLinkClick(e) {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.tagName === 'A') {
      const href = target.getAttribute('href');
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        e.preventDefault();
        postMessage('openExternal', { url: href });
      }
    }
  }

  renderPanel1El.addEventListener('click', handleLinkClick);
  renderPanel2El.addEventListener('click', handleLinkClick);

  // ============================================
  // COPY CODE BUTTON (for both panels)
  // ============================================

  /**
   * Handle copy button clicks in a panel
   * @param {MouseEvent} e
   */
  function handleCopyClick(e) {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.classList.contains('copy-btn')) {
      const encoded = target.getAttribute('data-code');
      if (encoded === null) {
        return;
      }

      try {
        const code = atob(encoded);
        navigator.clipboard.writeText(code).then(() => {
          // Show success feedback
          target.textContent = '✓';
          target.classList.add('copied');

          // Reset after 1.5 seconds
          setTimeout(() => {
            target.textContent = '📋';
            target.classList.remove('copied');
          }, 1500);
        }).catch(() => {
          // Fallback: show error briefly
          target.textContent = '✗';
          setTimeout(() => {
            target.textContent = '📋';
          }, 1500);
        });
      } catch {
        // Decode error
        target.textContent = '✗';
        setTimeout(() => {
          target.textContent = '📋';
        }, 1500);
      }
    }
  }

  renderPanel1El.addEventListener('click', handleCopyClick);
  renderPanel2El.addEventListener('click', handleCopyClick);

  // ============================================
  // WEBVIEW READY SIGNAL
  // ============================================

  // Notify extension that webview is ready to receive messages
  postMessage('webviewReady', {});

})();
