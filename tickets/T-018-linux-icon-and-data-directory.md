# T-018 — Ubuntu AppImage Dock Icon & Configurable Data Storage Directory

- **Status:** `DONE`
- **Area:** Desktop / Storage

## Scope
- Fix missing dock/taskbar icon on Ubuntu GNOME (Wayland & X11) for AppImage/deb/rpm builds:
  - Set `app.enableGTKAppId: true`, include `icons/64x64.png` + `icons/icon.png` in `bundle.icon`, and configure `bundle.linux.{deb,rpm}.desktopTemplate` (`src-tauri/linux/riftql.desktop` with `StartupWMClass=com.riftql.app`).
  - Explicitly apply `app.default_window_icon()` on the main window in `lib.rs` and auto-register `$XDG_DATA_HOME/applications/com.riftql.app.desktop` + hicolor PNG icon when running via `APPIMAGE` (`src-tauri/src/linux_desktop.rs`).
- Add configurable SQLite storage directory:
  - `src-tauri/src/db/storage_config.rs` reading/writing `<default_app_data_dir>/storage-config.json`.
  - `Database::open_with_default_dir`, `Database::storage_info`, and `Database::set_data_directory` (WAL checkpoint, Windows-safe connection swap before file copy, non-destructive switch if destination DB exists, reset to default).
  - `get_storage_info_cmd` and `set_data_directory_cmd` Tauri commands wired into **Settings → Data** with copy path, folder picker, optional migration copy, and automatic workspace/tabs reload.
- Document default data storage paths and Linux AppImage desktop integration in `README.md`.

## Acceptance Criteria
- Rust unit tests verify storage directory migration, persistence across reopen, non-destructive target switching, reset to default, and AppImage `.desktop` / PNG icon generation.
- Vitest test verifies Settings → Data displays current path, switches folders via native directory picker, and reloads workspace.
