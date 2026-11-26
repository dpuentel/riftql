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
    baseUrl?: string;
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
    baseUrl?: string;
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
  moveSavedRequest: (
    id: string,
    targetCollectionId: string,
    targetFolderId?: string,
  ) => Promise<SavedRequestRecord | undefined>;
  moveFolder: (
    id: string,
    targetCollectionId: string,
    targetParentId?: string,
  ) => Promise<string[]>;
  sortSavedRequests: (
    collectionId: string,
    folderId?: string,
    direction?: 'asc' | 'desc',
  ) => Promise<void>;
  deleteSavedRequest: (id: string) => Promise<void>;

  updateEnvironmentLocal: (
    id: string,
    patch: { name?: string; variables?: EnvironmentVariable[] },
  ) => void;
  persistEnvironment: (id: string) => Promise<EnvironmentRecord | undefined>;
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

const envSaveSeq = new Map<string, number>();

function bumpEnvSeq(id: string): number {
  const next = (envSaveSeq.get(id) ?? 0) + 1;
  envSaveSeq.set(id, next);
  return next;
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
    baseUrl,
    auth = { type: 'none' },
    variables = [],
    sortOrder,
  }) => {
    const existing = id ? get().collections.find((c) => c.id === id) : undefined;
    const effectiveBaseUrl =
      baseUrl !== undefined ? baseUrl.trim() : existing?.baseUrl ?? '';
    const saved = await tryInvoke<CollectionRecord>(
      'upsert_collection_cmd',
      {
        id: id ?? null,
        name,
        description,
        baseUrl: effectiveBaseUrl,
        auth,
        variables,
        sortOrder: sortOrder ?? null,
      },
      () => {
        const ts = nowIso();
        return {
          id: existing?.id ?? id ?? nanoid(),
          name: name.trim(),
          description,
          baseUrl: effectiveBaseUrl,
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
    baseUrl,
    auth = { type: 'inherit' },
    sortOrder,
  }) => {
    const existing = id ? get().folders.find((f) => f.id === id) : undefined;
    const effectiveBaseUrl =
      baseUrl !== undefined ? baseUrl.trim() : existing?.baseUrl ?? '';
    const saved = await tryInvoke<FolderRecord>(
      'upsert_folder_cmd',
      {
        id: id ?? null,
        collectionId,
        parentId: parentId ?? null,
        name,
        baseUrl: effectiveBaseUrl,
        auth,
        sortOrder: sortOrder ?? null,
      },
      () => {
        const ts = nowIso();
        return {
          id: existing?.id ?? id ?? nanoid(),
          collectionId,
          parentId,
          name: name.trim(),
          baseUrl: effectiveBaseUrl,
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

  moveSavedRequest: async (id, targetCollectionId, targetFolderId) => {
    const existing = get().savedRequests.find((r) => r.id === id);
    if (!existing) return undefined;

    const updated = await tryInvoke<SavedRequestRecord>(
      'move_saved_request_cmd',
      {
        id,
        targetCollectionId,
        targetFolderId: targetFolderId ?? null,
      },
      () => ({
        ...existing,
        collectionId: targetCollectionId,
        folderId: targetFolderId,
        updatedAt: nowIso(),
      }),
    );

    set((state) => ({
      savedRequests: state.savedRequests.map((r) => (r.id === updated.id ? updated : r)),
    }));
    return updated;
  },

  moveFolder: async (id, targetCollectionId, targetParentId) => {
    const folders = get().folders;
    const targetFolder = folders.find((f) => f.id === id);
    if (!targetFolder) return [];

    // Guard against cycles
    const subtree = new Set<string>([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of folders) {
        if (f.parentId && subtree.has(f.parentId) && !subtree.has(f.id)) {
          subtree.add(f.id);
          grew = true;
        }
      }
    }
    if (targetParentId && subtree.has(targetParentId)) {
      throw new Error('Cannot move a folder inside itself or one of its descendants');
    }

    const movedRequestIds = get()
      .savedRequests.filter((r) => r.folderId && subtree.has(r.folderId))
      .map((r) => r.id);

    await tryInvoke<void>(
      'move_folder_cmd',
      {
        id,
        targetCollectionId,
        targetParentId: targetParentId ?? null,
      },
      () => undefined,
    );

    const ts = nowIso();
    set((state) => ({
      folders: state.folders.map((f) => {
        if (f.id === id) {
          return {
            ...f,
            collectionId: targetCollectionId,
            parentId: targetParentId,
            updatedAt: ts,
          };
        }
        if (subtree.has(f.id)) {
          return {
            ...f,
            collectionId: targetCollectionId,
            updatedAt: ts,
          };
        }
        return f;
      }),
      savedRequests: state.savedRequests.map((r) =>
        r.folderId && subtree.has(r.folderId)
          ? { ...r, collectionId: targetCollectionId, updatedAt: ts }
          : r,
      ),
    }));

    return movedRequestIds;
  },

  sortSavedRequests: async (collectionId, folderId, direction = 'asc') => {
    const descending = direction === 'desc';
    const sortedAll = await tryInvoke<SavedRequestRecord[]>(
      'sort_saved_requests_cmd',
      {
        collectionId,
        folderId: folderId ?? null,
        descending,
      },
      () => {
        const targetFolder = folderId ?? undefined;
        const matching = get()
          .savedRequests.filter(
            (r) =>
              r.collectionId === collectionId && (r.folderId ?? undefined) === targetFolder,
          )
          .slice()
          .sort((a, b) => {
            const cmp = a.name.localeCompare(b.name, undefined, {
              sensitivity: 'base',
              numeric: true,
            });
            return descending ? -cmp : cmp;
          });
        const orderMap = new Map<string, number>();
        matching.forEach((r, idx) => orderMap.set(r.id, idx));
        const ts = nowIso();
        return get().savedRequests.map((r) => {
          const nextOrder = orderMap.get(r.id);
          return nextOrder !== undefined ? { ...r, sortOrder: nextOrder, updatedAt: ts } : r;
        });
      },
    );
    set({ savedRequests: sortedAll });
  },

  deleteSavedRequest: async (id) => {
    await tryInvoke('delete_saved_request_cmd', { id }, () => undefined);
    set((state) => ({
      savedRequests: state.savedRequests.filter((r) => r.id !== id),
    }));
  },

  updateEnvironmentLocal: (id, patch) => {
    bumpEnvSeq(id);
    const ts = nowIso();
    set((state) => ({
      environments: state.environments.map((e) => {
        if (e.id !== id) return e;
        return {
          ...e,
          name: patch.name !== undefined ? patch.name : e.name,
          variables: patch.variables !== undefined ? patch.variables : e.variables,
          updatedAt: ts,
        };
      }),
    }));
  },

  persistEnvironment: async (id) => {
    const current = get().environments.find((e) => e.id === id);
    if (!current) return undefined;
    const effectiveName = current.name.trim() || (current.isGlobal ? 'Global' : 'Untitled');
    const seq = bumpEnvSeq(id);
    const saved = await tryInvoke<EnvironmentRecord>(
      'upsert_environment_cmd',
      {
        id: current.id,
        name: effectiveName,
        isGlobal: current.isGlobal,
        variables: current.variables,
      },
      () => ({
        ...current,
        name: effectiveName,
        updatedAt: nowIso(),
      }),
    );
    if (envSaveSeq.get(id) === seq) {
      set((state) => ({
        environments: state.environments.map((e) => (e.id === saved.id ? saved : e)),
      }));
    }
    return saved;
  },

  upsertEnvironment: async ({ id, name, isGlobal = false, variables }) => {
    const existing = id ? get().environments.find((e) => e.id === id) : undefined;
    const seq = existing ? bumpEnvSeq(existing.id) : id ? bumpEnvSeq(id) : 0;

    // Apply optimistic local update synchronously so controlled inputs keep cursor selection intact
    if (existing) {
      const ts = nowIso();
      set((state) => ({
        environments: state.environments.map((e) =>
          e.id === existing.id
            ? {
                ...e,
                name: name.trim() || e.name,
                variables,
                updatedAt: ts,
              }
            : e,
        ),
      }));
    }

    const saved = await tryInvoke<EnvironmentRecord>(
      'upsert_environment_cmd',
      { id: id ?? null, name, isGlobal, variables },
      () => {
        const ts = nowIso();
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
      const targetId = saved.id;
      if (seq && envSaveSeq.get(targetId) !== seq) {
        return state;
      }
      const exists = state.environments.some((e) => e.id === targetId);
      return {
        environments: exists
          ? state.environments.map((e) => (e.id === targetId ? saved : e))
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
    if (payload.version !== 1) {
      throw new Error(`Unsupported workspace export version: ${payload.version}`);
    }
    let ranNatively = true;
    await tryInvoke('import_workspace_cmd', { payload }, () => {
      ranNatively = false;
      return undefined;
    });
    if (ranNatively) {
      await get().loadWorkspace();
      return;
    }

    set((state) => {
      const upsertById = <T extends { id: string }>(existing: T[], incoming: T[]): T[] => {
        if (incoming.length === 0) return existing;
        const next = existing.slice();
        const indexById = new Map(next.map((item, idx) => [item.id, idx]));
        for (const item of incoming) {
          const idx = indexById.get(item.id);
          if (idx !== undefined) {
            next[idx] = item;
          } else {
            indexById.set(item.id, next.length);
            next.push(item);
          }
        }
        return next;
      };

      const nextEnvs = state.environments.slice();
      for (const env of payload.environments) {
        if (env.isGlobal) {
          const globalIdx = nextEnvs.findIndex((e) => e.isGlobal);
          if (globalIdx >= 0) {
            nextEnvs[globalIdx] = {
              ...nextEnvs[globalIdx],
              name: env.name,
              variables: env.variables,
              updatedAt: env.updatedAt || nowIso(),
            };
          } else {
            nextEnvs.unshift(env);
          }
        } else {
          const idx = nextEnvs.findIndex((e) => e.id === env.id);
          if (idx >= 0) {
            nextEnvs[idx] = env;
          } else {
            nextEnvs.push(env);
          }
        }
      }

      return {
        collections: upsertById(state.collections, payload.collections),
        folders: upsertById(state.folders, payload.folders),
        savedRequests: upsertById(state.savedRequests, payload.savedRequests),
        environments: nextEnvs,
      };
    });
  },
}));
