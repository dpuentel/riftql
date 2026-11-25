# T-002 — Branding Tokens, Theme Engine, RiftLogo & UI Primitives

- **Status:** `DONE`
- **Area:** UI / Design System

## Scope
- Apply `BRANDING.md` visual system (Dark-first `#09090B`/`#121316`/`#27272A`/`#8B5CF6`, Light `#FAFAFA`/`#FFFFFF`/`#E4E4E7`/`#7C3AED`).
- Bundle `@fontsource-variable/inter` and `@fontsource-variable/jetbrains-mono` for offline local-first rendering.
- Enable `tabular-nums` for timings, payload sizes, status codes, and counts.
- Build `RiftLogo` SVG component (clean down to `16x16` + monochrome support).
- Build reusable UI primitives (`Button`, `Input`, `Badge`, `Dialog`, `Select`, `Tabs`, `Switch`, `ScrollArea`, `DropdownMenu`, `ContextMenu`, `Popover`, `Tooltip`, `ActionTooltip`).
- Build typed Tauri IPC bridge (`src/lib/tauri.ts`) and formatting helpers (`src/lib/format.ts`).

## Acceptance Criteria
- Theme switches cleanly between Dark, Light, and System without layout shift.
- `ActionTooltip` attaches both styled `<kbd>` tooltip and native `title="Label (Shortcut)"`.
- Format helpers unit tested with Vitest.
