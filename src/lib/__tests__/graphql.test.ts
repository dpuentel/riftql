import { buildSchema, graphqlSync } from 'graphql';
import { describe, expect, it } from 'vitest';
import {
  INTROSPECTION_QUERY,
  buildSchemaFromIntrospection,
  extractOperations,
  extractSchemaSummary,
  formatGraphQL,
} from '@/lib/graphql';

describe('GraphQL utilities', () => {
  const sdl = `
    enum Role {
      ADMIN
      MEMBER
    }
    type User {
      id: ID!
      name: String!
      role: Role!
      legacyCode: String @deprecated(reason: "Use id instead")
    }
    type Query {
      user(id: ID!, includeInactive: Boolean = false): User
      users: [User!]!
    }
    type Mutation {
      renameUser(id: ID!, name: String!): User!
    }
  `;

  it('builds GraphQLSchema from introspection response JSON and extracts docs summary', () => {
    const sourceSchema = buildSchema(sdl);
    const intro = graphqlSync({ schema: sourceSchema, source: INTROSPECTION_QUERY });
    const clientSchema = buildSchemaFromIntrospection(JSON.stringify(intro));
    const summary = extractSchemaSummary(clientSchema);

    expect(summary.queryTypeName).toBe('Query');
    expect(summary.mutationTypeName).toBe('Mutation');
    const userType = summary.types.find((t) => t.name === 'User');
    expect(userType).toBeDefined();
    expect(userType?.fields.find((f) => f.name === 'legacyCode')?.isDeprecated).toBe(true);

    const queryType = summary.types.find((t) => t.name === 'Query');
    const userField = queryType?.fields.find((f) => f.name === 'user');
    expect(userField?.args).toHaveLength(2);
    expect(userField?.args[1]).toMatchObject({ name: 'includeInactive', defaultValue: 'false' });
  });

  it('extracts multiple named operations and tolerates incomplete syntax while typing', () => {
    const ops = extractOperations(`
      query GetUsers { users { id } }
      mutation Rename($id: ID!, $name: String!) { renameUser(id: $id, name: $name) { id } }
    `);
    expect(ops).toEqual([
      { name: 'GetUsers', operation: 'query' },
      { name: 'Rename', operation: 'mutation' },
    ]);

    expect(extractOperations('query Broken {')).toEqual([]);
  });

  it('formats GraphQL queries cleanly', () => {
    const formatted = formatGraphQL('query  GetUser($id:ID!){user(id:$id){id name}}');
    expect(formatted).toContain('query GetUser($id: ID!)');
    expect(formatted).toContain('user(id: $id)');
  });
});
