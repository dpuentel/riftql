# T-013 — GitHub Actions CI & Multi-Platform Binary Releases

- **Status:** `DONE`
- **Area:** Infra / CI-CD

## Scope
- Pin `version: 12.23.0` on `pnpm/action-setup@v4` across workflows (avoiding `package.json` `packageManager` so offline `pnpm` runs stay network-free).
- Add `.github/workflows/ci.yml` running frontend checks (`pnpm typecheck`, `pnpm test`, `pnpm build`) and Rust `cargo test` across `ubuntu-22.04` and `windows-latest`.
- Add `.github/workflows/release.yml` compiling native Tauri v2 installers for Windows (`.msi`, `-setup.exe`), Linux (`.deb`, `.rpm`, `.AppImage`), and macOS (`arm64` & `x64` `.dmg`) via `tauri-apps/tauri-action@v0` on `v*` tags or uploading workflow artifacts on manual `workflow_dispatch`.
- Document CI and Release usage in `README.md`.

## Acceptance Criteria
- Valid GitHub Actions workflow YAML files with Rust & pnpm caching and release gate tests.
- `pnpm typecheck` and `pnpm test` remain green after updating `package.json`.
