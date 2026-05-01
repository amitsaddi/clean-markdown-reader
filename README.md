# Clean Markdown Reader

A lightweight, distraction-free markdown reader for VS Code. Finally, a proper way to read documentation.

![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/amitsaddi.clean-markdown-reader)
![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/amitsaddi.clean-markdown-reader)
![License](https://img.shields.io/github/license/amitsaddi/clean-markdown-reader)

---

## Why Clean Markdown Reader?

VS Code's built-in markdown preview gets the job done for quick checks. But when you're settling in to read through project docs, a knowledge base, or technical specs? It falls short.

Clean Markdown Reader gives you a dedicated reading environment. You get a file tree, bookmarks, reading progress tracking, and a clean interface that stays out of your way. Think of it as "reader mode" for your markdown files.

**Works great for:**
- Project documentation and READMEs
- Knowledge bases and wikis
- Technical specifications
- Markdown-based note collections

---

## Features

### Two-Panel Layout
Your files live on the left, rendered content on the right. Drag the divider to adjust panel widths. Need to compare two documents? Split view lets you see them side-by-side (vertically or horizontally).

### File Navigation
The extension scans your folder recursively and finds all markdown files automatically. Folders collapse and expand with a click. You can filter files using glob patterns like `docs/**/*.md`, and keyboard navigation works exactly as you'd expect—arrow keys to move, Enter to select.

Common clutter folders (`node_modules`, `.git`, `dist`, `build`) stay hidden by default. Quick folder switching through the activity bar keeps your recent folders within reach.

### Reading Experience
Zoom from 50% to 200% using toolbar buttons or keyboard shortcuts. A progress bar shows how far you've scrolled, and reading time estimates help you plan your reading sessions. The auto-generated table of contents pulls from your document headings—click any entry to jump straight there.

Three theme modes give you control: Auto follows your VS Code theme, or force Light/Dark mode independently.

### Organization
Star files to bookmark them for quick access later. The extension tracks your last 10 viewed files and 10 opened folders automatically. Panel widths, zoom levels, and bookmarks persist across sessions.

### Markdown Rendering
Full CommonMark support covers headers, lists, tables, blockquotes, and code blocks. Syntax highlighting handles 180+ languages through highlight.js. Mermaid diagrams render inline with their own zoom and copy controls. YAML front-matter gets parsed and displayed cleanly, and relative image paths resolve correctly. Math equations are fully supported via integrated KaTeX rendering. Wiki-style linking (`[[Page Title]]`) allows easy inter-document navigation.

### Tag Filtering & Task Aggregation
Organize your knowledge base effortlessly:
- **Tag Filtering:** Extract tags from YAML frontmatter and filter your folder view using the tag dropdown.
- **Tasks View:** View and navigate all `- [ ]` markdown checkboxes across your workspace in a dedicated VS Code Activity Bar view.

### Export to PDF & HTML
Export your rendered documents exactly how they appear in the reader. Print directly to PDF using your browser engine, or export to a standalone, bundled HTML file for sharing.

### Code Blocks
Code blocks get syntax highlighting with auto-detection when you don't specify a language. Multi-line blocks show line numbers, and every block has a copy button for quick clipboard access.

### Source Preview & Scroll Sync
Curious what the raw markdown looks like? Enable source preview and hover over any rendered element to see the original markup with line numbers. You can also `Alt+Click` any rendered paragraph or block to instantly open the source `.md` file in VS Code exactly at that line.

### Separate Window Mode
Prefer a dedicated window? Enable `openInSeparateWindow` in settings and the reader opens in its own VS Code instance.

---

## Quick Start

1. **Install** from the VS Code Marketplace
2. **Click** the Clean Markdown Reader icon (M with down arrow) in the Activity Bar
3. **Select** a folder with markdown files
4. **Start reading**—click any file in the tree

You can also click the Clean Markdown Reader icon (M with down arrow) in the editor title bar when viewing a markdown file, right-click any `.md` file in Explorer and choose "Open in Clean Markdown Reader", right-click any folder and choose "Open with Clean Markdown Reader", or use the Command Palette.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+R` | Toggle raw/rendered view |
| `Ctrl+Shift+O` | Toggle table of contents |
| `Ctrl+Shift+T` | Cycle theme (auto/light/dark) |
| `Ctrl+\` | Cycle split view mode |
| `Ctrl+1` / `Ctrl+2` | Focus panel 1 / panel 2 |
| `Ctrl+D` | Toggle bookmark |
| `Ctrl++` / `Ctrl+-` | Zoom in / out |
| `Ctrl+0` | Reset zoom to 100% |
| Arrow keys | Navigate file tree |
| Enter | Select file |
| Escape | Close TOC panel |

*On Mac, use `Cmd` instead of `Ctrl`*

---

## Settings

Find these under **Settings** → search "Clean Markdown Reader"

| Setting | Default | Description |
|---------|---------|-------------|
| `defaultPattern` | `*.{md,markdown,...}` | Default file filter pattern |
| `panelWidth` | 30 | Left panel width (%) |
| `rememberLastFolder` | true | Reopen last folder on launch |
| `autoRefreshOnChange` | true | Refresh when file changes |
| `defaultView` | rendered | Start in rendered or raw view |
| `syntaxHighlighting` | true | Enable code highlighting |
| `renderMermaid` | true | Render mermaid diagrams |
| `showLineNumbers` | true | Line numbers in code blocks |
| `fontSize` | 14 | Base font size (px) |
| `fontFamily` | System fonts | Font for rendered content |
| `showReadingProgress` | true | Show progress indicator |
| `readingSpeed` | 200 | Words per minute |
| `enableSourcePreview` | false | Show source on hover |
| `openInSeparateWindow` | false | Open in separate VS Code window |
| `customCSS` | (empty) | Inject custom CSS styles |

### Custom CSS Example

```css
/* Custom heading color */
.markdown-content h1 { color: #ff6b6b; }

/* Increase line height */
.markdown-content { line-height: 1.8; }

/* Custom code block style */
pre { border-radius: 8px; }
```

---

## Context Menu

Right-click any file in the reader's file tree for quick actions:

**Reader Actions:**
- Open in Panel 1 / Panel 2
- Add/Remove Bookmark

**VS Code Actions:**
- Open in Editor
- Reveal in Explorer
- Open in Terminal

**Copy Actions:**
- Copy Path / Relative Path / File Name

**File Management:**
- Delete (with confirmation)

---

## Supported File Types

`.md` · `.markdown` · `.mdown` · `.mkd` · `.mkdn` · `.mdwn`

---

## Requirements

VS Code 1.108.0 or higher

---

## Contributing

Found a bug? Have a feature request? Issues and pull requests are welcome at [GitHub](https://github.com/amitsaddi/clean-markdown-reader).

---

## License

MIT

---

*Clean Markdown Reader—read markdown the way it was meant to be read.*
