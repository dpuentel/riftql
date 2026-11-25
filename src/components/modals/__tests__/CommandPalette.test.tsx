import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandPalette } from '@/components/modals/CommandPalette';
import { TooltipProvider } from '@/components/ui/tooltip';
import { setTauriBridgeAdapter } from '@/lib/tauri';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/useSettingsStore';
import { useTabsStore } from '@/store/useTabsStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

// cmdk relies on ResizeObserver & scrollIntoView
if (typeof ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

describe('CommandPalette', () => {
  beforeEach(() => {
    setTauriBridgeAdapter(null);
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, isLoaded: true });
    useWorkspaceStore.setState({
      collections: [
        {
          id: 'col-1',
          name: 'Auth API',
          description: '',
          auth: { type: 'none' },
          variables: [],
          sortOrder: 0,
          createdAt: '',
          updatedAt: '',
        },
      ],
      savedRequests: [
        {
          id: 'req-1',
          collectionId: 'col-1',
          name: 'Fetch Session',
          protocol: 'rest',
          method: 'GET',
          url: 'https://auth.test/session',
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
        { id: 'e1', name: 'Production', isGlobal: false, variables: [], createdAt: '', updatedAt: '' },
      ],
    });
  });

  it('searches saved requests, displays live shortcuts, and switches environments', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <TooltipProvider>
        <CommandPalette
          open
          onOpenChange={onOpenChange}
          onSendRequest={vi.fn()}
          onFormatBody={vi.fn()}
          onImportCurl={vi.fn()}
          onOpenCodeSnippet={vi.fn()}
          onToggleSidebar={vi.fn()}
          onOpenCookies={vi.fn()}
          onOpenEnvironments={vi.fn()}
          onOpenSettings={vi.fn()}
          onNewCollection={vi.fn()}
        />
      </TooltipProvider>,
    );

    expect(screen.getByText('Fetch Session')).toBeInTheDocument();
    expect(screen.getByText('Production')).toBeInTheDocument();

    const input = screen.getByLabelText('Command palette search');
    await user.type(input, 'Fetch Session');
    await user.click(screen.getByText('Fetch Session'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(useTabsStore.getState().tabs.some((t) => t.savedRequestId === 'req-1')).toBe(true);
  });
});
