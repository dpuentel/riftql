import {
  buildClientSchema,
  getIntrospectionQuery,
  getNamedType,
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isObjectType,
  isScalarType,
  isUnionType,
  parse,
  print,
  type GraphQLDefaultInput,
  type GraphQLSchema,
  type IntrospectionQuery,
  type OperationDefinitionNode,
} from 'graphql';

export const INTROSPECTION_QUERY = getIntrospectionQuery({
  descriptions: true,
});

export interface GraphQLOperationItem {
  name?: string;
  operation: 'query' | 'mutation' | 'subscription';
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
