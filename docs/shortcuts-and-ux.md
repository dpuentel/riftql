# Keyboard Shortcuts & UX

RiftQL is built around dense, low-noise, keyboard-first workflows with persistent customization.

---

## Command Palette (`Ctrl/Cmd+K`)

Press `Ctrl+K` (`⌘K` on macOS) or click the Command icon in the header bar to:
- Trigger quick actions (new REST/GraphQL tab, send/format request, import cURL, import collection/spec, copy snippet, toggle sidebar/split/theme, manage cookies/environments/settings).
- Jump straight to any saved request across all collections and folders.
- Switch the active Environment (or clear to **No Environment**).

---

## Default Keyboard Shortcuts

Customize any shortcut in **Settings → Shortcuts** (with automatic conflict detection and per-action or global **Reset All**):

| Action | Windows / Linux | macOS |
| --- | --- | --- |
| Send Request | `Ctrl+Enter` | `⌘↵` |
| Cancel In-Flight Request | `Escape` | `Esc` |
| Save Request | `Ctrl+S` | `⌘S` |
| Format Request Body / Query | `Ctrl+Shift+F` | `⌘⇧F` |
| Focus URL Bar | `Ctrl+L` | `⌘L` |
| Copy as Code Snippet | `Ctrl+Shift+C` | `⌘⇧C` |
| Import cURL | `Ctrl+I` | `⌘I` |
| New Request Tab | `Ctrl+T` | `⌘T` |
| Close Active Tab | `Ctrl+W` | `⌘W` |
| Next Tab | `Ctrl+Tab` | `⌃Tab` |
| Previous Tab | `Ctrl+Shift+Tab` | `⌃⇧Tab` |
| Open Command Palette | `Ctrl+K` | `⌘K` |
| New Collection | `Ctrl+Shift+N` | `⌘⇧N` |
| Manage Environments | `Ctrl+E` | `⌘E` |
| Manage Cookie Jar | `Ctrl+Shift+J` | `⌘⇧J` |
| Open Settings | `Ctrl+,` | `⌘,` |
| Toggle Sidebar | `Ctrl+B` | `⌘B` |
| Toggle Horizontal / Vertical Split | `Ctrl+\` | `⌘\` |
| Toggle Dark / Light Theme | `Ctrl+Shift+L` | `⌘⇧L` |

> [!TIP]
> `Ctrl+Enter` (`⌘↵`) sends the active request even when your cursor is focused inside the JSON, Raw, GraphQL Query, or GraphQL Variables CodeMirror editor.

---

## Hover Tooltips & Resizable Workspace

- **Shortcut-aware tooltips (`ActionTooltip`):** Hover buttons across the app to see their action description alongside the currently configured keybinding `<kbd>` badge.
- **Resizable panels:** Drag to resize the sidebar (`200px–440px`), main Request/Response split (horizontal or vertical), GraphQL Query/Variables divider, and GraphQL Schema Docs width.
- **Resizable modals:** Drag the right edge, bottom edge, or bottom-right corner handle on key workspace modals (dimensions persist automatically in `localStorage`):
  - **Environments** (`riftql-env-modal-size`)
  - **RiftQL Settings** (`riftql-settings-modal-size`)
  - **Domain Cookie Jar** (`riftql-cookies-modal-size`)
  - **Collection / Folder Settings** (`riftql-collection-modal-size`)
  - **Import Collection / Spec** (`riftql-import-modal-size`)
  - **Discover GraphQL Schema** (`riftql-discover-gql-modal-size`)

---

## Themes, Typography, Notifications & Updates

- **Themes:** Switch between **Dark**, **Light**, and **System** (following OS dark/light preference dynamically) via Header toggle, `Ctrl/Cmd+Shift+L`, or **Settings → General**. Palette follows [BRANDING.md](../BRANDING.md).
- **Typography & Font Size:** Adjust **UI Font Size** (`13px–22px`, default `16px`) and **Code Editor Font Size** (`11px–22px`, default `13px`) independently in **Settings → General**. Both use locally bundled offline variable fonts (`Inter` and `JetBrains Mono`).
- **Sonner-Style Notification Center:** Non-blocking notifications stack in the bottom-right corner with variant icons (`info`, `success`, `warning`, `error`), dismiss button, deduplication by ID, and optional inline action buttons (used for saves, imports, schema generation, Git remote updates, and app updates).
- **In-App Updates (`Settings → Updates`):** RiftQL checks silently on startup (toggleable) or manually via **Check for Updates**, displays release notes, and installs signed updates directly in-app (NSIS `.exe`/`.msi` on Windows, `.AppImage` on Linux, `.app.tar.gz` on macOS) or opens the GitHub Release page for `.deb`/`.rpm` and unsigned builds.
