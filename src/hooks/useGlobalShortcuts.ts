import * as React from 'react';
import { getEffectiveShortcuts, matchesShortcutEvent } from '@/lib/shortcuts';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { ShortcutActionId } from '@/types/shortcuts';

export type ShortcutHandlers = Partial<Record<ShortcutActionId, () => void>>;

export function useGlobalShortcuts(
  handlers: ShortcutHandlers,
  options?: { paused?: boolean },
): void {
  const customShortcuts = useSettingsStore((s) => s.settings.customShortcuts);
  const handlersRef = React.useRef(handlers);
  handlersRef.current = handlers;

  const paused = options?.paused ?? false;

  React.useEffect(() => {
    if (paused) return;
    const bindings = getEffectiveShortcuts(customShortcuts);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      const hasModifier = e.ctrlKey || e.metaKey || e.altKey;
      const target = e.target as HTMLElement | null;
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        Boolean(target?.isContentEditable);

      // Never hijack plain typing inside inputs/editors unless a modifier chord or Escape is pressed
      if (isEditable && !hasModifier && e.key !== 'Escape') {
        return;
      }

      for (const actionId of Object.keys(bindings) as ShortcutActionId[]) {
        const combo = bindings[actionId];
        if (!matchesShortcutEvent(e, combo)) continue;

        if (actionId === 'cancelRequest') {
          const openDialog = document.querySelector('[role="dialog"]');
          if (openDialog) return;
        }

        const fn = handlersRef.current[actionId];
        if (fn) {
          e.preventDefault();
          fn();
          return;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [customShortcuts, paused]);
}
