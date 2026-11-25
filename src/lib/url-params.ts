import { nanoid } from 'nanoid';
import type { KeyValueItem } from '@/types/api';

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment.replace(/\+/g, ' '));
  } catch {
    return segment;
  }
}

export function splitUrlBaseAndQuery(rawUrl: string): {
  base: string;
  query: string;
  hash: string;
} {
  const hashIdx = rawUrl.indexOf('#');
  const hash = hashIdx >= 0 ? rawUrl.slice(hashIdx) : '';
  const withoutHash = hashIdx >= 0 ? rawUrl.slice(0, hashIdx) : rawUrl;
  const qIdx = withoutHash.indexOf('?');
  if (qIdx < 0) {
    return { base: withoutHash, query: '', hash };
  }
  return {
    base: withoutHash.slice(0, qIdx),
    query: withoutHash.slice(qIdx + 1),
    hash,
  };
}

/**
 * Parses URL query string into params while preserving existing disabled rows.
 */
export function syncParamsFromUrl(
  rawUrl: string,
  existingParams: KeyValueItem[],
): KeyValueItem[] {
  const { query } = splitUrlBaseAndQuery(rawUrl);
  const disabledRows = existingParams.filter((p) => !p.enabled);

  if (!query) {
    return disabledRows;
  }

  const enabledExisting = existingParams.filter((p) => p.enabled);
  const segments = query.split('&').filter((s) => s.length > 0);
  const parsed: KeyValueItem[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const eqIdx = seg.indexOf('=');
    const key = eqIdx >= 0 ? safeDecode(seg.slice(0, eqIdx)) : safeDecode(seg);
    const value = eqIdx >= 0 ? safeDecode(seg.slice(eqIdx + 1)) : '';
    const reuse = enabledExisting[i];
    parsed.push({
      id: reuse?.id ?? nanoid(),
      key,
      value,
      description: reuse?.description,
      enabled: true,
    });
  }

  return [...parsed, ...disabledRows];
}

/**
 * Rebuilds the URL string from enabled params without breaking `{{variable}}` templates.
 */
export function syncUrlFromParams(rawUrl: string, params: KeyValueItem[]): string {
  const { base, hash } = splitUrlBaseAndQuery(rawUrl);
  const active = params.filter((p) => p.enabled && (p.key.length > 0 || p.value.length > 0));
  if (active.length === 0) {
    return `${base}${hash}`;
  }

  const query = active
    .map((p) => {
      const k = p.key.includes('{{') ? p.key : encodeURIComponent(p.key);
      const v = p.value.includes('{{') ? p.value : encodeURIComponent(p.value);
      return `${k}=${v}`;
    })
    .join('&');

  return `${base}?${query}${hash}`;
}
