# RiftQL

> *The local-first API client for REST & GraphQL.*
> *Instant launch. Zero bloat. Built for keyboard-first workflows.*

**RiftQL** is a cross-platform desktop API client combining essential REST workflows (Postman) and native GraphQL introspection & exploration (Altair) with a dense, quiet, Linear/Raycast-inspired interface built on **Tauri v2**, **Rust**, and **React**.

---

## Key Features (MVP)

- **REST & GraphQL Client**:
  - Standard HTTP methods (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`) executed natively in Rust (`reqwest` + `tokio`) with zero CORS restrictions.
  - Native GraphQL editor powered by CodeMirror 6 + `cm6-graphql`: schema-aware autocomplete, linting, multi-operation selector, JSON variables editor, on-demand introspection caching per endpoint, and a searchable **Schema Docs** explorer.
- **Request Construction & Auth**:
  - Bidirectional URL <-> Query Params sync preserving `{{variable}}` templates.
  - Headers, Body (`None`, `JSON` with validation/formatting, `Form-data` with native streaming file uploads, `URL-encoded`, `Raw` text/XML/HTML/JS, and `GraphQL`).
  - Authorization (`Inherit`, `Bearer Token`, `Basic Auth`, `API Key` in Header or Query Param) with automatic inheritance across nested folders and collections.
- **Domain Cookie Jar & Network Controls**:
  - RFC 6265 Cookie Jar stored locally in SQLite, capturing `Set-Cookie` headers across redirects and resending matching domain/path cookies automatically (toggleable globally or per request).
  - SSL verification toggle (for self-signed localhost/staging certs), automatic redirect following with hop limits, configurable timeouts, system proxy support, and instant in-flight request cancellation.
- **Response Viewer**:
  - Pretty/Raw syntax-highlighted JSON, XML, HTML, and plain text.
  - Tabular metrics (`status`, `ms`, `KB/MB`, redirect count), searchable Headers tab, parsed Response Cookies tab, inline image preview, binary download cache, and lightweight preview mode for payloads > 5 MB.
- **Local-First Organization & Snippets**:
  - SQLite persistence (`collections`, arbitrarily nested `folders`, `saved_requests`, `environments`, `history_entries` capped at 200 entries / 500 KB bodies, open `session_tabs`, `cookies`, `app_settings`).
  - Per-folder & per-collection **Base URL inheritance** (composed across nested folders, with variable support and full-URL override) and **drag-and-drop** reorganization of requests and folders across folders and collections.
  - Variable precedence: `Active Environment > Collection > Global` plus built-in dynamic variables (`{{$uuid}}`, `{{$timestamp}}`, `{{$isoTimestamp}}`, `{{$randomInt}}`), secret masking (`••••`), and secret-stripped JSON export.
  - **cURL Importer** (modal + auto-detect paste in the URL bar) and **Code Snippet Generator** (`cURL`, `fetch`, `axios`, `Python requests`, `HTTPie`).
- **Keyboard-First UX**:
  - Command Palette (`Ctrl/Cmd+K`), customizable keyboard shortcuts with conflict detection, configurable UI & code editor font sizes, universal shortcut-aware hover tooltips (`title` + styled `<kbd>`), resizable panels, Horizontal/Vertical split toggle, and Dark/Light/System themes (see [BRANDING.md](./BRANDING.md)).

---

## Local Data Storage & Configuration

RiftQL stores collections, folders, requests, environments, cookies, history, and settings locally in a single SQLite database (`riftql.db`). Default data directories by OS:

- **Linux (`.AppImage` / `.deb` / `.rpm`):** `~/.local/share/com.riftql.app/` (or `$XDG_DATA_HOME/com.riftql.app/`)
- **Windows:** `%APPDATA%\com.riftql.app\`
- **macOS:** `~/Library/Application Support/com.riftql.app/`

You can view, copy, or change this folder anytime in **Settings → Data → Local Data Directory** (with optional automatic migration of your existing `riftql.db`). Custom paths are stored in `storage-config.json` inside the default app data directory, and **Reset to Default** restores the OS default location cleanly.

On **Linux AppImage** builds, RiftQL enables `enableGTKAppId` (`com.riftql.app`) and registers `~/.local/share/applications/com.riftql.app.desktop` + hicolor PNG icon at startup when `APPIMAGE` is present so GNOME/Ubuntu docks display the RiftQL icon reliably.

### Git-Friendly Workspace Sync (Optional)

Enable or disable folder-based Git sync anytime in **Settings → Git Sync**:
- **Migrate SQLite → Folder**, **Import Folder → SQLite**, or **Clone Git Repo** directly from Settings.
- Writes deterministic JSON files (`riftql.workspace.json`, `environments/`, `collections/`) with clean diffs, automatically maintains `.gitignore` so secrets (`isSecret` values in SQLite / `.riftql.secrets.json`) never enter Git commits, auto-syncs edits, watches disk for `git pull` / branch switches, and includes built-in **Git Init / Pull / Commit & Push**.

---

## Tech Stack

- **Desktop / Backend:** Tauri v2, Rust (`reqwest`, `tokio`, `rusqlite` bundled, `cookie`, `mime_guess`, `tokio-util`)
- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS v4, Radix UI (`shadcn/ui` primitives), Zustand, `cmdk`
- **Code Editors:** CodeMirror 6 + `cm6-graphql` + `graphql`
- **Fonts (Offline Local-First):** `@fontsource-variable/inter` & `@fontsource-variable/jetbrains-mono`

---

## Development & Verification

### Prerequisites
- Node.js + `pnpm`
- Rust toolchain (`cargo` / `rustc`) + platform Tauri v2 dependencies (WebView2 + MSVC Build Tools on Windows)

### Commands

```bash
# Install dependencies
pnpm install

# Run desktop app in development mode
pnpm tauri dev

# Typecheck and production frontend build
pnpm typecheck
pnpm build

# Run frontend unit & component tests (Vitest + Testing Library)
pnpm test

# Run Rust SQLite, Cookie Jar, and Axum HTTP integration tests
cargo test --manifest-path src-tauri/Cargo.toml
```

---

## Default Keyboard Shortcuts

All shortcuts can be customized in **Settings → Shortcuts** (`Ctrl+,` / `⌘,`).

| Action | Windows / Linux | macOS |
| --- | --- | --- |
| Send Request | `Ctrl+Enter` | `⌘↵` |
| Cancel Request | `Escape` | `Esc` |
| Command Palette | `Ctrl+K` | `⌘K` |
| New Request Tab | `Ctrl+T` | `⌘T` |
| Close Active Tab | `Ctrl+W` | `⌘W` |
| Next / Previous Tab | `Ctrl+Tab` / `Ctrl+Shift+Tab` | `⌃Tab` / `⌃⇧Tab` |
| Save Request | `Ctrl+S` | `⌘S` |
| Focus URL Bar | `Ctrl+L` | `⌘L` |
| Format Body / Query | `Ctrl+Shift+F` | `⌘⇧F` |
| Copy as Code Snippet | `Ctrl+Shift+C` | `⌘⇧C` |
| Import cURL | `Ctrl+I` | `⌘I` |
| New Collection | `Ctrl+Shift+N` | `⌘⇧N` |
| Manage Environments | `Ctrl+E` | `⌘E` |
| Manage Cookie Jar | `Ctrl+Shift+J` | `⌘⇧J` |
| Toggle Sidebar | `Ctrl+B` | `⌘B` |
| Toggle Split Layout | `Ctrl+\` | `⌘\` |
| Toggle Theme | `Ctrl+Shift+L` | `⌘⇧L` |
| Open Settings | `Ctrl+,` | `⌘,` |

---

## Automated CI & Multi-Platform Releases (GitHub Actions)

- **CI ([.github/workflows/ci.yml](./.github/workflows/ci.yml)):** Runs on every push/PR to `main` (`pnpm typecheck`, `pnpm test`, `pnpm build`, and `cargo test` on `ubuntu-22.04` and `windows-latest`).
- **Release Binaries ([.github/workflows/release.yml](./.github/workflows/release.yml)):** Compiles native installers for **Windows (`x64`: `.msi` / `.exe`)**, **Linux (`x64`: `.deb` / `.rpm` / `.AppImage`)**, and **macOS (`arm64` & `x64`: `.dmg`)**:
  - **Tag Release (Draft GitHub Release):**
    ```bash
    git tag v0.1.0
    git push origin v0.1.0
    ```
  - **Manual Build (Workflow Artifacts):** Trigger **Actions → Release Binaries → Run workflow** (`workflow_dispatch`) to compile and download binaries directly from the run artifacts without creating a release tag.

---

## Project Tracking & Roadmap

- Ticket board & v2 backlog (`Git-friendly sync`, `Postman/OpenAPI importers`, `JS scripting runtime`, `GraphQL WS/SSE subscriptions & mTLS`): [tickets/README.md](./tickets/README.md)
- Visual & voice identity guide: [BRANDING.md](./BRANDING.md)
