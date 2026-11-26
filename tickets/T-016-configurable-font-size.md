# T-016 — Configurable UI & Code Editor Font Sizes

- **Status:** `DONE`
- **Area:** UI / Settings

## Scope
- Add `uiFontSize` (default `16px`, range `13`–`22`) and `codeFontSize` (default `13px`, range `11`–`22`) to Rust & TypeScript `AppSettings` with `#[serde(default)]` backward compatibility.
- Change CSS root sizing (`html { font-size: var(--rift-ui-font-size, 16px) }`) and convert tiny fixed pixel classes (`text-[10px]` / `text-[11px]`) to scalable `rem` units across UI components.
- Drive CodeMirror 6 editor and gutter font sizes via `--rift-code-font-size` and call `requestMeasure()` on typography updates.
- Restore font size CSS variables synchronously in `index.html` FOUC guard script before first paint.
- Add Typography controls (UI presets, sliders, `-`/`+` steppers, and live monospace preview) in `SettingsModal → General`.

## Acceptance Criteria
- Rust unit test confirms legacy `AppSettings` JSON deserializes cleanly with default font sizes.
- Vitest test confirms UI and code font size controls update `useSettingsStore` and root CSS custom properties.
