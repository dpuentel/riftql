# T-014 — Fix Environment Selection Reset & Native Tauri File Export/Import

- **Status:** `DONE`
- **Area:** UI / Persistence

## Scope
- Fix `EnvironmentModal` selection reset effect so creating, editing, or adding variables on Global or non-active custom environments preserves the currently selected environment.
- Stabilize environment inline name editing so clearing the name field while typing does not trigger empty-name validation errors.
- Add `write_text_file_cmd` and `read_text_file_cmd` Rust Tauri commands, extend `TauriBridgeAdapter` (`pickOpenFile`, `pickSaveFile`, `pickOpenDirectory`), and introduce `src/lib/file-io.ts` so `EnvironmentModal` and `SettingsModal` export/import JSON reliably inside Tauri WebViews (Windows & Linux) with browser Blob fallback.

## Acceptance Criteria
- Regression tests verify editing/adding variables on non-active environments and on Global stays on the selected environment.
- Unit/component tests verify Export JSON writes stripped JSON via the Tauri save dialog bridge.
