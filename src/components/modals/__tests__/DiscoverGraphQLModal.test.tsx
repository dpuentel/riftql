import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildSchema, graphqlSync } from 'graphql';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscoverGraphQLModal } from '@/components/modals/DiscoverGraphQLModal';
import { AUTO_DISCOVERED_FOLDER_NAME, INTROSPECTION_QUERY } from '@/lib/graphql';
import { setTauriBridgeAdapter } from '@/lib/tauri';
import { useSchemaStore } from '@/store/useSchemaStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

const TEST_SDL = `
  type User {
    id: ID!
    email: String!
  }
  type Query {
    viewer: User!
    user(id: ID!): User
  }
  type Mutation {
    createUser(email: String!): User!
  }
`;

describe('DiscoverGraphQLModal', () => {
  beforeEach(() => {
    useSchemaStore.setState({ byEndpoint: {} });
    useWorkspaceStore.setState({
      collections: [
        {
          id: 'col-gql',
          name: 'Identity Service',
          description: '',
          baseUrl: 'https://identity.test/graphql',
          auth: { type: 'bearer', token: 'col-jwt' },
          variables: [],
          sortOrder: 0,
          createdAt: '',
          updatedAt: '',
        },
      ],
      folders: [
        {
          id: 'fld-users',
          collectionId: 'col-gql',
          name: 'Users',
          baseUrl: '',
          auth: { type: 'inherit' },
          sortOrder: 0,
          createdAt: '',
          updatedAt: '',
        },
      ],
      savedRequests: [
        {
          id: 'req-existing',
          collectionId: 'col-gql',
          folderId: 'fld-users',
          name: 'Mi Perfil',
          protocol: 'graphql',
          method: 'POST',
          url: '',
          params: [],
          headers: [],
          auth: { type: 'inherit' },
          body: { mode: 'graphql' },
          graphql: {
            query: 'query ExistingViewer { viewer { id email } }',
            variables: '{}',
          },
          settings: {},
          sortOrder: 0,
          createdAt: '',
          updatedAt: '',
        },
      ],
      environments: [
        { id: 'g1', name: 'Global', isGlobal: true, variables: [], createdAt: '', updatedAt: '' },
      ],
      history: [],
      cookies: [],
      isLoaded: true,
    });

    const schema = buildSchema(TEST_SDL);
    const intro = graphqlSync({ schema, source: INTROSPECTION_QUERY });

    setTauriBridgeAdapter({
      invoke: async <T,>(cmd: string) => {
        if (cmd === 'send_http_request_cmd') {
          return {
            responseId: 'resp-1',
            status: 200,
            statusText: 'OK',
            durationMs: 12,
            sizeBytes: 1024,
            finalUrl: 'https://identity.test/graphql',
            redirectCount: 0,
            headers: [],
            cookies: [],
            bodyKind: 'text',
            bodyText: JSON.stringify(intro),
            truncated: false,
          } as T;
        }
        throw new Error(`Tauri runtime unavailable for command "${cmd}"`);
      },
      openFile: vi.fn(async () => null),
      saveFile: vi.fn(async () => null),
    });
  });

  it('introspects schema, marks existing AST-covered operations, and generates missing ones in AUTO-DISCOVERED', async () => {
    const user = userEvent.setup();
    const onGenerated = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <DiscoverGraphQLModal
        open
        onOpenChange={onOpenChange}
        collectionId="col-gql"
        onGenerated={onGenerated}
      />,
    );

    expect(await screen.findByText('2 new')).toBeInTheDocument();
    expect(screen.getByText('1 already covered')).toBeInTheDocument();
    expect(screen.getByText(/Covered \(Mi Perfil\)/)).toBeInTheDocument();

    // Generate Selected should pre-select only the 2 missing operations (`user` query + `createUser` mutation)
    const generateBtn = screen.getByRole('button', { name: /generate selected \(2\)/i });
    await user.click(generateBtn);

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    const state = useWorkspaceStore.getState();
    const autoFolder = state.folders.find(
      (f) => f.collectionId === 'col-gql' && !f.parentId && f.name === AUTO_DISCOVERED_FOLDER_NAME,
    );
    expect(autoFolder).toBeDefined();

    const generatedReqs = state.savedRequests.filter((r) => r.folderId === autoFolder!.id);
    expect(generatedReqs.map((r) => r.name)).toEqual(['user', 'createUser']);
    expect(generatedReqs[0]).toMatchObject({
      protocol: 'graphql',
      method: 'POST',
      url: '',
      auth: { type: 'inherit' },
    });
    expect(generatedReqs[0].graphql.query).toContain('query User($id: ID!)');
    expect(onGenerated).toHaveBeenCalledWith(expect.stringContaining(AUTO_DISCOVERED_FOLDER_NAME));
  });
});
