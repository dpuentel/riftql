import { buildSchema, graphqlSync } from 'graphql';
import { describe, expect, it } from 'vitest';
import {
  AUTO_DISCOVERED_FOLDER_NAME,
  INTROSPECTION_QUERY,
  appendOperationToDocument,
  buildOperationFromField,
  buildSchemaFromIntrospection,
  collectDescendantFolderIds,
  discoverSchemaOperations,
  extractCoveredRootFields,
  extractOperations,
  extractSchemaSummary,
  formatGraphQL,
  mergeVariablesJson,
} from '@/lib/graphql';
import type { FolderRecord, SavedRequestRecord } from '@/types/storage';

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

  it('builds formatted operations with selection sets, args, unions, and cycle protection', () => {
    const richSchema = buildSchema(`
      enum Role {
        ADMIN
        MEMBER
      }
      input CreateUserInput {
        name: String!
        role: Role!
      }
      type Profile {
        bio: String
      }
      type Node {
        id: ID!
        label: String!
        parent: Node
        profile: Profile
      }
      type Bot {
        id: ID!
        handle: String!
      }
      union Actor = Node | Bot
      type Query {
        node(id: ID!): Node
        actor: Actor
        health: Boolean!
      }
      type Mutation {
        createUser(input: CreateUserInput!): Node!
      }
    `);

    const nodeOp = buildOperationFromField(richSchema, 'query', 'node');
    expect(nodeOp.operationName).toBe('Node');
    expect(nodeOp.operationText).toContain('query Node($id: ID!)');
    expect(nodeOp.operationText).toContain('node(id: $id)');
    expect(nodeOp.operationText).toContain('profile {');
    // Self-referential Node.parent must not infinitely recurse
    expect(nodeOp.operationText).not.toContain('parent {');
    expect(nodeOp.variables).toEqual({ id: '' });

    const mutOp = buildOperationFromField(richSchema, 'mutation', 'createUser');
    expect(mutOp.operationName).toBe('CreateUser');
    expect(mutOp.operationText).toContain('mutation CreateUser($input: CreateUserInput!)');
    expect(mutOp.variables).toEqual({ input: { name: '', role: 'ADMIN' } });

    const unionOp = buildOperationFromField(richSchema, 'query', 'actor');
    expect(unionOp.operationText).toContain('... on Node');
    expect(unionOp.operationText).toContain('... on Bot');

    const scalarOp = buildOperationFromField(richSchema, 'query', 'health');
    expect(scalarOp.operationText.replace(/\s+/g, ' ').trim()).toBe('query Health { health }');
    expect(scalarOp.variables).toEqual({});
  });

  it('appends operations cleanly without name collisions and merges variables', () => {
    const first = {
      operationName: 'User',
      operationText: 'query User($id: ID!) {\n  user(id: $id) {\n    id\n  }\n}',
      variables: { id: '' },
    };

    const replacedEmpty = appendOperationToDocument('query {\n  \n}', first);
    expect(replacedEmpty).toEqual({
      query: first.operationText,
      operationName: 'User',
    });

    const appended = appendOperationToDocument(replacedEmpty.query, first);
    expect(appended.operationName).toBe('User2');
    expect(appended.query).toContain('query User($id: ID!)');
    expect(appended.query).toContain('query User2($id: ID!)');

    const mergedVars = mergeVariablesJson('{"id":"42"}', { id: '', includeInactive: false });
    expect(JSON.parse(mergedVars)).toEqual({ id: '42', includeInactive: false });
  });

  it('extracts root Query/Mutation fields through fragments and discovers missing schema operations', () => {
    const schema = buildSchema(sdl);

    // Handles inline fragments, fragment spreads, and cycle guard
    const fields = extractCoveredRootFields(`
      fragment UserFields on Query { user(id: "1") { id name } ...Cycle }
      fragment Cycle on Query { ...UserFields }
      query RenamedProfileQuery {
        ...UserFields
        ... on Query { __typename }
      }
    `);
    expect(fields).toEqual([{ kind: 'query', fieldName: 'user' }]);

    const existingReqs: SavedRequestRecord[] = [
      {
        id: 'req-renamed',
        collectionId: 'col-1',
        folderId: 'fld-sub',
        name: 'Perfil de usuario', // Renamed by user! Still covers `query:user`
        protocol: 'graphql',
        method: 'POST',
        url: '',
        params: [],
        headers: [],
        auth: { type: 'inherit' },
        body: { mode: 'graphql' },
        graphql: {
          query: 'query CustomProfile { user(id: "1") { id } }',
          variables: '{}',
        },
        settings: {},
        sortOrder: 0,
        createdAt: '',
        updatedAt: '',
      },
    ];

    const discovered = discoverSchemaOperations(schema, existingReqs);
    expect(AUTO_DISCOVERED_FOLDER_NAME).toBe('AUTO-DISCOVERED');
    expect(discovered.find((o) => o.key === 'query:user')).toMatchObject({
      alreadyExists: true,
      existingRequestNames: ['Perfil de usuario'],
    });
    expect(discovered.find((o) => o.key === 'query:users')?.alreadyExists).toBe(false);
    expect(discovered.find((o) => o.key === 'mutation:renameUser')?.alreadyExists).toBe(false);

    const folders: FolderRecord[] = [
      { id: 'f1', collectionId: 'col-1', name: 'Root', auth: { type: 'inherit' }, sortOrder: 0, createdAt: '', updatedAt: '' },
      { id: 'f2', collectionId: 'col-1', parentId: 'f1', name: 'Child', auth: { type: 'inherit' }, sortOrder: 0, createdAt: '', updatedAt: '' },
      { id: 'f3', collectionId: 'col-2', name: 'Other', auth: { type: 'inherit' }, sortOrder: 0, createdAt: '', updatedAt: '' },
    ];
    expect(Array.from(collectDescendantFolderIds(folders, 'col-1', 'f1')).sort()).toEqual(['f1', 'f2']);
  });
});
