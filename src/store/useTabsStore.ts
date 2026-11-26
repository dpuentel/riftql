import { nanoid } from 'nanoid';
import { create } from 'zustand';
import { applyAuthToRequest, resolveEffectiveAuth } from '@/lib/auth';
import { resolveEffectiveBaseUrl, resolveRequestUrl } from '@/lib/base-url';
import { invokeCommand } from '@/lib/tauri';
import { resolveVariables, type VariableResolutionContext } from '@/lib/variables';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import type {
  HeaderPair,
  HttpExecutionRequest,
  HttpExecutionResponse,
  KeyValueItem,
  RequestBody,
  RequestDraft,
  RequestErrorInfo,
  RequestProtocol,
} from '@/types/api';
import type {
  HistoryEntry,
  RequestTab,
  SavedRequestRecord,
  SessionTabRecord,
} from '@/types/storage';

export function createEmptyDraft(protocol: RequestProtocol = 'rest'): RequestDraft {
  return {
    id: nanoid(),
    name: 'Untitled Request',
    protocol,
    method: protocol === 'graphql' ? 'POST' : 'GET',
    url: '',
    params: [],
    headers: [],
    auth: { type: 'inherit' },
    body: protocol === 'graphql' ? { mode: 'graphql' } : { mode: 'none' },
    graphql: {
      query:
        protocol === 'graphql'
          ? 'query {\n  \n}'
          : '',
      variables: '{}',
      operationName: undefined,
    },
    settings: {},
  };
}

export function buildTabTitle(draft: RequestDraft, savedName?: string): string {
  if (savedName && savedName.trim()) return savedName.trim();
  if (draft.name && draft.name !== 'Untitled Request') return draft.name;
  const trimmedUrl = draft.url.trim();
  if (!trimmedUrl) return 'Untitled Request';
  try {
    const u = new URL(trimmedUrl.startsWith('http') ? trimmedUrl : `https://${trimmedUrl}`);
    return `${u.pathname === '/' ? u.host : u.pathname}`;
  } catch {
    return trimmedUrl.slice(0, 32);
  }
}

export function appendQueryParamsToUrl(
  baseUrl: string,
  params: KeyValueItem[],
): string {
  const active = params.filter((p) => p.enabled && p.key.trim().length > 0);
  if (active.length === 0) return baseUrl;

  const [beforeHash, hash] = baseUrl.split('#');
  const qIndex = beforeHash.indexOf('?');
  const pathPart = qIndex >= 0 ? beforeHash.slice(0, qIndex) : beforeHash;
  const existingQuery = qIndex >= 0 ? beforeHash.slice(qIndex + 1) : '';

  const pairs: string[] = [];
  if (existingQuery) {
    // Keep existing raw segments unless replaced by params table?
    // Notice our URL bar stays synced with params table, so avoid duplicating keys!
    const paramKeys = new Set(active.map((a) => a.key.trim()));
    for (const seg of existingQuery.split('&')) {
      if (!seg) continue;
      const eq = seg.indexOf('=');
      const rawKey = decodeURIComponent(eq >= 0 ? seg.slice(0, eq) : seg);
      if (!paramKeys.has(rawKey)) {
        pairs.push(seg);
      }
    }
  }

  for (const item of active) {
    pairs.push(
      `${encodeURIComponent(item.key.trim())}=${encodeURIComponent(item.value)}`,
    );
  }

  const queryStr = pairs.join('&');
  const full = queryStr ? `${pathPart}?${queryStr}` : pathPart;
  return hash !== undefined ? `${full}#${hash}` : full;
}

let sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSessionPersist(tabs: RequestTab[], activeTabId: string): void {
  if (sessionSaveTimer) clearTimeout(sessionSaveTimer);
  sessionSaveTimer = setTimeout(() => {
    const records: SessionTabRecord[] = tabs.map((tab, index) => ({
      id: tab.id,
      savedRequestId: tab.savedRequestId,
      title: tab.title,
      isDirty: tab.isDirty,
      draft: tab.draft,
      sortOrder: index,
      isActive: tab.id === activeTabId,
      updatedAt: new Date().toISOString(),
    }));
    invokeCommand('save_session_tabs_cmd', { tabs: records }).catch(() => {
      // Ignore in standalone browser / test mode
    });
  }, 300);
}

function draftFromSaved(req: SavedRequestRecord): RequestDraft {
  return {
    id: req.id,
    name: req.name,
    protocol: req.protocol,
    method: req.method,
    url: req.url,
    params: req.params,
    headers: req.headers,
    auth: req.auth,
    body: req.body,
    graphql: req.graphql,
    settings: req.settings,
  };
}

function createTabFromSaved(req: SavedRequestRecord): RequestTab {
  return {
    id: nanoid(),
    savedRequestId: req.id,
    collectionId: req.collectionId,
    folderId: req.folderId,
    title: req.name,
    isDirty: false,
    draft: draftFromSaved(req),
    isLoading: false,
  };
}

function parseErrorInfo(err: unknown): RequestErrorInfo {
  if (err && typeof err === 'object' && 'message' in err) {
    const maybeCode = 'code' in err && typeof err.code === 'string' ? err.code : undefined;
    return {
      code: maybeCode,
      message: String((err as { message: unknown }).message),
    };
  }
  return { message: String(err) };
}

interface TabsState {
  tabs: RequestTab[];
  activeTabId: string;
  loadSessionTabs: () => Promise<void>;
  newTab: (protocol?: RequestProtocol, initialDraft?: Partial<RequestDraft>) => string;
  closeTab: (tabId: string) => void;
  selectTab: (tabId: string) => void;
  nextTab: () => void;
  prevTab: () => void;
  duplicateTab: (tabId: string) => void;
  openSavedRequest: (req: SavedRequestRecord) => void;
  openHistoryEntry: (entry: HistoryEntry) => void;
  updateDraft: (tabId: string, updater: (draft: RequestDraft) => RequestDraft) => void;
  renameTab: (tabId: string, name: string) => void;
  syncSavedRequestRename: (savedRequestId: string, name: string) => void;
  syncMovedSavedRequest: (
    savedRequestId: string,
    collectionId: string,
    folderId: string | undefined,
  ) => void;
  syncMovedCollectionRequests: (movedRequestIds: Set<string>, collectionId: string) => void;
  detachDeletedSavedRequests: (deletedIds: Set<string>) => void;
  syncTabsWithWorkspace: (savedRequests: SavedRequestRecord[]) => void;
  markTabSaved: (tabId: string, saved: SavedRequestRecord) => void;
  setTabResponse: (tabId: string, response: HttpExecutionResponse | undefined) => void;
  sendTabRequest: (tabId: string) => Promise<void>;
  cancelTabRequest: (tabId: string) => Promise<void>;
}

const initialDraft = createEmptyDraft('rest');
const initialTabId = nanoid();

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [
    {
      id: initialTabId,
      title: 'Untitled Request',
      isDirty: false,
      draft: initialDraft,
      isLoading: false,
    },
  ],
  activeTabId: initialTabId,

  loadSessionTabs: async () => {
    try {
      const restored = await invokeCommand<SessionTabRecord[]>('list_session_tabs_cmd');
      if (!restored || restored.length === 0) {
        const freshId = nanoid();
        set({
          tabs: [
            {
              id: freshId,
              title: 'Untitled Request',
              isDirty: false,
              draft: createEmptyDraft('rest'),
              isLoading: false,
            },
          ],
          activeTabId: freshId,
        });
        return;
      }

      const workspace = useWorkspaceStore.getState();
      const requestMap = new Map(workspace.savedRequests.map((r) => [r.id, r]));

      const tabs: RequestTab[] = restored.map((rec) => {
        const linked = rec.savedRequestId ? requestMap.get(rec.savedRequestId) : undefined;
        return {
          id: rec.id,
          savedRequestId: rec.savedRequestId,
          collectionId: linked?.collectionId,
          folderId: linked?.folderId,
          title: rec.title,
          isDirty: rec.isDirty,
          draft: rec.draft,
          isLoading: false,
        };
      });

      const active = restored.find((r) => r.isActive)?.id ?? tabs[0].id;
      set({ tabs, activeTabId: active });
    } catch {
      // Standalone mode without Tauri backend
    }
  },

  newTab: (protocol = 'rest', initialPartial) => {
    const draft = { ...createEmptyDraft(protocol), ...initialPartial };
    const id = nanoid();
    const tab: RequestTab = {
      id,
      title: buildTabTitle(draft),
      isDirty: Boolean(initialPartial?.url),
      draft,
      isLoading: false,
    };
    const nextTabs = [...get().tabs, tab];
    set({ tabs: nextTabs, activeTabId: id });
    scheduleSessionPersist(nextTabs, id);
    return id;
  },

  closeTab: (tabId) => {
    const current = get().tabs;
    const idx = current.findIndex((t) => t.id === tabId);
    if (idx === -1) return;

    const remaining = current.filter((t) => t.id !== tabId);
    if (remaining.length === 0) {
      const freshId = nanoid();
      const fresh: RequestTab = {
        id: freshId,
        title: 'Untitled Request',
        isDirty: false,
        draft: createEmptyDraft('rest'),
        isLoading: false,
      };
      set({ tabs: [fresh], activeTabId: freshId });
      scheduleSessionPersist([fresh], freshId);
      return;
    }

    let nextActive = get().activeTabId;
    if (nextActive === tabId) {
      const nextIdx = Math.min(idx, remaining.length - 1);
      nextActive = remaining[nextIdx].id;
    }
    set({ tabs: remaining, activeTabId: nextActive });
    scheduleSessionPersist(remaining, nextActive);
  },

  selectTab: (tabId) => {
    if (get().tabs.some((t) => t.id === tabId)) {
      set({ activeTabId: tabId });
      scheduleSessionPersist(get().tabs, tabId);
    }
  },

  nextTab: () => {
    const { tabs, activeTabId } = get();
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const next = tabs[(idx + 1) % tabs.length];
    get().selectTab(next.id);
  },

  prevTab: () => {
    const { tabs, activeTabId } = get();
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
    get().selectTab(prev.id);
  },

  duplicateTab: (tabId) => {
    const src = get().tabs.find((t) => t.id === tabId);
    if (!src) return;
    const clonedDraft: RequestDraft = structuredClone(src.draft);
    clonedDraft.id = nanoid();
    clonedDraft.name = `${src.title} Copy`;
    const newId = nanoid();
    const newTab: RequestTab = {
      id: newId,
      collectionId: src.collectionId,
      folderId: src.folderId,
      title: clonedDraft.name,
      isDirty: true,
      draft: clonedDraft,
      isLoading: false,
    };
    const nextTabs = [...get().tabs, newTab];
    set({ tabs: nextTabs, activeTabId: newId });
    scheduleSessionPersist(nextTabs, newId);
  },

  openSavedRequest: (req) => {
    const existing = get().tabs.find((t) => t.savedRequestId === req.id);
    if (existing) {
      set({ activeTabId: existing.id });
      scheduleSessionPersist(get().tabs, existing.id);
      return;
    }
    const tab = createTabFromSaved(req);
    const nextTabs = [...get().tabs, tab];
    set({ tabs: nextTabs, activeTabId: tab.id });
    scheduleSessionPersist(nextTabs, tab.id);
  },

  openHistoryEntry: (entry) => {
    const draftCopy: RequestDraft = structuredClone(entry.requestSnapshot);
    draftCopy.id = nanoid();
    const id = nanoid();
    const response: HttpExecutionResponse | undefined =
      entry.status > 0
        ? {
            responseId: `hist-${entry.id}`,
            status: entry.status,
            statusText: entry.statusText,
            durationMs: entry.durationMs,
            sizeBytes: entry.sizeBytes,
            finalUrl: entry.url,
            redirectCount: 0,
            headers: entry.responseHeaders,
            cookies: [],
            contentType: entry.responseContentType,
            bodyKind: entry.isBinary ? 'binary' : 'text',
            bodyText: entry.responseBody,
            truncated: false,
          }
        : undefined;

    const tab: RequestTab = {
      id,
      title: buildTabTitle(draftCopy),
      isDirty: true,
      draft: draftCopy,
      isLoading: false,
      response,
    };
    const nextTabs = [...get().tabs, tab];
    set({ tabs: nextTabs, activeTabId: id });
    scheduleSessionPersist(nextTabs, id);
  },

  updateDraft: (tabId, updater) => {
    const nextTabs = get().tabs.map((tab) => {
      if (tab.id !== tabId) return tab;
      const nextDraft = updater(tab.draft);
      const nextTitle = tab.savedRequestId
        ? nextDraft.name || tab.title
        : buildTabTitle(nextDraft);
      return {
        ...tab,
        title: nextTitle,
        isDirty: true,
        draft: nextDraft,
      };
    });
    set({ tabs: nextTabs });
    scheduleSessionPersist(nextTabs, get().activeTabId);
  },

  renameTab: (tabId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const nextTabs = get().tabs.map((tab) => {
      if (tab.id !== tabId) return tab;
      const nextDraft = { ...tab.draft, name: trimmed };
      return {
        ...tab,
        title: trimmed,
        isDirty: tab.savedRequestId ? tab.isDirty : true,
        draft: nextDraft,
      };
    });
    set({ tabs: nextTabs });
    scheduleSessionPersist(nextTabs, get().activeTabId);
  },

  syncSavedRequestRename: (savedRequestId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    let changed = false;
    const nextTabs = get().tabs.map((tab) => {
      if (tab.savedRequestId !== savedRequestId) return tab;
      changed = true;
      return {
        ...tab,
        title: trimmed,
        draft: { ...tab.draft, name: trimmed },
      };
    });
    if (!changed) return;
    set({ tabs: nextTabs });
    scheduleSessionPersist(nextTabs, get().activeTabId);
  },

  syncMovedSavedRequest: (savedRequestId, collectionId, folderId) => {
    let changed = false;
    const nextTabs = get().tabs.map((tab) => {
      if (tab.savedRequestId !== savedRequestId) return tab;
      changed = true;
      return {
        ...tab,
        collectionId,
        folderId,
      };
    });
    if (!changed) return;
    set({ tabs: nextTabs });
    scheduleSessionPersist(nextTabs, get().activeTabId);
  },

  syncMovedCollectionRequests: (movedRequestIds, collectionId) => {
    if (movedRequestIds.size === 0) return;
    let changed = false;
    const nextTabs = get().tabs.map((tab) => {
      if (!tab.savedRequestId || !movedRequestIds.has(tab.savedRequestId)) return tab;
      changed = true;
      return {
        ...tab,
        collectionId,
      };
    });
    if (!changed) return;
    set({ tabs: nextTabs });
    scheduleSessionPersist(nextTabs, get().activeTabId);
  },

  detachDeletedSavedRequests: (deletedIds) => {
    if (deletedIds.size === 0) return;
    let changed = false;
    const nextTabs = get().tabs.map((tab) => {
      if (!tab.savedRequestId || !deletedIds.has(tab.savedRequestId)) return tab;
      changed = true;
      return {
        ...tab,
        savedRequestId: undefined,
        collectionId: undefined,
        folderId: undefined,
        isDirty: true,
      };
    });
    if (!changed) return;
    set({ tabs: nextTabs });
    scheduleSessionPersist(nextTabs, get().activeTabId);
  },

  syncTabsWithWorkspace: (savedRequests) => {
    const requestMap = new Map(savedRequests.map((r) => [r.id, r]));
    let changed = false;
    const nextTabs = get().tabs.map((tab) => {
      if (!tab.savedRequestId) return tab;
      const matched = requestMap.get(tab.savedRequestId);
      if (!matched) {
        changed = true;
        return {
          ...tab,
          savedRequestId: undefined,
          collectionId: undefined,
          folderId: undefined,
          isDirty: true,
        };
      }
      if (tab.isDirty) {
        if (tab.collectionId !== matched.collectionId || tab.folderId !== matched.folderId) {
          changed = true;
          return {
            ...tab,
            collectionId: matched.collectionId,
            folderId: matched.folderId,
          };
        }
        return tab;
      }
      changed = true;
      return {
        ...tab,
        collectionId: matched.collectionId,
        folderId: matched.folderId,
        title: matched.name,
        draft: draftFromSaved(matched),
      };
    });
    if (!changed) return;
    set({ tabs: nextTabs });
    scheduleSessionPersist(nextTabs, get().activeTabId);
  },

  markTabSaved: (tabId, saved) => {
    const nextTabs = get().tabs.map((tab) => {
      if (tab.id !== tabId) return tab;
      return {
        ...tab,
        savedRequestId: saved.id,
        collectionId: saved.collectionId,
        folderId: saved.folderId,
        title: saved.name,
        isDirty: false,
        draft: {
          ...tab.draft,
          id: saved.id,
          name: saved.name,
        },
      };
    });
    set({ tabs: nextTabs });
    scheduleSessionPersist(nextTabs, get().activeTabId);
  },

  setTabResponse: (tabId, response) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, response, error: undefined } : t)),
    }));
  },

  sendTabRequest: async (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;

    const settings = useSettingsStore.getState().settings;
    const workspace = useWorkspaceStore.getState();

    const globalEnv = workspace.environments.find((e) => e.isGlobal);
    const activeEnv = settings.activeEnvironmentId
      ? workspace.environments.find((e) => e.id === settings.activeEnvironmentId)
      : undefined;
    const collection = tab.collectionId
      ? workspace.collections.find((c) => c.id === tab.collectionId)
      : undefined;

    const varCtx: VariableResolutionContext = {
      globalEnvironment: globalEnv,
      activeEnvironment: activeEnv,
      collectionVariables: collection?.variables,
    };
    const resolve = (raw: string) => resolveVariables(raw, varCtx);

    const inheritedBase = resolveEffectiveBaseUrl(
      tab.folderId,
      tab.collectionId,
      workspace.folders,
      workspace.collections,
    );
    const resolvedUrlBase = resolveRequestUrl(
      tab.draft.url,
      inheritedBase.baseUrl,
      resolve,
    );
    if (!resolvedUrlBase) {
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId
            ? { ...t, error: { code: 'VALIDATION_ERROR', message: 'Enter a request URL first.' } }
            : t,
        ),
      }));
      return;
    }

    const resolvedParams: KeyValueItem[] = tab.draft.params.map((p) => ({
      ...p,
      key: resolve(p.key),
      value: resolve(p.value),
    }));

    const resolvedHeaders: HeaderPair[] = tab.draft.headers
      .filter((h) => h.enabled && h.key.trim().length > 0)
      .map((h) => ({
        key: resolve(h.key.trim()),
        value: resolve(h.value),
      }));

    const effectiveAuth = resolveEffectiveAuth(
      tab.draft.auth,
      tab.folderId,
      tab.collectionId,
      workspace.folders,
      workspace.collections,
    );
    const withAuth = applyAuthToRequest(
      effectiveAuth.auth,
      resolvedHeaders,
      resolvedParams,
      resolve,
    );

    const normalizedBase =
      resolvedUrlBase.startsWith('http://') || resolvedUrlBase.startsWith('https://')
        ? resolvedUrlBase
        : `https://${resolvedUrlBase}`;
    const finalUrl = appendQueryParamsToUrl(normalizedBase, withAuth.queryParams);

    let resolvedBody: RequestBody = tab.draft.body;
    if (tab.draft.protocol === 'graphql') {
      resolvedBody = { mode: 'graphql' };
    } else if (tab.draft.body.mode === 'json') {
      resolvedBody = { mode: 'json', content: resolve(tab.draft.body.content) };
    } else if (tab.draft.body.mode === 'raw') {
      resolvedBody = {
        mode: 'raw',
        language: tab.draft.body.language,
        content: resolve(tab.draft.body.content),
      };
    } else if (tab.draft.body.mode === 'urlEncoded') {
      resolvedBody = {
        mode: 'urlEncoded',
        items: tab.draft.body.items.map((item) => ({
          ...item,
          key: resolve(item.key),
          value: resolve(item.value),
        })),
      };
    } else if (tab.draft.body.mode === 'formData') {
      resolvedBody = {
        mode: 'formData',
        items: tab.draft.body.items.map((item) => ({
          ...item,
          key: resolve(item.key),
          value: item.itemType === 'text' ? resolve(item.value) : item.value,
        })),
      };
    }

    const resolvedGraphql =
      tab.draft.protocol === 'graphql' || resolvedBody.mode === 'graphql'
        ? {
            query: resolve(tab.draft.graphql.query),
            variables: resolve(tab.draft.graphql.variables),
            operationName: tab.draft.graphql.operationName,
          }
        : undefined;

    const verifySsl = tab.draft.settings.verifySsl ?? settings.verifySsl;
    const followRedirects = tab.draft.settings.followRedirects ?? settings.followRedirects;
    const sendCookies = tab.draft.settings.sendCookies ?? settings.sendCookies;
    const timeoutMs = tab.draft.settings.timeoutMs ?? settings.timeoutMs;

    const inFlightRequestId = nanoid();
    const payload: HttpExecutionRequest = {
      requestId: inFlightRequestId,
      method: tab.draft.protocol === 'graphql' ? 'POST' : tab.draft.method,
      url: finalUrl,
      headers: withAuth.headers,
      body: resolvedBody,
      graphql: resolvedGraphql,
      verifySsl,
      followRedirects,
      maxRedirects: settings.maxRedirects,
      timeoutMs,
      sendCookies,
    };

    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              isLoading: true,
              inFlightRequestId,
              startedAtMs: Date.now(),
              error: undefined,
            }
          : t,
      ),
    }));

    try {
      const response = await invokeCommand<HttpExecutionResponse>('send_http_request_cmd', {
        request: payload,
      });

      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId
            ? {
                ...t,
                isLoading: false,
                inFlightRequestId: undefined,
                startedAtMs: undefined,
                response,
                error: undefined,
              }
            : t,
        ),
      }));

      if (sendCookies) {
        await workspace.refreshCookies();
      }

      await workspace.recordHistory({
        method: payload.method,
        protocol: tab.draft.protocol,
        url: finalUrl,
        requestSnapshot: structuredClone(tab.draft),
        status: response.status,
        statusText: response.statusText,
        durationMs: response.durationMs,
        sizeBytes: response.sizeBytes,
        responseHeaders: response.headers,
        responseBody: response.bodyText,
        responseContentType: response.contentType,
        isBinary: response.bodyKind === 'binary' || response.bodyKind === 'image',
      });
    } catch (err) {
      const error = parseErrorInfo(err);
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId
            ? {
                ...t,
                isLoading: false,
                inFlightRequestId: undefined,
                startedAtMs: undefined,
                error,
              }
            : t,
        ),
      }));
    }
  },

  cancelTabRequest: async (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab?.inFlightRequestId) return;
    try {
      await invokeCommand('cancel_http_request_cmd', {
        requestId: tab.inFlightRequestId,
      });
    } catch {
      // Ignore cancel errors if already completed
    }
  },
}));
