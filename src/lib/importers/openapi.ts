import {
  asString,
  buildParsedCollectionFallback,
  formItem,
  isRecord,
  kv,
  normalizeHttpMethod,
} from '@/lib/importers/helpers';
import type {
  ImportParseResult,
  ParsedImportCollection,
  ParsedImportFolder,
  ParsedImportRequest,
} from '@/lib/importers/types';
import type { AuthConfig, FormDataItem, KeyValueItem, RequestBody } from '@/types/api';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;

export function isOpenApi3Payload(data: unknown): boolean {
  return isRecord(data) && typeof data.openapi === 'string' && /^3\./.test(data.openapi.trim());
}

export function isSwagger2Payload(data: unknown): boolean {
  return isRecord(data) && typeof data.swagger === 'string' && data.swagger.trim() === '2.0';
}

function unescapeJsonPointerSegment(seg: string): string {
  return seg.replace(/~1/g, '/').replace(/~0/g, '~');
}

function resolvePointer(root: Record<string, unknown>, ref: string): unknown {
  if (!ref.startsWith('#/')) return undefined;
  const parts = ref.slice(2).split('/').map(unescapeJsonPointerSegment);
  let cursor: unknown = root;
  for (const part of parts) {
    if (!isRecord(cursor) && !Array.isArray(cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

function derefObject(
  root: Record<string, unknown>,
  raw: unknown,
  visited = new Set<string>(),
): Record<string, unknown> | undefined {
  if (!isRecord(raw)) return undefined;
  const ref = asString(raw.$ref).trim();
  if (!ref) return raw;
  if (visited.has(ref)) return undefined;
  const target = resolvePointer(root, ref);
  if (!isRecord(target)) return raw;
  const nextVisited = new Set(visited).add(ref);
  const resolvedTarget = derefObject(root, target, nextVisited) ?? target;
  // Preserve sibling overrides (OpenAPI 3.1 allows sibling keys next to $ref)
  return { ...resolvedTarget, ...raw, $ref: undefined };
}

function synthesizeExampleFromSchema(
  root: Record<string, unknown>,
  rawSchema: unknown,
  depth = 0,
  visitedRefs = new Set<string>(),
): unknown {
  if (depth > 6 || !isRecord(rawSchema)) return null;

  const ref = asString(rawSchema.$ref).trim();
  let schema = rawSchema;
  let nextVisited = visitedRefs;
  if (ref) {
    if (visitedRefs.has(ref)) return {};
    const resolved = derefObject(root, rawSchema, visitedRefs);
    if (!resolved) return {};
    schema = resolved;
    nextVisited = new Set(visitedRefs).add(ref);
  }

  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length > 0) return schema.examples[0];
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];

  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    const merged: Record<string, unknown> = {};
    for (const branch of schema.allOf) {
      const part = synthesizeExampleFromSchema(root, branch, depth + 1, nextVisited);
      if (isRecord(part)) {
        Object.assign(merged, part);
      }
    }
    if (Object.keys(merged).length > 0) return merged;
  }

  const composite = Array.isArray(schema.oneOf)
    ? schema.oneOf
    : Array.isArray(schema.anyOf)
      ? schema.anyOf
      : undefined;
  if (composite && composite.length > 0) {
    const nonNull = composite.find((c) => !isRecord(c) || c.type !== 'null') ?? composite[0];
    return synthesizeExampleFromSchema(root, nonNull, depth + 1, nextVisited);
  }

  const rawType = Array.isArray(schema.type)
    ? schema.type.find((t) => t !== 'null')
    : schema.type;
  const schemaType = asString(rawType).toLowerCase();

  if (schemaType === 'object' || isRecord(schema.properties)) {
    const out: Record<string, unknown> = {};
    if (isRecord(schema.properties)) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        out[propName] = synthesizeExampleFromSchema(root, propSchema, depth + 1, nextVisited);
      }
    }
    return out;
  }

  if (schemaType === 'array') {
    if (!schema.items) return [];
    return [synthesizeExampleFromSchema(root, schema.items, depth + 1, nextVisited)];
  }

  if (schemaType === 'integer' || schemaType === 'number') return 0;
  if (schemaType === 'boolean') return false;

  if (schemaType === 'string' || !schemaType) {
    const fmt = asString(schema.format).toLowerCase();
    if (fmt === 'email') return 'user@example.com';
    if (fmt === 'uuid') return '00000000-0000-0000-0000-000000000000';
    if (fmt === 'date-time') return '2026-01-01T00:00:00Z';
    if (fmt === 'date') return '2026-01-01';
    if (fmt === 'uri' || fmt === 'url') return 'https://example.com';
    return schemaType === 'string' ? 'string' : null;
  }

  return null;
}

function extractOpenApiBaseUrl(doc: Record<string, unknown>, isSwagger2: boolean): string {
  if (!isSwagger2) {
    const servers = Array.isArray(doc.servers) ? doc.servers.filter(isRecord) : [];
    const firstServer = servers[0];
    if (!firstServer) return '';
    let rawUrl = asString(firstServer.url).trim();
    if (!rawUrl) return '';
    const vars = isRecord(firstServer.variables) ? firstServer.variables : undefined;
    rawUrl = rawUrl.replace(/\{([^}]+)\}/g, (_match, name: string) => {
      if (vars && isRecord(vars[name])) {
        const defVal = asString(vars[name].default).trim();
        if (defVal) return defVal;
        if (Array.isArray(vars[name].enum) && vars[name].enum.length > 0) {
          return asString(vars[name].enum[0]);
        }
      }
      return `{{${name}}}`;
    });
    return rawUrl.replace(/\/+$/, '');
  }

  const host = asString(doc.host).trim();
  const basePath = asString(doc.basePath).trim();
  const schemes = Array.isArray(doc.schemes) ? doc.schemes.map((s) => asString(s)).filter(Boolean) : [];
  const scheme = schemes.includes('https') ? 'https' : schemes[0] || 'https';

  if (host) {
    const cleanBase = basePath === '/' ? '' : basePath.replace(/\/+$/, '');
    return `${scheme}://${host}${cleanBase}`;
  }
  return basePath === '/' ? '' : basePath.replace(/\/+$/, '');
}

function resolveSecuritySchemes(
  doc: Record<string, unknown>,
  isSwagger2: boolean,
): Record<string, Record<string, unknown>> {
  const rawMap = isSwagger2
    ? doc.securityDefinitions
    : isRecord(doc.components)
      ? doc.components.securitySchemes
      : undefined;
  if (!isRecord(rawMap)) return {};
  const out: Record<string, Record<string, unknown>> = {};
  for (const [k, v] of Object.entries(rawMap)) {
    const resolved = derefObject(doc, v);
    if (resolved) out[k] = resolved;
  }
  return out;
}

function schemeToAuthConfig(
  scheme: Record<string, unknown>,
  schemeName: string,
  warnings: string[],
): AuthConfig | null {
  const type = asString(scheme.type).toLowerCase();
  if (type === 'http') {
    const httpScheme = asString(scheme.scheme).toLowerCase();
    if (httpScheme === 'bearer') {
      return { type: 'bearer', token: '{{bearer_token}}' };
    }
    if (httpScheme === 'basic') {
      return { type: 'basic', username: '{{username}}', password: '{{password}}' };
    }
  }
  if (type === 'basic') {
    return { type: 'basic', username: '{{username}}', password: '{{password}}' };
  }
  if (type === 'apikey') {
    return {
      type: 'apiKey',
      key: asString(scheme.name).trim() || 'X-API-Key',
      value: '{{api_key}}',
      addTo: asString(scheme.in).toLowerCase() === 'query' ? 'query' : 'header',
    };
  }
  if (type === 'oauth2' || type === 'openidconnect') {
    warnings.push(
      `Security scheme "${schemeName}" (${type}) was not mapped automatically; configure Bearer/Auth manually.`,
    );
  }
  return null;
}

function resolveDefaultCollectionAuth(
  doc: Record<string, unknown>,
  schemes: Record<string, Record<string, unknown>>,
  warnings: string[],
): AuthConfig {
  const topSec = Array.isArray(doc.security) ? doc.security.filter(isRecord) : [];
  for (const req of topSec) {
    for (const schemeName of Object.keys(req)) {
      const scheme = schemes[schemeName];
      if (!scheme) continue;
      const mapped = schemeToAuthConfig(scheme, schemeName, warnings);
      if (mapped) return mapped;
    }
  }
  for (const [schemeName, scheme] of Object.entries(schemes)) {
    const mapped = schemeToAuthConfig(scheme, schemeName, warnings);
    if (mapped) return mapped;
  }
  return { type: 'none' };
}

function extractParamExampleValue(root: Record<string, unknown>, param: Record<string, unknown>): string {
  if (param.example !== undefined) return asString(param.example);
  if (param.default !== undefined) return asString(param.default);
  if (isRecord(param.schema)) {
    const schema = derefObject(root, param.schema) ?? param.schema;
    if (schema.example !== undefined) return asString(schema.example);
    if (schema.default !== undefined) return asString(schema.default);
    if (Array.isArray(schema.enum) && schema.enum.length > 0) return asString(schema.enum[0]);
  }
  if (Array.isArray(param.enum) && param.enum.length > 0) return asString(param.enum[0]);
  return '';
}

function buildOpenApi3Body(
  root: Record<string, unknown>,
  rawRequestBody: unknown,
  headers: KeyValueItem[],
): RequestBody {
  const bodyObj = derefObject(root, rawRequestBody);
  if (!bodyObj || !isRecord(bodyObj.content)) return { mode: 'none' };

  const content = bodyObj.content;
  const entries = Object.entries(content).filter(([, v]) => isRecord(v)) as Array<
    [string, Record<string, unknown>]
  >;
  if (entries.length === 0) return { mode: 'none' };

  const jsonEntry =
    entries.find(([ct]) => ct.toLowerCase() === 'application/json') ??
    entries.find(([ct]) => ct.toLowerCase().includes('json'));
  if (jsonEntry) {
    const [mediaType, mediaObj] = jsonEntry;
    let exampleVal: unknown = mediaObj.example;
    if (exampleVal === undefined && isRecord(mediaObj.examples)) {
      const firstEx = Object.values(mediaObj.examples)[0];
      if (isRecord(firstEx) && firstEx.value !== undefined) {
        exampleVal = firstEx.value;
      }
    }
    if (exampleVal === undefined && mediaObj.schema) {
      exampleVal = synthesizeExampleFromSchema(root, mediaObj.schema);
    }
    if (!headers.some((h) => h.key.toLowerCase() === 'content-type')) {
      headers.push(kv('Content-Type', mediaType, true));
    }
    return {
      mode: 'json',
      content:
        exampleVal === undefined
          ? '{}'
          : typeof exampleVal === 'string'
            ? exampleVal
            : JSON.stringify(exampleVal, null, 2),
    };
  }

  const urlEncodedEntry = entries.find(([ct]) => ct.toLowerCase().includes('x-www-form-urlencoded'));
  if (urlEncodedEntry) {
    const [, mediaObj] = urlEncodedEntry;
    const sample = mediaObj.schema ? synthesizeExampleFromSchema(root, mediaObj.schema) : {};
    const items = isRecord(sample)
      ? Object.entries(sample).map(([k, v]) => kv(k, typeof v === 'string' ? v : JSON.stringify(v), true))
      : [];
    return { mode: 'urlEncoded', items };
  }

  const formEntry = entries.find(([ct]) => ct.toLowerCase().includes('multipart/form-data'));
  if (formEntry) {
    const [, mediaObj] = formEntry;
    const schema = isRecord(mediaObj.schema) ? derefObject(root, mediaObj.schema) ?? mediaObj.schema : {};
    const props = isRecord(schema.properties) ? schema.properties : {};
    const items: FormDataItem[] = Object.entries(props).map(([k, propSchema]) => {
      const resolvedProp = derefObject(root, propSchema);
      const isBinary =
        isRecord(resolvedProp) &&
        (asString(resolvedProp.format).toLowerCase() === 'binary' ||
          asString(resolvedProp.type).toLowerCase() === 'file');
      return formItem({
        key: k,
        value: isBinary
          ? ''
          : asString(synthesizeExampleFromSchema(root, resolvedProp ?? propSchema) ?? ''),
        itemType: isBinary ? 'file' : 'text',
        enabled: true,
      });
    });
    return { mode: 'formData', items };
  }

  const [firstCt, firstMedia] = entries[0];
  const lowerCt = firstCt.toLowerCase();
  const sample =
    firstMedia.example !== undefined
      ? firstMedia.example
      : firstMedia.schema
        ? synthesizeExampleFromSchema(root, firstMedia.schema)
        : '';
  const contentStr = typeof sample === 'string' ? sample : JSON.stringify(sample, null, 2);
  const language = lowerCt.includes('xml')
    ? 'xml'
    : lowerCt.includes('html')
      ? 'html'
      : 'text';
  return { mode: 'raw', language, content: contentStr };
}

function buildSwagger2Body(
  root: Record<string, unknown>,
  params: Array<Record<string, unknown>>,
  headers: KeyValueItem[],
): RequestBody {
  const bodyParam = params.find((p) => asString(p.in).toLowerCase() === 'body');
  if (bodyParam && bodyParam.schema) {
    const example = synthesizeExampleFromSchema(root, bodyParam.schema);
    if (!headers.some((h) => h.key.toLowerCase() === 'content-type')) {
      headers.push(kv('Content-Type', 'application/json', true));
    }
    return {
      mode: 'json',
      content: typeof example === 'string' ? example : JSON.stringify(example ?? {}, null, 2),
    };
  }

  const formParams = params.filter((p) => asString(p.in).toLowerCase() === 'formdata');
  if (formParams.length > 0) {
    const hasFile = formParams.some((p) => asString(p.type).toLowerCase() === 'file');
    if (hasFile) {
      return {
        mode: 'formData',
        items: formParams.map((p) => {
          const isFile = asString(p.type).toLowerCase() === 'file';
          return formItem({
            key: asString(p.name),
            value: isFile ? '' : extractParamExampleValue(root, p),
            itemType: isFile ? 'file' : 'text',
            enabled: p.required !== false,
          });
        }),
      };
    }
    return {
      mode: 'urlEncoded',
      items: formParams.map((p) =>
        kv(asString(p.name), extractParamExampleValue(root, p), Boolean(p.required), asString(p.description) || undefined),
      ),
    };
  }

  return { mode: 'none' };
}

export function parseOpenApiSpec(data: unknown, fileName?: string): ImportParseResult {
  const doc = isRecord(data) ? data : {};
  const isSwagger2 = isSwagger2Payload(doc);
  const warnings: string[] = [];

  const info = isRecord(doc.info) ? doc.info : {};
  const title =
    asString(info.title).trim() ||
    fileName?.replace(/\.[^.]+$/, '') ||
    (isSwagger2 ? 'Swagger 2.0 API' : 'OpenAPI 3.x API');
  const description = asString(info.description);
  const baseUrl = extractOpenApiBaseUrl(doc, isSwagger2);
  const schemes = resolveSecuritySchemes(doc, isSwagger2);
  const collectionAuth = resolveDefaultCollectionAuth(doc, schemes, warnings);

  const foldersByName = new Map<string, ParsedImportFolder>();
  const orderedFolders: ParsedImportFolder[] = [];
  const rootRequests: ParsedImportRequest[] = [];

  // Pre-seed tag descriptions/order if spec declares top-level tags
  if (Array.isArray(doc.tags)) {
    for (const tagItem of doc.tags) {
      if (!isRecord(tagItem)) continue;
      const tagName = asString(tagItem.name).trim();
      if (tagName && !foldersByName.has(tagName)) {
        const folder: ParsedImportFolder = {
          name: tagName,
          auth: { type: 'inherit' },
          folders: [],
          requests: [],
        };
        foldersByName.set(tagName, folder);
        orderedFolders.push(folder);
      }
    }
  }

  const paths = isRecord(doc.paths) ? doc.paths : {};
  for (const [rawPath, rawPathItem] of Object.entries(paths)) {
    const pathItem = derefObject(doc, rawPathItem);
    if (!pathItem) continue;

    const normalizedPath = rawPath.replace(/\{([^}]+)\}/g, '{{$1}}');
    const pathLevelParams = Array.isArray(pathItem.parameters)
      ? pathItem.parameters
          .map((p) => derefObject(doc, p))
          .filter((p): p is Record<string, unknown> => Boolean(p))
      : [];

    for (const methodKey of HTTP_METHODS) {
      const op = pathItem[methodKey];
      if (!isRecord(op)) continue;

      const opParams = Array.isArray(op.parameters)
        ? op.parameters
            .map((p) => derefObject(doc, p))
            .filter((p): p is Record<string, unknown> => Boolean(p))
        : [];

      // Merge path-level + operation-level params by `in:name`
      const paramMap = new Map<string, Record<string, unknown>>();
      for (const p of [...pathLevelParams, ...opParams]) {
        const key = `${asString(p.in).toLowerCase()}:${asString(p.name)}`;
        paramMap.set(key, p);
      }
      const mergedParams = Array.from(paramMap.values());

      const queryParams: KeyValueItem[] = [];
      const headers: KeyValueItem[] = [];

      for (const p of mergedParams) {
        const location = asString(p.in).toLowerCase();
        const name = asString(p.name).trim();
        if (!name) continue;
        const exampleVal = extractParamExampleValue(doc, p);
        const desc = asString(p.description) || undefined;
        const enabled = Boolean(p.required) || exampleVal.length > 0;
        if (location === 'query') {
          queryParams.push(kv(name, exampleVal, enabled, desc));
        } else if (location === 'header') {
          headers.push(kv(name, exampleVal, enabled, desc));
        }
      }

      const body = isSwagger2
        ? buildSwagger2Body(doc, mergedParams, headers)
        : buildOpenApi3Body(doc, op.requestBody, headers);

      const opSecurity = Array.isArray(op.security) ? op.security : undefined;
      const reqAuth: AuthConfig =
        opSecurity && opSecurity.length === 0 ? { type: 'none' } : { type: 'inherit' };

      const reqName =
        asString(op.summary).trim() ||
        asString(op.operationId).trim() ||
        `${methodKey.toUpperCase()} ${rawPath}`;

      const parsedReq: ParsedImportRequest = {
        name: reqName,
        protocol: 'rest',
        method: normalizeHttpMethod(methodKey),
        url: normalizedPath,
        params: queryParams,
        headers,
        auth: reqAuth,
        body,
        graphql: { query: '', variables: '{}' },
        settings: {},
      };

      const firstTag = Array.isArray(op.tags) ? asString(op.tags[0]).trim() : '';
      if (firstTag) {
        let folder = foldersByName.get(firstTag);
        if (!folder) {
          folder = {
            name: firstTag,
            auth: { type: 'inherit' },
            folders: [],
            requests: [],
          };
          foldersByName.set(firstTag, folder);
          orderedFolders.push(folder);
        }
        folder.requests.push(parsedReq);
      } else {
        rootRequests.push(parsedReq);
      }
    }
  }

  // Drop empty pre-declared tag folders that had no operations
  const nonEmptyFolders = orderedFolders.filter(
    (f) => f.requests.length > 0 || f.folders.length > 0,
  );

  const collection: ParsedImportCollection = buildParsedCollectionFallback({
    name: title,
    description,
    baseUrl,
    auth: collectionAuth,
    variables: [],
    folders: nonEmptyFolders,
    requests: rootRequests,
  });

  return {
    format: isSwagger2 ? 'swagger-2' : 'openapi-3',
    formatLabel: isSwagger2 ? 'Swagger 2.0' : 'OpenAPI 3.x',
    sourceName: collection.name,
    collections: [collection],
    environments: [],
    warnings,
  };
}
