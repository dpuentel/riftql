# Requests & Responses

RiftQL executes all HTTP and GraphQL requests natively in Rust (`reqwest` + `tokio`), avoiding browser CORS restrictions and supporting custom TLS verification, redirects, timeouts, streaming file uploads, and RFC 6265 cookie handling.

---

## Constructing Requests

### Methods & URL Bar
- **HTTP methods:** `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`, plus `GQL` to switch the tab into native GraphQL mode.
- **Bidirectional URL ↔ Params sync:** Editing the query string (`?page=2&limit={{limit}}`) updates the **Params** table immediately, and editing/toggling rows in **Params** rebuilds the URL cleanly while preserving `{{variable}}` templates.
- **Base URL composition:** If the request belongs to a collection or folder with a configured **Base URL**, relative paths (e.g., `/v1/users`) combine automatically with ancestor Base URLs. Typing a full `http://` or `https://` URL overrides the inherited Base URL for that request. See [Collections & Variables](./collections-and-variables.md#base-url-inheritance).
- **Quick cURL paste:** Pasting a `curl ...` command straight into the URL bar automatically parses and populates the active tab.

### Headers & Request Bodies
- **Headers:** Key/value editor with per-row enable/disable toggles, descriptions, and variable interpolation.
- **Body modes:**
  - `None`: No request body.
  - `JSON`: CodeMirror 6 editor with JSON syntax highlighting, inline lint diagnostics, and pretty-printing (`Ctrl/Cmd+Shift+F`).
  - `Raw`: Plain text, `XML`, `HTML`, or `JavaScript`.
  - `URL-encoded` (`application/x-www-form-urlencoded`): Key/value pairs encoded on send.
  - `Form-data` (`multipart/form-data`): Supports both text fields and native OS file attachments streamed directly from disk in Rust.
  - `GraphQL`: Uses the native Query + Variables editor; see [GraphQL](./graphql.md).

### Authorization
Configure authorization per request in the **Auth** tab (or inherit from parent folders / collections):
- **Inherit auth from parent** (default for saved requests & folders)
- **No Auth** (explicitly disables inherited parent auth)
- **Bearer Token** (`Authorization: Bearer <token>`)
- **Basic Auth** (`Authorization: Basic <base64>`)
- **API Key** (injected as a **Header** or **Query Param**)

All auth fields support `{{variable}}` templates (for example, keeping `{{api_token}}` inside a secret environment variable).

---

## Network Controls & Cancellation

Global networking defaults live in **Settings → Network**, and every request can optionally override SSL verification, redirect following, cookie sending, or timeout:
- **Verify SSL Certificates:** Toggle off for self-signed `localhost` or internal staging certificates.
- **Follow Redirects & Max Redirects:** Default enabled with a configurable redirect limit (`10` hops by default).
- **Timeout (ms):** Default `30,000 ms`. Exceeding the timeout surfaces a `TIMEOUT` error without hanging the UI.
- **Cancel in-flight request:** Press `Escape` or click **Cancel** to abort the active Rust HTTP task immediately.
- **System Proxy:** Inherited automatically via `reqwest` system proxy support.

---

## Domain Cookie Jar (RFC 6265)

RiftQL maintains a local SQLite Cookie Jar:
- Automatically captures `Set-Cookie` headers across responses and redirect hops when **Send Cookies** is enabled.
- Matches stored cookies by domain (`hostOnly` vs domain-wide), path prefix, and `Secure` flag on subsequent requests.
- Any manual `Cookie` header on a request merges cleanly without losing explicit manual cookie keys.
- Open the **Cookie Jar** modal (`Ctrl/Cmd+Shift+J`, Sidebar footer **Cookies** button, or Command Palette) to search, inspect, manually add/edit, clear per domain, or wipe all cookies.

---

## Response Viewer

- **Metrics bar:** Color-coded HTTP status badge (`2xx`, `3xx`, `4xx`, `5xx`), tabular duration (`ms` / `s`), response size (`B` / `KB` / `MB`), and redirect count badge when redirects occurred.
- **Pretty / Raw Body views:** Automatic language detection and pretty-printing for JSON, XML, HTML, and plain text inside a read-only CodeMirror viewer.
- **Headers tab:** Searchable table of all response headers.
- **Cookies tab:** Parsed response cookies with domain, path, `HttpOnly`, `Secure`, `SameSite`, and `Expires`/`Max-Age` attributes.
- **Images & Binary Responses:**
  - Inline image previews (up to 15 MB).
  - Non-text binary payloads cache up to the 10 most recent responses in memory so you can save them to disk via native OS Save dialog without re-sending the request.
  - Large text payloads over **5 MB** switch to a safe **250 KB** preview mode with one-click download/save to keep the UI responsive.
