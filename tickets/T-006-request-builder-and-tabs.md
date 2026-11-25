# T-006 — CodeMirror 6 Wrapper, Multi-Tab Bar & REST Request Builder

- **Status:** `DONE`
- **Area:** UI / Request

## Scope
- CodeMirror 6 wrapper (`CodeEditor.tsx`) supporting JSON, XML, HTML, GraphQL, plain text, RiftQL Dark/Light themes, search, folding, and lightweight mode.
- Multi-tab bar (`TabBar.tsx`) with method colors, dirty dot, middle-click close, and new tab shortcut.
- `RequestPane`, `KeyValueEditor` (with native Tauri file upload picker for `form-data`), `AuthEditor` (showing inheritance source), `BodyEditor`, and bidirectional URL <-> Query Params table sync.

## Acceptance Criteria
- Request builder tests pass for URL/param sync, key-value toggles, auth mode switching, and tab switching.
