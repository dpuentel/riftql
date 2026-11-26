# RiftQL — Ticket Board

Track MVP execution and post-MVP backlog items. Every ticket maps to atomic Git commits and automated verification checks.

## MVP Scope (`T-001` – `T-012`)

| ID | Title | Area | Status |
| --- | --- | --- | --- |
| [T-001](./T-001-bootstrap-tooling-and-tauri.md) | Bootstrap tooling, Git, tickets & Tauri v2 workspace | Infra / Setup | `DONE` |
| [T-002](./T-002-branding-theme-and-layout.md) | Branding tokens, theme engine, RiftLogo & UI primitives | UI / Design System | `DONE` |
| [T-003](./T-003-sqlite-persistence-layer.md) | Rust SQLite persistence layer & migrations | Backend / DB | `DONE` |
| [T-004](./T-004-http-engine-and-cookie-jar.md) | Rust HTTP engine, RFC Cookie Jar, multipart streaming & cancel | Backend / HTTP | `DONE` |
| [T-005](./T-005-variables-and-auth-resolution.md) | Domain types, variable engine, auth inheritance & Zustand stores | Core / State | `DONE` |
| [T-006](./T-006-request-builder-and-tabs.md) | CodeMirror 6 wrapper, multi-tab bar & REST request builder | UI / Request | `DONE` |
| [T-007](./T-007-response-viewer.md) | Response viewer (metrics, formatted body, headers, cookies, binary/images) | UI / Response | `DONE` |
| [T-008](./T-008-graphql-and-schema-docs.md) | Native GraphQL editor (`cm6-graphql`), multi-op & Schema Docs | UI / GraphQL | `DONE` |
| [T-009](./T-009-collections-environments-history.md) | Sidebar (collections, nested folders, history, envs) & Cookie Jar modal | UI / Workspace | `DONE` |
| [T-010](./T-010-curl-import-and-code-snippets.md) | cURL import (URL bar auto-paste + modal) & multi-language code snippets | Features / Snippets | `DONE` |
| [T-011](./T-011-shortcuts-tooltips-command-palette.md) | Customizable shortcuts, shortcut-aware tooltips, Command Palette & Settings | UX / Keyboard | `DONE` |
| [T-012](./T-012-e2e-verification-and-polish.md) | End-to-end verification, Windows Tauri build, README & final polish | QA / Release | `DONE` |
| [T-013](./T-013-github-actions-ci-and-release.md) | GitHub Actions CI tests & multi-platform Tauri binary releases | Infra / CI-CD | `DONE` |
| [T-014](./T-014-env-selection-and-native-file-io.md) | Fix Environment selection reset & native Tauri file export/import | UI / Persistence | `DONE` |
| [T-015](./T-015-folder-management-and-request-rename.md) | Collection folder actions, nested subfolders & inline request renaming | UI / Collections | `DONE` |
| [T-016](./T-016-configurable-font-size.md) | Configurable UI & code editor font sizes | UI / Settings | `DONE` |
| [T-017](./T-017-graphql-resizable-panels-and-insert.md) | Resizable GraphQL panels & insert operations from Schema Docs | UI / GraphQL | `DONE` |
| [T-018](./T-018-linux-icon-and-data-directory.md) | Ubuntu AppImage dock icon & configurable data storage directory | Desktop / Storage | `DONE` |
| [T-019](./T-019-folder-base-url-inheritance.md) | Per-folder & collection Base URL inheritance | Persistence / Requests | `DONE` |
| [T-020](./T-020-drag-and-drop-requests-and-folders.md) | Drag & drop requests and folders across folders & collections | UI / Collections | `DONE` |

---

## Backlog v2 (`T-101` – `T-104`)

| ID | Title | Area | Status |
| --- | --- | --- | --- |
| [T-101](./T-101-backlog-git-friendly-sync.md) | Git-friendly JSON workspace sync (folder-based collections, Git & migration) | Persistence / v2 | `DONE` |
| [T-102](./T-102-backlog-postman-openapi-import.md) | Postman v2.1, Insomnia & OpenAPI 3.x / Swagger importers | Importers / v2 | `BACKLOG` |
| [T-103](./T-103-backlog-js-scripting-runtime.md) | Sandboxed JavaScript pre-request & post-response test assertions runtime | Scripting / v2 | `BACKLOG` |
| [T-104](./T-104-backlog-graphql-subscriptions-mtls.md) | GraphQL WebSocket/SSE subscriptions & custom mTLS client certificates | Protocol / v2 | `BACKLOG` |
