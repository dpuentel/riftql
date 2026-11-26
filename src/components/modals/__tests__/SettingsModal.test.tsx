import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsModal } from '@/components/modals/SettingsModal';
import { TooltipProvider } from '@/components/ui/tooltip';
import { setTauriBridgeAdapter } from '@/lib/tauri';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/useSettingsStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

describe('SettingsModal', () => {
  beforeEach(async () => {
    setTauriBridgeAdapter(null);
    await useSettingsStore.getState().loadSettings({ ...DEFAULT_SETTINGS });
  });

  it('toggles network settings, records custom shortcuts, detects conflicts, and resets', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <SettingsModal open onOpenChange={() => {}} />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('tab', { name: /network/i }));
    const sslSwitch = screen.getByRole('switch', { name: /verify ssl certificates/i });
    await user.click(sslSwitch);
    expect(useSettingsStore.getState().settings.verifySsl).toBe(false);

    await user.click(screen.getByRole('tab', { name: /shortcuts/i }));
    const recordBtn = screen.getByRole('button', { name: /record shortcut for new request tab/i });
    await user.click(recordBtn);
    expect(recordBtn).toHaveTextContent('Press keys…');

    // Trigger conflict with Command Palette (Mod+K)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByText(/already assigned to/i)).toBeInTheDocument();

    // Assign non-conflicting combo Mod+Alt+T
    await user.click(recordBtn);
    fireEvent.keyDown(window, { key: 't', ctrlKey: true, altKey: true });
    expect(useSettingsStore.getState().settings.customShortcuts.newTab).toBe('Mod+Alt+T');

    await user.click(screen.getByRole('button', { name: /reset all/i }));
    expect(useSettingsStore.getState().settings.customShortcuts).toEqual({});
  });

  it('exports workspace JSON via native Tauri save dialog in Data tab', async () => {
    const user = userEvent.setup();
    const invokeCalls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const saveFile = vi.fn(async () => '/tmp/riftql-workspace.json');

    useWorkspaceStore.setState({
      collections: [],
      folders: [],
      savedRequests: [],
      environments: [
        {
          id: 'g1',
          name: 'Global',
          isGlobal: true,
          variables: [{ id: 's1', key: 'token', value: 'raw-secret', isSecret: true, enabled: true }],
          createdAt: '',
          updatedAt: '',
        },
      ],
    });

    setTauriBridgeAdapter({
      invoke: async <T,>(cmd: string, args?: Record<string, unknown>) => {
        invokeCalls.push({ cmd, args });
        if (cmd === 'export_workspace_cmd') {
          return {
            version: 1,
            exportedAt: '2026-11-26T00:00:00Z',
            collections: [],
            folders: [],
            savedRequests: [],
            environments: [
              {
                id: 'g1',
                name: 'Global',
                isGlobal: true,
                variables: [{ id: 's1', key: 'token', value: '', isSecret: true, enabled: true }],
                createdAt: '',
                updatedAt: '',
              },
            ],
          } as T;
        }
        return undefined as T;
      },
      openFile: vi.fn(async () => null),
      saveFile,
    });

    render(
      <TooltipProvider>
        <SettingsModal open onOpenChange={() => {}} />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('tab', { name: /^data$/i }));
    await user.click(screen.getByRole('button', { name: /export workspace json/i }));

    expect(saveFile).toHaveBeenCalledTimes(1);
    const writeCall = invokeCalls.find((c) => c.cmd === 'write_text_file_cmd');
    expect(writeCall?.args?.path).toBe('/tmp/riftql-workspace.json');
    expect(String(writeCall?.args?.content)).not.toContain('raw-secret');
    expect(screen.getByText(/exported workspace json to \/tmp\/riftql-workspace\.json/i)).toBeInTheDocument();
  });

  it('updates UI and code editor font sizes and syncs CSS custom properties', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <SettingsModal open onOpenChange={() => {}} />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: /large \(20px\)/i }));
    expect(useSettingsStore.getState().settings.uiFontSize).toBe(20);
    expect(document.documentElement.style.getPropertyValue('--rift-ui-font-size')).toBe('20px');

    await user.click(screen.getByRole('button', { name: /increase code font size/i }));
    await user.click(screen.getByRole('button', { name: /increase code font size/i }));
    expect(useSettingsStore.getState().settings.codeFontSize).toBe(15);
    expect(document.documentElement.style.getPropertyValue('--rift-code-font-size')).toBe('15px');
  });

  it('displays local data directory in Data tab and switches folder cleanly', async () => {
    const user = userEvent.setup();
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const openDirectory = vi.fn(async () => '/home/user/riftql-sync');

    setTauriBridgeAdapter({
      invoke: async <T,>(cmd: string, args?: Record<string, unknown>) => {
        calls.push({ cmd, args });
        if (cmd === 'get_storage_info_cmd') {
          return {
            currentDataDir: '/home/user/.local/share/com.riftql.app',
            dbPath: '/home/user/.local/share/com.riftql.app/riftql.db',
            defaultDataDir: '/home/user/.local/share/com.riftql.app',
            isCustom: false,
          } as T;
        }
        if (cmd === 'set_data_directory_cmd') {
          return {
            currentDataDir: '/home/user/riftql-sync',
            dbPath: '/home/user/riftql-sync/riftql.db',
            defaultDataDir: '/home/user/.local/share/com.riftql.app',
            isCustom: true,
          } as T;
        }
        if (cmd === 'load_workspace') {
          return {
            collections: [],
            folders: [],
            savedRequests: [],
            environments: [
              { id: 'g1', name: 'Global', isGlobal: true, variables: [], createdAt: '', updatedAt: '' },
            ],
            settings: { ...DEFAULT_SETTINGS },
          } as T;
        }
        if (cmd === 'list_history_cmd' || cmd === 'list_cookies_cmd' || cmd === 'list_session_tabs_cmd') {
          return [] as T;
        }
        return undefined as T;
      },
      openFile: vi.fn(async () => null),
      saveFile: vi.fn(async () => null),
      openDirectory,
    });

    render(
      <TooltipProvider>
        <SettingsModal open onOpenChange={() => {}} />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('tab', { name: /^data$/i }));
    expect(
      await screen.findByText('/home/user/.local/share/com.riftql.app'),
    ).toBeInTheDocument();
    expect(screen.getByText('System Default')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /change folder/i }));
    expect(openDirectory).toHaveBeenCalledTimes(1);
    const moveCall = calls.find((c) => c.cmd === 'set_data_directory_cmd');
    expect(moveCall?.args).toEqual({
      newDir: '/home/user/riftql-sync',
      migrateExisting: true,
    });
    expect(await screen.findByText('Custom Folder')).toBeInTheDocument();
    expect(screen.getByText(/data storage moved to \/home\/user\/riftql-sync/i)).toBeInTheDocument();
  });
});
