# Importers & Code Snippets

Migrate collections, specs, and environments from existing API tools into RiftQL, or export any request as a runnable snippet.

---

## Multi-Format Collection & Spec Importer

Open **Import Collection / Spec** from:
- The **Import** icon (`FolderUp`) in the Sidebar **Collections** bar (or the button in an empty workspace).
- Right-clicking any **Collection** or **Folder** → **Import Into Collection…** / **Import Into Folder…** (pre-selects that exact destination).
- **Command Palette** (`Ctrl/Cmd+K`) → *Import Collection / Spec (Postman, Altair, Insomnia, OpenAPI)*.
- **Settings → Data** → *Import External (Postman, Altair, OpenAPI)…*.

Paste raw JSON directly or click **Choose File…** (native OS dialog supporting `.json`, `.agq`, `.agc`, `.agx`, `.txt`). RiftQL auto-detects the format, shows a tree preview + counts, and surfaces non-fatal compatibility notes.

### Supported Formats

| Source | Formats | Mapped Details |
| --- | --- | --- |
| **Altair GraphQL** | `.agq` (single query/window), `.agc` (collections & subcollections), `.agx` / `variablesJson` (environments) | Endpoint URL + query params, GraphQL query & formatted JSON variables, selected operation, headers, `bearer`/`basic`/`api-key` auth, environments |
| **Postman** | Collection v2.0 / v2.1 & Environment JSON | Recursive folders, REST + GraphQL (`body.mode === "graphql"`), `raw` (`json`/`xml`/`html`/`js`/`text`), `urlencoded`, `formdata` (including file paths), URL query params without duplication, `bearer`/`basic`/`apikey`/`noauth`, collection & env variables (preserving `secret` & disabled flags) |
| **Insomnia v4** | Export JSON (`_type: "export"`, `__export_format: 4`) | Workspaces → collections, nested `request_group` → folders, REST & `application/graphql` requests, auth, and environments (`isPrivate` → `isSecret`) |
| **OpenAPI / Swagger** | OpenAPI 3.0 / 3.1 & Swagger 2.0 (JSON) | `servers[0]` (with variable defaults) or `host + basePath` → Base URL, `tags` → folders, `{param}` → `{{param}}`, `securitySchemes` / `securityDefinitions`, path/query/header params, cycle-safe `$ref` resolution, synthesized JSON example bodies *(YAML files prompt to export/convert to `.json` first)* |
| **RiftQL Export** | Workspace JSON (`version: 1`) | Re-imports collections, nested folders, requests, and non-global environments with fresh IDs |

### Destination & Safety Rules
- **Create New Collection:** Optionally rename single-collection imports before creating.
- **Import into Existing Collection / Folder:** Choose any target collection and nested folder, with an optional **Wrap imported items inside a new subfolder** checkbox:
  - When wrapped, the source's `baseUrl` and collection `auth` attach cleanly to the new wrapper subfolder so imported requests keep working without altering the parent collection's own settings.
  - When unwrapped (e.g. importing a single `.agq` query directly into an existing folder), relative endpoints like `/users` automatically resolve against the spec's `baseUrl`.
- **Non-destructive:** Every imported collection, folder, request, header, param, variable, and environment gets a fresh `nanoid()` ID, appending `sortOrder` after existing items.
- **Global env safety:** External environments always import as named custom environments (`isGlobal: false`), deduplicating names with ` (Imported)` so your `Global` variables are never overwritten.

---

## cURL Importer

- **URL Bar Auto-Paste:** Paste any `curl ...` command into the active tab's URL input to immediately populate method, URL, params, headers, auth, SSL/redirect flags, and body.
- **Modal Importer:** Press `Ctrl/Cmd+I` (or use **Import cURL** from the Request pane / Command Palette) to preview the parsed request and open it in a new tab.
- **Supported flags:** `-X`/`--request`, `--url`, `-H`/`--header`, `-A`/`--user-agent`, `-b`/`--cookie`, `-u`/`--user` (`Basic` auth), `-d`/`--data`/`--data-raw`/`--data-binary`/`--data-urlencode`, `-F`/`--form` (including `@filepath`), `-k`/`--insecure`, `-L`/`--location`, `-G`/`--get`, plus ANSI-C `$'...'` and multiline `\` continuations. GraphQL JSON payloads (`{ "query": "..." }`) automatically open as native GraphQL tabs.

---

## Code Snippet Generator

Press `Ctrl/Cmd+Shift+C` (or click **Code** in the Request pane) to export the active tab in 5 formats:
- **cURL**
- **fetch (JS)**
- **axios**
- **Python (`requests`)**
- **HTTPie**

Toggle **Resolve Variables & Auth** to either emit literal resolved URLs/tokens for quick terminal testing or preserve `{{variable}}` placeholders.
