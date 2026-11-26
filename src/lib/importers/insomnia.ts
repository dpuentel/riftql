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

export function isInsomniaV4Payload(data: unknown): boolean {
  if (!isRecord(data)) return false;
  return data._type === 'export' && Array.isArray(data.resources);
}

function parseInsomniaAuth(rawAuth: unknown, warnings: string[], label: string): AuthConfig {
  if (!isRecord(rawAuth) || rawAuth.disabled === true) {
    return { type: 'inherit' };
  }
  const type = asString(rawAuth.type).trim().toLowerCase();
  if (!type || type === 'none') {
    return { type: 'inherit' };
  }
  if (type === 'bearer') {
    return {
      type: 'bearer',
      token: asString(rawAuth.token),
    };
  }
  if (type === 'basic') {
    return {
      type: 'basic',
      username: asString(rawAuth.username),
      password: asString(rawAuth.password),
    };
  }
  if (type === 'apikey') {
    return {
      type: 'apiKey',
      key: asString(rawAuth.key) || 'X-API-Key',
      value: asString(rawAuth.value),
      addTo: asString(rawAuth.addTo).toLowerCase() === 'query' ? 'query' : 'header',
    };
  }

  warnings.push(`Unsupported Insomnia auth type "${type}" on ${label} mapped to inherit.`);
  return { type: 'inherit' };
}

function parseInsomniaBody(
  rawBody: unknown,
  headers: KeyValueItem[],
  requestName: string,
  warnings: string[],
): {
  body: RequestBody;
  protocol: 'rest' | 'graphql';
  graphql: { query: string; variables: string; operationName?: string };
} {
  const emptyGraphql = { query: '', variables: '{}' };
  if (!isRecord(rawBody)) {
    return { body: { mode: 'none' }, protocol: 'rest', graphql: emptyGraphql };
  }

  const mimeType = asString(rawBody.mimeType).toLowerCase();
  const text = asString(rawBody.text);
  const rawParams = Array.isArray(rawBody.params) ? rawBody.params.filter(isRecord) : [];

  if (mimeType === 'application/graphql') {
    let query = text;
    let variables = '{}';
    let operationName: string | undefined;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (isRecord(parsed)) {
        query = asString(parsed.query);
        variables = normalizeGraphQLVariables(parsed.variables);
        const opName = asString(parsed.operationName).trim();
        if (opName) operationName = opName;
      }
    } catch {
      // Raw GraphQL query string inside Insomnia body.text
    }
    return {
      body: { mode: 'graphql' },
      protocol: 'graphql',
      graphql: { query, variables, ...(operationName ? { operationName } : {}) },
    };
  }

  if (mimeType.includes('x-www-form-urlencoded')) {
    const items = rawParams
      .map((p) =>
        kv(asString(p.name || p.key), asString(p.value), p.disabled !== true, asString(p.description) || undefined),
      )
      .filter((p) => p.key.length > 0 || p.value.length > 0);
    return { body: { mode: 'urlEncoded', items }, protocol: 'rest', graphql: emptyGraphql };
  }

  if (mimeType.includes('multipart/form-data')) {
    const items: FormDataItem[] = rawParams
      .map((p) => {
        const isFile = asString(p.type).toLowerCase() === 'file';
        const fileName = asString(p.fileName);
        return formItem({
          key: asString(p.name || p.key),
          value: isFile ? '' : asString(p.value),
          filePath: isFile && fileName ? fileName : undefined,
          fileName: isFile ? fileName.split(/[/\\]/).pop() || fileName : undefined,
          itemType: isFile ? 'file' : 'text',
          enabled: p.disabled !== true,
        });
      })
      .filter((item) => item.key.length > 0 || item.value.length > 0 || Boolean(item.filePath));
    return { body: { mode: 'formData', items }, protocol: 'rest', graphql: emptyGraphql };
  }

  if (mimeType === 'application/octet-stream' && asString(rawBody.fileName)) {
    warnings.push(
      `Binary file body on "${requestName}" was omitted (re-attach the file in RiftQL).`,
    );
    return { body: { mode: 'none' }, protocol: 'rest', graphql: emptyGraphql };
  }

  if (text.length > 0 || mimeType.includes('json')) {
    const contentType = mimeType || getHeaderValue(headers, 'Content-Type');
    const lang = inferRawBodyLanguage(undefined, contentType);
    if (lang === 'json') {
      return { body: { mode: 'json', content: text }, protocol: 'rest', graphql: emptyGraphql };
    }
    return {
      body: { mode: 'raw', language: lang, content: text },
      protocol: 'rest',
      graphql: emptyGraphql,
    };
  }

  return { body: { mode: 'none' }, protocol: 'rest', graphql: emptyGraphql };
}

function parseInsomniaRequest(raw: Record<string, unknown>, warnings: string[]): ParsedImportRequest {
  const name = asString(raw.name).trim() || 'Untitled Request';
  const { baseUrl, queryParams: urlQueryParams } = splitUrlAndQuery(asString(raw.url));

  const explicitParams: KeyValueItem[] = Array.isArray(raw.parameters)
    ? raw.parameters
        .filter(isRecord)
        .map((p) =>
          kv(asString(p.name || p.key), asString(p.value), p.disabled !== true, asString(p.description) || undefined),
        )
        .filter((p) => p.key.length > 0 || p.value.length > 0)
    : [];

  const params = explicitParams.length > 0 ? explicitParams : urlQueryParams;

  const headers: KeyValueItem[] = Array.isArray(raw.headers)
    ? raw.headers
        .filter(isRecord)
        .map((h) =>
          kv(asString(h.name || h.key), asString(h.value), h.disabled !== true, asString(h.description) || undefined),
        )
        .filter((h) => h.key.trim().length > 0 || h.value.length > 0)
    : [];

  const auth = parseInsomniaAuth(raw.authentication, warnings, `request "${name}"`);
  const { body, protocol, graphql } = parseInsomniaBody(raw.body, headers, name, warnings);
  const method = protocol === 'graphql' ? 'POST' : normalizeHttpMethod(raw.method, 'GET');

  return {
    name,
    protocol,
    method,
    url: baseUrl,
    params,
    headers,
    auth,
    body,
    graphql,
    settings: {},
  };
}

function sortByMetaSortKey(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const ak = typeof a.metaSortKey === 'number' ? a.metaSortKey : 0;
  const bk = typeof b.metaSortKey === 'number' ? b.metaSortKey : 0;
  return ak - bk;
}

export function parseInsomniaV4(data: unknown, fileName?: string): ImportParseResult {
  const doc = isRecord(data) ? data : {};
  const resources = Array.isArray(doc.resources) ? doc.resources.filter(isRecord) : [];
  const warnings: string[] = [];

  const workspaces = resources.filter((r) => r._type === 'workspace');
  const groups = resources.filter((r) => r._type === 'request_group').sort(sortByMetaSortKey);
  const requests = resources.filter((r) => r._type === 'request').sort(sortByMetaSortKey);
  const envResources = resources.filter((r) => r._type === 'environment');

  const workspaceIds = new Set(workspaces.map((w) => asString(w._id)));

  const buildFolderNode = (group: Record<string, unknown>): ParsedImportFolder => {
    const id = asString(group._id);
    const childGroups = groups.filter((g) => asString(g.parentId) === id);
    const childReqs = requests.filter((r) => asString(r.parentId) === id);
    return {
      name: asString(group.name).trim() || 'Folder',
      auth: { type: 'inherit' },
      folders: childGroups.map(buildFolderNode),
      requests: childReqs.map((r) => parseInsomniaRequest(r, warnings)),
    };
  };

  const collections: ParsedImportCollection[] = [];

  if (workspaces.length > 0) {
    for (const ws of workspaces) {
      const wsId = asString(ws._id);
      const topGroups = groups.filter((g) => asString(g.parentId) === wsId);
      const topReqs = requests.filter((r) => asString(r.parentId) === wsId);

      // Attach any groups whose parent is unknown to the first workspace so requests aren't dropped
      const extraGroups =
        workspaces.indexOf(ws) === 0
          ? groups.filter(
              (g) =>
                !workspaceIds.has(asString(g.parentId)) &&
                !groups.some((p) => asString(p._id) === asString(g.parentId)),
            )
          : [];
      const extraReqs =
        workspaces.indexOf(ws) === 0
          ? requests.filter(
              (r) =>
                !workspaceIds.has(asString(r.parentId)) &&
                !groups.some((p) => asString(p._id) === asString(r.parentId)),
            )
          : [];

      collections.push(
        buildParsedCollectionFallback({
          name: asString(ws.name).trim() || fileName?.replace(/\.[^.]+$/, '') || 'Insomnia Workspace',
          description: asString(ws.description),
          auth: { type: 'none' },
          folders: [...topGroups, ...extraGroups].map(buildFolderNode),
          requests: [...topReqs, ...extraReqs].map((r) => parseInsomniaRequest(r, warnings)),
        }),
      );
    }
  } else if (groups.length > 0 || requests.length > 0) {
    const rootGroups = groups.filter(
      (g) => !groups.some((p) => asString(p._id) === asString(g.parentId)),
    );
    const rootReqs = requests.filter(
      (r) => !groups.some((p) => asString(p._id) === asString(r.parentId)),
    );
    collections.push(
      buildParsedCollectionFallback({
        name: fileName?.replace(/\.[^.]+$/, '') || 'Insomnia Export',
        auth: { type: 'none' },
        folders: rootGroups.map(buildFolderNode),
        requests: rootReqs.map((r) => parseInsomniaRequest(r, warnings)),
      }),
    );
  }

  const environments: ParsedImportEnvironment[] = [];
  for (const envRes of envResources) {
    const envData = isRecord(envRes.data) ? envRes.data : {};
    const entries = Object.entries(envData).filter(([key]) => key.trim().length > 0);
    if (entries.length === 0) continue;

    environments.push({
      name: asString(envRes.name).trim() || 'Insomnia Environment',
      variables: entries.map(([key, val]) =>
        envVar(key, typeof val === 'string' ? val : JSON.stringify(val), Boolean(envRes.isPrivate), true),
      ),
    });
  }

  const sourceName =
    collections[0]?.name ||
    environments[0]?.name ||
    fileName?.replace(/\.[^.]+$/, '') ||
    'Insomnia Export';

  return {
    format: 'insomnia-v4',
    formatLabel: 'Insomnia v4 Export',
    sourceName,
    collections,
    environments,
    warnings,
  };
}
