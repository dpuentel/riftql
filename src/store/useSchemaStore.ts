import type { GraphQLSchema } from 'graphql';
import { create } from 'zustand';
import { applyAuthToRequest, resolveEffectiveAuth } from '@/lib/auth';
import { resolveEffectiveBaseUrl, resolveRequestUrl } from '@/lib/base-url';
import {
  INTROSPECTION_QUERY,
  buildSchemaFromIntrospection,
} from '@/lib/graphql';
import { invokeCommand } from '@/lib/tauri';
import { resolveVariables, type VariableResolutionContext } from '@/lib/variables';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import type { HeaderPair, HttpExecutionResponse } from '@/types/api';
import type { RequestTab } from '@/types/storage';

export interface CachedSchemaEntry {
  schema?: GraphQLSchema;
  fetchedAt?: string;
  loading: boolean;
  error?: string;
}

interface SchemaState {
  byEndpoint: Record<string, CachedSchemaEntry>;
  getEntry: (endpoint: string) => CachedSchemaEntry | undefined;
  setSchema: (endpoint: string, schema: GraphQLSchema) => void;
  fetchSchemaForTab: (tab: RequestTab) => Promise<GraphQLSchema | undefined>;
}

export function resolveEndpointKey(
  rawUrl: string,
  collectionId?: string,
  folderId?: string,
): string {
  const settings = useSettingsStore.getState().settings;
  const workspace = useWorkspaceStore.getState();
  const globalEnv = workspace.environments.find((e) => e.isGlobal);
  const activeEnv = settings.activeEnvironmentId
    ? workspace.environments.find((e) => e.id === settings.activeEnvironmentId)
    : undefined;
  const collection = collectionId
    ? workspace.collections.find((c) => c.id === collectionId)
    : undefined;

  const ctx: VariableResolutionContext = {
    globalEnvironment: globalEnv,
    activeEnvironment: activeEnv,
    collectionVariables: collection?.variables,
  };
  const resolve = (s: string) => resolveVariables(s, ctx);
  const inheritedBase = resolveEffectiveBaseUrl(
    folderId,
    collectionId,
    workspace.folders,
    workspace.collections,
  );
  const resolved = resolveRequestUrl(rawUrl, inheritedBase.baseUrl, resolve);
  if (!resolved) return '';
  return resolved.startsWith('http://') || resolved.startsWith('https://')
    ? resolved
    : `https://${resolved}`;
}

export const useSchemaStore = create<SchemaState>((set, get) => ({
  byEndpoint: {},

  getEntry: (endpoint) => {
    if (!endpoint) return undefined;
    return get().byEndpoint[endpoint];
  },

  setSchema: (endpoint, schema) => {
    if (!endpoint) return;
    set((state) => ({
      byEndpoint: {
        ...state.byEndpoint,
        [endpoint]: {
          schema,
          fetchedAt: new Date().toISOString(),
          loading: false,
          error: undefined,
        },
      },
    }));
  },

  fetchSchemaForTab: async (tab) => {
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
    const resolve = (s: string) => resolveVariables(s, varCtx);
    const endpoint = resolveEndpointKey(tab.draft.url, tab.collectionId, tab.folderId);
    if (!endpoint) {
      return undefined;
    }

    set((state) => ({
      byEndpoint: {
        ...state.byEndpoint,
        [endpoint]: {
          ...state.byEndpoint[endpoint],
          loading: true,
          error: undefined,
        },
      },
    }));

    try {
      const headers: HeaderPair[] = tab.draft.headers
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
      const withAuth = applyAuthToRequest(effectiveAuth.auth, headers, [], resolve);

      const response = await invokeCommand<HttpExecutionResponse>('send_http_request_cmd', {
        request: {
          requestId: `introspect-${Date.now()}`,
          method: 'POST',
          url: endpoint,
          headers: withAuth.headers,
          body: { mode: 'graphql' },
          graphql: {
            query: INTROSPECTION_QUERY,
            variables: '{}',
            operationName: 'IntrospectionQuery',
          },
          verifySsl: tab.draft.settings.verifySsl ?? settings.verifySsl,
          followRedirects: tab.draft.settings.followRedirects ?? settings.followRedirects,
          maxRedirects: settings.maxRedirects,
          timeoutMs: tab.draft.settings.timeoutMs ?? settings.timeoutMs,
          sendCookies: tab.draft.settings.sendCookies ?? settings.sendCookies,
        },
      });

      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      if (!response.bodyText) {
        throw new Error('Empty response returned from introspection endpoint');
      }

      const schema = buildSchemaFromIntrospection(response.bodyText);
      set((state) => ({
        byEndpoint: {
          ...state.byEndpoint,
          [endpoint]: {
            schema,
            fetchedAt: new Date().toISOString(),
            loading: false,
            error: undefined,
          },
        },
      }));
      return schema;
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err);
      set((state) => ({
        byEndpoint: {
          ...state.byEndpoint,
          [endpoint]: {
            ...state.byEndpoint[endpoint],
            loading: false,
            error: message,
          },
        },
      }));
      return undefined;
    }
  },
}));
