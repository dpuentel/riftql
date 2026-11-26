import { nanoid } from 'nanoid';
import { create } from 'zustand';
import { invokeCommand } from '@/lib/tauri';
import { stripSecretsForExport } from '@/lib/variables';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { AuthConfig, RequestDraft } from '@/types/api';
import type {
  CollectionRecord,
  CookieRecord,
  EnvironmentRecord,
  EnvironmentVariable,
  FolderRecord,
  HistoryEntry,
  NewHistoryEntryInput,
  SavedRequestRecord,
  WorkspaceExport,
  WorkspaceSnapshot,
} from '@/types/storage';

function nowIso(): string {
  return new Date().toISOString();
}

const DEFAULT_GLOBAL_ENV: EnvironmentRecord = {
  id: 'global-env-default',
  name: 'Global',
  isGlobal: true,
  variables: [],
  createdAt: nowIso(),
  updatedAt: nowIso(),
};

interface WorkspaceState {
  collections: CollectionRecord[];
  folders: FolderRecord[];
  savedRequests: SavedRequestRecord[];
  environments: EnvironmentRecord[];
  history: HistoryEntry[];
  cookies: CookieRecord[];
  isLoaded: boolean;
  loadWorkspace: () => Promise<void>;

  upsertCollection: (input: {
    id?: string;
    name: string;
    description?: string;
    auth?: AuthConfig;
    variables?: EnvironmentVariable[];
    sortOrder?: number;
  }) => Promise<CollectionRecord>;
  deleteCollection: (id: string) => Promise<void>;

  upsertFolder: (input: {
    id?: string;
    collectionId: string;
    parentId?: string;
    name: string;
    auth?: AuthConfig;
    sortOrder?: number;
  }) => Promise<FolderRecord>;
  deleteFolder: (id: string) => Promise<void>;

  upsertSavedRequest: (input: {
    id?: string;
    collectionId: string;
    folderId?: string;
    draft: RequestDraft;
    sortOrder?: number;
  }) => Promise<SavedRequestRecord>;
  renameSavedRequest: (id: string, name: string) => Promise<SavedRequestRecord | undefined>;
  deleteSavedRequest: (id: string) => Promise<void>;

  upsertEnvironment: (input: {
    id?: string;
    name: string;
    isGlobal?: boolean;
    variables: EnvironmentVariable[];
  }) => Promise<EnvironmentRecord>;
  deleteEnvironment: (id: string) => Promise<void>;

  recordHistory: (entry: NewHistoryEntryInput) => Promise<HistoryEntry>;
  deleteHistoryEntry: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;

  refreshCookies: () => Promise<void>;
  upsertCookie: (cookie: CookieRecord) => Promise<CookieRecord>;
  deleteCookie: (id: string) => Promise<void>;
  clearCookiesByDomain: (domain: string) => Promise<void>;
  clearAllCookies: () => Promise<void>;

  exportWorkspace: () => Promise<WorkspaceExport>;
  importWorkspace: (payload: WorkspaceExport) => Promise<void>;
}

async function tryInvoke<T>(
  command: string,
  args: Record<string, unknown> | undefined,
  fallback: () => T,
): Promise<T> {
  try {
    return await invokeCommand<T>(command, args);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Tauri runtime unavailable')) {
      return fallback();
    }
    throw err;
  }
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  collections: [],
  folders: [],
  savedRequests: [],
  environments: [DEFAULT_GLOBAL_ENV],
  history: [],
  cookies: [],
  isLoaded: false,

  loadWorkspace: async () => {
    try {
      const [snapshot, history, cookies] = await Promise.all([
        invokeCommand<WorkspaceSnapshot>('load_workspace'),
        invokeCommand<HistoryEntry[]>('list_history_cmd'),
        invokeCommand<CookieRecord[]>('list_cookies_cmd'),
      ]);
      await useSettingsStore.getState().loadSettings(snapshot.settings);
      set({
        collections: snapshot.collections,
        folders: snapshot.folders,
        savedRequests: snapshot.savedRequests,
        environments:
          snapshot.environments.length > 0 ? snapshot.environments : [DEFAULT_GLOBAL_ENV],
        history,
        cookies,
        isLoaded: true,
      });
    } catch {
      await useSettingsStore.getState().loadSettings();
      set({ isLoaded: true });
    }
  },

  upsertCollection: async ({
    id,
    name,
    description = '',
    auth = { type: 'none' },
    variables = [],
    sortOrder,
  }) => {
    const saved = await tryInvoke<CollectionRecord>(
      'upsert_collection_cmd',
      { id: id ?? null, name, description, auth, variables, sortOrder: sortOrder ?? null },
      () => {
        const ts = nowIso();
        const existing = id ? get().collections.find((c) => c.id === id) : undefined;
        return {
          id: existing?.id ?? id ?? nanoid(),
          name: name.trim(),
          description,
          auth,
          variables,
          sortOrder: sortOrder ?? existing?.sortOrder ?? get().collections.length,
          createdAt: existing?.createdAt ?? ts,
          updatedAt: ts,
        };
      },
    );
    set((state) => {
      const exists = state.collections.some((c) => c.id === saved.id);
      return {
        collections: exists
          ? state.collections.map((c) => (c.id === saved.id ? saved : c))
          : [...state.collections, saved],
      };
    });
    return saved;
  },

  deleteCollection: async (id) => {
    await tryInvoke('delete_collection_cmd', { id }, () => undefined);
    set((state) => ({
      collections: state.collections.filter((c) => c.id !== id),
      folders: state.folders.filter((f) => f.collectionId !== id),
      savedRequests: state.savedRequests.filter((r) => r.collectionId !== id),
    }));
  },

  upsertFolder: async ({
    id,
    collectionId,
    parentId,
    name,
    auth = { type: 'inherit' },
    sortOrder,
  }) => {
    const saved = await tryInvoke<FolderRecord>(
      'upsert_folder_cmd',
      {
        id: id ?? null,
        collectionId,
        parentId: parentId ?? null,
        name,
        auth,
        sortOrder: sortOrder ?? null,
      },
      () => {
        const ts = nowIso();
        const existing = id ? get().folders.find((f) => f.id === id) : undefined;
        return {
          id: existing?.id ?? id ?? nanoid(),
          collectionId,
          parentId,
          name: name.trim(),
          auth,
          sortOrder: sortOrder ?? existing?.sortOrder ?? 0,
          createdAt: existing?.createdAt ?? ts,
          updatedAt: ts,
        };
      },
    );
    set((state) => {
      const exists = state.folders.some((f) => f.id === saved.id);
      return {
        folders: exists
          ? state.folders.map((f) => (f.id === saved.id ? saved : f))
          : [...state.folders, saved],
      };
    });
    return saved;
  },

  deleteFolder: async (id) => {
    await tryInvoke('delete_folder_cmd', { id }, () => undefined);
    set((state) => {
      const toRemove = new Set<string>([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const f of state.folders) {
          if (f.parentId && toRemove.has(f.parentId) && !toRemove.has(f.id)) {
            toRemove.add(f.id);
            changed = true;
          }
        }
      }
      return {
        folders: state.folders.filter((f) => !toRemove.has(f.id)),
        savedRequests: state.savedRequests.filter(
          (r) => !r.folderId || !toRemove.has(r.folderId),
        ),
      };
    });
  },

  upsertSavedRequest: async ({ id, collectionId, folderId, draft, sortOrder }) => {
    const saved = await tryInvoke<SavedRequestRecord>(
      'upsert_saved_request_cmd',
      {
        id: id ?? null,
        collectionId,
        folderId: folderId ?? null,
        draft,
        sortOrder: sortOrder ?? null,
      },
      () => {
        const ts = nowIso();
        const existing = id ? get().savedRequests.find((r) => r.id === id) : undefined;
        return {
          id: existing?.id ?? id ?? nanoid(),
          collectionId,
          folderId,
          name: draft.name.trim() || 'Untitled Request',
          protocol: draft.protocol,
          method: draft.method,
          url: draft.url,
          params: draft.params,
          headers: draft.headers,
          auth: draft.auth,
          body: draft.body,
          graphql: draft.graphql,
          settings: draft.settings,
          sortOrder: sortOrder ?? existing?.sortOrder ?? 0,
          createdAt: existing?.createdAt ?? ts,
          updatedAt: ts,
        };
      },
    );
    set((state) => {
      const exists = state.savedRequests.some((r) => r.id === saved.id);
      return {
        savedRequests: exists
          ? state.savedRequests.map((r) => (r.id === saved.id ? saved : r))
          : [...state.savedRequests, saved],
      };
    });
    return saved;
  },

  renameSavedRequest: async (id, name) => {
    const existing = get().savedRequests.find((r) => r.id === id);
    const trimmed = name.trim();
    if (!existing || !trimmed) return existing;
    const draft: RequestDraft = {
      id: existing.id,
      name: trimmed,
      protocol: existing.protocol,
      method: existing.method,
      url: existing.url,
      params: existing.params,
      headers: existing.headers,
      auth: existing.auth,
      body: existing.body,
      graphql: existing.graphql,
      settings: existing.settings,
    };
    return get().upsertSavedRequest({
      id: existing.id,
      collectionId: existing.collectionId,
      folderId: existing.folderId,
      draft,
      sortOrder: existing.sortOrder,
    });
  },

  deleteSavedRequest: async (id) => {
    await tryInvoke('delete_saved_request_cmd', { id }, () => undefined);
    set((state) => ({
      savedRequests: state.savedRequests.filter((r) => r.id !== id),
    }));
  },

  upsertEnvironment: async ({ id, name, isGlobal = false, variables }) => {
    const saved = await tryInvoke<EnvironmentRecord>(
      'upsert_environment_cmd',
      { id: id ?? null, name, isGlobal, variables },
      () => {
        const ts = nowIso();
        const existing = id ? get().environments.find((e) => e.id === id) : undefined;
        return {
          id: existing?.id ?? id ?? nanoid(),
          name: name.trim(),
          isGlobal: existing?.isGlobal ?? isGlobal,
          variables,
          createdAt: existing?.createdAt ?? ts,
          updatedAt: ts,
        };
      },
    );
    set((state) => {
      const exists = state.environments.some((e) => e.id === saved.id);
      return {
        environments: exists
          ? state.environments.map((e) => (e.id === saved.id ? saved : e))
          : [...state.environments, saved],
      };
    });
    return saved;
  },

  deleteEnvironment: async (id) => {
    const target = get().environments.find((e) => e.id === id);
    if (target?.isGlobal) {
      throw new Error('Cannot delete the Global environment');
    }
    await tryInvoke('delete_environment_cmd', { id }, () => undefined);
    set((state) => ({
      environments: state.environments.filter((e) => e.id !== id),
    }));
    const settingsState = useSettingsStore.getState();
    if (settingsState.settings.activeEnvironmentId === id) {
      await settingsState.updateSettings({ activeEnvironmentId: undefined });
    }
  },

  recordHistory: async (entry) => {
    const saved = await tryInvoke<HistoryEntry>(
      'record_history_cmd',
      { entry },
      () => ({
        id: entry.id ?? nanoid(),
        method: entry.method,
        protocol: entry.protocol,
        url: entry.url,
        requestSnapshot: entry.requestSnapshot,
        status: entry.status,
        statusText: entry.statusText,
        durationMs: entry.durationMs,
        sizeBytes: entry.sizeBytes,
        responseHeaders: entry.responseHeaders,
        responseBody:
          entry.isBinary || (entry.responseBody && entry.responseBody.length > 500_000)
            ? undefined
            : entry.responseBody,
        responseContentType: entry.responseContentType,
        isBinary: entry.isBinary,
        createdAt: nowIso(),
      }),
    );
    set((state) => ({
      history: [saved, ...state.history].slice(0, 200),
    }));
    return saved;
  },

  deleteHistoryEntry: async (id) => {
    await tryInvoke('delete_history_entry_cmd', { id }, () => undefined);
    set((state) => ({
      history: state.history.filter((h) => h.id !== id),
    }));
  },

  clearHistory: async () => {
    await tryInvoke('clear_history_cmd', undefined, () => undefined);
    set({ history: [] });
  },

  refreshCookies: async () => {
    const cookies = await tryInvoke<CookieRecord[]>(
      'list_cookies_cmd',
      undefined,
      () => get().cookies,
    );
    set({ cookies });
  },

  upsertCookie: async (cookie) => {
    const saved = await tryInvoke<CookieRecord>(
      'upsert_cookie_cmd',
      { cookie },
      () => ({
        ...cookie,
        id: cookie.id || nanoid(),
        domain: cookie.domain.trim().toLowerCase(),
        path: cookie.path.trim() || '/',
        updatedAt: nowIso(),
      }),
    );
    set((state) => {
      const exists = state.cookies.some((c) => c.id === saved.id);
      return {
        cookies: exists
          ? state.cookies.map((c) => (c.id === saved.id ? saved : c))
          : [...state.cookies, saved],
      };
    });
    return saved;
  },

  deleteCookie: async (id) => {
    await tryInvoke('delete_cookie_cmd', { id }, () => undefined);
    set((state) => ({
      cookies: state.cookies.filter((c) => c.id !== id),
    }));
  },

  clearCookiesByDomain: async (domain) => {
    await tryInvoke('clear_cookies_by_domain_cmd', { domain }, () => undefined);
    const normalized = domain.trim().toLowerCase();
    set((state) => ({
      cookies: state.cookies.filter((c) => c.domain !== normalized),
    }));
  },

  clearAllCookies: async () => {
    await tryInvoke('clear_all_cookies_cmd', undefined, () => undefined);
    set({ cookies: [] });
  },

  exportWorkspace: async () => {
    return tryInvoke<WorkspaceExport>('export_workspace_cmd', undefined, () => ({
      version: 1,
      exportedAt: nowIso(),
      collections: get().collections.map((c) => ({
        ...c,
        variables: c.variables.map((v) => (v.isSecret ? { ...v, value: '' } : v)),
      })),
      folders: get().folders,
      savedRequests: get().savedRequests,
      environments: stripSecretsForExport(get().environments),
    }));
  },

  importWorkspace: async (payload) => {
    await tryInvoke('import_workspace_cmd', { payload }, () => undefined);
    await get().loadWorkspace();
  },
}));
