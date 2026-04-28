# Changelog

All notable changes to Clean Markdown Reader will be documented in this file.

## [1.12.0] - 2026-04-28

### Added
- **Math equations (KaTeX)** - Inline (`$...$`) and block (`$$...$$`) math now render via `markdown-it-katex`. KaTeX CSS and fonts are bundled in `out/assets/katex/` for full offline support.
- **Wiki-style links** - `[[Page Title]]` syntax renders as a clickable link. Clicking resolves the page name against the current folder tree (case-insensitive, ignoring `.md`/`.markdown`/etc. extensions) and navigates inside the reader.
- **Tag filtering** - YAML front-matter `tags:` are extracted during folder scan and exposed as a dropdown beneath the file filter. Selecting a tag hides files that don't carry it; tag chips are shown next to file names in the tree.
- **HTML export** - New "Export" toolbar button packages the rendered HTML into a standalone file via `vscode.window.showSaveDialog`.
- **Print to PDF** - New "Print" toolbar button triggers `window.print()`. A `@media print` stylesheet hides the file tree, toolbar, status bar, and tooltips so the browser print dialog produces a clean, content-only PDF.
- **Alt+Click / double-click → open source at line** - Block elements now carry `data-source-start` attributes. Alt+clicking (or double-clicking) any rendered block opens the underlying `.md` file in a side editor, scrolled to the matching line.
- **Markdown Tasks tree view** - New activity-bar tree under the Clean Markdown Reader container that aggregates every `- [ ]` and `- [x]` checkbox across `**/*.md` in the workspace. Clicking a task jumps to the corresponding line in the source file.

## [1.11.0] - 2025-01-25

### Added
- **Editor title bar icon** - Click the book icon in the editor title bar when viewing a markdown file to open it in Clean Markdown Reader (opens to the side)
- **Open folder from context menu** - Right-click any folder in Explorer and choose "Open with Clean Markdown Reader" to open it directly

## [1.7.0] - 2025-01-19

### Added
- **Delete file from context menu** - Right-click any file in the file tree to delete it (with confirmation dialog)
- **Custom CSS tooltips** - Toolbar buttons and diagram controls now show styled tooltips on hover

## [1.3.0] - 2025-01-19

### Added
- **Mermaid diagram controls** - Zoom and copy controls for each diagram
  - Zoom in/out buttons with 25% increments (50% to 300% range)
  - Reset button to return to 100%
  - Ctrl/Cmd + mouse wheel zoom support
  - Copy button to copy Mermaid source code
  - Zoom level display showing current percentage
- **Recent folders** - Track last 10 opened folders in the activity bar launcher for quick switching
  - Collapsible section below the folder button
  - One-click to open any recent folder
  - Clear option to remove all recent folders
  - Smart filtering: current folder excluded, non-existent folders silently removed

### Fixed
- **Folder switching** - Selecting a new folder now correctly loads the new folder instead of keeping the old one

## [1.1.0] - 2025-01-17

### Added
- **Separate window mode** - Open the reader in its own VS Code window via `openInSeparateWindow` setting

## [1.0.0] - 2025-01-17

### Added
- Two-panel layout with file tree and content viewer
- Recursive folder scanning with smart exclusions
- Glob pattern filtering for files
- Full CommonMark markdown rendering
- Syntax highlighting for 180+ languages
- Mermaid diagram support
- YAML front-matter parsing
- Zoom controls (50% - 200%)
- Reading progress indicator
- Reading time estimates
- Table of contents with scroll sync
- Bookmarks system
- Recent files tracking
- Split view (vertical/horizontal)
- Source preview on hover
- Theme toggle (Auto/Light/Dark)
- Code block copy button
- Line numbers in code blocks
- Custom CSS injection
- Context menu integration
- Keyboard shortcuts
- Persistent settings across sessions
