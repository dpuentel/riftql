import {
  isAltairCollectionPayload,
  isAltairEnvironmentPayload,
  isAltairQueryPayload,
  parseAltairCollection,
  parseAltairEnvironment,
  parseAltairQuery,
} from '@/lib/importers/altair';
import {
  asString,
  buildParsedCollectionFallback,
  envVar,
  isRecord,
} from '@/lib/importers/helpers';
import { isInsomniaV4Payload, parseInsomniaV4 } from '@/lib/importers/insomnia';
import {
  isOpenApi3Payload,
  isSwagger2Payload,
  parseOpenApiSpec,
} from '@/lib/importers/openapi';
import {
  isPostmanCollectionPayload,
  isPostmanEnvironmentPayload,
  parsePostmanCollection,
  parsePostmanEnvironment,
} from '@/lib/importers/postman';
import type {
  ImportParseResult,
  ImportSourceFormat,
  ParsedImportCollection,
  ParsedImportFolder,
  ParsedImportRequest,
} from '@/lib/importers/types';
import type { FolderRecord, SavedRequestRecord, WorkspaceExport } from '@/types/storage';

export * from '@/lib/importers/types';
export { buildWorkspaceExportFromImport, countImportStats } from '@/lib/importers/helpers';

export function isRiftqlWorkspacePayload(data: unknown): data is WorkspaceExport {
  return (
    isRecord(data) &&
    data.version === 1 &&
    Array.isArray(data.collections) &&
    Array.isArray(data.savedRequests)
  );
}

function parseRiftqlWorkspace(data: WorkspaceExport): ImportParseResult {
  const folders = Array.isArray(data.folders) ? data.folders : [];
  const savedRequests = Array.isArray(data.savedRequests) ? data.savedRequests : [];

  const toParsedReq = (req: SavedRequestRecord): ParsedImportRequest => ({
    name: req.name,
    protocol: req.protocol,
    method: req.method,
    url: req.url,
    params: req.params ?? [],
    headers: req.headers ?? [],
    auth: req.auth ?? { type: 'inherit' },
    body: req.body ?? { mode: 'none' },
    graphql: req.graphql ?? { query: '', variables: '{}' },
    settings: req.settings ?? {},
  });

  const buildFolder = (folder: FolderRecord): ParsedImportFolder => {
    const childFolders = folders.filter(
      (f) => f.collectionId === folder.collectionId && f.parentId === folder.id,
    );
    const childRequests = savedRequests.filter(
      (r) => r.collectionId === folder.collectionId && r.folderId === folder.id,
    );
    return {
      name: folder.name,
      baseUrl: folder.baseUrl,
      auth: folder.auth ?? { type: 'inherit' },
      folders: childFolders.map(buildFolder),
      requests: childRequests.map(toParsedReq),
    };
  };

  const collections: ParsedImportCollection[] = data.collections.map((col) =>
    buildParsedCollectionFallback({
      name: col.name,
      description: col.description ?? '',
      baseUrl: col.baseUrl,
      auth: col.auth ?? { type: 'none' },
      variables: col.variables ?? [],
      folders: folders
        .filter((f) => f.collectionId === col.id && !f.parentId)
        .map(buildFolder),
      requests: savedRequests
        .filter((r) => r.collectionId === col.id && !r.folderId)
        .map(toParsedReq),
    }),
  );

  const environments = (Array.isArray(data.environments) ? data.environments : [])
    .filter((env) => !env.isGlobal || (env.variables?.length ?? 0) > 0)
    .map((env) => ({
      name: env.isGlobal ? 'Imported Global Variables' : env.name,
      variables: (env.variables ?? []).map((v) =>
        envVar(asString(v.key), asString(v.value), Boolean(v.isSecret), v.enabled !== false),
      ),
    }));

  return {
    format: 'riftql-workspace',
    formatLabel: 'RiftQL Workspace JSON',
    sourceName:
      collections.length === 1
        ? collections[0].name
        : collections.length > 1
          ? `${collections.length} Collections`
          : environments[0]?.name || 'RiftQL Workspace',
    collections,
    environments,
    warnings: [],
  };
}

export function detectImportFormat(data: unknown): ImportSourceFormat | null {
  if (isPostmanCollectionPayload(data)) return 'postman-collection';
  if (isPostmanEnvironmentPayload(data)) return 'postman-environment';
  if (isInsomniaV4Payload(data)) return 'insomnia-v4';
  if (isOpenApi3Payload(data)) return 'openapi-3';
  if (isSwagger2Payload(data)) return 'swagger-2';
  if (isAltairCollectionPayload(data)) return 'altair-collection';
  if (isAltairQueryPayload(data)) return 'altair-query';
  if (isAltairEnvironmentPayload(data)) return 'altair-environment';
  if (isRiftqlWorkspacePayload(data)) return 'riftql-workspace';
  return null;
}

function looksLikeYamlSpec(trimmedText: string, fileName?: string): boolean {
  if (fileName && /\.(ya?ml)$/i.test(fileName.trim())) return true;
  return /^(openapi|swagger)\s*:/im.test(trimmedText);
}

/**
 * Parses an external collection, environment, or API spec JSON string into a normalized
 * import tree. Supports Altair (.agq / .agc / .agx), Postman v2.x & Environments,
 * Insomnia v4, OpenAPI 3.x / Swagger 2.0, and RiftQL Workspace JSON.
 */
export function parseImportText(rawText: string, fileName?: string): ImportParseResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error('Paste JSON or choose a file to import.');
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(trimmed) as unknown;
  } catch {
    if (looksLikeYamlSpec(trimmed, fileName)) {
      throw new Error(
        'YAML OpenAPI/Swagger specs are not parsed directly yet. Export or convert the spec to JSON (.json) and try again.',
      );
    }
    throw new Error(
      'Invalid JSON content. Supported files: Postman v2.x (.json), Altair (.agq/.agc/.agx), Insomnia v4 (.json), OpenAPI/Swagger (.json), or RiftQL export (.json).',
    );
  }

  const format = detectImportFormat(parsedJson);
  if (!format) {
    throw new Error(
      'Unrecognized import format. Supported formats: Postman Collection/Environment, Altair (.agq/.agc/.agx), Insomnia v4, OpenAPI 3.x / Swagger 2.0, or RiftQL Workspace.',
    );
  }

  switch (format) {
    case 'postman-collection':
      return parsePostmanCollection(parsedJson, fileName);
    case 'postman-environment':
      return parsePostmanEnvironment(parsedJson, fileName);
    case 'altair-collection':
      return parseAltairCollection(parsedJson, fileName);
    case 'altair-query':
      return parseAltairQuery(parsedJson, fileName);
    case 'altair-environment':
      return parseAltairEnvironment(parsedJson, fileName);
    case 'insomnia-v4':
      return parseInsomniaV4(parsedJson, fileName);
    case 'openapi-3':
    case 'swagger-2':
      return parseOpenApiSpec(parsedJson, fileName);
    case 'riftql-workspace':
      return parseRiftqlWorkspace(parsedJson as WorkspaceExport);
  }
}
