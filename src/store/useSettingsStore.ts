import { create } from 'zustand';
import { invokeCommand, isTauriRuntime } from '@/lib/tauri';
import { notifyShortcutChange, registerShortcutResolver } from '@/lib/shortcut-bridge';
import { formatShortcutForDisplay, getEffectiveShortcuts } from '@/lib/shortcuts';
import type { ShortcutActionId } from '@/types/shortcuts';
import type { AppSettings, SplitLayout, ThemePreference } from '@/types/storage';

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
};

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
        customShortcuts: loaded.customShortcuts ?? {},
      };
      const resolved = applyThemeToDocument(merged.theme);
      attachSystemMediaListener(merged.theme);
      syncShortcutBridge(merged.customShortcuts);
      set({ settings: merged, resolvedTheme: resolved, isLoaded: true });
    },

    updateSettings: async (patch) => {
      const next: AppSettings = {
        ...get().settings,
        ...patch,
        customShortcuts: patch.customShortcuts ?? get().settings.customShortcuts,
      };
      const resolved = applyThemeToDocument(next.theme);
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
