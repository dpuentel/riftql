# T-009 — Sidebar, Collections Tree, Environments & Cookie Jar Modal

- **Status:** `DONE`
- **Area:** UI / Workspace

## Scope
- `Sidebar`: `Collections`, `History`, and `Envs` views with search filter, plus Cookie Jar and Settings triggers.
- Arbitrary nested folders inside collections, inline CRUD/context menus, and Collection/Folder Settings modal (variables + inherited auth).
- Chronological `History` list (Today / Yesterday / Older) restoring request snapshot and saved `< 500 KB` response.
- Top-bar quick environment switcher + `EnvironmentModal` (Global + custom envs, `isSecret` toggle with `••••` masking/reveal, secret-safe export & import).
- `CookieJarModal` with global auto-cookie toggle (`sendCookies`), domain filter, inspect/add/edit/delete/clear actions.
- `AppShell` with collapsible sidebar, draggable/resizable horizontal/vertical Request/Response split pane.

## Acceptance Criteria
- Component tests for `CookieJarModal` and `EnvironmentModal` pass.
- Tree nesting, auth inheritance dialog, and workspace state persistence verified.
