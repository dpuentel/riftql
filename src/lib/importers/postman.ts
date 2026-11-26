import {
  asString,
  buildParsedCollectionFallback,
  envVar,
  formItem,
  getHeaderValue,
  inferRawBodyLanguage,
  isRecord,
  kv,
  normalizeGraphQLVariables,
  normalizeHttpMethod,
  splitUrlAndQuery,
} from '@/lib/importers/helpers';
import type {
  ImportParseResult,
  ParsedImportCollection,
  ParsedImportEnvironment,
  ParsedImportFolder,
  ParsedImportRequest,
} from '@/lib/importers/types';
import type { AuthConfig, FormDataItem, KeyValueItem, RequestBody } from '@/types/api';
import type { EnvironmentVariable } from '@/types/storage';

export function isPostmanCollectionPayload(data: unknown): boolean {
  if (!isRecord(data)) return false;
  if (!isRecord(data.info) || !Array.isArray(data.item)) return false;
  const schema = asString(data.info.schema).toLowerCase();
  if (schema.includes('getpostman.com') || schema.includes('postman')) return true;
  if (typeof data.info._postman_id === 'string') return true;
  return typeof data.info.name === 'string';
}

export function isPostmanEnvironmentPayload(data: unknown): boolean {
  if (!isRecord(data)) return false;
  const scope = asString(data._postman_variable_scope).toLowerCase();
  if ((scope === 'environment' || scope === 'globals') && Array.isArray(data.values)) {
    return true;
  }
  return (
    typeof data.name === 'string' &&
    Array.isArray(data.values) &&
    !('item' in data) &&
    !('info' in data)
  );
}

function readPostmanAuthParams(section: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(section)) {
    for (const entry of section) {
      if (!isRecord(entry)) continue;
      const k = asString(entry.key).trim();
      if (k) out[k] = asString(entry.value);
    }
    return out;
  }
  if (isRecord(section)) {
    for (const [k, v] of Object.entries(section)) {
      out[k] = asString(v);
    }
  }
  return out;
}

function parsePostmanAuth(
  rawAuth: unknown,
  fallback: AuthConfig,
  warnings: string[],
  contextLabel: string,
): AuthConfig {
  if (!isRecord(rawAuth)) return fallback;
  const type = asString(rawAuth.type).trim().toLowerCase();
  if (!type) return fallback;

  if (type === 'noauth') {
    return { type: 'none' };
  }
  if (type === 'bearer') {
    const params = readPostmanAuthParams(rawAuth.bearer);
    return { type: 'bearer', token: params.token ?? '' };
  }
  if (type === 'basic') {
    const params = readPostmanAuthParams(rawAuth.basic);
    return {
      type: 'basic',
      username: params.username ?? '',
      password: params.password ?? '',
    };
  }
  if (type === 'apikey') {
    const params = readPostmanAuthParams(rawAuth.apikey);
    const inVal = (params.in ?? '').toLowerCase();
    return {
      type: 'apiKey',
      key: params.key || 'X-API-Key',
      value: params.value ?? '',
      addTo: inVal === 'query' ? 'query' : 'header',
    };
  }

  warnings.push(`Unsupported Postman auth type "${type}" on ${contextLabel} mapped to inherit/none.`);
  return fallback;
}

function parsePostmanVariables(raw: unknown): EnvironmentVariable[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .map((v) =>
      envVar(
        asString(v.key).trim(),
        asString(v.value),
        asString(v.type).toLowerCase() === 'secret',
        v.disabled !== true && v.enabled !== false,
      ),
    )
    .filter((v) => v.key.length > 0);
}

function parsePostmanUrl(rawUrl: unknown): { url: string; params: KeyValueItem[] } {
  if (typeof rawUrl === 'string') {
    const { baseUrl, queryParams } = splitUrlAndQuery(rawUrl);
    return { url: baseUrl, params: queryParams };
  }
  if (!isRecord(rawUrl)) {
    return { url: '', params: [] };
  }

  const rawString = asString(rawUrl.raw).trim();
  let baseUrl = '';
  let fallbackParams: KeyValueItem[] = [];

  if (rawString) {
    const split = splitUrlAndQuery(rawString);
    baseUrl = split.baseUrl;
    fallbackParams = split.queryParams;
  } else {
    const protocol = asString(rawUrl.protocol).trim();
    const hostRaw = rawUrl.host;
    const host = Array.isArray(hostRaw)
      ? hostRaw.map((h) => asString(h)).filter(Boolean).join('.')
      : asString(hostRaw).trim();
    const port = asString(rawUrl.port).trim();
    const pathRaw = rawUrl.path;
    const path = Array.isArray(pathRaw)
      ? pathRaw.map((p) => asString(p)).filter(Boolean).join('/')
      : asString(pathRaw).trim().replace(/^\/+/, '');

    const prefix = protocol ? `${protocol}://` : host ? 'https://' : '';
    const hostPart = port ? `${host}:${port}` : host;
    const combined = [prefix + hostPart, path].filter(Boolean).join('/');
    baseUrl = combined;
  }

  if (Array.isArray(rawUrl.query)) {
    const params = rawUrl.query
      .filter(isRecord)
      .map((q) => {
        const desc = isRecord(q.description)
          ? asString(q.description.content)
          : asString(q.description);
        return kv(asString(q.key), asString(q.value), q.disabled !== true, desc || undefined);
      })
      .filter((p) => p.key.length > 0 || p.value.length > 0);
    return { url: baseUrl, params };
  }

  return { url: baseUrl, params: fallbackParams };
}

function parsePostmanHeaders(rawHeaders: unknown): KeyValueItem[] {
  if (!Array.isArray(rawHeaders)) return [];
  return rawHeaders
    .filter(isRecord)
    .map((h) => {
      const desc = isRecord(h.description)
        ? asString(h.description.content)
        : asString(h.description);
      return kv(asString(h.key), asString(h.value), h.disabled !== true, desc || undefined);
    })
    .filter((h) => h.key.trim().length > 0 || h.value.length > 0);
}

function parsePostmanBody(
  rawBody: unknown,
  headers: KeyValueItem[],
  requestName: string,
  warnings: string[],
): {
  body: RequestBody;
  protocol: 'rest' | 'graphql';
  graphql: { query: string; variables: string };
} {
  const emptyGraphql = { query: '', variables: '{}' };
  if (!isRecord(rawBody)) {
    return { body: { mode: 'none' }, protocol: 'rest', graphql: emptyGraphql };
  }

  const mode = asString(rawBody.mode).trim().toLowerCase();
  if (!mode || mode === 'none') {
    return { body: { mode: 'none' }, protocol: 'rest', graphql: emptyGraphql };
  }

  if (mode === 'graphql') {
    const gql = isRecord(rawBody.graphql) ? rawBody.graphql : {};
    return {
      body: { mode: 'graphql' },
      protocol: 'graphql',
      graphql: {
        query: asString(gql.query),
        variables: normalizeGraphQLVariables(gql.variables),
      },
    };
  }

  if (mode === 'raw') {
    const content = asString(rawBody.raw);
    const options = isRecord(rawBody.options) && isRecord(rawBody.options.raw)
      ? asString(rawBody.options.raw.language)
      : undefined;
    const contentType = getHeaderValue(headers, 'Content-Type');
    const lang = inferRawBodyLanguage(options, contentType);
    if (lang === 'json') {
      return {
        body: { mode: 'json', content },
        protocol: 'rest',
        graphql: emptyGraphql,
      };
    }
    return {
      body: { mode: 'raw', language: lang, content },
      protocol: 'rest',
      graphql: emptyGraphql,
    };
  }

  if (mode === 'urlencoded') {
    const rawItems = Array.isArray(rawBody.urlencoded) ? rawBody.urlencoded : [];
    const items = rawItems
      .filter(isRecord)
      .map((item) => {
        const desc = isRecord(item.description)
          ? asString(item.description.content)
          : asString(item.description);
        return kv(asString(item.key), asString(item.value), item.disabled !== true, desc || undefined);
      })
      .filter((item) => item.key.length > 0 || item.value.length > 0);
    return {
      body: { mode: 'urlEncoded', items },
      protocol: 'rest',
      graphql: emptyGraphql,
    };
  }

  if (mode === 'formdata') {
    const rawItems = Array.isArray(rawBody.formdata) ? rawBody.formdata : [];
    const items: FormDataItem[] = rawItems
      .filter(isRecord)
      .map((item) => {
        const isFile = asString(item.type).toLowerCase() === 'file';
        const rawSrc = Array.isArray(item.src) ? asString(item.src[0]) : asString(item.src);
        const fileName = rawSrc ? rawSrc.split(/[/\\]/).pop() || rawSrc : undefined;
        return formItem({
          key: asString(item.key),
          value: isFile ? '' : asString(item.value),
          filePath: isFile && rawSrc ? rawSrc : undefined,
          fileName: isFile ? fileName : undefined,
          itemType: isFile ? 'file' : 'text',
          enabled: item.disabled !== true,
        });
      })
      .filter((item) => item.key.length > 0 || item.value.length > 0 || Boolean(item.filePath));
    return {
      body: { mode: 'formData', items },
      protocol: 'rest',
      graphql: emptyGraphql,
    };
  }

  if (mode === 'file') {
    warnings.push(
      `Postman binary file body on "${requestName}" was omitted (re-attach the file in RiftQL).`,
    );
  } else {
    warnings.push(`Unsupported Postman body mode "${mode}" on "${requestName}" mapped to none.`);
  }

  return { body: { mode: 'none' }, protocol: 'rest', graphql: emptyGraphql };
}

function parsePostmanRequestItem(
  node: Record<string, unknown>,
  warnings: string[],
): ParsedImportRequest {
  const name = asString(node.name).trim() || 'Untitled Request';
  const rawReq = node.request;

  if (typeof rawReq === 'string') {
    const { url, params } = parsePostmanUrl(rawReq);
    return {
      name,
      protocol: 'rest',
      method: 'GET',
      url,
      params,
      headers: [],
      auth: { type: 'inherit' },
      body: { mode: 'none' },
      graphql: { query: '', variables: '{}' },
      settings: {},
    };
  }

  const reqObj = isRecord(rawReq) ? rawReq : {};
  const headers = parsePostmanHeaders(reqObj.header);
  const { url, params } = parsePostmanUrl(reqObj.url);
  const auth = parsePostmanAuth(reqObj.auth, { type: 'inherit' }, warnings, `request "${name}"`);
  const { body, protocol, graphql } = parsePostmanBody(reqObj.body, headers, name, warnings);
  const method = protocol === 'graphql' ? 'POST' : normalizeHttpMethod(reqObj.method, 'GET');

  return {
    name,
    protocol,
    method,
    url,
    params,
    headers,
    auth,
    body,
    graphql,
    settings: {},
  };
}

function parsePostmanItems(
  itemsRaw: unknown,
  warnings: string[],
): { folders: ParsedImportFolder[]; requests: ParsedImportRequest[] } {
  const folders: ParsedImportFolder[] = [];
  const requests: ParsedImportRequest[] = [];
  if (!Array.isArray(itemsRaw)) return { folders, requests };

  for (const item of itemsRaw) {
    if (!isRecord(item)) continue;

    if (Array.isArray(item.item) && !('request' in item)) {
      const folderName = asString(item.name).trim() || 'Folder';
      const children = parsePostmanItems(item.item, warnings);
      folders.push({
        name: folderName,
        auth: parsePostmanAuth(item.auth, { type: 'inherit' }, warnings, `folder "${folderName}"`),
        folders: children.folders,
        requests: children.requests,
      });
    } else if ('request' in item) {
      requests.push(parsePostmanRequestItem(item, warnings));
    } else if (Array.isArray(item.item)) {
      const folderName = asString(item.name).trim() || 'Folder';
      const children = parsePostmanItems(item.item, warnings);
      folders.push({
        name: folderName,
        auth: parsePostmanAuth(item.auth, { type: 'inherit' }, warnings, `folder "${folderName}"`),
        folders: children.folders,
        requests: children.requests,
      });
    }
  }

  return { folders, requests };
}

export function parsePostmanCollection(data: unknown, fileName?: string): ImportParseResult {
  const doc = isRecord(data) ? data : {};
  const info = isRecord(doc.info) ? doc.info : {};
  const warnings: string[] = [];

  const colName =
    asString(info.name).trim() || fileName?.replace(/\.[^.]+$/, '') || 'Postman Collection';
  const descRaw = info.description;
  const description = isRecord(descRaw) ? asString(descRaw.content) : asString(descRaw);
  const auth = parsePostmanAuth(doc.auth, { type: 'none' }, warnings, `collection "${colName}"`);
  const variables = parsePostmanVariables(doc.variable);
  const { folders, requests } = parsePostmanItems(doc.item, warnings);

  const collection: ParsedImportCollection = buildParsedCollectionFallback({
    name: colName,
    description,
    auth,
    variables,
    folders,
    requests,
  });

  return {
    format: 'postman-collection',
    formatLabel: 'Postman Collection v2.1',
    sourceName: collection.name,
    collections: [collection],
    environments: [],
    warnings,
  };
}

export function parsePostmanEnvironment(data: unknown, fileName?: string): ImportParseResult {
  const doc = isRecord(data) ? data : {};
  const name =
    asString(doc.name).trim() || fileName?.replace(/\.[^.]+$/, '') || 'Postman Environment';
  const rawValues = Array.isArray(doc.values) ? doc.values.filter(isRecord) : [];

  const variables = rawValues
    .map((v) =>
      envVar(
        asString(v.key).trim(),
        asString(v.value),
        asString(v.type).toLowerCase() === 'secret',
        v.enabled !== false && v.disabled !== true,
      ),
    )
    .filter((v) => v.key.length > 0);

  const environment: ParsedImportEnvironment = {
    name,
    variables,
  };

  return {
    format: 'postman-environment',
    formatLabel: 'Postman Environment',
    sourceName: environment.name,
    collections: [],
    environments: [environment],
    warnings: [],
  };
}
