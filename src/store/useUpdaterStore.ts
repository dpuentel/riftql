import { create } from 'zustand';
import { invokeCommand } from '@/lib/tauri';
import { notify } from '@/store/useNotificationStore';
import type {
  AppRuntimeInfo,
  AppUpdateInfo,
  AppUpdateProgress,
} from '@/types/storage';
import pkg from '../../package.json';

const GITHUB_RELEASES_URL = 'https://github.com/dpuentel/riftql/releases/latest';

function formatError(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
}

interface UpdaterState {
  currentVersion: string;
  runtimeInfo: AppRuntimeInfo | null;
  updateInfo: AppUpdateInfo | null;
  checking: boolean;
  installing: boolean;
  progress: AppUpdateProgress | null;
  error: string | null;
  lastCheckedAt: string | null;
  initRuntimeInfo: () => Promise<AppRuntimeInfo | null>;
  checkForUpdates: (options?: { silent?: boolean }) => Promise<AppUpdateInfo | null>;
  installUpdate: () => Promise<void>;
  openReleaseUrl: () => Promise<void>;
  setProgress: (progress: AppUpdateProgress | null) => void;
  reset: () => void;
}

const DEFAULT_VERSION = typeof pkg.version === 'string' && pkg.version ? pkg.version : '0.4.0';

export const useUpdaterStore = create<UpdaterState>((set, get) => ({
  currentVersion: DEFAULT_VERSION,
  runtimeInfo: null,
  updateInfo: null,
  checking: false,
  installing: false,
  progress: null,
  error: null,
  lastCheckedAt: null,

  initRuntimeInfo: async () => {
    try {
      const info = await invokeCommand<AppRuntimeInfo>('get_app_runtime_info_cmd');
      if (info && typeof info.version === 'string') {
        set({
          runtimeInfo: info,
          currentVersion: info.version || get().currentVersion,
        });
        return info;
      }
      return null;
    } catch {
      return null;
    }
  },

  checkForUpdates: async (options = {}) => {
    if (get().checking) {
      return get().updateInfo;
    }
    set({ checking: true, error: null });
    try {
      const info = await invokeCommand<AppUpdateInfo>('check_app_update_cmd');
      if (info && typeof info.available === 'boolean') {
        set({
          updateInfo: info,
          currentVersion: info.currentVersion || get().currentVersion,
          lastCheckedAt: info.checkedAt || new Date().toISOString(),
          checking: false,
          error: null,
        });
        return info;
      }
      set({ checking: false });
      return null;
    } catch (err) {
      set({ checking: false });
      if (!options.silent) {
        const message = formatError(err, 'Unable to check for updates.');
        set({
          error: message.includes('Tauri runtime unavailable')
            ? 'In-app update checks are only available in the desktop RiftQL app.'
            : message,
        });
      }
      return null;
    }
  },

  installUpdate: async () => {
    if (get().installing) return;
    set({
      installing: true,
      error: null,
      progress: {
        stage: 'downloading',
        downloadedBytes: 0,
        totalBytes: null,
        percent: null,
      },
    });
    try {
      await invokeCommand<void>('install_app_update_cmd');
    } catch (err) {
      const message = formatError(err, 'Failed to download and install update.');
      set({ installing: false, progress: null, error: message });
      notify.error('Update failed', { description: message });
    }
  },

  openReleaseUrl: async () => {
    const url = get().updateInfo?.releaseUrl || GITHUB_RELEASES_URL;
    try {
      await invokeCommand<void>('open_external_url_cmd', { url });
    } catch {
      if (typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    }
  },

  setProgress: (progress) => set({ progress }),

  reset: () =>
    set({
      currentVersion: DEFAULT_VERSION,
      runtimeInfo: null,
      updateInfo: null,
      checking: false,
      installing: false,
      progress: null,
      error: null,
      lastCheckedAt: null,
    }),
}));
