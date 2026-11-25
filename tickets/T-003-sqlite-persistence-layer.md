# T-003 — Rust SQLite Persistence Layer & Migrations

- **Status:** `IN_PROGRESS`
- **Area:** Backend / DB

## Scope
- Implement `AppError` and camelCase Rust DTOs (`src-tauri/src/models.rs`) aligned with TypeScript domain models.
- SQLite initialization with WAL mode, foreign keys ON, and idempotent migrations.
- Tables: `collections`, `folders` (arbitrary nesting), `saved_requests`, `environments` (with seeded `Global`), `history_entries` (200-row cap, 500 KB response body cap), `session_tabs`, `cookies` (unique domain+path+name), `app_settings`.
- Full CRUD commands + workspace JSON export/import (automatically stripping `isSecret: true` values on export).

## Acceptance Criteria
- All SQLite CRUD operations, cascade deletes, history pruning, and secret stripping verified via `:memory:` `cargo test` suite.
