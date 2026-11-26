# RiftQL Documentation

Welcome to the **RiftQL** documentation. RiftQL is a local-first desktop API client for **REST** and **GraphQL** built with **Tauri v2**, **Rust**, and **React**.

---

## Guides

| Guide | What it covers |
| --- | --- |
| [Requests & Responses](./requests-and-responses.md) | HTTP methods, URL <-> Query Params sync, body modes, auth, Domain Cookie Jar, SSL/redirects/timeouts, and Response Viewer |
| [GraphQL & Schema Auto-Discovery](./graphql.md) | CodeMirror 6 GraphQL editor, JSON variables formatting, Schema Docs explorer, and **Auto-Discovery (`AUTO-DISCOVERED`)** |
| [Collections, Folders & Variables](./collections-and-variables.md) | Nested folders, drag-and-drop, alphabetical sorting, Base URL & Auth inheritance, Environments, Secrets, Dynamic Variables, Tabs & History |
| [Importers & Code Snippets](./importers-and-snippets.md) | Importing Altair (`.agq`/`.agc`/`.agx`), Postman v2.x & Environments, Insomnia v4, OpenAPI 3.x / Swagger 2.0, cURL, and Snippet generation |
| [Git Sync & Local Storage](./git-sync-and-storage.md) | SQLite storage, custom data directories, Git-friendly JSON layout, Secrets model, HTTPS/SSH auth, Auto-Push, and Auto-Fetch with snooze |
| [Shortcuts & UX](./shortcuts-and-ux.md) | Command Palette, customizable shortcuts, conflict detection, resizable panels & modals, typography settings, themes & Sonner notifications |
| [Development & Releases](./development-and-releases.md) | Tech stack, repo structure, dev/test commands, GitHub Actions CI, and the `pnpm release` automation CLI |

---

## 2-Minute Quick Start

1. **Create a Collection (or Import an Existing One)**
   - Click **`+`** next to the sidebar filter (or press `Ctrl/Cmd+Shift+N`) to create a collection, optionally setting a shared **Base URL** and **Auth** under Collection Settings.
   - Or click the **Import** button (`FolderUp` icon) to import from **Altair**, **Postman**, **Insomnia**, or **OpenAPI / Swagger**.
2. **Send a REST or GraphQL Request**
   - Pick an HTTP method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`) or switch to **`GQL`** for the native GraphQL editor.
   - Press `Ctrl+Enter` (`⌘↵` on macOS) — works anywhere, including inside the body/query editor.
3. **Explore GraphQL Schemas Automatically**
   - In any GraphQL tab, click **Fetch Schema** to unlock schema-aware autocomplete and **Schema Docs**.
   - On any collection or folder with a Base URL, click the ✨ **Discover GraphQL Schema** icon (or right-click → *Discover GraphQL Schema…*) to auto-generate missing operations into `AUTO-DISCOVERED`.
4. **Use Environments & Secrets**
   - Switch active environments from the top bar or `Ctrl/Cmd+K` (`Ctrl/Cmd+E` to edit variables and copy keys across all environments).
5. **Sync via Git (Optional)**
   - Open **Settings → Git Sync** to mirror your workspace into deterministic, Git-diffable JSON files with optional **Auto-Commit & Push** and **Auto-Fetch** notifications while keeping secret values local.

---

## Contributor & Agent Guidelines

- [AGENTS.md](../AGENTS.md) — Architecture, security invariants, CodeMirror/Tauri rules, testing conventions & verification commands
- [DESIGN.md](../DESIGN.md) — CSS theme tokens, HTTP/GraphQL semantic colors, typography scaling, layout metrics & UI primitive specs
- [BRANDING.md](../BRANDING.md) — Brand narrative, logo rationale & voice guidelines
