import {
  buildClientSchema,
  getIntrospectionQuery,
  getNamedType,
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
  isUnionType,
  Kind,
  parse,
  print,
  type FragmentDefinitionNode,
  type GraphQLDefaultInput,
  type GraphQLInputType,
  type GraphQLOutputType,
  type GraphQLSchema,
  type IntrospectionQuery,
  type OperationDefinitionNode,
  type SelectionSetNode,
} from 'graphql';
import type { FolderRecord, SavedRequestRecord } from '@/types/storage';

export const AUTO_DISCOVERED_FOLDER_NAME = 'AUTO-DISCOVERED';

export interface CoveredRootField {
  kind: 'query' | 'mutation';
  fieldName: string;
}

export interface DiscoveredGraphQLOperation {
  key: string;
  kind: 'query' | 'mutation';
  fieldName: string;
  operationName: string;
  description?: string;
  isDeprecated: boolean;
  argsCount: number;
  alreadyExists: boolean;
  existingRequestNames: string[];
}

export const INTROSPECTION_QUERY = getIntrospectionQuery({
  descriptions: true,
});

export type GraphQLRootOperationKind = 'query' | 'mutation' | 'subscription';

export interface GraphQLOperationItem {
  name?: string;
  operation: GraphQLRootOperationKind;
}

export interface SchemaArgDoc {
  name: string;
  type: string;
  defaultValue?: string;
  description?: string;
}

export interface SchemaFieldDoc {
  name: string;
  type: string;
  namedType: string;
  description?: string;
  isDeprecated: boolean;
  deprecationReason?: string;
  args: SchemaArgDoc[];
}

export interface SchemaTypeDoc {
  name: string;
  kind: 'OBJECT' | 'INPUT' | 'INTERFACE' | 'UNION' | 'ENUM' | 'SCALAR';
  description?: string;
  fields: SchemaFieldDoc[];
  enumValues: Array<{ name: string; description?: string; deprecationReason?: string }>;
  possibleTypes: string[];
}

export interface SchemaSummary {
  queryTypeName?: string;
  mutationTypeName?: string;
  subscriptionTypeName?: string;
  types: SchemaTypeDoc[];
}

export interface GeneratedOperationResult {
  operationName: string;
  operationText: string;
  variables: Record<string, unknown>;
}

export function buildSchemaFromIntrospection(payload: unknown): GraphQLSchema {
  let obj: Record<string, unknown>;
  if (typeof payload === 'string') {
    obj = JSON.parse(payload) as Record<string, unknown>;
  } else if (payload && typeof payload === 'object') {
    obj = payload as Record<string, unknown>;
  } else {
    throw new Error('Introspection response is empty or invalid JSON');
  }

  if (Array.isArray(obj.errors) && obj.errors.length > 0 && !obj.data) {
    const first = obj.errors[0] as { message?: string };
    throw new Error(first?.message || 'GraphQL introspection returned errors');
  }

  const data = (obj.data ?? obj) as Record<string, unknown>;
  if (!data || !('__schema' in data) || !data.__schema) {
    throw new Error('Introspection payload does not contain data.__schema');
  }

  return buildClientSchema(data as unknown as IntrospectionQuery);
}

export function extractOperations(querySource: string): GraphQLOperationItem[] {
  if (!querySource.trim()) return [];
  try {
    const doc = parse(querySource);
    return doc.definitions
      .filter(
        (def): def is OperationDefinitionNode => def.kind === 'OperationDefinition',
      )
      .map((op) => ({
        name: op.name?.value,
        operation: op.operation,
      }));
  } catch {
    return [];
  }
}

export function formatGraphQL(source: string): string {
  if (!source.trim()) return source;
  const ast = parse(source);
  return print(ast);
}

export function formatVariablesJson(raw: string): string {
  if (!raw.trim()) return '{}';
  return JSON.stringify(JSON.parse(raw), null, 2);
}

function formatDefaultInput(def?: GraphQLDefaultInput): string | undefined {
  if (!def) return undefined;
  if ('literal' in def && def.literal) {
    return print(def.literal);
  }
  if ('value' in def && def.value !== undefined) {
    return JSON.stringify(def.value);
  }
  return undefined;
}

export function extractSchemaSummary(schema: GraphQLSchema): SchemaSummary {
  const typeMap = schema.getTypeMap();
  const types: SchemaTypeDoc[] = [];

  for (const [name, gqlType] of Object.entries(typeMap)) {
    if (name.startsWith('__')) continue;

    if (isObjectType(gqlType) || isInterfaceType(gqlType)) {
      const rawFields = gqlType.getFields();
      const fields: SchemaFieldDoc[] = Object.values(rawFields).map((f) => ({
        name: f.name,
        type: f.type.toString(),
        namedType: getNamedType(f.type).name,
        description: f.description ?? undefined,
        isDeprecated: Boolean(f.deprecationReason),
        deprecationReason: f.deprecationReason ?? undefined,
        args: f.args.map((a) => ({
          name: a.name,
          type: a.type.toString(),
          defaultValue: formatDefaultInput(a.default),
          description: a.description ?? undefined,
        })),
      }));

      types.push({
        name,
        kind: isObjectType(gqlType) ? 'OBJECT' : 'INTERFACE',
        description: gqlType.description ?? undefined,
        fields,
        enumValues: [],
        possibleTypes: isInterfaceType(gqlType)
          ? schema.getPossibleTypes(gqlType).map((t) => t.name)
          : [],
      });
    } else if (isInputObjectType(gqlType)) {
      const rawFields = gqlType.getFields();
      const fields: SchemaFieldDoc[] = Object.values(rawFields).map((f) => ({
        name: f.name,
        type: f.type.toString(),
        namedType: getNamedType(f.type).name,
        description: f.description ?? undefined,
        isDeprecated: Boolean(f.deprecationReason),
        deprecationReason: f.deprecationReason ?? undefined,
        args: [],
      }));

      types.push({
        name,
        kind: 'INPUT',
        description: gqlType.description ?? undefined,
        fields,
        enumValues: [],
        possibleTypes: [],
      });
    } else if (isEnumType(gqlType)) {
      types.push({
        name,
        kind: 'ENUM',
        description: gqlType.description ?? undefined,
        fields: [],
        enumValues: gqlType.getValues().map((v) => ({
          name: v.name,
          description: v.description ?? undefined,
          deprecationReason: v.deprecationReason ?? undefined,
        })),
        possibleTypes: [],
      });
    } else if (isUnionType(gqlType)) {
      types.push({
        name,
        kind: 'UNION',
        description: gqlType.description ?? undefined,
        fields: [],
        enumValues: [],
        possibleTypes: gqlType.getTypes().map((t) => t.name),
      });
    } else if (isScalarType(gqlType)) {
      types.push({
        name,
        kind: 'SCALAR',
        description: gqlType.description ?? undefined,
        fields: [],
        enumValues: [],
        possibleTypes: [],
      });
    }
  }

  types.sort((a, b) => a.name.localeCompare(b.name));

  return {
    queryTypeName: schema.getQueryType()?.name,
    mutationTypeName: schema.getMutationType()?.name,
    subscriptionTypeName: schema.getSubscriptionType()?.name,
    types,
  };
}

function toOperationName(fieldName: string): string {
  const parts = fieldName
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .split('_')
    .filter(Boolean);
  if (parts.length === 0) return 'Operation';
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

function buildDefaultValueForInputType(
  inputType: GraphQLInputType,
  visited = new Set<string>(),
): unknown {
  if (isNonNullType(inputType)) {
    return buildDefaultValueForInputType(inputType.ofType, visited);
  }
  if (isListType(inputType)) {
    return [buildDefaultValueForInputType(inputType.ofType, visited)];
  }
  if (isScalarType(inputType)) {
    switch (inputType.name) {
      case 'Int':
      case 'Float':
        return 0;
      case 'Boolean':
        return false;
      default:
        return '';
    }
  }
  if (isEnumType(inputType)) {
    return inputType.getValues()[0]?.name ?? '';
  }
  if (isInputObjectType(inputType)) {
    if (visited.has(inputType.name)) return {};
    const nextVisited = new Set(visited).add(inputType.name);
    const out: Record<string, unknown> = {};
    const fields = Object.values(inputType.getFields());
    const required = fields.filter((f) => isNonNullType(f.type));
    const optional = fields.filter((f) => !isNonNullType(f.type));
    const chosen = required.length > 0 ? [...required, ...optional.slice(0, 4)] : fields.slice(0, 6);
    for (const f of chosen) {
      if (f.default && 'value' in f.default && f.default.value !== undefined) {
        out[f.name] = f.default.value;
      } else {
        out[f.name] = buildDefaultValueForInputType(f.type, nextVisited);
      }
    }
    return out;
  }
  return null;
}

function buildLeafSelectionSet(
  gqlType: GraphQLOutputType,
): string {
  const named = getNamedType(gqlType);
  if (!isObjectType(named) && !isInterfaceType(named)) return '';
  const leaves = Object.values(named.getFields())
    .filter((f) => !f.name.startsWith('__'))
    .filter((f) => !f.args.some((a) => isNonNullType(a.type) && a.default === undefined))
    .filter((f) => {
      const child = getNamedType(f.type);
      return isScalarType(child) || isEnumType(child);
    })
    .map((f) => f.name);

  if (leaves.length === 0) return '{ __typename }';
  return `{ ${leaves.join(' ')} }`;
}

function buildSelectionSet(
  outputType: GraphQLOutputType,
  schema: GraphQLSchema,
  depth: number,
  maxDepth: number,
  ancestry: Set<string>,
): string {
  const named = getNamedType(outputType);
  if (isScalarType(named) || isEnumType(named)) {
    return '';
  }

  if (isUnionType(named)) {
    const fragments = ['__typename'];
    for (const pt of schema.getPossibleTypes(named)) {
      const leaf = buildLeafSelectionSet(pt);
      fragments.push(`... on ${pt.name} ${leaf}`);
    }
    return `{ ${fragments.join(' ')} }`;
  }

  if (isObjectType(named) || isInterfaceType(named)) {
    const nextAncestry = new Set(ancestry).add(named.name);
    const selections: string[] = [];

    for (const field of Object.values(named.getFields())) {
      if (field.name.startsWith('__')) continue;
      if (field.args.some((a) => isNonNullType(a.type) && a.default === undefined)) {
        continue;
      }
      const childNamed = getNamedType(field.type);
      if (isScalarType(childNamed) || isEnumType(childNamed)) {
        selections.push(field.name);
      } else if (depth < maxDepth && !nextAncestry.has(childNamed.name)) {
        const sub = buildSelectionSet(field.type, schema, depth + 1, maxDepth, nextAncestry);
        if (sub) {
          selections.push(`${field.name} ${sub}`);
        }
      }
    }

    if (selections.length === 0) {
      return '{ __typename }';
    }
    return `{ ${selections.join(' ')} }`;
  }

  return '';
}

/**
 * Generates a formatted GraphQL operation and starter JSON variables from a root field.
 */
export function buildOperationFromField(
  schema: GraphQLSchema,
  operationKind: GraphQLRootOperationKind,
  fieldName: string,
  options?: { maxDepth?: number },
): GeneratedOperationResult {
  const rootType =
    operationKind === 'query'
      ? schema.getQueryType()
      : operationKind === 'mutation'
        ? schema.getMutationType()
        : schema.getSubscriptionType();

  if (!rootType) {
    throw new Error(`Schema does not define a ${operationKind} root type`);
  }

  const field = rootType.getFields()[fieldName];
  if (!field) {
    throw new Error(`Field "${fieldName}" does not exist on ${rootType.name}`);
  }

  const operationName = toOperationName(fieldName);
  const variables: Record<string, unknown> = {};
  const varDefs: string[] = [];
  const callArgs: string[] = [];

  for (const arg of field.args) {
    varDefs.push(`$${arg.name}: ${arg.type.toString()}`);
    callArgs.push(`${arg.name}: $${arg.name}`);
    if (arg.default && 'value' in arg.default && arg.default.value !== undefined) {
      variables[arg.name] = arg.default.value;
    } else {
      variables[arg.name] = buildDefaultValueForInputType(arg.type);
    }
  }

  const maxDepth = options?.maxDepth ?? 2;
  const selectionSet = buildSelectionSet(
    field.type,
    schema,
    1,
    maxDepth,
    new Set([rootType.name]),
  );

  const varSection = varDefs.length > 0 ? `(${varDefs.join(', ')})` : '';
  const argSection = callArgs.length > 0 ? `(${callArgs.join(', ')})` : '';
  const selSection = selectionSet ? ` ${selectionSet}` : '';

  const raw = `${operationKind} ${operationName}${varSection} { ${field.name}${argSection}${selSection} }`;
  const operationText = formatGraphQL(raw);

  return {
    operationName,
    operationText,
    variables,
  };
}

/**
 * Inserts a generated GraphQL operation into an existing query document, replacing empty/default
 * boilerplate or appending cleanly with a deduplicated operation name.
 */
export function appendOperationToDocument(
  existingQuery: string,
  generated: GeneratedOperationResult,
): { query: string; operationName: string } {
  const trimmed = existingQuery.trim();
  const isDefaultStarter = /^query\s*\{\s*\}$/.test(trimmed);
  if (!trimmed || isDefaultStarter) {
    return {
      query: generated.operationText,
      operationName: generated.operationName,
    };
  }

  const existingNames = new Set(
    extractOperations(existingQuery)
      .map((op) => op.name)
      .filter((n): n is string => Boolean(n)),
  );

  let nextName = generated.operationName;
  if (existingNames.has(nextName)) {
    let idx = 2;
    while (existingNames.has(`${generated.operationName}${idx}`)) {
      idx += 1;
    }
    nextName = `${generated.operationName}${idx}`;
  }

  const renamedText =
    nextName === generated.operationName
      ? generated.operationText
      : generated.operationText.replace(
          new RegExp(`^(query|mutation|subscription)\\s+${generated.operationName}\\b`),
          `$1 ${nextName}`,
        );

  return {
    query: `${existingQuery.trimEnd()}\n\n${renamedText}`,
    operationName: nextName,
  };
}

/**
 * Merges incoming starter variable values into existing JSON variables without clobbering
 * user-edited values.
 */
export function mergeVariablesJson(
  existingVariablesJson: string,
  incoming: Record<string, unknown>,
): string {
  const incomingKeys = Object.keys(incoming);
  if (incomingKeys.length === 0) {
    return existingVariablesJson.trim() ? existingVariablesJson : '{}';
  }

  let base: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(existingVariablesJson || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      base = parsed as Record<string, unknown>;
    }
  } catch {
    base = {};
  }

  const merged: Record<string, unknown> = { ...base };
  for (const key of incomingKeys) {
    if (!(key in merged)) {
      merged[key] = incoming[key];
    }
  }

  return JSON.stringify(merged, null, 2);
}

function collectSelectionRootFields(
  selectionSet: SelectionSetNode | undefined,
  fragments: Map<string, FragmentDefinitionNode>,
  visitedFragments: Set<string>,
  out: Set<string>,
): void {
  if (!selectionSet) return;
  for (const sel of selectionSet.selections) {
    if (sel.kind === Kind.FIELD) {
      if (!sel.name.value.startsWith('__')) {
        out.add(sel.name.value);
      }
    } else if (sel.kind === Kind.INLINE_FRAGMENT) {
      collectSelectionRootFields(sel.selectionSet, fragments, visitedFragments, out);
    } else if (sel.kind === Kind.FRAGMENT_SPREAD) {
      const fragName = sel.name.value;
      if (visitedFragments.has(fragName)) continue;
      const frag = fragments.get(fragName);
      if (!frag) continue;
      const nextVisited = new Set(visitedFragments).add(fragName);
      collectSelectionRootFields(frag.selectionSet, fragments, nextVisited, out);
    }
  }
}

/**
 * Extracts all root Query/Mutation field names invoked by a GraphQL document,
 * resolving root inline fragments and fragment spreads while ignoring introspection fields.
 */
export function extractCoveredRootFields(querySource: string): CoveredRootField[] {
  if (!querySource.trim()) return [];
  try {
    const doc = parse(querySource);
    const fragments = new Map<string, FragmentDefinitionNode>();
    for (const def of doc.definitions) {
      if (def.kind === Kind.FRAGMENT_DEFINITION) {
        fragments.set(def.name.value, def);
      }
    }

    const covered: CoveredRootField[] = [];
    const seenKeys = new Set<string>();
    for (const def of doc.definitions) {
      if (def.kind !== Kind.OPERATION_DEFINITION) continue;
      if (def.operation !== 'query' && def.operation !== 'mutation') continue;
      const rootFields = new Set<string>();
      collectSelectionRootFields(def.selectionSet, fragments, new Set(), rootFields);
      for (const fieldName of rootFields) {
        const key = `${def.operation}:${fieldName}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          covered.push({ kind: def.operation, fieldName });
        }
      }
    }
    return covered;
  } catch {
    return [];
  }
}

/**
 * Collects all folder IDs within a collection subtree (`!rootFolderId` = entire collection).
 */
export function collectDescendantFolderIds(
  folders: FolderRecord[],
  collectionId: string,
  rootFolderId?: string,
): Set<string> {
  const result = new Set<string>();
  if (!rootFolderId) {
    for (const folder of folders) {
      if (folder.collectionId === collectionId) {
        result.add(folder.id);
      }
    }
    return result;
  }

  result.add(rootFolderId);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (
        folder.collectionId === collectionId &&
        folder.parentId &&
        result.has(folder.parentId) &&
        !result.has(folder.id)
      ) {
        result.add(folder.id);
        changed = true;
      }
    }
  }
  return result;
}

/**
 * Compares all root Queries and Mutations in a GraphQL schema against existing GraphQL requests
 * in a collection/folder subtree using AST inspection (independent of request titles).
 */
export function discoverSchemaOperations(
  schema: GraphQLSchema,
  existingRequests: SavedRequestRecord[],
): DiscoveredGraphQLOperation[] {
  const coveredMap = new Map<string, Set<string>>();

  for (const req of existingRequests) {
    if (req.protocol !== 'graphql' && req.body.mode !== 'graphql') continue;
    const fields = extractCoveredRootFields(req.graphql.query);
    for (const f of fields) {
      const key = `${f.kind}:${f.fieldName}`;
      let names = coveredMap.get(key);
      if (!names) {
        names = new Set<string>();
        coveredMap.set(key, names);
      }
      names.add(req.name);
    }
  }

  const out: DiscoveredGraphQLOperation[] = [];
  const collectKind = (kind: 'query' | 'mutation', rootType: ReturnType<GraphQLSchema['getQueryType']>) => {
    if (!rootType) return;
    const fields = Object.values(rootType.getFields()).sort((a, b) => a.name.localeCompare(b.name));
    for (const field of fields) {
      if (field.name.startsWith('__')) continue;
      const key = `${kind}:${field.name}`;
      const existingNames = Array.from(coveredMap.get(key) ?? []);
      out.push({
        key,
        kind,
        fieldName: field.name,
        operationName: toOperationName(field.name),
        description: field.description ?? undefined,
        isDeprecated: Boolean(field.deprecationReason),
        argsCount: field.args.length,
        alreadyExists: existingNames.length > 0,
        existingRequestNames: existingNames,
      });
    }
  };

  collectKind('query', schema.getQueryType());
  collectKind('mutation', schema.getMutationType());
  return out;
}
