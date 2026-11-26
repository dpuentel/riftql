import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsModal } from '@/components/modals/SettingsModal';
import { TooltipProvider } from '@/components/ui/tooltip';
import { setTauriBridgeAdapter } from '@/lib/tauri';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/useSettingsStore';
import { useUpdaterStore } from '@/store/useUpdaterStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

describe('SettingsModal', () => {
  beforeEach(async () => {
    setTauriBridgeAdapter(null);
    useUpdaterStore.getState().reset();
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

  it('configures, migrates, pulls/commits/pushes, and disables Git-friendly workspace sync', async () => {
    const user = userEvent.setup();
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const openDirectory = vi.fn(async () => '/home/user/team-api-repo');
    let enabled = false;

    const buildStatus = (isEnabled: boolean) => ({
      enabled: isEnabled,
      folderPath: '/home/user/team-api-repo',
      remoteUrl: 'https://github.com/org/team-api.git',
      branch: 'main',
      autoSync: true,
      lastSyncedAt: '2026-11-26T10:00:00Z',
      lastError: undefined,
      git: {
        gitAvailable: true,
        gitVersion: 'git version 2.47.0',
        isGitRepo: true,
        branch: 'main',
        remoteUrl: 'https://github.com/org/team-api.git',
        changedFiles: 1,
        ahead: 0,
        behind: 0,
      },
    });

    setTauriBridgeAdapter({
      invoke: async <T,>(cmd: string, args?: Record<string, unknown>) => {
        calls.push({ cmd, args });
        if (cmd === 'get_git_sync_status_cmd') {
          return {
            enabled,
            folderPath: enabled ? '/home/user/team-api-repo' : undefined,
            remoteUrl: enabled ? 'https://github.com/org/team-api.git' : undefined,
            branch: enabled ? 'main' : undefined,
            autoSync: true,
            git: {
              gitAvailable: true,
              gitVersion: 'git version 2.47.0',
              isGitRepo: enabled,
              branch: enabled ? 'main' : undefined,
              remoteUrl: enabled ? 'https://github.com/org/team-api.git' : undefined,
              changedFiles: 0,
              ahead: 0,
              behind: 0,
            },
          } as T;
        }
        if (cmd === 'inspect_git_sync_folder_cmd') {
          return {
            exists: true,
            isEmpty: !enabled,
            hasRiftqlWorkspace: enabled,
            collectionCount: enabled ? 1 : 0,
            environmentCount: enabled ? 1 : 0,
            git: {
              gitAvailable: true,
              gitVersion: 'git version 2.47.0',
              isGitRepo: enabled,
              branch: enabled ? 'main' : undefined,
              remoteUrl: enabled ? 'https://github.com/org/team-api.git' : undefined,
              changedFiles: enabled ? 1 : 0,
              ahead: 0,
              behind: 0,
            },
          } as T;
        }
        if (cmd === 'configure_git_sync_cmd') {
          enabled = true;
          return {
            status: buildStatus(true),
            message: 'Migrated SQLite workspace to /home/user/team-api-repo and enabled Git sync.',
            workspaceReloaded: false,
          } as T;
        }
        if (cmd === 'git_commit_push_workspace_cmd') {
          return {
            status: buildStatus(true),
            message: 'Committed changes and pushed to origin.',
            workspaceReloaded: false,
          } as T;
        }
        if (cmd === 'git_pull_workspace_cmd') {
          return {
            status: buildStatus(true),
            message: 'Already up to date.',
            workspaceReloaded: true,
          } as T;
        }
        if (cmd === 'disable_git_sync_cmd') {
          enabled = false;
          return buildStatus(false) as T;
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
        if (cmd === 'list_history_cmd' || cmd === 'list_cookies_cmd') {
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

    await user.click(screen.getByRole('tab', { name: /git sync/i }));
    expect(screen.getByText('SQLite Only')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /browse/i }));
    expect(openDirectory).toHaveBeenCalledTimes(1);

    const urlInput = screen.getByLabelText(/git repository url/i);
    await user.type(urlInput, 'https://github.com/org/team-api.git');
    await user.click(screen.getByRole('button', { name: /migrate sqlite → folder/i }));

    await user.click(screen.getByRole('button', { name: /migrate sqlite → folder & enable/i }));
    const configCall = calls.find((c) => c.cmd === 'configure_git_sync_cmd');
    expect(configCall?.args).toEqual({
      folderPath: '/home/user/team-api-repo',
      remoteUrl: 'https://github.com/org/team-api.git',
      branch: null,
      migrationMode: 'migrate-to-folder',
      initGit: true,
      autoSync: true,
      username: null,
      password: null,
    });
    expect(await screen.findByText('Enabled')).toBeInTheDocument();
    expect(screen.getByText(/migrated sqlite workspace/i)).toBeInTheDocument();

    // Commit & Push
    const msgInput = screen.getByLabelText(/git commit message/i);
    await user.clear(msgInput);
    await user.type(msgInput, 'feat: initial sync');
    await user.click(screen.getByRole('button', { name: /commit & push/i }));
    const commitCall = calls.find((c) => c.cmd === 'git_commit_push_workspace_cmd');
    expect(commitCall?.args).toEqual({
      message: 'feat: initial sync',
      push: true,
    });

    // Pull reloads workspace
    await user.click(screen.getByRole('button', { name: /git pull/i }));
    expect(calls.some((c) => c.cmd === 'git_pull_workspace_cmd')).toBe(true);
    expect(calls.some((c) => c.cmd === 'load_workspace')).toBe(true);

    // Disable Git Sync via master switch
    const enableSwitch = screen.getByRole('switch', {
      name: /enable git-friendly workspace sync/i,
    });
    await user.click(enableSwitch);
    expect(calls.some((c) => c.cmd === 'disable_git_sync_cmd')).toBe(true);
    expect(await screen.findByText('SQLite Only')).toBeInTheDocument();
  });

  it('submits and clears HTTPS Git authentication credentials for private repositories', async () => {
    const user = userEvent.setup();
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    let hasCredentials = false;
    let authUsername: string | undefined;

    setTauriBridgeAdapter({
      invoke: async <T,>(cmd: string, args?: Record<string, unknown>) => {
        calls.push({ cmd, args });
        if (cmd === 'get_git_sync_status_cmd') {
          return {
            enabled: false,
            autoSync: true,
            authUsername,
            hasCredentials,
            git: {
              gitAvailable: true,
              isGitRepo: false,
              changedFiles: 0,
              ahead: 0,
              behind: 0,
            },
          } as T;
        }
        if (cmd === 'inspect_git_sync_folder_cmd') {
          return {
            exists: true,
            isEmpty: true,
            hasRiftqlWorkspace: false,
            collectionCount: 0,
            environmentCount: 0,
            git: {
              gitAvailable: true,
              isGitRepo: false,
              changedFiles: 0,
              ahead: 0,
              behind: 0,
            },
          } as T;
        }
        if (cmd === 'configure_git_sync_cmd') {
          hasCredentials = Boolean(args?.password);
          authUsername = typeof args?.username === 'string' ? args.username : undefined;
          return {
            status: {
              enabled: true,
              folderPath: String(args?.folderPath ?? ''),
              remoteUrl: String(args?.remoteUrl ?? ''),
              branch: 'main',
              autoSync: true,
              authUsername,
              hasCredentials,
              git: {
                gitAvailable: true,
                isGitRepo: true,
                branch: 'main',
                remoteUrl: String(args?.remoteUrl ?? ''),
                changedFiles: 0,
                ahead: 0,
                behind: 0,
              },
            },
            message: 'Cloned repository and imported workspace.',
            workspaceReloaded: true,
          } as T;
        }
        if (cmd === 'save_git_credentials_cmd') {
          if (args?.clear) {
            hasCredentials = false;
            authUsername = undefined;
          } else {
            hasCredentials = true;
            authUsername = typeof args?.username === 'string' ? args.username : undefined;
          }
          return {
            enabled: true,
            folderPath: '/home/user/private-repo',
            remoteUrl: 'https://git-php.dinalab.com/dpuente/riftql-workspace/',
            branch: 'main',
            autoSync: true,
            authUsername,
            hasCredentials,
            git: {
              gitAvailable: true,
              isGitRepo: true,
              branch: 'main',
              remoteUrl: 'https://git-php.dinalab.com/dpuente/riftql-workspace/',
              changedFiles: 0,
              ahead: 0,
              behind: 0,
            },
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
        if (cmd === 'list_history_cmd' || cmd === 'list_cookies_cmd') {
          return [] as T;
        }
        return undefined as T;
      },
      openFile: vi.fn(async () => null),
      saveFile: vi.fn(async () => null),
      openDirectory: vi.fn(async () => '/home/user/private-repo'),
    });

    render(
      <TooltipProvider>
        <SettingsModal open onOpenChange={() => {}} />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('tab', { name: /git sync/i }));
    await user.type(
      screen.getByLabelText(/git sync workspace folder/i),
      '/home/user/private-repo',
    );
    await user.type(
      screen.getByLabelText(/git repository url/i),
      'https://git-php.dinalab.com/dpuente/riftql-workspace/',
    );

    // HTTPS Authentication section opens automatically for https:// URLs
    const userField = await screen.findByLabelText(/git https username/i);
    const passField = screen.getByLabelText(/git https password or token/i);
    await user.type(userField, 'dpuente');
    await user.type(passField, 'my-secret-pat');

    await user.click(screen.getByRole('button', { name: /clone git repo/i }));
    await user.click(screen.getByRole('button', { name: /clone repo & enable sync/i }));

    const cfgCall = calls.find((c) => c.cmd === 'configure_git_sync_cmd');
    expect(cfgCall?.args?.username).toBe('dpuente');
    expect(cfgCall?.args?.password).toBe('my-secret-pat');
    expect(await screen.findByText('Saved locally')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /clear credentials/i }));
    expect(
      calls.some((c) => c.cmd === 'save_git_credentials_cmd' && c.args?.clear === true),
    ).toBe(true);
    expect(screen.queryByText('Saved locally')).not.toBeInTheDocument();
  });

  it('toggles Git Sync auto-push & auto-fetch options and runs Fetch Now', async () => {
    const user = userEvent.setup();
    const calls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const onRemoteUpdateFound = vi.fn();

    let statusState = {
      enabled: true,
      folderPath: '/home/user/team-repo',
      remoteUrl: 'https://github.com/org/team-repo.git',
      branch: 'main',
      autoSync: true,
      autoPush: false,
      autoPushDelaySecs: 15,
      autoFetch: false,
      autoFetchIntervalMins: 5,
      fetchSnoozeMins: 30,
      isPushing: false,
      git: {
        gitAvailable: true,
        isGitRepo: true,
        branch: 'main',
        remoteUrl: 'https://github.com/org/team-repo.git',
        changedFiles: 0,
        ahead: 0,
        behind: 0,
      },
    };

    setTauriBridgeAdapter({
      invoke: async <T,>(cmd: string, args?: Record<string, unknown>) => {
        calls.push({ cmd, args });
        if (cmd === 'get_git_sync_status_cmd') {
          return statusState as T;
        }
        if (cmd === 'inspect_git_sync_folder_cmd') {
          return {
            exists: true,
            isEmpty: false,
            hasRiftqlWorkspace: true,
            collectionCount: 1,
            environmentCount: 1,
            git: statusState.git,
          } as T;
        }
        if (cmd === 'update_git_sync_options_cmd') {
          statusState = {
            ...statusState,
            autoSync: Boolean(args?.autoSync),
            autoPush: Boolean(args?.autoPush),
            autoPushDelaySecs: Number(args?.autoPushDelaySecs ?? 15),
            autoFetch: Boolean(args?.autoFetch),
            autoFetchIntervalMins: Number(args?.autoFetchIntervalMins ?? 5),
            fetchSnoozeMins: Number(args?.fetchSnoozeMins ?? 30),
          };
          return statusState as T;
        }
        if (cmd === 'git_fetch_workspace_cmd') {
          const update = {
            repoName: 'team-repo',
            branch: 'main',
            remoteUrl: statusState.remoteUrl,
            behind: 1,
            ahead: 0,
            changedFiles: 0,
            remoteHead: 'deadbeef',
            commits: [
              { hash: 'deadbeef', author: 'Luis', message: 'chore: add endpoint', date: '1m ago' },
            ],
          };
          statusState = {
            ...statusState,
            git: { ...statusState.git, behind: 1 },
          };
          return {
            status: { ...statusState, remoteUpdate: update },
            message: 'Found 1 new commit on origin/main.',
            workspaceReloaded: false,
          } as T;
        }
        return undefined as T;
      },
      openFile: vi.fn(async () => null),
      saveFile: vi.fn(async () => null),
    });

    render(
      <TooltipProvider>
        <SettingsModal
          open
          onOpenChange={() => {}}
          onRemoteUpdateFound={onRemoteUpdateFound}
        />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('tab', { name: /git sync/i }));

    await user.click(
      await screen.findByRole('switch', { name: /auto-commit and push changes to git/i }),
    );
    expect(
      calls.some((c) => c.cmd === 'update_git_sync_options_cmd' && c.args?.autoPush === true),
    ).toBe(true);

    await user.click(
      screen.getByRole('switch', { name: /auto-fetch remote git updates/i }),
    );
    expect(
      calls.some((c) => c.cmd === 'update_git_sync_options_cmd' && c.args?.autoFetch === true),
    ).toBe(true);

    await user.click(screen.getByRole('button', { name: /fetch now/i }));
    expect(calls.some((c) => c.cmd === 'git_fetch_workspace_cmd')).toBe(true);
    expect(onRemoteUpdateFound).toHaveBeenCalledWith(
      expect.objectContaining({ repoName: 'team-repo', behind: 1 }),
    );
  });

  it('checks for updates, renders release notes, triggers Update Now, and toggles startup update checks', async () => {
    const user = userEvent.setup();
    const calls: string[] = [];

    setTauriBridgeAdapter({
      invoke: async <T,>(cmd: string) => {
        calls.push(cmd);
        if (cmd === 'get_app_runtime_info_cmd') {
          return {
            version: '0.4.0',
            platform: 'windows',
            arch: 'x86_64',
            updaterConfigured: true,
            isAppimage: false,
          } as T;
        }
        if (cmd === 'check_app_update_cmd') {
          return {
            currentVersion: '0.4.0',
            available: true,
            availableVersion: '0.5.0',
            releaseNotes: '### Highlights\n- One-click auto updates',
            publishedAt: '2026-11-26T18:00:00Z',
            releaseUrl: 'https://github.com/dpuentel/riftql/releases/tag/v0.5.0',
            canAutoInstall: true,
            autoInstallUnavailableReason: null,
            checkedAt: new Date().toISOString(),
          } as T;
        }
        if (cmd === 'install_app_update_cmd') {
          return undefined as T;
        }
        throw new Error(`Tauri runtime unavailable for command "${cmd}"`);
      },
      openFile: vi.fn(async () => null),
      saveFile: vi.fn(async () => null),
    });

    render(
      <TooltipProvider>
        <SettingsModal open onOpenChange={() => {}} />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('tab', { name: /updates/i }));
    expect(await screen.findByText('v0.4.0')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /check for updates/i }));
    expect(await screen.findByText(/v0\.5\.0 available/i)).toBeInTheDocument();
    expect(screen.getByText(/one-click auto updates/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /update now/i }));
    expect(calls).toContain('install_app_update_cmd');

    const startupSwitch = screen.getByRole('switch', { name: /check for updates on startup/i });
    expect(startupSwitch).toHaveAttribute('data-state', 'checked');
    await user.click(startupSwitch);
    expect(useSettingsStore.getState().settings.autoCheckUpdates).toBe(false);
  });

  it('keeps user-selected tabs active even when parent passes inline onGitSyncStatusChange and re-renders', async () => {
    const user = userEvent.setup();
    let gitStatusCalls = 0;

    setTauriBridgeAdapter({
      invoke: async <T,>(cmd: string) => {
        if (cmd === 'get_git_sync_status_cmd') {
          gitStatusCalls += 1;
          return {
            enabled: false,
            autoSync: true,
            git: {
              gitAvailable: true,
              isGitRepo: false,
              changedFiles: 0,
              ahead: 0,
              behind: 0,
            },
          } as T;
        }
        throw new Error(`Tauri runtime unavailable for command "${cmd}"`);
      },
      openFile: vi.fn(async () => null),
      saveFile: vi.fn(async () => null),
    });

    function StatefulSettingsHost() {
      const [, setParentStateCount] = React.useState(0);
      return (
        <TooltipProvider>
          <SettingsModal
            open
            onOpenChange={() => {}}
            initialTab="general"
            onGitSyncStatusChange={() => {
              setParentStateCount((n) => n + 1);
            }}
          />
        </TooltipProvider>
      );
    }

    render(<StatefulSettingsHost />);

    await waitFor(() => {
      expect(gitStatusCalls).toBe(1);
    });

    const networkTab = screen.getByRole('tab', { name: /network/i });
    await user.click(networkTab);
    expect(networkTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('switch', { name: /verify ssl certificates/i })).toBeInTheDocument();

    const updatesTab = screen.getByRole('tab', { name: /updates/i });
    await user.click(updatesTab);
    expect(updatesTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/current version/i)).toBeInTheDocument();

    expect(gitStatusCalls).toBe(1);
  });
});
