# Development, CI & Releases

Technical overview, local development commands, automated CI checks, and release workflows.

---

## Tech Stack

- **Desktop / Backend:** Tauri v2, Rust (`reqwest`, `tokio`, `rusqlite` bundled, `cookie`, `mime_guess`, `tokio-util`, `chrono`, `uuid`)
- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS v4, Radix UI primitives, Zustand, `cmdk`
- **Code Editors:** CodeMirror 6 + `cm6-graphql` + `graphql`
- **Offline Fonts:** `@fontsource-variable/inter` & `@fontsource-variable/jetbrains-mono`
- **Testing:** Vitest 5 + Testing Library (`jsdom`) on frontend; `cargo test` (`rusqlite` + `axum` local HTTP + Git integration tests) on backend

---

## Repository Structure

```text
riftql/
  docs/             Feature guides & documentation index
  scripts/          Release CLI (`release.mjs`) & tests
  src/              React UI, Zustand stores, CodeMirror wrappers, importers, GraphQL & utilities
  src-tauri/        Rust backend (`commands/`, `db/`, `http/`, `sync/`, `models.rs`)
  tickets/          MVP tickets (`T-001`–`T-020`) & v2 backlog (`T-101`–`T-104`)
  BRANDING.md       Visual system, palette & copy guidelines
```

---

## Local Development & Verification

### Prerequisites
- Node.js + `pnpm`
- Rust toolchain (`cargo` / `rustc`) + platform Tauri v2 dependencies (WebView2 + MSVC Build Tools on Windows; standard WebKitGTK deps on Linux)

### Commands

```bash
# Install dependencies
pnpm install

# Launch desktop app in dev mode
pnpm tauri dev

# Typecheck & production frontend build
pnpm typecheck
pnpm build

# Run frontend unit & component tests
pnpm test

# Run Rust SQLite, Cookie Jar, Axum HTTP, and Git Sync integration tests
cargo test --manifest-path src-tauri/Cargo.toml
```

---

## GitHub Actions CI & Releases

- **Continuous Integration ([ci.yml](../.github/workflows/ci.yml)):** Runs on every push and PR to `main` (`pnpm typecheck`, `pnpm test`, `pnpm build`, and `cargo test` across `ubuntu-22.04` and `windows-latest`).
- **Multi-Platform Release Builds ([release.yml](../.github/workflows/release.yml)):** Triggered by `v*` Git tags or manual `workflow_dispatch`. On tag pushes, `prepare-release` creates a single Draft Release with auto-generated release notes (and automatic `prerelease` detection for tags containing `-`), the `build` matrix attaches installers (plus signed updater artifacts when `TAURI_SIGNING_PRIVATE_KEY` is configured), and `publish` generates a single consolidated `latest.json` via [generate-latest-json.mjs](../scripts/generate-latest-json.mjs) and publishes the release once all platforms succeed:
  - **Windows (`x64`):** `.msi` / `.exe` (`latest.json` uses NSIS `.exe` first)
  - **Linux (`x64`):** `.deb` / `.rpm` / `.AppImage` (`latest.json` targets portable `.AppImage` for user-space self-updates)
  - **macOS (`arm64` & `x64`):** `.dmg` + signed `.app.tar.gz`

### In-App Auto-Updater Signing Setup

To enable cryptographic one-click in-app updates via `tauri-plugin-updater`:

1. Generate an Ed25519 keypair once locally:
   ```bash
   pnpm tauri signer generate -w ~/.tauri/riftql.key
   ```
2. Paste the generated `.pub` key string into `plugins.updater.pubkey` in [tauri.conf.json](../src-tauri/tauri.conf.json) (keep `bundle.createUpdaterArtifacts: false` in the repo so local/unsigned builds work without the private key).
3. Add GitHub Actions repository secrets:
   - `TAURI_SIGNING_PRIVATE_KEY`: contents of the private `.key` file
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: key password (if set)

When `TAURI_SIGNING_PRIVATE_KEY` is present on a tagged release, the CI workflow enables `createUpdaterArtifacts: true`, signs every bundle, and uploads a consolidated `latest.json` right before publishing.

### Automated Release CLI (`pnpm release`)

Verifies clean git state + `pnpm typecheck` + `pnpm test`, bumps the version across `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock`, creates commit `chore(release): v<version>` + annotated tag `v<version>`, and pushes to `origin` to start the automated Release workflow:

```bash
# Version targets
pnpm release patch              # bump patch (commits, tags & pushes)
pnpm release minor              # bump minor
pnpm release major              # bump major
pnpm release 0.4.0              # explicit version (or v0.4.0-rc.1)

# Useful flags
pnpm release minor --dry-run    # preview changes & git commands without modifying files
pnpm release 0.4.0 --no-push    # commit & tag locally; push manually later
pnpm release patch --skip-checks # skip pnpm typecheck & pnpm test
pnpm release patch --allow-dirty # allow uncommitted changes in working tree
pnpm release --help             # show usage & current version
```
