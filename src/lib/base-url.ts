import { splitUrlBaseAndQuery } from '@/lib/url-params';
import type { CollectionRecord, FolderRecord } from '@/types/storage';

export interface EffectiveBaseUrlResolution {
  baseUrl: string;
  sourceLabel?: string;
}

export function isAbsoluteHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

/**
 * Combines a base URL (from a collection/folder) with a request path/URL.
 * - Explicit `http://` or `https://` request URLs override `baseUrl`.
 * - Query (`?a=1`) and hash (`#frag`) request suffixes merge cleanly onto `baseUrl`.
 * - Path segments join without duplicate slashes.
 */
export function combineBaseAndRequestUrl(
  baseUrl: string | undefined,
  requestUrl: string,
): string {
  const base = (baseUrl ?? '').trim();
  const req = requestUrl.trim();

  if (!base) return req;
  if (!req) return base;
  if (isAbsoluteHttpUrl(req)) return req;

  if (req.startsWith('#')) {
    const { base: bPath, query: bQuery } = splitUrlBaseAndQuery(base);
    return bQuery ? `${bPath}?${bQuery}${req}` : `${bPath}${req}`;
  }

  if (req.startsWith('?')) {
    const { base: bPath, query: bQuery, hash: bHash } = splitUrlBaseAndQuery(base);
    const reqParts = splitUrlBaseAndQuery(req);
    const combinedQuery = [bQuery, reqParts.query].filter(Boolean).join('&');
    const outHash = reqParts.hash || bHash;
    return `${bPath}${combinedQuery ? `?${combinedQuery}` : ''}${outHash}`;
  }

  const { base: bPath, query: bQuery, hash: bHash } = splitUrlBaseAndQuery(base);
  const { base: rPath, query: rQuery, hash: rHash } = splitUrlBaseAndQuery(req);

  const normalizedBase = bPath.replace(/\/+$/, '');
  const normalizedReq = rPath.replace(/^\/+/, '');
  const joinedPath = normalizedReq ? `${normalizedBase}/${normalizedReq}` : normalizedBase;

  const combinedQuery = [bQuery, rQuery].filter(Boolean).join('&');
  const outHash = rHash || bHash;
  return `${joinedPath}${combinedQuery ? `?${combinedQuery}` : ''}${outHash}`;
}

/**
 * Walks request folder -> parent folders -> collection to compute the effective inherited Base URL.
 * Relative child folder segments append onto ancestor URLs, while any absolute `http(s)://` URL stops inheritance.
 */
export function resolveEffectiveBaseUrl(
  folderId: string | undefined,
  collectionId: string | undefined,
  folders: FolderRecord[],
  collections: CollectionRecord[],
): EffectiveBaseUrlResolution {
  const folderMap = new Map(folders.map((f) => [f.id, f]));
  const visited = new Set<string>();
  const segmentsFromRoot: Array<{ value: string; label: string }> = [];

  let hitAbsolute = false;
  let currentFolderId = folderId;

  while (currentFolderId && !visited.has(currentFolderId)) {
    visited.add(currentFolderId);
    const folder = folderMap.get(currentFolderId);
    if (!folder) break;
    const raw = folder.baseUrl?.trim() ?? '';
    if (raw) {
      segmentsFromRoot.unshift({
        value: raw,
        label: `Folder "${folder.name}"`,
      });
      if (isAbsoluteHttpUrl(raw)) {
        hitAbsolute = true;
        break;
      }
    }
    currentFolderId = folder.parentId;
  }

  if (!hitAbsolute && collectionId) {
    const collection = collections.find((c) => c.id === collectionId);
    const colBase = collection?.baseUrl?.trim() ?? '';
    if (colBase && collection) {
      segmentsFromRoot.unshift({
        value: colBase,
        label: `Collection "${collection.name}"`,
      });
    }
  }

  if (segmentsFromRoot.length === 0) {
    return { baseUrl: '' };
  }

  let composed = '';
  for (const seg of segmentsFromRoot) {
    composed = combineBaseAndRequestUrl(composed, seg.value);
  }

  const nearestSource = segmentsFromRoot[segmentsFromRoot.length - 1];
  return {
    baseUrl: composed,
    sourceLabel: nearestSource.label,
  };
}

/**
 * Resolves templates and combines the effective inherited Base URL with the active request URL.
 */
export function resolveRequestUrl(
  requestUrl: string,
  inheritedBaseUrl: string | undefined,
  resolveVar: (raw: string) => string,
): string {
  const resolvedReq = resolveVar(requestUrl.trim()).trim();
  if (isAbsoluteHttpUrl(resolvedReq)) {
    return resolvedReq;
  }
  const resolvedBase = inheritedBaseUrl ? resolveVar(inheritedBaseUrl.trim()).trim() : '';
  return combineBaseAndRequestUrl(resolvedBase, resolvedReq);
}
