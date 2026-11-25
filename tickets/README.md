# RiftQL — Ticket Board

Track MVP execution and post-MVP backlog items. Every ticket maps to atomic Git commits and automated verification checks.

## MVP Scope (`T-001` – `T-012`)

| ID | Title | Area | Status |
| --- | --- | --- | --- |
| [T-001](./T-001-bootstrap-tooling-and-tauri.md) | Bootstrap tooling, Git, tickets & Tauri v2 workspace | Infra / Setup | `DONE` |
| [T-002](./T-002-branding-theme-and-layout.md) | Branding tokens, theme engine, RiftLogo & UI primitives | UI / Design System | `DONE` |
| [T-003](./T-003-sqlite-persistence-layer.md) | Rust SQLite persistence layer & migrations | Backend / DB | `DONE` |
| [T-004](./T-004-http-engine-and-cookie-jar.md) | Rust HTTP engine, RFC Cookie Jar, multipart streaming & cancel | Backend / HTTP | `DONE` |
| [T-005](./T-005-variables-and-auth-resolution.md) | Domain types, variable engine, auth inheritance & Zustand stores | Core / State | `IN_PROGRESS` |
| [T-006](./T-006-request-builder-and-tabs.md) | CodeMirror 6 wrapper, multi-tab bar & REST request builder | UI / Request | `TODO` |
| [T-007](./T-007-response-viewer.md) | Response viewer (metrics, formatted body, headers, cookies, binary/images) | UI / Response | `TODO` |
| [T-008](./T-008-graphql-and-schema-docs.md) | Native GraphQL editor (`cm6-graphql`), multi-op & Schema Docs | UI / GraphQL | `TODO` |
| [T-009](./T-009-collections-environments-history.md) | Sidebar (collections, nested folders, history, envs) & Cookie Jar modal | UI / Workspace | `TODO` |
| [T-010](./T-010-curl-import-and-code-snippets.md) | cURL import (URL bar auto-paste + modal) & multi-language code snippets | Features / Snippets | `TODO` |
| [T-011](./T-011-shortcuts-tooltips-command-palette.md) | Customizable shortcuts, shortcut-aware tooltips, Command Palette & Settings | UX / Keyboard | `TODO` |
| [T-012](./T-012-e2e-verification-and-polish.md) | End-to-end verification, Windows Tauri build, README & final polish | QA / Release | `TODO` |

---

## Backlog v2 (`T-101` – `T-104`)

| ID | Title | Area | Status |
| --- | --- | --- | --- |
| [T-101](./T-101-backlog-git-friendly-sync.md) | Git-friendly JSON/YAML workspace sync (folder-based collections & diffs) | Persistence / v2 | `BACKLOG` |
| [T-102](./T-102-backlog-postman-openapi-import.md) | Postman v2.1, Insomnia & OpenAPI 3.x / Swagger importers | Importers / v2 | `BACKLOG` |
| [T-103](./T-103-backlog-js-scripting-runtime.md) | Sandboxed JavaScript pre-request & post-response test assertions runtime | Scripting / v2 | `BACKLOG` |
| [T-104](./T-104-backlog-graphql-subscriptions-mtls.md) | GraphQL WebSocket/SSE subscriptions & custom mTLS client certificates | Protocol / v2 | `BACKLOG` |
