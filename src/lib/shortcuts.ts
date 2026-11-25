import type { ShortcutActionId, ShortcutDefinition } from '@/types/shortcuts';

export const DEFAULT_SHORTCUTS: ShortcutDefinition[] = [
  {
    id: 'sendRequest',
    label: 'Send Request',
    category: 'Request',
    defaultCombo: 'Mod+Enter',
  },
  {
    id: 'cancelRequest',
    label: 'Cancel In-Flight Request',
    category: 'Request',
    defaultCombo: 'Escape',
  },
  {
    id: 'saveRequest',
    label: 'Save Request',
    category: 'Request',
    defaultCombo: 'Mod+S',
  },
  {
    id: 'formatBody',
    label: 'Format Request Body / Query',
    category: 'Request',
    defaultCombo: 'Mod+Shift+F',
  },
  {
    id: 'focusUrl',
    label: 'Focus URL Bar',
    category: 'Request',
    defaultCombo: 'Mod+L',
  },
  {
    id: 'openCodeSnippet',
    label: 'Copy as Code Snippet',
    category: 'Request',
    defaultCombo: 'Mod+Shift+C',
  },
  {
    id: 'importCurl',
    label: 'Import cURL',
    category: 'Request',
    defaultCombo: 'Mod+I',
  },
  {
    id: 'newTab',
    label: 'New Request Tab',
    category: 'Tabs & Navigation',
    defaultCombo: 'Mod+T',
  },
  {
    id: 'closeTab',
    label: 'Close Active Tab',
    category: 'Tabs & Navigation',
    defaultCombo: 'Mod+W',
  },
  {
    id: 'nextTab',
    label: 'Next Tab',
    category: 'Tabs & Navigation',
    defaultCombo: 'Ctrl+Tab',
  },
  {
    id: 'prevTab',
    label: 'Previous Tab',
    category: 'Tabs & Navigation',
    defaultCombo: 'Ctrl+Shift+Tab',
  },
  {
    id: 'commandPalette',
    label: 'Open Command Palette',
    category: 'Workspace',
    defaultCombo: 'Mod+K',
  },
  {
    id: 'newCollection',
    label: 'New Collection',
    category: 'Workspace',
    defaultCombo: 'Mod+Shift+N',
  },
  {
    id: 'openEnvironments',
    label: 'Manage Environments',
    category: 'Workspace',
    defaultCombo: 'Mod+E',
  },
  {
    id: 'openCookies',
    label: 'Manage Cookie Jar',
    category: 'Workspace',
    defaultCombo: 'Mod+Shift+J',
  },
  {
    id: 'openSettings',
    label: 'Open Settings',
    category: 'Workspace',
    defaultCombo: 'Mod+,',
  },
  {
    id: 'toggleSidebar',
    label: 'Toggle Sidebar',
    category: 'Appearance',
    defaultCombo: 'Mod+B',
  },
  {
    id: 'toggleLayout',
    label: 'Toggle Horizontal / Vertical Split',
    category: 'Appearance',
    defaultCombo: 'Mod+\\',
  },
  {
    id: 'toggleTheme',
    label: 'Toggle Dark / Light Theme',
    category: 'Appearance',
    defaultCombo: 'Mod+Shift+L',
  },
];

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

const MODIFIER_ORDER = ['Mod', 'Ctrl', 'Alt', 'Shift'] as const;

function normalizeKeyToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (lower === 'esc' || lower === 'escape') return 'Escape';
  if (lower === 'enter' || lower === 'return') return 'Enter';
  if (lower === 'tab') return 'Tab';
  if (lower === ' ' || lower === 'space') return 'Space';
  if (lower === 'backspace') return 'Backspace';
  if (lower === 'delete') return 'Delete';
  if (trimmed.length === 1) return trimmed.toUpperCase();
  return trimmed[0].toUpperCase() + trimmed.slice(1);
}

export function normalizeComboString(combo: string): string {
  const parts = combo
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);

  const mods = new Set<string>();
  let mainKey = '';

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'mod' || lower === 'cmdorctrl' || lower === 'meta' || lower === 'cmd') {
      mods.add('Mod');
    } else if (lower === 'ctrl' || lower === 'control') {
      mods.add('Ctrl');
    } else if (lower === 'alt' || lower === 'option') {
      mods.add('Alt');
    } else if (lower === 'shift') {
      mods.add('Shift');
    } else {
      mainKey = normalizeKeyToken(part);
    }
  }

  if (!mainKey) return '';
  const orderedMods = MODIFIER_ORDER.filter((m) => mods.has(m));
  return [...orderedMods, mainKey].join('+');
}

export function getEffectiveShortcuts(
  customShortcuts: Record<string, string> = {},
): Record<ShortcutActionId, string> {
  const map = {} as Record<ShortcutActionId, string>;
  for (const def of DEFAULT_SHORTCUTS) {
    const custom = customShortcuts[def.id];
    map[def.id] = custom ? normalizeComboString(custom) || def.defaultCombo : def.defaultCombo;
  }
  return map;
}

export function formatShortcutForDisplay(
  combo: string,
  mac: boolean = isMacPlatform(),
): string {
  const normalized = normalizeComboString(combo);
  if (!normalized) return '';
  const parts = normalized.split('+');
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);

  if (mac) {
    const symbols = mods.map((m) => {
      if (m === 'Mod') return '⌘';
      if (m === 'Ctrl') return '⌃';
      if (m === 'Alt') return '⌥';
      if (m === 'Shift') return '⇧';
      return m;
    });
    const displayKey = key === 'Enter' ? '↵' : key === 'Escape' ? 'Esc' : key;
    return `${symbols.join('')}${displayKey}`;
  }

  const labels = mods.map((m) => (m === 'Mod' ? 'Ctrl' : m));
  return [...labels, key].join('+');
}

export function keyboardEventToCombo(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  mac: boolean = isMacPlatform(),
): string | null {
  const rawKey = e.key;
  if (
    rawKey === 'Control' ||
    rawKey === 'Meta' ||
    rawKey === 'Alt' ||
    rawKey === 'Shift'
  ) {
    return null;
  }

  const parts: string[] = [];
  if (mac) {
    if (e.metaKey) parts.push('Mod');
    if (e.ctrlKey) parts.push('Ctrl');
  } else {
    if (e.ctrlKey || e.metaKey) parts.push('Mod');
  }
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  const keyToken = normalizeKeyToken(rawKey);
  if (!keyToken) return null;
  parts.push(keyToken);

  return normalizeComboString(parts.join('+'));
}

export function matchesShortcutEvent(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  combo: string,
  mac: boolean = isMacPlatform(),
): boolean {
  const normalized = normalizeComboString(combo);
  if (!normalized) return false;
  const parts = normalized.split('+');
  const expectedKey = parts[parts.length - 1];
  const expectedMods = new Set(parts.slice(0, -1));

  const actualKey = normalizeKeyToken(e.key);
  if (actualKey !== expectedKey) return false;

  const expectMod = expectedMods.has('Mod');
  const expectCtrl = expectedMods.has('Ctrl');
  const expectAlt = expectedMods.has('Alt');
  const expectShift = expectedMods.has('Shift');

  if (e.altKey !== expectAlt || e.shiftKey !== expectShift) return false;

  if (mac) {
    return e.metaKey === expectMod && e.ctrlKey === expectCtrl;
  }

  const wantsCtrl = expectMod || expectCtrl;
  return (e.ctrlKey || e.metaKey) === wantsCtrl;
}

export function detectShortcutConflict(
  actionId: ShortcutActionId,
  candidateCombo: string,
  bindings: Record<ShortcutActionId, string>,
): ShortcutDefinition | undefined {
  const normalized = normalizeComboString(candidateCombo);
  if (!normalized) return undefined;

  for (const def of DEFAULT_SHORTCUTS) {
    if (def.id === actionId) continue;
    if (normalizeComboString(bindings[def.id] ?? def.defaultCombo) === normalized) {
      return def;
    }
  }
  return undefined;
}
