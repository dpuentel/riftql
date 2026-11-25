import { beforeEach, describe, expect, it } from 'vitest';
import { setTauriBridgeAdapter } from '@/lib/tauri';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

describe('useWorkspaceStore', () => {
  beforeEach(() => {
    setTauriBridgeAdapter(null);
    useWorkspaceStore.setState({
      collections: [],
      folders: [],
      savedRequests: [],
      environments: [
        {
          id: 'global-1',
          name: 'Global',
          isGlobal: true,
          variables: [
            { id: 'v1', key: 'secret_k', value: 'top-secret', isSecret: true, enabled: true },
          ],
          createdAt: '',
          updatedAt: '',
        },
      ],
      history: [],
      cookies: [],
      isLoaded: true,
    });
  });

  it('manages nested folders, collections, and cascade deletes in local fallback mode', async () => {
    const store = useWorkspaceStore.getState();
    const col = await store.upsertCollection({ name: 'Platform' });
    const f1 = await store.upsertFolder({ collectionId: col.id, name: 'V1' });
    const f2 = await store.upsertFolder({
      collectionId: col.id,
      parentId: f1.id,
      name: 'Users',
    });

    await store.upsertSavedRequest({
      collectionId: col.id,
      folderId: f2.id,
      draft: {
        id: 'r1',
        name: 'Get User',
        protocol: 'rest',
        method: 'GET',
        url: 'https://api.test/users',
        params: [],
        headers: [],
        auth: { type: 'inherit' },
        body: { mode: 'none' },
        graphql: { query: '', variables: '{}' },
        settings: {},
      },
    });

    expect(useWorkspaceStore.getState().folders).toHaveLength(2);
    expect(useWorkspaceStore.getState().savedRequests).toHaveLength(1);

    await store.deleteFolder(f1.id);
    expect(useWorkspaceStore.getState().folders).toHaveLength(0);
    expect(useWorkspaceStore.getState().savedRequests).toHaveLength(0);
  });

  it('prevents deleting Global environment and strips secrets on export', async () => {
    const store = useWorkspaceStore.getState();
    await expect(store.deleteEnvironment('global-1')).rejects.toThrow(/Global/);

    const exported = await store.exportWorkspace();
    expect(exported.environments[0].variables[0].value).toBe('');
  });
});
