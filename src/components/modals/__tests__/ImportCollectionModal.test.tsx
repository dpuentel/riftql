import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportCollectionModal } from '@/components/modals/ImportCollectionModal';
import { setTauriBridgeAdapter } from '@/lib/tauri';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

describe('ImportCollectionModal', () => {
  beforeEach(() => {
    setTauriBridgeAdapter(null);
    useWorkspaceStore.setState({
      collections: [
        {
          id: 'col-existing',
          name: 'Existing Workspace API',
          description: '',
          baseUrl: '',
          auth: { type: 'none' },
          variables: [],
          sortOrder: 0,
          createdAt: '',
          updatedAt: '',
        },
      ],
      folders: [
        {
          id: 'fld-existing',
          collectionId: 'col-existing',
          name: 'GraphQL Endpoints',
          baseUrl: '',
          auth: { type: 'inherit' },
          sortOrder: 0,
          createdAt: '',
          updatedAt: '',
        },
      ],
      savedRequests: [
        {
          id: 'req-keep',
          collectionId: 'col-existing',
          folderId: 'fld-existing',
          name: 'Existing Query',
          protocol: 'rest',
          method: 'GET',
          url: 'https://existing.test/keep',
          params: [],
          headers: [],
          auth: { type: 'inherit' },
          body: { mode: 'none' },
          graphql: { query: '', variables: '{}' },
          settings: {},
          sortOrder: 0,
          createdAt: '',
          updatedAt: '',
        },
      ],
      environments: [
        {
          id: 'global-1',
          name: 'Global',
          isGlobal: true,
          variables: [{ id: 'g1', key: 'org', value: 'riftql', isSecret: false, enabled: true }],
          createdAt: '',
          updatedAt: '',
        },
      ],
      history: [],
      cookies: [],
      isLoaded: true,
    });
  });

  it('auto-detects Postman v2.1 JSON, previews counts, and imports into a new collection', async () => {
    const user = userEvent.setup();
    const onImported = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ImportCollectionModal
        open
        onOpenChange={onOpenChange}
        onImported={onImported}
      />,
    );

    const postmanPayload = {
      info: {
        name: 'Orders API',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: [
        {
          name: 'Orders',
          item: [
            {
              name: 'List Orders',
              request: { method: 'GET', url: 'https://orders.test/orders' },
            },
            {
              name: 'Create Order',
              request: { method: 'POST', url: 'https://orders.test/orders' },
            },
          ],
        },
      ],
    };

    const textarea = screen.getByLabelText('Import JSON content');
    fireEvent.change(textarea, { target: { value: JSON.stringify(postmanPayload) } });

    expect(screen.getByText('Postman Collection v2.1')).toBeInTheDocument();
    expect(screen.getByText('1 folders')).toBeInTheDocument();
    expect(screen.getByText('2 requests')).toBeInTheDocument();

    const nameInput = screen.getByLabelText('New collection name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Orders Service v2');

    await user.click(screen.getByRole('button', { name: /^import$/i }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    const state = useWorkspaceStore.getState();
    expect(state.collections.map((c) => c.name)).toEqual([
      'Existing Workspace API',
      'Orders Service v2',
    ]);
    expect(state.savedRequests.some((r) => r.name === 'List Orders')).toBe(true);
    expect(state.savedRequests.some((r) => r.name === 'Create Order')).toBe(true);
    expect(onImported).toHaveBeenCalledWith(expect.stringMatching(/Orders Service v2/));
  });

  it('imports Altair .agq/.agc into an existing collection and folder without overwriting existing requests', async () => {
    const user = userEvent.setup();
    const onImported = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ImportCollectionModal
        open
        onOpenChange={onOpenChange}
        initialTargetCollectionId="col-existing"
        initialTargetFolderId="fld-existing"
        onImported={onImported}
      />,
    );

    const altairQuery = {
      version: 1,
      type: 'window',
      windowName: 'Introspect Schema',
      apiUrl: 'https://gql.example.com/graphql',
      query: 'query { __schema { queryType { name } } }',
      variables: '{}',
    };

    const textarea = screen.getByLabelText('Import JSON content');
    fireEvent.change(textarea, { target: { value: JSON.stringify(altairQuery) } });

    expect(screen.getByText('Altair GraphQL Query (.agq)')).toBeInTheDocument();

    // Pre-targeted into Existing Collection + GraphQL Endpoints folder with wrapInSubfolder defaulted to false for single query
    await user.click(screen.getByRole('button', { name: /^import$/i }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    const state = useWorkspaceStore.getState();
    expect(state.collections).toHaveLength(1);
    const inTargetFolder = state.savedRequests.filter(
      (r) => r.collectionId === 'col-existing' && r.folderId === 'fld-existing',
    );
    expect(inTargetFolder.map((r) => r.name)).toEqual(['Existing Query', 'Introspect Schema']);
    expect(inTargetFolder[1].protocol).toBe('graphql');
  });

  it('imports Postman Environment files while keeping existing Global variables untouched', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(<ImportCollectionModal open onOpenChange={onOpenChange} />);

    const pmEnv = {
      name: 'Staging Env',
      _postman_variable_scope: 'environment',
      values: [
        { key: 'apiKey', value: 'secret-999', type: 'secret', enabled: true },
      ],
    };

    fireEvent.change(screen.getByLabelText('Import JSON content'), {
      target: { value: JSON.stringify(pmEnv) },
    });

    expect(screen.getByText('Postman Environment')).toBeInTheDocument();
    expect(screen.getByText(/Staging Env \(1 vars\)/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^import$/i }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    const envs = useWorkspaceStore.getState().environments;
    expect(envs).toHaveLength(2);
    expect(envs.find((e) => e.isGlobal)?.variables[0].value).toBe('riftql');
    expect(envs.find((e) => !e.isGlobal && e.name === 'Staging Env')?.variables[0]).toMatchObject({
      key: 'apiKey',
      value: 'secret-999',
      isSecret: true,
    });
  });

  it('displays validation errors for malformed JSON or YAML OpenAPI specs', () => {
    render(<ImportCollectionModal open onOpenChange={vi.fn()} />);

    const textarea = screen.getByLabelText('Import JSON content');
    fireEvent.change(textarea, { target: { value: 'openapi: 3.0.3\ninfo:\n  title: BadYaml' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/convert the spec to JSON/i);

    fireEvent.change(textarea, { target: { value: '{broken json' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/Invalid JSON content/i);
  });
});
