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

interface ContainerSchemaResult {
  schema?: GraphQLSchema;
  endpoint: string;
  error?: string;
}

interface SchemaState {
  byEndpoint: Record<string, CachedSchemaEntry>;
  getEntry: (endpoint: string) => CachedSchemaEntry | undefined;
  setSchema: (endpoint: string, schema: GraphQLSchema) => void;
  fetchSchemaForTab: (tab: RequestTab) => Promise<GraphQLSchema | undefined>;
  fetchSchemaForContainer: (input: {
    collectionId: string;
    folderId?: string;
    urlOverride?: string;
    extraHeaders?: HeaderPair[];
  }) => Promise<ContainerSchemaResult>;
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
    const baseHeaders: HeaderPair[] = tab.draft.headers
      .filter((h) => h.enabled && h.key.trim().length > 0)
      .map((h) => ({ key: h.key.trim(), value: h.value }));
    const res = await introspectEndpoint({
      rawUrl: tab.draft.url,
      collectionId: tab.collectionId,
      folderId: tab.folderId,
      rawAuth: tab.draft.auth,
      rawHeaders: baseHeaders,
      verifySslOverride: tab.draft.settings.verifySsl,
      followRedirectsOverride: tab.draft.settings.followRedirects,
      timeoutMsOverride: tab.draft.settings.timeoutMs,
      sendCookiesOverride: tab.draft.settings.sendCookies,
      set,
      get,
    });
    return res.schema;
  },

  fetchSchemaForContainer: async ({ collectionId, folderId, urlOverride = '', extraHeaders = [] }) => {
    return introspectEndpoint({
      rawUrl: urlOverride,
      collectionId,
      folderId,
      rawAuth: { type: 'inherit' },
      rawHeaders: extraHeaders,
      set,
      get,
    });
  },
}));

async function introspectEndpoint(params: {
  rawUrl: string;
  collectionId?: string;
  folderId?: string;
  rawAuth: import('@/types/api').AuthConfig;
  rawHeaders: HeaderPair[];
  verifySslOverride?: boolean;
  followRedirectsOverride?: boolean;
  timeoutMsOverride?: number;
  sendCookiesOverride?: boolean;
  set: (partial: (state: SchemaState) => Partial<SchemaState>) => void;
  get: () => SchemaState;
}): Promise<ContainerSchemaResult> {
  const settings = useSettingsStore.getState().settings;
  const workspace = useWorkspaceStore.getState();
  const globalEnv = workspace.environments.find((e) => e.isGlobal);
  const activeEnv = settings.activeEnvironmentId
    ? workspace.environments.find((e) => e.id === settings.activeEnvironmentId)
    : undefined;
  const collection = params.collectionId
    ? workspace.collections.find((c) => c.id === params.collectionId)
    : undefined;

  const varCtx: VariableResolutionContext = {
    globalEnvironment: globalEnv,
    activeEnvironment: activeEnv,
    collectionVariables: collection?.variables,
  };
  const resolve = (s: string) => resolveVariables(s, varCtx);
  const endpoint = resolveEndpointKey(params.rawUrl, params.collectionId, params.folderId);
  if (!endpoint) {
    return { endpoint: '', error: 'No endpoint URL configured for introspection.' };
  }

  params.set((state) => ({
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
    const resolvedHeaders: HeaderPair[] = params.rawHeaders.map((h) => ({
      key: resolve(h.key.trim()),
      value: resolve(h.value),
    }));

    const effectiveAuth = resolveEffectiveAuth(
      params.rawAuth,
      params.folderId,
      params.collectionId,
      workspace.folders,
      workspace.collections,
    );
    const withAuth = applyAuthToRequest(effectiveAuth.auth, resolvedHeaders, [], resolve);

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
        verifySsl: params.verifySslOverride ?? settings.verifySsl,
        followRedirects: params.followRedirectsOverride ?? settings.followRedirects,
        maxRedirects: settings.maxRedirects,
        timeoutMs: params.timeoutMsOverride ?? settings.timeoutMs,
        sendCookies: params.sendCookiesOverride ?? settings.sendCookies,
      },
    });

    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    if (!response.bodyText) {
      throw new Error('Empty response returned from introspection endpoint');
    }

    const schema = buildSchemaFromIntrospection(response.bodyText);
    params.set((state) => ({
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
    return { schema, endpoint };
  } catch (err) {
    const message =
      err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err);
    params.set((state) => ({
      byEndpoint: {
        ...state.byEndpoint,
        [endpoint]: {
          ...state.byEndpoint[endpoint],
          loading: false,
          error: message,
        },
      },
    }));
    return { endpoint, error: message };
  }
}
