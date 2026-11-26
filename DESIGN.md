# DESIGN.md — RiftQL Design System & UI Guidelines

Concrete visual design system, token contract, component inventory, and UX rules for **RiftQL**. Every new screen, modal, editor panel, or interactive control should conform to these specifications so the application feels cohesive, fast, and native.

> **Related Docs:**
> - Brand Narrative & Tone of Voice: [BRANDING.md](./BRANDING.md)
> - AI Coding & Engineering Guidelines: [AGENTS.md](./AGENTS.md)
> - Keyboard Shortcuts & UX User Guide: [docs/shortcuts-and-ux.md](./docs/shortcuts-and-ux.md)

---

## 1. Design Philosophy

RiftQL uses a **Linear / Raycast / Vercel-inspired** engineering aesthetic:
- **Quiet Chrome, Loud Data:** The interface disappears behind hairline `1px` borders (`--border-subtle`) and desaturated slate neutrals so payloads, JSON/GraphQL documents, URLs, and status codes take visual priority.
- **Dark-First with Light Parity:** `:root.dark` is the default visual anchor; every color token and semantic accent must maintain clear readability and contrast in both Light (`:root`) and Dark (`:root.dark`) themes.
- **High Information Density:** Compact controls (`h-7`, `text-xs`), tight padding, crisp monospace metrics (`tabular-nums`), and zero decorative gradients, marketing cards, or heavy drop shadows on inline panels.
- **Keyboard-First & Non-Blocking:** Every frequent action is mapped to shortcuts / the Command Palette (`Ctrl/Cmd+K`), and background feedback uses transient or actionable Sonner-style toasts (`Toaster`) rather than blocking browser alerts.

---

## 2. Color & Surface Token System (`src/index.css`)

Always style surfaces, text, borders, and highlights with CSS custom properties from [src/index.css](./src/index.css) (never hardcode `#09090B` or `#FFFFFF` on panels/inputs).

### 2.1 Core Theme Variables

| Token | Light Mode (`:root`) | Dark Mode (`:root.dark`) | Tailwind / Semantic Role |
| --- | --- | --- | --- |
| `--bg-base` | `#FAFAFA` | `#09090B` | Root window canvas, sidebar, top header (`--color-background`) |
| `--bg-surface` | `#FFFFFF` | `#121316` | Inputs, cards, modals, toasts, active request surface (`--color-surface`) |
| `--bg-elevated` | `#F4F4F5` | `#18191D` | Active tabs, `<kbd>` keycaps, default badges, CodeMirror search panel |
| `--bg-hover` | `rgba(9, 9, 11, 0.045)` | `rgba(244, 244, 245, 0.05)` | Subtle row/button hover fills |
| `--border-subtle` | `#E4E4E7` | `#27272A` | Default `1px` hairline borders & dividers (`--color-border`) |
| `--border-strong` | `#D4D4D8` | `#3F3F46` | Emphasized hover borders, resize separators, logo frame |
| `--accent` | `#7C3AED` | `#8B5CF6` | Primary **Send** CTA, active tab underline, focus ring, active toggles |
| `--accent-hover` | `#6D28D9` | `#7C3AED` | Hover state for primary accent buttons |
| `--accent-muted` | `rgba(124, 58, 237, 0.12)` | `rgba(139, 92, 246, 0.16)` | Active list item selection, accent badges, autocomplete highlight |
| `--text-primary` | `#09090B` | `#F4F4F5` | Primary labels, headings, active values, code (`--color-foreground`) |
| `--text-secondary` | `#71717A` | `#A1A1AA` | Helper text, section labels, inactive tabs (`--color-muted`) |
| `--text-tertiary` | `#A1A1AA` | `#71717A` | Muted placeholders, subtle icons, dismiss glyphs |

### 2.2 CodeMirror Editor Tokens (`src/index.css` + `src/components/editor/CodeEditor.tsx`)

| Token | Light Mode | Dark Mode | Role |
| --- | --- | --- | --- |
| `--cm-bg` | `#FFFFFF` | `#121316` | Editor content surface |
| `--cm-gutter-bg` | `#FAFAFA` | `#121316` | Line number & fold gutter background |
| `--cm-gutter-text` | `#A1A1AA` | `#52525B` | Inactive line numbers |
| `--cm-active-line` | `rgba(124, 58, 237, 0.05)` | `rgba(139, 92, 246, 0.06)` | Active line & active gutter highlight |
| `--cm-selection` | `rgba(124, 58, 237, 0.18)` | `rgba(139, 92, 246, 0.25)` | Editor text selection |

Syntax highlight themes (`riftDarkHighlight` / `riftLightHighlight` in `CodeEditor.tsx`) pair violet keywords (`#C084FC` / `#7C3AED`), emerald strings (`#34D399` / `#059669`), amber literals (`#FBBF24` / `#D97706`), blue property names (`#60A5FA` / `#2563EB`), pink types/tags (`#F472B6` / `#DB2777`), and italic zinc comments (`#71717A`).

### 2.3 Surface Elevation Hierarchy

1. **Base (`--bg-base`)** — App chrome (`AppShell`), Sidebar, Top Bar, recessed inner container boxes inside modals.
2. **Surface (`--bg-surface`)** — Editors, Modals (`DialogContent`), Inputs, Select triggers, Cards, Toasts (`Toaster`).
3. **Elevated (`--bg-elevated`)** — Secondary pills, `<kbd>` chips, default `Badge`, Switch track, CodeMirror find panels.
4. **Hover / Accent Muted (`--bg-hover` / `--accent-muted`)** — Interactive rows, selected environments, focused autocomplete items.

---

## 3. Semantic HTTP, GraphQL & Status Colors (`src/lib/format.ts`)

Always reuse `getMethodColorClass`, `getMethodBadgeClasses`, and `getStatusBadgeClasses` from [src/lib/format.ts](./src/lib/format.ts) rather than duplicating color strings across components:

| Category | Light Mode | Dark Mode | Meaning |
| --- | --- | --- | --- |
| **GET / 2xx / Success** | `#059669` | `#34D399` | Safe reads, HTTP `200–299`, healthy sync dot, success badges/toasts |
| **POST / 4xx / Warning** | `#D97706` | `#FBBF24` | Mutations/creation, HTTP `400–499`, paused cookies dot, warning badges/toasts |
| **PUT / PATCH / 3xx / Sync** | `#2563EB` | `#60A5FA` | Partial/full updates, HTTP `300–399`, remote update badge (`↓N`), `Pushing…` pulse |
| **DELETE / 5xx / Destructive** | `#DC2626` | `#F87171` | Destructive actions, HTTP `500+`, network/sync errors, confirm-delete states |
| **GQL / GRAPHQL** | `#C026D3` | `#E879F9` | GraphQL tabs, sidebar method tags, Schema Auto-Discovery (`Sparkles` icon) |
| **OPTIONS / HEAD / Neutral** | `#52525B` | `#A1A1AA` | Metadata/preflight HTTP methods and unknown status codes |

Badges and status pills pair translucent `10%–12%` tinted fills (`bg-[#...]/10`) with subtle `25%–30%` borders (`border-[#...]/25`).

---

## 4. Typography & Dynamic Scaling

RiftQL bundles offline variable fonts via `@fontsource-variable/inter` and `@fontsource-variable/jetbrains-mono` in [src/index.css](./src/index.css):
- **`--font-sans`**: `"Inter Variable", ui-sans-serif, system-ui, -apple-system, sans-serif` (UI chrome, buttons, labels, headings).
- **`--font-mono`**: `"JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` (code editors, URLs, JSON keys, headers, branch names, `<kbd>`).

### Dynamic Font Size Contract (`src/store/useSettingsStore.ts`)
Users adjust typography live in Settings:
- **UI Font Size (`--rift-ui-font-size`):** `13px–22px` (default `16px`), applied directly to `html { font-size }`.
- **Code Font Size (`--rift-code-font-size`):** `11px–22px` (default `13px`), applied to `.cm-scroller` / `CodeEditor`.

**Critical Rule:** Express all UI font sizes in **`rem` or Tailwind scale utilities** (`text-xs` = `0.75rem`, `text-sm` = `0.875rem`, `text-[0.6875rem]`, `text-[0.75rem]`). **Never** hardcode pixel classes like `text-[11px]` or `text-[12px]` in UI chrome, because pixel units ignore `--rift-ui-font-size` scaling.

### Numeric & Code Utility Classes
- `.font-mono-code`: Sets `font-family: var(--font-mono)` + `font-variant-numeric: tabular-nums`. Use on URLs, method codes, git branch/commit hashes, `<kbd>` hints, JSON snippets, and port/ID values.
- `.tabular-nums`: Sets `font-variant-numeric: tabular-nums`. Always apply on timers (`ms`/`s`), byte sizes (`KB`/`MB`), status codes, cookie/environment counts, and badge counters (`↓N`) so values never jitter horizontally when updated.

---

## 5. Layout Architecture & Spatial Metrics

Implemented in [src/components/layout/AppShell.tsx](./src/components/layout/AppShell.tsx):

- **Top Header Bar (`h-10` / `2.5rem`):**
  - Left: `RiftLogo` (`size={18}`), `RiftQL` title, Sidebar toggle (`PanelLeft`).
  - Center: `TabBar` (`role="tablist"`) with horizontal `.rift-scroll`, method label, title (double-click inline rename), dirty blue dot indicator (genuine edits only), and close button.
  - Right: Active Environment `Select` (`w-36 h-7`), Command Palette trigger (`Ctrl/Cmd+K`), Split Layout toggle (`horizontal` / `vertical`), Theme toggle (`Sun` / `Moon`), and Settings gear (`Settings`).
- **Resizable Sidebar (`Sidebar.tsx`):**
  - Default `260px`, user-resizable between `200px` and `440px` (`localStorage` key `riftql-sidebar-width`), separated by a `3px` drag handle (`hover:bg-[var(--accent)]`).
  - Header controls: compact filter `Input` (`h-7`), view switcher (`Collections`, `History`, `Environments`), quick `+ Collection` & `Import` (`FolderUp`) buttons.
  - Footer strip: Cookie Jar trigger with live `settings.sendCookies` status dot (`#34D399` enabled / `#FBBF24` paused), optional active Git Sync indicator (`animate-pulse bg-[#60A5FA]` during `Pushing…` + error `#F87171` / healthy `#34D399` dot + branch name), optional clickable `↓N` remote-update pill (`GitRemoteUpdateModal`), and Settings button.
- **Main Split Workspace:**
  - `RequestPane` and `ResponsePane` divided by a `3px` draggable handle (`splitRatio` clamped `0.22`–`0.78`, default `0.5`) supporting side-by-side (`horizontal`) and stacked (`vertical`) layouts.
- **Scrollbars & Preview Helpers:**
  - Use `.rift-scroll` on every scrollable container (tree lists, response viewers, tables, modal bodies).
  - Use `.rift-checkerboard` behind transparent binary/image previews in `ResponseBodyViewer.tsx`.

---

## 6. UI Primitive Inventory (`src/components/ui/`)

Always compose UI from existing primitives in [src/components/ui/](./src/components/ui/) before styling raw elements:

### 6.1 `Button` (`button.tsx`)
- Defaults to `type="button"`, `variant="secondary"`, `size="sm"`.
- **Variants:**
  - `default` — Accent fill (`--accent`, white text) — reserve for the primary CTA in a view/modal (e.g., **Send**, **Save**, **Import**, **Pull**).
  - `secondary` — Surface background + subtle border (`--bg-surface` / `--border-subtle`) — standard actions (**Format**, **Browse…**, **Fetch Schema**).
  - `ghost` — Transparent until hovered (`--bg-hover`) — toolbar icon buttons, sidebar row actions, dismiss buttons.
  - `destructive` — Soft red tint (`#DC2626`) — confirmed delete/clear actions.
  - `outline` — Transparent + subtle border.
- **Sizes:** `xs` (`h-6 px-2 text-[0.75rem]`), `sm` (`h-7 px-2.5 text-xs`), `md` (`h-8 px-3 text-xs`), `icon` (`h-7 w-7 p-0`), `icon-sm` (`h-6 w-6 p-0`).

### 6.2 `Badge` (`badge.tsx`) & `Input` (`input.tsx`)
- `Badge`: Compact `px-1.5 py-0.5 text-[0.6875rem] font-medium` pill with variants `default`, `accent`, `success`, `warning`, `destructive`.
- `Input`: Dense `h-7` rounded-md surface input with `border-[var(--border-subtle)]`, `text-xs`, and `focus:border-[var(--accent)]`.

### 6.3 `Dialog` & Resizable Modal Contract (`dialog.tsx`)
Centered surface (`--bg-surface`, `border-[var(--border-subtle)]`, `shadow-2xl`, `overscroll-contain`) over `bg-black/55 backdrop-blur-[1px]`.
- Enable resizing via `<DialogContent resizable storageKey="..." minWidth={...} minHeight={...}>` (`ew`, `ns`, and `nwse` bottom-right resize handles saving to `localStorage`).
- **Required Internal Layout for Resizable Modals:**
  - `<DialogHeader className="shrink-0">`
  - Scrollable/flex body `<div className="min-h-0 flex-1 overflow-y-auto rift-scroll">` (or `flex min-h-0 flex-1 flex-col overflow-hidden` when inner panes scroll independently)
  - `<DialogFooter className="shrink-0">`
- Active persisted `storageKey`s in `src/components/modals/`:
  - `riftql-settings-modal-size` (`SettingsModal`, min `560x420`)
  - `riftql-env-modal-size` (`EnvironmentModal`, min `560x380`)
  - `riftql-collection-modal-size` (`CollectionSettingsModal`, min `480x360`)
  - `riftql-cookie-modal-size` (`CookieJarModal`, min `520x360`)
  - `riftql-import-modal-size` (`ImportCollectionModal`, min `540x440`)
  - `riftql-discover-gql-modal-size` (`DiscoverGraphQLModal`, min `560x440`)

### 6.4 `ActionTooltip` (`action-tooltip.tsx`)
Wrap interactive buttons (especially icon-only controls) with `ActionTooltip`:
- Pass `actionId` when bound to a customizable shortcut (`src/lib/shortcuts.ts`) so the `<kbd>` pill updates automatically when the user edits shortcuts in Settings.
- Sets both an accessible Radix Tooltip and a native HTML `title` attribute (`"Label (Shortcut)"`).

### 6.5 `Toaster` (`Toaster.tsx`) & `notify` (`src/store/useNotificationStore.ts`)
Custom zero-dependency Sonner-style notification stack anchored `fixed right-4 bottom-4 z-50 w-[23rem] max-w-[calc(100vw-2rem)]`:
- Maximum **5** simultaneous notifications (`MAX_NOTIFICATIONS`), newest deduplicated by `id`.
- Left `3px` semantic stripe + Lucide icon: `info` (`--accent`), `success` (`#34D399`), `warning` (`#FBBF24`), `error` (`#F87171`).
- Accessibility: `role="alert" aria-live="assertive"` for `warning`/`error`; `role="status" aria-live="polite"` for `info`/`success`.
- Duration defaults: `3500ms` (`info`/`success`), `5000ms` (`warning`/`error`), or `durationMs: 0` for persistent actionable alerts (e.g., remote Git updates with **Review & Pull** / **Dismiss** buttons).

### 6.6 Supporting Radix Primitives
- `Tabs` (`tabs.tsx`): `2px` bottom `--accent` indicator bar on `data-[state=active]`.
- `Switch` (`switch.tsx`): Compact `h-4 w-7` pill toggling `--bg-elevated` -> `--accent`.
- `Select`, `ContextMenu`, `DropdownMenu`, `Popover`, `ScrollArea`, `Tooltip` — thin Tailwind-styled Radix wrappers.

### 6.7 Iconography (`lucide-react`)
- Toolbar / tree / `xs`–`sm` button icons: `h-3.5 w-3.5` (or `h-3 w-3` inside ultra-compact badges/rows).
- Modal header / notification icons: `h-4 w-4`.
- Brand mark: `<RiftLogo size={18} />` in top bar (`monochrome` prop supported for monochrome icon contexts).

---

## 7. Interaction Standards & Copy Tone

- **Tone & Microcopy:** Direct, technical, concise English (`"No collections yet."`, `"Folder is empty and ready for migration or Git clone."`, `"Auto-sync workspace"`). Avoid exclamation marks, mascots, or verbose prose.
- **Progressive Disclosure in Trees (`Sidebar.tsx`):** Keep collection/folder/request rows clean by revealing hover/focus action trays (`+` Add, ✨ Discover GraphQL, Sort A–Z, Settings, Delete) on hover/focus-within, and expose the full action set inside right-click `ContextMenu`.
- **Two-Step Inline Delete Confirmation:** Prefer inline confirmation buttons (`Click again to delete` / contextual prompt) over modal confirmation spam or browser `window.confirm`.
- **Inline Validation & Error Banners:** Display contextual errors inside the initiating container or modal (`border-[#F87171]/40 bg-[#F87171]/10`) or via `notify.error(...)` for async background operations.
- **Focus Visibility:** Preserve the global `:focus-visible` rule (`outline: 1.5px solid var(--accent); outline-offset: 1px`) and `overscroll-behavior: contain` on modal overlays.

---

## 8. Do / Don't Checklist for New UI

| Do | Don't |
| --- | --- |
| Use CSS variables (`var(--bg-surface)`, `var(--text-secondary)`) for all chrome | Hardcode `#09090B`, `#FFFFFF`, or dark-only surfaces that break Light mode |
| Use `rem` sizes (`text-xs`, `text-[0.6875rem]`, `text-[0.75rem]`) | Hardcode `text-[11px]` or `text-[12px]` (breaks user UI font scaling) |
| Reuse `getMethodColorClass` / `getMethodBadgeClasses` / `getStatusBadgeClasses` | Invent new ad-hoc HTTP method or status colors |
| Apply `.font-mono-code` & `.tabular-nums` to metrics, URLs, timings & badges | Let changing numbers (`ms`, `KB`, `↓N`) shift surrounding layout width |
| Use `ActionTooltip` with `actionId` on icon-only controls | Ship unlabelled icon buttons or stale hardcoded shortcut strings |
| Use `DialogContent resizable` + `shrink-0` header/footer for complex modals | Build fixed-height overflowing modals or use `window.alert` / `window.confirm` |
| Keep chrome hairline-thin (`1px`), flat, and low-glare | Add marketing banners, heavy multi-layer shadows, or decorative animations |
