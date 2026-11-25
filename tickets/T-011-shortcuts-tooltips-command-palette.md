# T-011 — Customizable Shortcuts, Tooltips, Command Palette & Settings

- **Status:** `TODO`
- **Area:** UX / Keyboard

## Scope
- `shortcuts.ts` registry covering 19 workspace/editor actions with platform formatting (`⌘` vs `Ctrl`), normalized combos, conflict detection, and safe `useGlobalShortcuts` listener.
- Audit all interactive buttons to use `ActionTooltip` so every action displays both label and live customized shortcut in both styled tooltip and native `title` attribute.
- `CommandPalette` (`Ctrl/Cmd+K`) built with `cmdk`: fuzzy search across saved requests, quick actions, and environment switching with right-aligned shortcut badges.
- `SettingsModal`: General (Theme, Default Layout), Network (SSL verify, redirects, max redirects, timeout, Cookie Jar toggle), Shortcuts (interactive key recorder, conflict warning, reset), Data (export/import workspace JSON).

## Acceptance Criteria
- Unit tests for shortcut matching/formatting/conflicts.
- Component tests for `ActionTooltip` dynamic `title`/tooltip updates and `CommandPalette` search/trigger.
