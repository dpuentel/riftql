# T-015 — Collection Folder Actions, Nested Subfolders & Inline Request Renaming

- **Status:** `DONE`
- **Area:** UI / Collections

## Scope
- Expose clear hover/keyboard action buttons on Sidebar collection & folder rows for creating nested subfolders (`FolderPlus`), adding requests (`Plus`), inline renaming (`Pencil`), settings (`SlidersHorizontal`), and deleting with inline confirmation (`Trash2`).
- Immediately enter inline rename when creating a folder or subfolder.
- Add inline request renaming across `Sidebar`, `RequestPane` header bar (with Collection / Folder breadcrumb), and `TabBar` context menu / double-click, keeping `useWorkspaceStore` and `useTabsStore` synchronized cleanly.
- Detach deleted saved request IDs from open tabs when deleting requests, folders, or collections.

## Acceptance Criteria
- Component tests verify creating and renaming nested subfolders, deleting folders with cascade & tab detachment, and renaming saved requests across Sidebar, RequestPane, and TabBar.
