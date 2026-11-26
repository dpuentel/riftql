import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/layout/Sidebar';
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
});
