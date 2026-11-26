import {
  asString,
  buildParsedCollectionFallback,
  envVar,
  isRecord,
  kv,
  normalizeGraphQLVariables,
  splitUrlAndQuery,
} from '@/lib/importers/helpers';
import type {
  ImportParseResult,
  ParsedImportCollection,
  ParsedImportEnvironment,
  ParsedImportFolder,
  ParsedImportRequest,
} from '@/lib/importers/types';
import type { AuthConfig, KeyValueItem } from '@/types/api';
import type { EnvironmentVariable } from '@/types/storage';

export function isAltairCollectionPayload(data: unknown): boolean {
  if (isRecord(data)) {
    if (data.type === 'collection') return true;
    return Array.isArray(data.queries) && typeof data.title === 'string';
  }
  if (Array.isArray(data) && data.length > 0) {
    return data.every(
      (item) =>
        isRecord(item) &&
        (item.type === 'collection' || (Array.isArray(item.queries) && typeof item.title === 'string')),
    );
  }
  return false;
}

export function isAltairQueryPayload(data: unknown): boolean {
  if (isRecord(data)) {
    if (data.type === 'window') return true;
    return (
      typeof data.query === 'string' &&
      ('apiUrl' in data || 'windowName' in data) &&
      !Array.isArray(data.queries) &&
      !('_type' in data)
    );
  }
  if (Array.isArray(data) && data.length > 0) {
    return data.every(
      (item) =>
        isRecord(item) &&
        (item.type === 'window' ||
          (typeof item.query === 'string' && ('apiUrl' in item || 'windowName' in item))),
    );
  }
  return false;
}

export function isAltairEnvironmentPayload(data: unknown): boolean {
  if (!isRecord(data)) return false;
  if (data.type === 'environment' && ('variablesJson' in data || isRecord(data.variables))) {
    return true;
  }
  return isRecord(data.base) && 'variablesJson' in data.base && Array.isArray(data.subEnvironments);
}

function parseAltairHeaders(raw: unknown): KeyValueItem[] {
  if (Array.isArray(raw)) {
    return raw
      .filter(isRecord)
      .map((h) =>
        kv(asString(h.key), asString(h.value), h.enabled !== false),
      )
      .filter((h) => h.key.trim().length > 0 || h.value.trim().length > 0);
  }
  if (isRecord(raw)) {
    return Object.entries(raw)
      .filter(([key]) => key.trim().length > 0)
      .map(([key, value]) => kv(key, asString(value), true));
  }
  return [];
}

function parseAltairAuth(raw: Record<string, unknown>, warnings: string[]): AuthConfig {
  const authType = asString(raw.authorizationType).trim().toLowerCase();
  const data = isRecord(raw.authorizationData) ? raw.authorizationData : {};

  if (!authType || authType === 'none') {
    return { type: 'inherit' };
  }
  if (authType === 'bearer') {
    return {
      type: 'bearer',
      token: asString(data.token),
    };
  }
  if (authType === 'basic') {
    return {
      type: 'basic',
      username: asString(data.username),
      password: asString(data.password),
    };
  }
  if (authType === 'api-key' || authType === 'apikey') {
    return {
      type: 'apiKey',
      key: asString(data.headerName) || asString(data.key) || 'X-API-Key',
      value: asString(data.headerValue) || asString(data.value),
      addTo: 'header',
    };
  }

  warnings.push(`Unsupported Altair authorization type "${authType}" mapped to inherit.`);
  return { type: 'inherit' };
}

function parseAltairWindow(
  raw: Record<string, unknown>,
  warnings: string[],
  warnedScripts: { value: boolean },
): ParsedImportRequest {
  const { baseUrl, queryParams } = splitUrlAndQuery(asString(raw.apiUrl));
  const headers = parseAltairHeaders(raw.headers);
  const auth = parseAltairAuth(raw, warnings);

  if (
    !warnedScripts.value &&
    ((isRecord(raw.preRequest) && raw.preRequest.enabled && asString(raw.preRequest.script).trim()) ||
      (isRecord(raw.postRequest) && raw.postRequest.enabled && asString(raw.postRequest.script).trim()))
  ) {
    warnedScripts.value = true;
    warnings.push(
      'Altair pre-request/post-request scripts were skipped because RiftQL scripting is not enabled yet.',
    );
  }

  const selectedOp = asString(raw.selectedOperation).trim();

  return {
    name: asString(raw.windowName).trim() || 'GraphQL Query',
    protocol: 'graphql',
    method: 'POST',
    url: baseUrl,
    params: queryParams,
    headers,
    auth,
    body: { mode: 'graphql' },
    graphql: {
      query: asString(raw.query),
      variables: normalizeGraphQLVariables(raw.variables),
      ...(selectedOp ? { operationName: selectedOp } : {}),
    },
    settings: {},
  };
}

function parseAltairSubCollectionAsFolder(
  raw: Record<string, unknown>,
  warnings: string[],
  warnedScripts: { value: boolean },
): ParsedImportFolder {
  const nestedCollections = Array.isArray(raw.collections) ? raw.collections.filter(isRecord) : [];
  const rawQueries = Array.isArray(raw.queries) ? raw.queries.filter(isRecord) : [];

  return {
    name: asString(raw.title).trim() || asString(raw.name).trim() || 'Subcollection',
    auth: { type: 'inherit' },
    folders: nestedCollections.map((sub) =>
      parseAltairSubCollectionAsFolder(sub, warnings, warnedScripts),
    ),
    requests: rawQueries.map((q) => parseAltairWindow(q, warnings, warnedScripts)),
  };
}

function parseAltairCollectionRecord(
  raw: Record<string, unknown>,
  warnings: string[],
  warnedScripts: { value: boolean },
): ParsedImportCollection {
  const nestedCollections = Array.isArray(raw.collections) ? raw.collections.filter(isRecord) : [];
  const rawQueries = Array.isArray(raw.queries) ? raw.queries.filter(isRecord) : [];

  const requests = rawQueries.map((q) => parseAltairWindow(q, warnings, warnedScripts));
  const folders = nestedCollections.map((sub) =>
    parseAltairSubCollectionAsFolder(sub, warnings, warnedScripts),
  );

  // If all imported GraphQL requests share a single endpoint URL, lift nothing automatically
  // so every query retains its explicit Altair apiUrl even if moved across collections.
  return buildParsedCollectionFallback({
    name: asString(raw.title).trim() || asString(raw.name).trim() || 'Altair Collection',
    description: asString(raw.description),
    auth: { type: 'none' },
    folders,
    requests,
  });
}

function parseAltairVariablesRecord(raw: Record<string, unknown>, warnings: string[]): EnvironmentVariable[] {
  let obj: Record<string, unknown> = {};
  if (typeof raw.variablesJson === 'string') {
    const trimmed = raw.variablesJson.trim();
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (isRecord(parsed)) {
          obj = parsed;
        }
      } catch {
        warnings.push(
          `Could not parse variablesJson for Altair environment "${asString(raw.title) || 'Environment'}".`,
        );
      }
    }
  } else if (isRecord(raw.variables)) {
    obj = raw.variables;
  }

  return Object.entries(obj)
    .filter(([key]) => key.trim().length > 0)
    .map(([key, val]) =>
      envVar(key, typeof val === 'string' ? val : JSON.stringify(val), false, true),
    );
}

export function parseAltairCollection(data: unknown, fileName?: string): ImportParseResult {
  const warnings: string[] = [];
  const warnedScripts = { value: false };
  const items = Array.isArray(data) ? data.filter(isRecord) : isRecord(data) ? [data] : [];
  const collections = items.map((item) =>
    parseAltairCollectionRecord(item, warnings, warnedScripts),
  );

  const fallbackName = fileName?.replace(/\.[^.]+$/, '') || 'Altair Collection';
  const sourceName =
    collections.length === 1
      ? collections[0].name
      : collections.length > 1
        ? `${collections.length} Altair Collections`
        : fallbackName;

  return {
    format: 'altair-collection',
    formatLabel: 'Altair GraphQL Collection (.agc)',
    sourceName,
    collections,
    environments: [],
    warnings,
  };
}

export function parseAltairQuery(data: unknown, fileName?: string): ImportParseResult {
  const warnings: string[] = [];
  const warnedScripts = { value: false };
  const items = Array.isArray(data) ? data.filter(isRecord) : isRecord(data) ? [data] : [];
  const requests = items.map((q) => parseAltairWindow(q, warnings, warnedScripts));

  const fallbackTitle =
    (requests.length === 1 ? requests[0].name : undefined) ||
    fileName?.replace(/\.[^.]+$/, '') ||
    'Altair Queries';

  const collection = buildParsedCollectionFallback({
    name: fallbackTitle,
    description: 'Imported from Altair GraphQL query file',
    auth: { type: 'none' },
    requests,
  });

  return {
    format: 'altair-query',
    formatLabel: 'Altair GraphQL Query (.agq)',
    sourceName: collection.name,
    collections: [collection],
    environments: [],
    warnings,
  };
}

export function parseAltairEnvironment(data: unknown, fileName?: string): ImportParseResult {
  const warnings: string[] = [];
  const environments: ParsedImportEnvironment[] = [];

  if (isRecord(data)) {
    if (Array.isArray(data.subEnvironments)) {
      if (isRecord(data.base)) {
        const baseVars = parseAltairVariablesRecord(data.base, warnings);
        if (baseVars.length > 0) {
          environments.push({ name: 'Altair Base Environment', variables: baseVars });
        }
      }
      for (const sub of data.subEnvironments.filter(isRecord)) {
        environments.push({
          name: asString(sub.title).trim() || 'Altair Environment',
          variables: parseAltairVariablesRecord(sub, warnings),
        });
      }
    } else {
      environments.push({
        name:
          asString(data.title).trim() ||
          asString(data.name).trim() ||
          fileName?.replace(/\.[^.]+$/, '') ||
          'Altair Environment',
        variables: parseAltairVariablesRecord(data, warnings),
      });
    }
  }

  return {
    format: 'altair-environment',
    formatLabel: 'Altair GraphQL Environment (.agx)',
    sourceName: environments[0]?.name || 'Altair Environment',
    collections: [],
    environments,
    warnings,
  };
}
