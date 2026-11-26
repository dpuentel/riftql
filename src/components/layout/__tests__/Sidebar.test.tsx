import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar, canDropDraggedItem } from '@/components/layout/Sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { setTauriBridgeAdapter } from '@/lib/tauri';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/useSettingsStore';
import { createEmptyDraft, useTabsStore } from '@/store/useTabsStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

describe('Sidebar collections, subfolders, delete folder, and rename actions', () => {
  beforeEach(() => {
    setTauriBridgeAdapter(null);
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, resolvedTheme: 'dark', isLoaded: true });
    useWorkspaceStore.setState({
      collections: [
        {
          id: 'col-1',
          name: 'Users API',
          description: '',
          auth: { type: 'none' },
          variables: [],
          sortOrder: 0,
          createdAt: '',
          updatedAt: '',
        },
      ],
      folders: [
        {
          id: 'folder-1',
          collectionId: 'col-1',
          name: 'Accounts',
          auth: { type: 'inherit' },
          sortOrder: 0,
          createdAt: '',
          updatedAt: '',
        },
      ],
      savedRequests: [
        {
          id: 'req-1',
          collectionId: 'col-1',
          folderId: 'folder-1',
          name: 'Get Profile',
          protocol: 'rest',
          method: 'GET',
          url: 'https://api.test/me',
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
        { id: 'g1', name: 'Global', isGlobal: true, variables: [], createdAt: '', updatedAt: '' },
      ],
      history: [],
      cookies: [],
      isLoaded: true,
    });
    useTabsStore.setState({
      tabs: [
        {
          id: 'tab-1',
          savedRequestId: 'req-1',
          collectionId: 'col-1',
          folderId: 'folder-1',
          title: 'Get Profile',
          isDirty: false,
          draft: { ...createEmptyDraft('rest'), id: 'req-1', name: 'Get Profile' },
          isLoading: false,
        },
      ],
      activeTabId: 'tab-1',
    });
  });

  const renderSidebar = () =>
    render(
      <TooltipProvider>
        <Sidebar
          onOpenEnvironments={vi.fn()}
          onOpenCookies={vi.fn()}
          onOpenSettings={vi.fn()}
          onEditCollection={vi.fn()}
          onEditFolder={vi.fn()}
        />
      </TooltipProvider>,
    );

  it('creates nested subfolders inside folders and renames them inline', async () => {
    const user = userEvent.setup();
    renderSidebar();

    // Expand collection
    await user.click(screen.getByText('Users API'));
    expect(screen.getByText('Accounts')).toBeInTheDocument();

    // Create subfolder inside Accounts
    await user.click(screen.getByRole('button', { name: 'New subfolder in Accounts' }));
    const renameInput = screen.getByLabelText('Rename folder');
    await user.clear(renameInput);
    await user.type(renameInput, 'Billing{Enter}');

    expect(screen.getByText('Billing')).toBeInTheDocument();
    const billingFolder = useWorkspaceStore.getState().folders.find((f) => f.name === 'Billing');
    expect(billingFolder).toBeDefined();
    expect(billingFolder?.parentId).toBe('folder-1');
  });

  it('renames a saved request inline and syncs open tab title', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByText('Users API'));
    await user.click(screen.getByText('Accounts'));
    expect(screen.getByText('Get Profile')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rename Get Profile' }));
    const renameInput = screen.getByLabelText('Rename request');
    await user.clear(renameInput);
    await user.type(renameInput, 'Fetch Current User{Enter}');

    expect(screen.getByText('Fetch Current User')).toBeInTheDocument();
    expect(useWorkspaceStore.getState().savedRequests[0]?.name).toBe('Fetch Current User');
    expect(useTabsStore.getState().tabs[0]?.title).toBe('Fetch Current User');
    expect(useTabsStore.getState().tabs[0]?.draft.name).toBe('Fetch Current User');
  });

  it('deletes a folder with confirmation, cascading requests and detaching open tabs', async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByText('Users API'));
    await user.click(screen.getByRole('button', { name: 'Delete Accounts' }));
    await user.click(screen.getByRole('button', { name: 'Confirm delete Accounts' }));

    expect(useWorkspaceStore.getState().folders).toHaveLength(0);
    expect(useWorkspaceStore.getState().savedRequests).toHaveLength(0);
    expect(useTabsStore.getState().tabs[0]?.savedRequestId).toBeUndefined();
    expect(useTabsStore.getState().tabs[0]?.folderId).toBeUndefined();
  });

  it('supports drag and drop for requests and folders across folders and collections while preventing cycles', async () => {
    const user = userEvent.setup();
    useWorkspaceStore.setState({
      collections: [
        {
          id: 'col-1',
          name: 'Users API',
          description: '',
          auth: { type: 'none' },
          variables: [],
          sortOrder: 0,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'col-2',
          name: 'Billing API',
          description: '',
          auth: { type: 'none' },
          variables: [],
          sortOrder: 1,
          createdAt: '',
          updatedAt: '',
        },
      ],
      folders: [
        {
          id: 'folder-1',
          collectionId: 'col-1',
          name: 'Accounts',
          auth: { type: 'inherit' },
          sortOrder: 0,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'folder-1-child',
          collectionId: 'col-1',
          parentId: 'folder-1',
          name: 'SubAccounts',
          auth: { type: 'inherit' },
          sortOrder: 0,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'folder-2',
          collectionId: 'col-2',
          name: 'Invoices',
          auth: { type: 'inherit' },
          sortOrder: 0,
          createdAt: '',
          updatedAt: '',
        },
      ],
      savedRequests: [
        {
          id: 'req-1',
          collectionId: 'col-1',
          folderId: 'folder-1',
          name: 'Get Profile',
          protocol: 'rest',
          method: 'GET',
          url: 'https://api.test/me',
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
    });

    // Cycle protection: folder-1 cannot be dropped onto its descendant folder-1-child
    expect(
      canDropDraggedItem(
        { kind: 'folder', id: 'folder-1' },
        { kind: 'folder', collectionId: 'col-1', folderId: 'folder-1-child' },
        useWorkspaceStore.getState().folders,
        useWorkspaceStore.getState().savedRequests,
      ),
    ).toBe(false);

    const { container } = renderSidebar();
    await user.click(screen.getByText('Users API'));
    await user.click(screen.getByText('Accounts'));
    await user.click(screen.getByText('Billing API'));

    const reqRow = screen.getByText('Get Profile').closest('[draggable="true"]') as HTMLElement;
    const invoicesDrop = container.querySelector('[data-drop-target="folder:folder-2"]') as HTMLElement;
    const billingRootDrop = container.querySelector(
      '[data-drop-target="collection:col-2"]',
    ) as HTMLElement;

    // Drag Get Profile -> Billing API / Invoices folder
    fireEvent.dragStart(reqRow);
    fireEvent.dragOver(invoicesDrop);
    fireEvent.drop(invoicesDrop);

    await waitFor(() => {
      const movedReq = useWorkspaceStore.getState().savedRequests.find((r) => r.id === 'req-1');
      expect(movedReq?.collectionId).toBe('col-2');
      expect(movedReq?.folderId).toBe('folder-2');
      expect(useTabsStore.getState().tabs[0]?.collectionId).toBe('col-2');
      expect(useTabsStore.getState().tabs[0]?.folderId).toBe('folder-2');
    });

    // Drag Get Profile -> Billing API collection root
    const movedReqRow = screen
      .getByText('Get Profile')
      .closest('[draggable="true"]') as HTMLElement;
    fireEvent.dragStart(movedReqRow);
    fireEvent.dragOver(billingRootDrop);
    fireEvent.drop(billingRootDrop);

    await waitFor(() => {
      const rootReq = useWorkspaceStore.getState().savedRequests.find((r) => r.id === 'req-1');
      expect(rootReq?.collectionId).toBe('col-2');
      expect(rootReq?.folderId).toBeUndefined();
      expect(useTabsStore.getState().tabs[0]?.folderId).toBeUndefined();
    });

    // Drag Accounts folder -> Billing API collection root (also moves descendant SubAccounts)
    const accountsRow = container.querySelector(
      '[data-drop-target="folder:folder-1"]',
    ) as HTMLElement;
    fireEvent.dragStart(accountsRow);
    fireEvent.dragOver(billingRootDrop);
    fireEvent.drop(billingRootDrop);

    await waitFor(() => {
      const accounts = useWorkspaceStore.getState().folders.find((f) => f.id === 'folder-1');
      const sub = useWorkspaceStore.getState().folders.find((f) => f.id === 'folder-1-child');
      expect(accounts?.collectionId).toBe('col-2');
      expect(accounts?.parentId).toBeUndefined();
      expect(sub?.collectionId).toBe('col-2');
    });
  });

  it('sorts saved requests alphabetically within a folder without disturbing other containers', async () => {
    const user = userEvent.setup();
    useWorkspaceStore.setState({
      collections: [
        {
          id: 'col-1',
          name: 'API',
          description: '',
          auth: { type: 'none' },
          variables: [],
          sortOrder: 0,
          createdAt: '',
          updatedAt: '',
        },
      ],
      folders: [
        {
          id: 'fld-1',
          collectionId: 'col-1',
          name: 'Users',
          auth: { type: 'inherit' },
          sortOrder: 0,
          createdAt: '',
          updatedAt: '',
        },
      ],
      savedRequests: [
        {
          id: 'req-z',
          collectionId: 'col-1',
          folderId: 'fld-1',
          name: 'Zebra Users',
          protocol: 'rest',
          method: 'GET',
          url: '/z',
          params: [],
          headers: [],
          auth: { type: 'inherit' },
          body: { mode: 'none' },
          graphql: { query: '', variables: '{}' },
          settings: {},
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '',
        },
        {
          id: 'req-a',
          collectionId: 'col-1',
          folderId: 'fld-1',
          name: 'Alpha Users',
          protocol: 'rest',
          method: 'GET',
          url: '/a',
          params: [],
          headers: [],
          auth: { type: 'inherit' },
          body: { mode: 'none' },
          graphql: { query: '', variables: '{}' },
          settings: {},
          sortOrder: 1,
          createdAt: '2026-01-01T00:00:01Z',
          updatedAt: '',
        },
        {
          id: 'req-m',
          collectionId: 'col-1',
          folderId: 'fld-1',
          name: 'Middle Users',
          protocol: 'rest',
          method: 'GET',
          url: '/m',
          params: [],
          headers: [],
          auth: { type: 'inherit' },
          body: { mode: 'none' },
          graphql: { query: '', variables: '{}' },
          settings: {},
          sortOrder: 2,
          createdAt: '2026-01-01T00:00:02Z',
          updatedAt: '',
        },
      ],
    });

    renderSidebar();
    await user.click(screen.getByText('API'));
    await user.click(screen.getByText('Users'));

    await user.click(screen.getByRole('button', { name: 'Sort requests in Users' }));

    await waitFor(() => {
      const sorted = useWorkspaceStore
        .getState()
        .savedRequests.slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((r) => r.name);
      expect(sorted).toEqual(['Alpha Users', 'Middle Users', 'Zebra Users']);
    });
  });
});
