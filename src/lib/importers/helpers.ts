import { nanoid } from 'nanoid';
import { combineBaseAndRequestUrl, isAbsoluteHttpUrl } from '@/lib/base-url';
import { splitUrlBaseAndQuery, syncParamsFromUrl } from '@/lib/url-params';
import type {
  AuthConfig,
  FormDataItem,
  FormDataItemType,
  KeyValueItem,
  RawBodyLanguage,
  RequestBody,
} from '@/types/api';
import type {
  CollectionRecord,
  EnvironmentRecord,
  EnvironmentVariable,
  FolderRecord,
  SavedRequestRecord,
} from '@/types/storage';
import type {
  BuiltWorkspaceImport,
  ExistingWorkspaceContext,
  ImportDestinationOptions,
  ImportParseResult,
  ImportStats,
  ParsedImportCollection,
  ParsedImportFolder,
  ParsedImportRequest,
} from '@/lib/importers/types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

export function kv(
  key: string,
  value: string,
  enabled = true,
  description?: string,
): KeyValueItem {
  return {
    id: nanoid(),
    key,
    value,
    ...(description ? { description } : {}),
    enabled,
  };
}

export function formItem(input: {
  key: string;
  value?: string;
  filePath?: string;
  fileName?: string;
  itemType?: FormDataItemType;
  enabled?: boolean;
}): FormDataItem {
  return {
    id: nanoid(),
    key: input.key,
    value: input.value ?? '',
    filePath: input.filePath,
    fileName: input.fileName,
    itemType: input.itemType ?? 'text',
    enabled: input.enabled ?? true,
  };
}

export function envVar(
  key: string,
  value: string,
  isSecret = false,
  enabled = true,
): EnvironmentVariable {
  return {
    id: nanoid(),
    key,
    value,
    isSecret,
    enabled,
  };
}

export function isAbsoluteOrTemplatedUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  return (
    isAbsoluteHttpUrl(trimmed) ||
    /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ||
    trimmed.startsWith('{{')
  );
}

export function splitUrlAndQuery(rawUrl: string): {
  baseUrl: string;
  queryParams: KeyValueItem[];
} {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { baseUrl: '', queryParams: [] };
  const { base, hash } = splitUrlBaseAndQuery(trimmed);
  return {
    baseUrl: `${base}${hash}`,
    queryParams: syncParamsFromUrl(trimmed, []),
  };
}

export function joinBaseAndPath(baseUrl: string | undefined, pathOrUrl: string): string {
  const rel = pathOrUrl.trim();
  if (!baseUrl?.trim()) return rel;
  if (!rel) return baseUrl.trim();
  if (isAbsoluteOrTemplatedUrl(rel)) return rel;
  return combineBaseAndRequestUrl(baseUrl, rel);
}

export function normalizeGraphQLVariables(raw: unknown): string {
  if (raw === null || raw === undefined) return '{}';
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return '{}';
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return trimmed;
    }
  }
  if (typeof raw === 'object') {
    try {
      return JSON.stringify(raw, null, 2);
    } catch {
      return '{}';
    }
  }
  return '{}';
}

const VALID_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);

export function normalizeHttpMethod(raw: unknown, fallback = 'GET'): string {
  const upper = asString(raw).trim().toUpperCase();
  if (!upper) return fallback;
  return VALID_METHODS.has(upper) ? upper : upper;
}

export function inferRawBodyLanguage(
  languageHint?: string,
  contentType?: string,
): RawBodyLanguage | 'json' {
  const combined = `${languageHint ?? ''} ${contentType ?? ''}`.toLowerCase();
  if (combined.includes('json')) return 'json';
  if (combined.includes('xml')) return 'xml';
  if (combined.includes('html')) return 'html';
  if (combined.includes('javascript') || /\bjs\b/.test(combined)) return 'javascript';
  return 'text';
}

export function getHeaderValue(headers: KeyValueItem[], name: string): string | undefined {
  const lower = name.toLowerCase();
  return headers.find((h) => h.enabled && h.key.trim().toLowerCase() === lower)?.value;
}

function countFolderTree(folder: ParsedImportFolder): {
  folders: number;
  requests: number;
  restRequests: number;
  graphqlRequests: number;
} {
  let folders = 1;
  let requests = folder.requests.length;
  let restRequests = folder.requests.filter((r) => r.protocol !== 'graphql').length;
  let graphqlRequests = folder.requests.filter((r) => r.protocol === 'graphql').length;

  for (const child of folder.folders) {
    const sub = countFolderTree(child);
    folders += sub.folders;
    requests += sub.requests;
    restRequests += sub.restRequests;
    graphqlRequests += sub.graphqlRequests;
  }

  return { folders, requests, restRequests, graphqlRequests };
}

export function countImportStats(parsed: ImportParseResult): ImportStats {
  let folders = 0;
  let requests = 0;
  let restRequests = 0;
  let graphqlRequests = 0;

  for (const col of parsed.collections) {
    requests += col.requests.length;
    restRequests += col.requests.filter((r) => r.protocol !== 'graphql').length;
    graphqlRequests += col.requests.filter((r) => r.protocol === 'graphql').length;

    for (const folder of col.folders) {
      const sub = countFolderTree(folder);
      folders += sub.folders;
      requests += sub.requests;
      restRequests += sub.restRequests;
      graphqlRequests += sub.graphqlRequests;
    }
  }

  return {
    collections: parsed.collections.length,
    folders,
    requests,
    restRequests,
    graphqlRequests,
    environments: parsed.environments.length,
  };
}

function cloneRequestWithFreshIds(req: ParsedImportRequest): Omit<
  SavedRequestRecord,
  'id' | 'collectionId' | 'folderId' | 'sortOrder' | 'createdAt' | 'updatedAt'
> {
  let clonedBody: RequestBody = { mode: 'none' };
  if (req.body.mode === 'json') {
    clonedBody = { mode: 'json', content: req.body.content };
  } else if (req.body.mode === 'raw') {
    clonedBody = { mode: 'raw', language: req.body.language, content: req.body.content };
  } else if (req.body.mode === 'urlEncoded') {
    clonedBody = {
      mode: 'urlEncoded',
      items: req.body.items.map((item) => ({ ...item, id: nanoid() })),
    };
  } else if (req.body.mode === 'formData') {
    clonedBody = {
      mode: 'formData',
      items: req.body.items.map((item) => ({ ...item, id: nanoid() })),
    };
  } else if (req.body.mode === 'graphql') {
    clonedBody = { mode: 'graphql' };
  }

  return {
    name: req.name.trim() || 'Untitled Request',
    protocol: req.protocol,
    method: req.protocol === 'graphql' ? 'POST' : normalizeHttpMethod(req.method),
    url: req.url,
    params: req.params.map((p) => ({ ...p, id: nanoid() })),
    headers: req.headers.map((h) => ({ ...h, id: nanoid() })),
    auth: structuredClone(req.auth) as AuthConfig,
    body: clonedBody,
    graphql: {
      query: req.graphql.query,
      variables: req.graphql.variables,
      ...(req.graphql.operationName ? { operationName: req.graphql.operationName } : {}),
    },
    settings: { ...req.settings },
  };
}

function deduplicateEnvName(rawName: string, usedLower: Set<string>): string {
  const base = rawName.trim() || 'Imported Environment';
  if (!usedLower.has(base.toLowerCase())) {
    usedLower.add(base.toLowerCase());
    return base;
  }
  let candidate = `${base} (Imported)`;
  let idx = 2;
  while (usedLower.has(candidate.toLowerCase())) {
    candidate = `${base} (Imported ${idx})`;
    idx += 1;
  }
  usedLower.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Converts a parsed external import tree into a valid RiftQL `WorkspaceExport` payload with
 * fresh unique IDs, appending items cleanly into either new collections or an existing target.
 */
export function buildWorkspaceExportFromImport(
  parsed: ImportParseResult,
  options: ImportDestinationOptions,
  existing: ExistingWorkspaceContext,
): BuiltWorkspaceImport {
  const ts = new Date().toISOString();
  const outCollections: CollectionRecord[] = [];
  const outFolders: FolderRecord[] = [];
  const outRequests: SavedRequestRecord[] = [];
  const outEnvironments: EnvironmentRecord[] = [];

  const folderSortCounters = new Map<string, number>();
  const requestSortCounters = new Map<string, number>();

  const nextCollectionSortStart =
    existing.collections.reduce((max, c) => Math.max(max, c.sortOrder), -1) + 1;
  let colSort = nextCollectionSortStart;

  const nextFolderSort = (collectionId: string, parentId?: string): number => {
    const key = `${collectionId}::${parentId ?? ''}`;
    let current = folderSortCounters.get(key);
    if (current === undefined) {
      const maxExisting = existing.folders
        .filter((f) => f.collectionId === collectionId && (f.parentId ?? undefined) === parentId)
        .reduce((max, f) => Math.max(max, f.sortOrder), -1);
      current = maxExisting + 1;
    }
    folderSortCounters.set(key, current + 1);
    return current;
  };

  const nextRequestSort = (collectionId: string, folderId?: string): number => {
    const key = `${collectionId}::${folderId ?? ''}`;
    let current = requestSortCounters.get(key);
    if (current === undefined) {
      const maxExisting = existing.savedRequests
        .filter((r) => r.collectionId === collectionId && (r.folderId ?? undefined) === folderId)
        .reduce((max, r) => Math.max(max, r.sortOrder), -1);
      current = maxExisting + 1;
    }
    requestSortCounters.set(key, current + 1);
    return current;
  };

  const emitTree = (
    folders: ParsedImportFolder[],
    requests: ParsedImportRequest[],
    collectionId: string,
    parentFolderId?: string,
    rebaseRelativeToBaseUrl?: string,
  ) => {
    for (const fld of folders) {
      const newFolderId = nanoid();
      const effectiveFolderBase =
        rebaseRelativeToBaseUrl && !isAbsoluteOrTemplatedUrl(fld.baseUrl ?? '')
          ? joinBaseAndPath(rebaseRelativeToBaseUrl, fld.baseUrl ?? '')
          : (fld.baseUrl ?? '').trim();

      outFolders.push({
        id: newFolderId,
        collectionId,
        ...(parentFolderId ? { parentId: parentFolderId } : {}),
        name: fld.name.trim() || 'Imported Folder',
        baseUrl: effectiveFolderBase,
        auth: structuredClone(fld.auth),
        sortOrder: nextFolderSort(collectionId, parentFolderId),
        createdAt: ts,
        updatedAt: ts,
      });

      emitTree(fld.folders, fld.requests, collectionId, newFolderId);
    }

    for (const req of requests) {
      const cloned = cloneRequestWithFreshIds(req);
      const effectiveUrl =
        rebaseRelativeToBaseUrl && !isAbsoluteOrTemplatedUrl(cloned.url)
          ? joinBaseAndPath(rebaseRelativeToBaseUrl, cloned.url)
          : cloned.url;

      outRequests.push({
        ...cloned,
        url: effectiveUrl,
        id: nanoid(),
        collectionId,
        ...(parentFolderId ? { folderId: parentFolderId } : {}),
        sortOrder: nextRequestSort(collectionId, parentFolderId),
        createdAt: ts,
        updatedAt: ts,
      });
    }
  };

  let targetName = parsed.sourceName;

  if (parsed.collections.length > 0) {
    if (options.mode === 'existing-collection') {
      const targetCol = existing.collections.find((c) => c.id === options.targetCollectionId);
      if (!targetCol) {
        throw new Error('Select a target collection to import requests into.');
      }
      const targetFolder = options.targetFolderId
        ? existing.folders.find(
            (f) => f.id === options.targetFolderId && f.collectionId === targetCol.id,
          )
        : undefined;
      targetName = targetFolder ? `${targetCol.name} / ${targetFolder.name}` : targetCol.name;

      for (const parsedCol of parsed.collections) {
        if (options.wrapInSubfolder) {
          const wrapperId = nanoid();
          const wrapperName =
            (parsed.collections.length === 1 ? options.subfolderName?.trim() : undefined) ||
            parsedCol.name.trim() ||
            parsed.sourceName.trim() ||
            'Imported';
          outFolders.push({
            id: wrapperId,
            collectionId: targetCol.id,
            ...(targetFolder ? { parentId: targetFolder.id } : {}),
            name: wrapperName,
            baseUrl: (parsedCol.baseUrl ?? '').trim(),
            auth: parsedCol.auth.type === 'none' ? { type: 'inherit' } : structuredClone(parsedCol.auth),
            sortOrder: nextFolderSort(targetCol.id, targetFolder?.id),
            createdAt: ts,
            updatedAt: ts,
          });
          emitTree(parsedCol.folders, parsedCol.requests, targetCol.id, wrapperId);
        } else {
          emitTree(
            parsedCol.folders,
            parsedCol.requests,
            targetCol.id,
            targetFolder?.id,
            parsedCol.baseUrl?.trim() || undefined,
          );
        }
      }
    } else {
      for (const parsedCol of parsed.collections) {
        const newColId = nanoid();
        const colName =
          (parsed.collections.length === 1 ? options.newCollectionName?.trim() : undefined) ||
          parsedCol.name.trim() ||
          parsed.sourceName.trim() ||
          'Imported Collection';
        if (parsed.collections.length === 1) {
          targetName = colName;
        }
        outCollections.push({
          id: newColId,
          name: colName,
          description: parsedCol.description,
          baseUrl: (parsedCol.baseUrl ?? '').trim(),
          auth: structuredClone(parsedCol.auth),
          variables: parsedCol.variables.map((v) => ({ ...v, id: nanoid() })),
          sortOrder: colSort,
          createdAt: ts,
          updatedAt: ts,
        });
        colSort += 1;
        emitTree(parsedCol.folders, parsedCol.requests, newColId, undefined);
      }
    }
  }

  if (options.importEnvironments !== false && parsed.environments.length > 0) {
    const usedEnvNames = new Set(existing.environments.map((e) => e.name.trim().toLowerCase()));
    for (const env of parsed.environments) {
      outEnvironments.push({
        id: nanoid(),
        name: deduplicateEnvName(env.name, usedEnvNames),
        isGlobal: false,
        variables: env.variables.map((v) => ({ ...v, id: nanoid() })),
        createdAt: ts,
        updatedAt: ts,
      });
    }
    if (parsed.collections.length === 0) {
      targetName = outEnvironments.map((e) => e.name).join(', ');
    }
  }

  return {
    exportPayload: {
      version: 1,
      exportedAt: ts,
      collections: outCollections,
      folders: outFolders,
      savedRequests: outRequests,
      environments: outEnvironments,
    },
    summary: {
      collections: outCollections.length,
      folders: outFolders.length,
      requests: outRequests.length,
      environments: outEnvironments.length,
      targetName,
    },
  };
}

export function buildParsedCollectionFallback(
  partial: Partial<ParsedImportCollection>,
): ParsedImportCollection {
  return {
    name: partial.name?.trim() || 'Imported Collection',
    description: partial.description ?? '',
    baseUrl: partial.baseUrl,
    auth: partial.auth ?? { type: 'none' },
    variables: partial.variables ?? [],
    folders: partial.folders ?? [],
    requests: partial.requests ?? [],
  };
}
