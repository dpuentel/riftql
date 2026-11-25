# T-001 — Bootstrap Tooling, Git, Tickets & Tauri v2 Workspace

- **Status:** `DONE`
- **Area:** Infra / Setup

## Scope
- Ensure `pnpm` and native Windows Rust (`cargo`/`rustc` via `rustup`) are available.
- Initialize Git repository (`main`) with `.gitignore` excluding build/cache/local DB artifacts.
- Set up `tickets/` board covering MVP (`T-001`–`T-012`) and v2 backlog (`T-101`–`T-104`).
- Scaffold React 19 + TypeScript + Vite + Tailwind CSS v4 + CodeMirror 6 + Vitest + Tauri v2 (`com.riftql.app`).
- Generate RiftQL icon assets in `src-tauri/icons/`.

## Acceptance Criteria
- `pnpm typecheck`, `pnpm build`, `pnpm test`, and `cargo check --manifest-path src-tauri/Cargo.toml` succeed cleanly.
- No duplicate `@codemirror/state` instances in dependency tree.
