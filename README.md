# RiftQL

> *The local-first API client for REST & GraphQL.*
> *Instant launch. Zero bloat. Built for keyboard-first workflows.*

**RiftQL** is a cross-platform desktop API client combining essential REST workflows (Postman) and native GraphQL exploration & schema discovery (Altair) inside a fast, dense, Linear/Raycast-inspired interface built on **Tauri v2**, **Rust**, and **React**.

---

## Key Features

- **Native REST & GraphQL Execution:** All HTTP methods executed in Rust (`reqwest` + `tokio`) with zero CORS restrictions, SSL toggle, redirect controls, timeouts, request cancellation, streaming multipart uploads, and RFC 6265 Cookie Jar — [Requests & Responses Guide](./docs/requests-and-responses.md)
- **GraphQL Editor, Schema Docs & `AUTO-DISCOVERED`:** CodeMirror 6 + `cm6-graphql` autocomplete/linting, multi-operation selector, JSON variables formatter, searchable **Schema Docs**, and AST-aware **Schema Auto-Discovery** for collections/folders into `AUTO-DISCOVERED` — [GraphQL Guide](./docs/graphql.md)
- **Collections, Base URL Inheritance & Environments:** Nested folders, drag-and-drop, alphabetical sorting, composable Base URL & Auth inheritance, `Active Env > Collection > Global` precedence, dynamic variables, masked secrets, and bulk variable creation across all environments — [Collections & Variables Guide](./docs/collections-and-variables.md)
- **Multi-Format Importers & Code Snippets:** Import from **Altair** (`.agq`/`.agc`/`.agx`), **Postman v2.0/v2.1 & Environments**, **Insomnia v4**, **OpenAPI 3.0/3.1 & Swagger 2.0**, and **cURL** into new or existing collections/folders; export snippets as `cURL`, `fetch`, `axios`, `Python requests`, or `HTTPie` — [Importers & Snippets Guide](./docs/importers-and-snippets.md)
- **Local SQLite Storage & Git-Friendly Sync:** Local `riftql.db` with configurable storage directory, plus optional deterministic JSON folder sync, local-only secret storage (no `.env`), SSH/HTTPS Git auth, debounced **Auto-Push**, and periodic **Auto-Fetch** Sonner alerts with snooze/mute — [Git Sync & Storage Guide](./docs/git-sync-and-storage.md)
- **Keyboard-First UX:** Command Palette (`Ctrl/Cmd+K`), customizable shortcuts with conflict detection, configurable font sizes, Dark/Light/System themes, resizable panels & modals, and non-blocking Sonner-style notifications — [Shortcuts & UX Guide](./docs/shortcuts-and-ux.md)

---

## Documentation

Browse the full documentation under **[docs/](./docs/README.md)**:

- [Requests & Responses](./docs/requests-and-responses.md)
- [GraphQL & Schema Auto-Discovery](./docs/graphql.md)
- [Collections, Folders, Inheritance & Variables](./docs/collections-and-variables.md)
- [Importers & Code Snippets](./docs/importers-and-snippets.md)
- [Git Sync & Local Storage](./docs/git-sync-and-storage.md)
- [Keyboard Shortcuts & UX](./docs/shortcuts-and-ux.md)
- [Development, CI & Releases](./docs/development-and-releases.md)

---

## Development Quick Start

```bash
# Install dependencies
pnpm install

# Run desktop app in development mode
pnpm tauri dev

# Verify TypeScript, frontend tests (Vitest), and Rust tests (Cargo)
pnpm typecheck
pnpm test
pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
```

For full contributor setup, GitHub Actions workflows, the automated `pnpm release` CLI, and the `website/` Astro landing + documentation deployment guide, see [Development, CI & Releases](./docs/development-and-releases.md).

---

## Tech Stack

- **Desktop / Backend:** Tauri v2, Rust (`reqwest`, `tokio`, `rusqlite` bundled, `cookie`, `mime_guess`, `tokio-util`)
- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS v4, Radix UI primitives, Zustand, `cmdk`
- **Code Editors & GraphQL:** CodeMirror 6 + `cm6-graphql` + `graphql`
- **Fonts (Offline Local-First):** `@fontsource-variable/inter` & `@fontsource-variable/jetbrains-mono`

---

## Project Tracking, Guidelines & Branding

- AI agent engineering guidelines: [AGENTS.md](./AGENTS.md)
- Design system, tokens & UI specs: [DESIGN.md](./DESIGN.md)
- Visual & voice identity guide: [BRANDING.md](./BRANDING.md)
- Ticket board & v2 backlog: [tickets/README.md](./tickets/README.md)
