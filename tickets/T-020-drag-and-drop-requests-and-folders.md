# T-020 — Drag & Drop Requests and Folders Across Folders & Collections

- **Status:** `DONE`
- **Area:** UI / Collections / Persistence

## Scope
- Set `dragDropEnabled: false` in `src-tauri/tauri.conf.json` so HTML5 drag-and-drop events work seamlessly inside Windows WebView2 alongside Linux WebKitGTK and macOS WKWebView.
- Implement transactional SQLite `move_saved_request` and `move_folder` (with `move_saved_request_cmd` and `move_folder_cmd`) atomically updating `collection_id` and `parent_id`/`folder_id` across moved folder subtrees and preventing cycles.
- Add `moveSavedRequest` and `moveFolder` actions in `useWorkspaceStore` plus `syncMovedSavedRequest` and `syncMovedCollectionRequests` in `useTabsStore` so open tabs reflect moved collections/folders (and inherited Auth / Base URLs) immediately.
- Make saved requests and folders draggable onto any folder or collection in `Sidebar`, with drop target highlighting, dimmed drag source, collapsed target auto-expand on hover, and valid drop target guards (`canDropDraggedItem`).

## Acceptance Criteria
- Rust DB tests verify moving requests across folders/collections, atomic cross-collection subtree moves for folders, mismatch validation, and cycle rejection.
- Frontend tests verify `canDropDraggedItem` cycle rejection plus dragging requests and folders across folders & collections and keeping `useTabsStore` synchronized.
