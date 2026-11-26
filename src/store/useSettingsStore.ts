import { create } from 'zustand';
import { invokeCommand, isTauriRuntime } from '@/lib/tauri';
import { notifyShortcutChange, registerShortcutResolver } from '@/lib/shortcut-bridge';
import { formatShortcutForDisplay, getEffectiveShortcuts } from '@/lib/shortcuts';
import type { ShortcutActionId } from '@/types/shortcuts';
import type { AppSettings, SplitLayout, ThemePreference } from '@/types/storage';

export const MIN_UI_FONT_SIZE = 13;
export const MAX_UI_FONT_SIZE = 22;
export const MIN_CODE_FONT_SIZE = 11;
export const MAX_CODE_FONT_SIZE = 22;

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  layout: 'horizontal',
  verifySsl: true,
  followRedirects: true,
  maxRedirects: 10,
  timeoutMs: 30_000,
  sendCookies: true,
  activeEnvironmentId: undefined,
  customShortcuts: {},
  uiFontSize: 16,
  codeFontSize: 13,
  autoCheckUpdates: true,
};

export function clampUiFontSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.uiFontSize;
  return Math.min(MAX_UI_FONT_SIZE, Math.max(MIN_UI_FONT_SIZE, Math.round(value)));
}

export function clampCodeFontSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SETTINGS.codeFontSize;
  return Math.min(MAX_CODE_FONT_SIZE, Math.max(MIN_CODE_FONT_SIZE, Math.round(value)));
}

export function applyTypographyToDocument(uiFontSize: number, codeFontSize: number): void {
  const ui = clampUiFontSize(uiFontSize);
  const code = clampCodeFontSize(codeFontSize);

  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.style.setProperty('--rift-ui-font-size', `${ui}px`);
    root.style.setProperty('--rift-code-font-size', `${code}px`);
  }

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('riftql-ui-font-size', String(ui));
      localStorage.setItem('riftql-code-font-size', String(code));
    } catch {
      // ignore storage errors
    }
  }
}

let mediaListenerCleanup: (() => void) | null = null;

function computeResolvedTheme(pref: ThemePreference): 'dark' | 'light' {
  if (pref === 'dark' || pref === 'light') return pref;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

export function applyThemeToDocument(pref: ThemePreference): 'dark' | 'light' {
  const resolved = computeResolvedTheme(pref);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    root.classList.toggle('light', resolved === 'light');
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) {
      meta.setAttribute('content', pref === 'system' ? 'light dark' : resolved);
    }
  }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('riftql-theme', pref);
    } catch {
      // ignore storage errors
    }
  }
  return resolved;
}

interface SettingsState {
  settings: AppSettings;
  resolvedTheme: 'dark' | 'light';
  isLoaded: boolean;
  loadSettings: (initial?: AppSettings) => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  setTheme: (theme: ThemePreference) => Promise<void>;
  toggleTheme: () => Promise<void>;
  toggleLayout: () => Promise<void>;
  setLayout: (layout: SplitLayout) => Promise<void>;
  setShortcut: (actionId: ShortcutActionId, combo: string) => Promise<void>;
  resetShortcut: (actionId: ShortcutActionId) => Promise<void>;
  resetAllShortcuts: () => Promise<void>;
  getShortcutLabel: (actionId: ShortcutActionId) => string;
}

async function persistSettings(settings: AppSettings): Promise<void> {
  if (!isTauriRuntime()) {
    try {
      await invokeCommand('save_app_settings_cmd', { settings });
    } catch {
      // Browser standalone mode without Tauri backend
    }
    return;
  }
  await invokeCommand('save_app_settings_cmd', { settings });
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  const syncShortcutBridge = (customShortcuts: Record<string, string>) => {
    const effective = getEffectiveShortcuts(customShortcuts);
    registerShortcutResolver((actionId) => {
      const combo = effective[actionId as ShortcutActionId];
      return combo ? formatShortcutForDisplay(combo) : undefined;
    });
  };

  syncShortcutBridge(DEFAULT_SETTINGS.customShortcuts);
  applyTypographyToDocument(DEFAULT_SETTINGS.uiFontSize, DEFAULT_SETTINGS.codeFontSize);

  const attachSystemMediaListener = (pref: ThemePreference) => {
    if (mediaListenerCleanup) {
      mediaListenerCleanup();
      mediaListenerCleanup = null;
    }
    if (
      pref === 'system' &&
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function'
    ) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => {
        const resolved = applyThemeToDocument('system');
        set({ resolvedTheme: resolved });
      };
      mq.addEventListener('change', handler);
      mediaListenerCleanup = () => mq.removeEventListener('change', handler);
    }
  };

  return {
    settings: DEFAULT_SETTINGS,
    resolvedTheme: 'dark',
    isLoaded: false,

    loadSettings: async (initial) => {
      let loaded = initial;
      if (!loaded) {
        try {
          loaded = await invokeCommand<AppSettings>('get_app_settings_cmd');
        } catch {
          loaded = DEFAULT_SETTINGS;
        }
      }
      const merged: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...loaded,
        uiFontSize: clampUiFontSize(loaded.uiFontSize ?? DEFAULT_SETTINGS.uiFontSize),
        codeFontSize: clampCodeFontSize(loaded.codeFontSize ?? DEFAULT_SETTINGS.codeFontSize),
        customShortcuts: loaded.customShortcuts ?? {},
      };
      const resolved = applyThemeToDocument(merged.theme);
      applyTypographyToDocument(merged.uiFontSize, merged.codeFontSize);
      attachSystemMediaListener(merged.theme);
      syncShortcutBridge(merged.customShortcuts);
      set({ settings: merged, resolvedTheme: resolved, isLoaded: true });
    },

    updateSettings: async (patch) => {
      const prev = get().settings;
      const next: AppSettings = {
        ...prev,
        ...patch,
        uiFontSize: clampUiFontSize(patch.uiFontSize ?? prev.uiFontSize),
        codeFontSize: clampCodeFontSize(patch.codeFontSize ?? prev.codeFontSize),
        customShortcuts: patch.customShortcuts ?? prev.customShortcuts,
      };
      const resolved = applyThemeToDocument(next.theme);
      applyTypographyToDocument(next.uiFontSize, next.codeFontSize);
      attachSystemMediaListener(next.theme);
      syncShortcutBridge(next.customShortcuts);
      set({ settings: next, resolvedTheme: resolved });
      await persistSettings(next);
    },

    setTheme: async (theme) => {
      await get().updateSettings({ theme });
    },

    toggleTheme: async () => {
      const currentResolved = get().resolvedTheme;
      await get().updateSettings({ theme: currentResolved === 'dark' ? 'light' : 'dark' });
    },

    setLayout: async (layout) => {
      await get().updateSettings({ layout });
    },

    toggleLayout: async () => {
      const next = get().settings.layout === 'horizontal' ? 'vertical' : 'horizontal';
      await get().updateSettings({ layout: next });
    },

    setShortcut: async (actionId, combo) => {
      const customShortcuts = {
        ...get().settings.customShortcuts,
        [actionId]: combo,
      };
      await get().updateSettings({ customShortcuts });
      notifyShortcutChange();
    },

    resetShortcut: async (actionId) => {
      const next = { ...get().settings.customShortcuts };
      delete next[actionId];
      await get().updateSettings({ customShortcuts: next });
      notifyShortcutChange();
    },

    resetAllShortcuts: async () => {
      await get().updateSettings({ customShortcuts: {} });
      notifyShortcutChange();
    },

    getShortcutLabel: (actionId) => {
      const effective = getEffectiveShortcuts(get().settings.customShortcuts);
      return formatShortcutForDisplay(effective[actionId]);
    },
  };
});
