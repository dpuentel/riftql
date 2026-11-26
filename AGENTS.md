# AGENTS.md — AI Coding Guidelines for RiftQL

Guidelines, architectural invariants, and verification workflows for AI coding agents and contributors working on **RiftQL** (`com.riftql.app`), a local-first cross-platform REST & GraphQL desktop API client built with **Tauri v2**, **Rust**, **React 19**, **TypeScript 7**, and **Tailwind CSS v4**.

> **Related Docs:**
> - UI/Visual Tokens & Component Contracts: [DESIGN.md](./DESIGN.md)
> - Brand Identity & Tone: [BRANDING.md](./BRANDING.md)
> - User & Developer Documentation: [docs/README.md](./docs/README.md)
> - Ticket Board & Roadmap: [tickets/README.md](./tickets/README.md)

---

## 1. Core Engineering Philosophy

- **Local-First, Instant Launch, Zero Bloat:** Avoid introducing new npm or Cargo dependencies unless genuinely necessary; prefer built-in TypeScript, Rust standard library, existing dependencies, or clean internal helpers. All builds and tests must remain runnable offline (`cargo test --offline`, Vitest without network access).
- **Single Source of Truth in Rust + Graceful Browser Fallback:** All real HTTP execution, SQLite persistence, Cookie Jar management, and Git Sync run natively in Rust (`src-tauri/`). The React frontend (`src/`) communicates strictly through `src/lib/tauri.ts` and maintains offline/in-memory fallbacks so browser previews and Vitest tests work seamlessly outside Tauri.
- **Minimal, Scoped Diffs:** Keep edits focused on the requested task. Preserve unrelated comments, docstrings, and backwards-compatible schemas. Never push to `origin` unless the user explicitly asks.

---

## 2. Repository Map

```text
riftql/
  AGENTS.md                       # Engineering guidelines & invariants for AI agents (this file)
  DESIGN.md                       # UI design tokens, typography, component specs & anti-patterns
  BRANDING.md                     # Visual identity rationale, color choices & tone of voice
  README.md                       # Project overview & quick start
  package.json                    # Frontend dependencies & scripts (pnpm)
  tsconfig.json                   # Strict TypeScript config (@/* -> ./src/*)
  docs/                           # Feature documentation & release guides
  tickets/                        # MVP specs (T-001–T-020) & v2 backlog (T-101–T-104)
  scripts/release.mjs             # Automated version bump, commit & tag CLI (`pnpm release`)
  src/
    App.tsx                       # Global keyboard shortcuts, Tauri event listeners & root wiring
    index.css                     # Tailwind v4 @theme, Light/Dark CSS vars, .rift-scroll, .font-mono-code
    components/
      brand/RiftLogo.tsx          # Geometric logo mark
      editor/CodeEditor.tsx       # CodeMirror 6 wrapper (JSON/XML/HTML/GraphQL/Text + schema wiring)
      graphql/SchemaDocsPanel.tsx # Searchable GraphQL schema explorer
      layout/                     # AppShell.tsx, Sidebar.tsx, TabBar.tsx
      modals/                     # SettingsModal, EnvironmentModal, CollectionSettingsModal,
                                  # CookieJarModal, ImportCollectionModal, DiscoverGraphQLModal,
                                  # GitRemoteUpdateModal, ImportCurlModal, CodeSnippetModal,
                                  # SaveRequestModal, CommandPalette
      request/                    # RequestPane, AuthEditor, BodyEditor, GraphQLEditor, KeyValueEditor
      response/                   # ResponsePane, ResponseBodyViewer, ResponseCookiesTable
      ui/                         # Radix primitives (button, dialog, badge, input, select, switch,
                                  # tabs, action-tooltip, context-menu, popover, Toaster, etc.)
    store/                        # Zustand stores: useWorkspaceStore, useTabsStore, useSettingsStore,
                                  # useSchemaStore, useNotificationStore
    lib/
      tauri.ts                    # Centralized Tauri IPC bridge & test adapter hook
      auth.ts / base-url.ts       # Collection -> Folder -> Request inheritance resolvers
      variables.ts                # {{var}}, dynamic $vars, Precedence & stripSecretsForExport
      format.ts                   # Byte/duration formatters, method & status color helpers
      graphql.ts                  # AST introspection, schema diff & AUTO-DISCOVERED operation builder
      collections.ts              # Tree formatting helpers (e.g. buildIndentedFolders)
      curl-parser.ts              # cURL parser
      code-generators.ts          # cURL / fetch / axios / Python / HTTPie snippet generators
      file-io.ts                  # Native & browser file open/save helpers
      shortcuts.ts / shortcut-bridge.ts
      importers/                  # altair, postman, insomnia, openapi, helpers, types, index
    types/                        # Shared TypeScript interfaces mirroring Rust serde models
  src-tauri/
    tauri.conf.json               # Tauri v2 app config (keep windows[0].dragDropEnabled = false)
    Cargo.toml                    # Rust dependencies (reqwest, rusqlite bundled, tokio, cookie, etc.)
    src/
      lib.rs                      # Command registration & startup setup (SQLite + GitSyncManager)
      models.rs                   # Serde camelCase models shared over Tauri IPC
      commands/                   # Tauri command handlers: http.rs, storage.rs, sync.rs, cookies.rs
      db/                         # SQLite schema, migrations, collections, environments, settings, etc.
      http/                       # reqwest execution engine, multipart streaming, cancellation, Cookie Jar
      sync/                       # GitSyncManager (mod.rs), git CLI wrapper (git.rs), JSON layout (fs_layout.rs)
```

---

## 3. Architecture & Data Flow Rules

### 3.1 Tauri IPC Bridge (`src/lib/tauri.ts`)
- **Never** import `@tauri-apps/api/core` or `@tauri-apps/plugin-dialog` directly in components or stores. Always route through `src/lib/tauri.ts`:
  - `invokeCommand<T>(command, args)`
  - `listenEvent<T>(event, handler)`
  - `pickOpenFile`, `pickSaveFile`, `pickOpenDirectory`, `hasNativeFileBridge()`
  - `setTauriBridgeAdapter(adapter)` (test injection)
- **Offline Fallbacks Required:** Store methods in `useWorkspaceStore` and `useSettingsStore` must keep working in-memory when `invokeCommand` throws `Tauri runtime unavailable...`. Do not remove or bypass those fallback branches.

### 3.2 Persistence & Git Sync Model
- SQLite (`riftql.db`) is always present locally (`src-tauri/src/db/`).
- When Git-Friendly Sync is enabled (`src-tauri/src/sync/`), Rust mirrors non-secret collections, folders, requests, and environments to deterministic JSON files (`collections/`, `folders/`, `requests/`, `environments/`, `riftql.workspace.json`), watches the directory every 2 seconds via `spawn_watcher`, and emits:
  - `riftql://git-sync-updated` — external disk changes reconciled into SQLite (frontend reloads workspace).
  - `riftql://git-sync-status` — updated `GitSyncStatus` snapshot (e.g., `isPushing`, `lastSyncedAt`, errors).
  - `riftql://git-remote-updates` — `GitRemoteUpdateInfo` payload when remote commits arrive (`auto_fetch` or non-fast-forward `auto_push` rejection).

---

## 4. Strict Engineering & Security Invariants

### 4.1 Secrets Isolation (CRITICAL)
- **Workspace & Collection Secret Variables (`isSecret: true`):**
  - **NEVER** serialize secret values in plaintext into exported workspace JSON files or tracked Git Sync JSON files.
  - Frontend exports must pass through `stripSecretsForExport` (`src/lib/variables.ts`).
  - Backend Git Sync (`src-tauri/src/sync/fs_layout.rs`) redacts `is_secret` values from tracked `environments/*.json` and stores them exclusively in SQLite and the `.gitignore`d `.riftql.secrets.json` file (RiftQL does **not** use `.env` files).
- **Git HTTPS Credentials (`src-tauri/src/sync/git.rs` & `mod.rs`):**
  - Store credentials only in `<app-data-dir>/git-sync-credentials.json` (permissions `0o600` on Unix via `fs::set_permissions`).
  - Pass HTTPS credentials ephemerally per `git` invocation using `-c credential.helper=` and environment variables (`RIFTQL_GIT_USERNAME` / `RIFTQL_GIT_PASSWORD`).
  - **NEVER** write tokens/passwords into `.git/config`, remote URLs, logs, or UI error banners.

### 4.2 Git Sync Concurrency, Safety & Backwards Compatibility (`src-tauri/src/sync/`)
- **Never Hold `GitSyncManager::inner` Across Network/Blocking `git` Calls:** Always snapshot config/credentials under lock, drop the `MutexGuard`, execute `git` subprocesses (`fetch_repo`, `pull_repo`, `commit_and_push`, `clone`), and re-acquire the lock only to record outcomes. Holding the mutex stalls `get_git_sync_status_cmd` and freezes the UI.
- **No Force Push:** Never execute `git push --force` (`--force-with-lease` or otherwise). If a push fails with a non-fast-forward rejection (`git::is_non_fast_forward_error`), abort auto-push, run `fetch_repo`, and notify the UI (`GitRemoteUpdateModal`) so the user explicitly chooses **Fast-Forward** (`PullStrategy::FastForwardOnly`) or **Rebase & Autostash** (`PullStrategy::RebaseAutostash`).
- **Backwards-Compatible Config & Commands:** Any new fields on persisted Rust structs (`GitSyncConfig`, `AppSettings`, `Disk*File` models) MUST use `#[serde(default)]` (or `#[serde(default = "...")]`) so existing `git-sync-config.json`, SQLite rows, and JSON repos deserialize cleanly without breaking upgrades. Keep existing Tauri command signatures compatible.

### 4.3 CodeMirror 6 & Editor UX Invariants (`src/components/editor/CodeEditor.tsx`)
- **Do Not Swallow `Ctrl/Cmd+Enter`:** `riftDefaultKeymap` explicitly filters out `/^(mod|ctrl|cmd)-enter$/i` from `@codemirror/commands` `defaultKeymap`. Never re-add a keybinding that captures `Mod-Enter` inside CodeMirror, or sending requests from inside the body/query editor will break.
- **No False Dirty State (Blue Tab Dot):** Programmatic document updates (tab switches, formatting, auto-syncing state) MUST dispatch with `[externalSyncAnnotation.of(true), Transaction.addToHistory.of(false)]`, and the update listener must ignore `externalSyncAnnotation` updates. Switching tabs must NEVER mark an untouched tab dirty or pollute undo history.
- **Keep Schema Live Without Remounting:** Updates to `graphqlSchema` use `cm6-graphql`'s `updateSchema(view, graphqlSchema)` (with compartment reconfigure fallback). Do not destroy and recreate `EditorView` on tab/schema updates.

### 4.4 Controlled Inputs & Cursor Stability
- For persisted editable tables/forms (e.g., `EnvironmentModal` variables and names), update local/optimistic state synchronously and debounce backend IPC persistence (`schedulePersistEnv` + flush on unmount/close). Never trigger an immediate full-workspace reload on every keystroke, which jumps the cursor to the end of `<input>` fields when editing in the middle of a string.

### 4.5 HTML5 Drag-and-Drop in Tauri v2 (`src-tauri/tauri.conf.json` & `Sidebar.tsx`)
- `app.windows[0].dragDropEnabled` MUST stay `false` in `src-tauri/tauri.conf.json` so Tauri's native OS file drop handler does not hijack internal HTML5 drag-and-drop reordering of requests and folders inside `Sidebar.tsx`.

### 4.6 Importers & GraphQL Auto-Discovery
- **Importers (`src/lib/importers/`):** Support Altair (`.agq`/`.agc`/`.agx`), Postman v2.0/v2.1 & Environments, Insomnia v4, OpenAPI 3.0/3.1 & Swagger 2.0 JSON, and RiftQL Workspace JSON. Always guard `$ref` resolution against cycles, preserve explicit single-query `name` precedence (e.g. `.agq` `windowName` over filename), and support non-destructive merging into either a new collection or an existing collection/folder.
- **GraphQL Schema Auto-Discovery (`src/lib/graphql.ts`, `DiscoverGraphQLModal.tsx`):** Use GraphQL AST parsing (`parse` + `visit` from `graphql`) against all requests inside the target collection/folder subtree (`collectDescendantFolderIds` + `extractCoveredRootFields`) so already-covered root fields are detected reliably, and write newly generated operations under an `AUTO-DISCOVERED` subfolder without overwriting existing user requests.

### 4.7 TypeScript Strictness (`tsconfig.json`)
- `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `noFallthroughCasesInSwitch: true`.
- Resolve imports with `@/` (`./src/*`). Do not leave unused variables, implicit `any`, or unguarded `@ts-ignore` comments.

---

## 5. UI & UX Engineering Rules

Follow **[DESIGN.md](./DESIGN.md)** for all colors, typography, layout metrics, and component contracts:
- Use semantic CSS variables (`var(--bg-base)`, `var(--bg-surface)`, `var(--accent)`, etc.) — avoid hardcoded page/card hex backgrounds so Light and Dark modes stay consistent.
- Use `rem` typography classes (`text-xs`, `text-[0.75rem]`, `text-[0.6875rem]`) so `--rift-ui-font-size` scaling (`13px–22px`) works everywhere; never hardcode pixel text sizes (`text-[11px]`, `text-[12px]`) on UI labels.
- Never use `window.alert`, `window.confirm`, or `window.prompt`. Use:
  - `notify.info` / `notify.success` / `notify.warning` / `notify.error` (`src/store/useNotificationStore.ts` + `Toaster.tsx`) for non-blocking feedback and interactive update prompts.
  - Inline confirmation state for destructive actions (e.g., two-click delete confirmation in `Sidebar.tsx`).
- Wrap icon/shortcut buttons with `ActionTooltip` (`actionId` preferred over static `shortcut`) so tooltips stay synchronized with customized user shortcuts.
- Give complex/scrollable modals `DialogContent` with `resizable`, a unique `storageKey` (`riftql-*-modal-size`), `minWidth`, `minHeight`, `shrink-0` header/footer, and `min-h-0 flex-1 overflow-y-auto rift-scroll` content.

---

## 6. Testing Conventions & Known Pitfalls

### 6.1 Frontend (Vitest + Testing Library)
- Test files live next to source under `__tests__/*.test.ts` or `__tests__/*.test.tsx` (`src/test/setup.ts`).
- **Mocking Tauri IPC (`setTauriBridgeAdapter`):** When mocking specific commands in a component/store test, **throw** `new Error(\`Tauri runtime unavailable for command "\${cmd}"\`)` for unmocked commands instead of returning `undefined`! Returning `undefined` bypasses Zustand offline fallbacks and breaks `loadWorkspace()` / `loadSettings()`.
- **Typing JSON in Tests:** When filling `<input>` or `<textarea>` values containing `{` or `[`, use `fireEvent.change(el, { target: { value } })` instead of `userEvent.type` (`userEvent` treats `{`/`[` as keystroke modifiers).
- **Unambiguous `aria-label`s:** Keep `aria-label` strings specific (e.g., `"Bulk add variable"`, not overlapping existing `/add variable/i` queries) so Testing Library selectors remain deterministic.

### 6.2 Backend (Rust `cargo test`)
- Database tests (`src-tauri/src/db/tests.rs`), HTTP/Cookie tests (`src-tauri/src/http/`), and Git Sync tests (`src-tauri/src/sync/tests.rs`) spin up temporary directories (`tempfile`) and local `axum` / bare-Git repositories.
- Keep tests deterministic and isolated (`TempDir`), clean up temporary state, and ensure offline compatibility (`--offline`).

---

## 7. Verification Commands & Platform Notes

Run these checks after modifying code (scoped appropriately; run the full suite before finishing a feature or bugfix):

```bash
# 1. TypeScript static check
pnpm typecheck

# 2. Frontend unit & component tests (Vitest)
pnpm test

# 3. Frontend production build check
pnpm build

# 4. Rust compile & offline check (zero warnings target)
cargo build --manifest-path src-tauri/Cargo.toml --offline

# 5. Rust unit & integration tests (SQLite, Axum HTTP, Cookie Jar, Git Sync)
cargo test --manifest-path src-tauri/Cargo.toml --offline
```

### Windows / PowerShell Specifics
- Invoke `pnpm.cmd` in Windows PowerShell when needed so `.ps1` execution policies do not block `pnpm`.
- Do **not** chain commands with `&&` in Windows PowerShell 5.1; execute statements separately or with `;` while checking exit codes.
- If `cargo` is not on the default shell `PATH`, prepend `$env:USERPROFILE\.cargo\bin` (or `%USERPROFILE%\.cargo\bin`).
- Rust integration tests that bind `127.0.0.1` (`axum`) or invoke Windows MSYS2 `git` subprocesses may require running outside restricted sandboxes (`NtCreateDirectoryObject` / loopback limits).

---

## 8. Release & Git Workflow

- **Atomic Commits:** Group related changes cleanly (`feat:`, `fix:`, `docs:`, `chore:`, `test:`). Never leave half-migrated schemas or broken builds on `main`.
- **Do Not Push Automatically:** Only run `git push` when the user explicitly requests it.
- **Keep Docs & Tickets Updated:** When changing user-facing features, update the matching guide in [docs/](./docs/README.md) and ticket status in [tickets/README.md](./tickets/README.md).
- **Releases (`pnpm release`):** Never hand-edit only one version file. Always use `node scripts/release.mjs` (`pnpm release <patch|minor|major|x.y.z> [--dry-run] [--no-push]`), which keeps `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock` synchronized. See [docs/development-and-releases.md](./docs/development-and-releases.md).
