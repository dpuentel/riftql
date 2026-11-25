# T-007 — Response Viewer

- **Status:** `TODO`
- **Area:** UI / Response

## Scope
- `ResponsePane` with keyboard-first empty state, live elapsed timer + Cancel during flight, actionable error states (including quick SSL bypass button on TLS failure).
- Metrics bar (`tabular-nums`): color-coded status, `ms`, size (`KB`/`MB`), redirect count badge, Copy Body, Save to File.
- `ResponseBodyViewer` handling Pretty/Raw text, inline image preview, binary download card, and >5 MB large-text lightweight mode.
- Searchable `Headers` table and parsed `Cookies` (`Set-Cookie`) table with quick link to Domain Cookie Jar.

## Acceptance Criteria
- Component tests cover text formatting, metrics, headers filtering, cookies tab, image preview, binary download, large-text banner, and error states.
