# T-005 — Domain Types, Variable Engine, Auth Inheritance & Zustand Stores

- **Status:** `DONE`
- **Area:** Core / State

## Scope
- TypeScript types matching Rust DTOs (`src/types/`).
- Variable resolver (`Active Environment > Collection > Global`) + dynamic built-ins (`{{$uuid}}`, `{{$timestamp}}`, `{{$isoTimestamp}}`, `{{$randomInt}}`) + match inspector & secret-stripping export helper.
- Auth inheritance resolver (`request -> folder chain -> collection -> none`) for Bearer, Basic, and API Key (Header or Query Param).
- Zustand stores: `useSettingsStore`, `useWorkspaceStore`, `useTabsStore` with debounced SQLite session persistence.

## Acceptance Criteria
- Unit and store tests passing in Vitest covering precedence, secret masking, auth inheritance, tab lifecycle, and request execution orchestration.
