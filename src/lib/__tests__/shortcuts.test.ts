import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHORTCUTS,
  detectShortcutConflict,
  formatShortcutForDisplay,
  getEffectiveShortcuts,
  keyboardEventToCombo,
  matchesShortcutEvent,
  normalizeComboString,
} from '@/lib/shortcuts';

describe('shortcuts registry and matching', () => {
  it('normalizes and formats shortcuts per platform', () => {
    expect(normalizeComboString('shift+mod+f')).toBe('Mod+Shift+F');
    expect(formatShortcutForDisplay('Mod+Enter', false)).toBe('Ctrl+Enter');
    expect(formatShortcutForDisplay('Mod+Enter', true)).toBe('⌘↵');
    expect(formatShortcutForDisplay('Mod+Shift+F', true)).toBe('⌘⇧F');
  });

  it('matches KeyboardEvent combos accurately on Windows/Linux and macOS', () => {
    expect(
      matchesShortcutEvent(
        { key: 'Enter', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false },
        'Mod+Enter',
        false,
      ),
    ).toBe(true);

    expect(
      matchesShortcutEvent(
        { key: 'k', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false },
        'Mod+K',
        true,
      ),
    ).toBe(true);

    expect(
      matchesShortcutEvent(
        { key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true },
        'Mod+K',
        false,
      ),
    ).toBe(false);
  });

  it('converts recorded key events and detects conflicts', () => {
    const combo = keyboardEventToCombo(
      { key: 'p', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true },
      false,
    );
    expect(combo).toBe('Mod+Shift+P');

    const bindings = getEffectiveShortcuts({});
    const conflict = detectShortcutConflict('newTab', 'Mod+K', bindings);
    expect(conflict?.id).toBe('commandPalette');
    expect(DEFAULT_SHORTCUTS.length).toBeGreaterThanOrEqual(19);
  });
});
