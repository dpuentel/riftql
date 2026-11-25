import type { AuthConfig, HeaderPair, KeyValueItem } from '@/types/api';
import type { CollectionRecord, FolderRecord } from '@/types/storage';

export interface EffectiveAuthResolution {
  auth: AuthConfig;
  sourceLabel: string;
}

/**
 * Walks request -> nested folders (nearest parent first) -> collection -> none
 * whenever auth.type === 'inherit'.
 */
export function resolveEffectiveAuth(
  requestAuth: AuthConfig,
  folderId: string | undefined,
  collectionId: string | undefined,
  folders: FolderRecord[],
  collections: CollectionRecord[],
): EffectiveAuthResolution {
  if (requestAuth.type !== 'inherit') {
    return { auth: requestAuth, sourceLabel: 'Request' };
  }

  const folderMap = new Map(folders.map((f) => [f.id, f]));
  const visited = new Set<string>();
  let currentFolderId = folderId;

  while (currentFolderId && !visited.has(currentFolderId)) {
    visited.add(currentFolderId);
    const folder = folderMap.get(currentFolderId);
    if (!folder) break;
    if (folder.auth.type !== 'inherit') {
      return {
        auth: folder.auth,
        sourceLabel: `Folder "${folder.name}"`,
      };
    }
    currentFolderId = folder.parentId;
  }

  if (collectionId) {
    const collection = collections.find((c) => c.id === collectionId);
    if (collection && collection.auth.type !== 'inherit') {
      return {
        auth: collection.auth,
        sourceLabel: `Collection "${collection.name}"`,
      };
    }
  }

  return { auth: { type: 'none' }, sourceLabel: 'None' };
}

function encodeBase64Utf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function upsertHeaderCaseInsensitive(
  headers: HeaderPair[],
  key: string,
  value: string,
): HeaderPair[] {
  const lower = key.toLowerCase();
  const hasExplicit = headers.some((h) => h.key.toLowerCase() === lower);
  if (hasExplicit) {
    return headers;
  }
  return [...headers, { key, value }];
}

export function applyAuthToRequest(
  auth: AuthConfig,
  headers: HeaderPair[],
  queryParams: KeyValueItem[],
  resolveVar: (raw: string) => string,
): { headers: HeaderPair[]; queryParams: KeyValueItem[] } {
  switch (auth.type) {
    case 'inherit':
    case 'none':
      return { headers, queryParams };

    case 'bearer': {
      const token = resolveVar(auth.token);
      if (!token) return { headers, queryParams };
      return {
        headers: upsertHeaderCaseInsensitive(headers, 'Authorization', `Bearer ${token}`),
        queryParams,
      };
    }

    case 'basic': {
      const username = resolveVar(auth.username);
      const password = resolveVar(auth.password);
      const encoded = encodeBase64Utf8(`${username}:${password}`);
      return {
        headers: upsertHeaderCaseInsensitive(headers, 'Authorization', `Basic ${encoded}`),
        queryParams,
      };
    }

    case 'apiKey': {
      const key = resolveVar(auth.key).trim();
      const value = resolveVar(auth.value);
      if (!key) return { headers, queryParams };
      if (auth.addTo === 'header') {
        return {
          headers: upsertHeaderCaseInsensitive(headers, key, value),
          queryParams,
        };
      }
      const nextParams = [
        ...queryParams,
        { id: `auth-${key}`, key, value, enabled: true },
      ];
      return { headers, queryParams: nextParams };
    }
  }
}
