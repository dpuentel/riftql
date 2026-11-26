import * as React from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { CodeSnippetModal } from '@/components/modals/CodeSnippetModal';
import { CommandPalette } from '@/components/modals/CommandPalette';
import { DiscoverGraphQLModal } from '@/components/modals/DiscoverGraphQLModal';
import { GitRemoteUpdateModal } from '@/components/modals/GitRemoteUpdateModal';
import { ImportCollectionModal } from '@/components/modals/ImportCollectionModal';
import { ImportCurlModal } from '@/components/modals/ImportCurlModal';
import { SettingsModal, type SettingsTab } from '@/components/modals/SettingsModal';
import { Toaster } from '@/components/ui/Toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import { isCurlCommand, parseCurlCommand } from '@/lib/curl-parser';
import { formatGraphQL, formatVariablesJson } from '@/lib/graphql';
import { hasNativeFileBridge, invokeCommand, listenEvent } from '@/lib/tauri';
import { notify } from '@/store/useNotificationStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useTabsStore } from '@/store/useTabsStore';
import { useUpdaterStore } from '@/store/useUpdaterStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import type {
  AppUpdateProgress,
  GitRemoteUpdateInfo,
  GitSyncActionResult,
  GitSyncStatus,
} from '@/types/storage';

const REMOTE_UPDATE_TOAST_ID = 'git-remote-updates';
const APP_UPDATE_TOAST_ID = 'app-update-available';

export function App() {
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace);
  const upsertSavedRequest = useWorkspaceStore((s) => s.upsertSavedRequest);

  const loadSessionTabs = useTabsStore((s) => s.loadSessionTabs);
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const newTab = useTabsStore((s) => s.newTab);
  const closeTab = useTabsStore((s) => s.closeTab);
  const nextTab = useTabsStore((s) => s.nextTab);
  const prevTab = useTabsStore((s) => s.prevTab);
  const updateDraft = useTabsStore((s) => s.updateDraft);
  const markTabSaved = useTabsStore((s) => s.markTabSaved);
  const sendTabRequest = useTabsStore((s) => s.sendTabRequest);
  const cancelTabRequest = useTabsStore((s) => s.cancelTabRequest);

  const toggleTheme = useSettingsStore((s) => s.toggleTheme);
  const toggleLayout = useSettingsStore((s) => s.toggleLayout);

  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settingsTab, setSettingsTab] = React.useState<SettingsTab>('general');
  const [gitSyncStatus, setGitSyncStatus] = React.useState<GitSyncStatus | null>(null);
  const [remoteUpdate, setRemoteUpdate] = React.useState<GitRemoteUpdateInfo | null>(null);
  const [remoteUpdateModalOpen, setRemoteUpdateModalOpen] = React.useState(false);
  const [importCurlOpen, setImportCurlOpen] = React.useState(false);
  const [importCollectionModal, setImportCollectionModal] = React.useState<{
    open: boolean;
    collectionId?: string;
    folderId?: string;
  }>({ open: false });
  const [discoverGqlModal, setDiscoverGqlModal] = React.useState<{
    open: boolean;
    collectionId?: string;
    folderId?: string;
  }>({ open: false });
  const [codeSnippetOpen, setCodeSnippetOpen] = React.useState(false);
  const [envOpen, setEnvOpen] = React.useState(false);
  const [cookiesOpen, setCookiesOpen] = React.useState(false);
  const [saveModalTabId, setSaveModalTabId] = React.useState<string | null>(null);
  const [createCollectionTrigger, setCreateCollectionTrigger] = React.useState(0);
  const [recordingShortcut, setRecordingShortcut] = React.useState(false);
  const urlInputRef = React.useRef<HTMLInputElement | null>(null);
  const snoozeUntilMsRef = React.useRef<number>(0);
  const mutedForSessionRef = React.useRef<boolean>(false);
  const fetchSnoozeMinsRef = React.useRef<number>(30);
  fetchSnoozeMinsRef.current = gitSyncStatus?.fetchSnoozeMins ?? 30;

  const openSettings = React.useCallback((tab: SettingsTab = 'general') => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }, []);

  const openImportCollection = React.useCallback(
    (target?: { collectionId?: string; folderId?: string }) => {
      setImportCollectionModal({
        open: true,
        collectionId: target?.collectionId,
        folderId: target?.folderId,
      });
    },
    [],
  );

  const openDiscoverGraphQL = React.useCallback(
    (target: { collectionId: string; folderId?: string }) => {
      setDiscoverGqlModal({
        open: true,
        collectionId: target.collectionId,
        folderId: target.folderId,
      });
    },
    [],
  );

  const showToast = React.useCallback((msg: string) => {
    notify.success(msg);
  }, []);

  const snoozeRemoteNotifications = React.useCallback(() => {
    const mins = fetchSnoozeMinsRef.current;
    snoozeUntilMsRef.current = Date.now() + mins * 60_000;
    notify.dismiss(REMOTE_UPDATE_TOAST_ID);
  }, []);

  const muteRemoteNotificationsForSession = React.useCallback(() => {
    mutedForSessionRef.current = true;
    notify.dismiss(REMOTE_UPDATE_TOAST_ID);
  }, []);

  const handleGitSyncStatusChange = React.useCallback((nextStatus: GitSyncStatus) => {
    setGitSyncStatus(nextStatus);
    setRemoteUpdate(nextStatus.remoteUpdate ?? null);
    if (!nextStatus.remoteUpdate) {
      notify.dismiss(REMOTE_UPDATE_TOAST_ID);
    }
  }, []);

  const presentRemoteUpdateNotification = React.useCallback(
    (info: GitRemoteUpdateInfo, force = false) => {
      setRemoteUpdate(info);
      if (!force && (mutedForSessionRef.current || Date.now() < snoozeUntilMsRef.current)) {
        return;
      }
      const snoozeMins = fetchSnoozeMinsRef.current;
      notify.info(`Updates available in ${info.repoName}`, {
        id: REMOTE_UPDATE_TOAST_ID,
        durationMs: 0,
        description: `${info.behind} new commit${info.behind === 1 ? '' : 's'} on branch ${info.branch}.`,
        actions: [
          {
            label: 'View & Pull…',
            variant: 'primary',
            onClick: () => {
              notify.dismiss(REMOTE_UPDATE_TOAST_ID);
              setRemoteUpdateModalOpen(true);
            },
          },
          {
            label: `Later (${snoozeMins}m)`,
            variant: 'secondary',
            onClick: () => snoozeRemoteNotifications(),
          },
          {
            label: 'Mute',
            variant: 'ghost',
            onClick: () => muteRemoteNotificationsForSession(),
          },
        ],
      });
    },
    [snoozeRemoteNotifications, muteRemoteNotificationsForSession],
  );

  const handlePullRemoteUpdates = React.useCallback(
    async (rebase: boolean) => {
      const result = await invokeCommand<GitSyncActionResult>('git_pull_workspace_cmd', {
        rebase,
      });
      setGitSyncStatus(result.status);
      setRemoteUpdate(result.status.remoteUpdate ?? null);
      snoozeUntilMsRef.current = 0;
      notify.dismiss(REMOTE_UPDATE_TOAST_ID);
      if (result.workspaceReloaded) {
        await loadWorkspace();
        useTabsStore
          .getState()
          .syncTabsWithWorkspace(useWorkspaceStore.getState().savedRequests);
      }
      notify.success(result.message || 'Pulled latest changes from Git remote.');
    },
    [loadWorkspace],
  );

  const handleOpenRemoteUpdates = React.useCallback(async () => {
    if (remoteUpdate) {
      setRemoteUpdateModalOpen(true);
      return;
    }
    if (gitSyncStatus?.remoteUpdate) {
      setRemoteUpdate(gitSyncStatus.remoteUpdate);
      setRemoteUpdateModalOpen(true);
      return;
    }
    if (hasNativeFileBridge()) {
      try {
        const res = await invokeCommand<GitSyncActionResult>('git_fetch_workspace_cmd');
        setGitSyncStatus(res.status);
        if (res.status.remoteUpdate) {
          setRemoteUpdate(res.status.remoteUpdate);
          setRemoteUpdateModalOpen(true);
          return;
        }
      } catch {
        // Fall through to opening Git Sync settings
      }
    }
    openSettings('git-sync');
  }, [remoteUpdate, gitSyncStatus?.remoteUpdate, openSettings]);

  React.useEffect(() => {
    void (async () => {
      await loadWorkspace();
      await loadSessionTabs();
      if (hasNativeFileBridge()) {
        void useUpdaterStore.getState().initRuntimeInfo();
        try {
          const status = await invokeCommand<GitSyncStatus>('get_git_sync_status_cmd');
          if (status && typeof status.enabled === 'boolean') {
            setGitSyncStatus(status);
            if (status.remoteUpdate) {
              setRemoteUpdate(status.remoteUpdate);
            }
          }
        } catch {
          // Ignore when unavailable
        }
      }
    })();
  }, [loadWorkspace, loadSessionTabs]);

  React.useEffect(() => {
    if (!hasNativeFileBridge()) return;
    let active = true;
    const timer = setTimeout(() => {
      if (!active) return;
      if (useSettingsStore.getState().settings.autoCheckUpdates === false) {
        return;
      }
      void useUpdaterStore
        .getState()
        .checkForUpdates({ silent: true })
        .then((result) => {
          if (!active || !result?.available) return;
          notify.info(`RiftQL v${result.availableVersion ?? 'update'} available`, {
            id: APP_UPDATE_TOAST_ID,
            durationMs: 0,
            description: result.canAutoInstall
              ? `You are running v${result.currentVersion}. Install the update now or open Settings.`
              : `You are running v${result.currentVersion}. Download the installer from GitHub Releases.`,
            actions: [
              {
                label: result.canAutoInstall ? 'Update Now' : 'View Update',
                variant: 'primary',
                onClick: () => {
                  notify.dismiss(APP_UPDATE_TOAST_ID);
                  openSettings('updates');
                  if (result.canAutoInstall) {
                    void useUpdaterStore.getState().installUpdate();
                  }
                },
              },
              {
                label: 'Settings',
                variant: 'secondary',
                onClick: () => {
                  notify.dismiss(APP_UPDATE_TOAST_ID);
                  openSettings('updates');
                },
              },
              {
                label: 'Later',
                variant: 'ghost',
                onClick: () => notify.dismiss(APP_UPDATE_TOAST_ID),
              },
            ],
          });
        });
    }, 3000);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [openSettings]);

  React.useEffect(() => {
    let active = true;
    const cleanups: Array<() => void> = [];

    const register = async <T,>(eventName: string, handler: (payload: T) => void) => {
      const unlisten = await listenEvent<T>(eventName, (payload) => {
        if (active) handler(payload);
      });
      if (!active) {
        unlisten();
      } else {
        cleanups.push(unlisten);
      }
    };

    void register<GitSyncStatus>('riftql://git-sync-updated', (status) => {
      if (status && typeof status.enabled === 'boolean') {
        setGitSyncStatus(status);
        setRemoteUpdate(status.remoteUpdate ?? null);
      }
      void (async () => {
        await loadWorkspace();
        useTabsStore
          .getState()
          .syncTabsWithWorkspace(useWorkspaceStore.getState().savedRequests);
        notify.info('Workspace reloaded from Git sync folder.');
      })();
    });

    void register<GitSyncStatus>('riftql://git-sync-status', (status) => {
      if (status && typeof status.enabled === 'boolean') {
        setGitSyncStatus(status);
        if (!status.remoteUpdate) {
          setRemoteUpdate(null);
          notify.dismiss(REMOTE_UPDATE_TOAST_ID);
        } else {
          setRemoteUpdate(status.remoteUpdate);
        }
      }
    });

    void register<GitRemoteUpdateInfo>('riftql://git-remote-updates', (info) => {
      if (info && typeof info.behind === 'number' && info.behind > 0) {
        presentRemoteUpdateNotification(info);
      }
    });

    void register<AppUpdateProgress>('riftql://app-update-progress', (progress) => {
      if (progress && typeof progress.stage === 'string') {
        useUpdaterStore.getState().setProgress(progress);
      }
    });

    return () => {
      active = false;
      for (const fn of cleanups) {
        fn();
      }
    };
  }, [loadWorkspace, presentRemoteUpdateNotification]);

  const handlePasteCurlInUrl = React.useCallback(
    (pasted: string): boolean => {
      if (!isCurlCommand(pasted)) return false;
      try {
        const parsed = parseCurlCommand(pasted);
        updateDraft(activeTabId, () => parsed);
        showToast('Imported cURL command into active tab.');
        return true;
      } catch {
        return false;
      }
    },
    [activeTabId, updateDraft, showToast],
  );

  const handleFormatActiveBody = React.useCallback(() => {
    const active = tabs.find((t) => t.id === activeTabId);
    if (!active) return;
    if (active.draft.protocol === 'graphql') {
      const focusedVariables = Boolean(
        document.activeElement?.closest('[aria-label="GraphQL variables editor"]') ||
          document.activeElement?.getAttribute('aria-label') === 'GraphQL variables editor',
      );
      if (focusedVariables) {
        try {
          const formattedVars = formatVariablesJson(active.draft.graphql.variables);
          if (formattedVars !== active.draft.graphql.variables) {
            updateDraft(active.id, (prev) => ({
              ...prev,
              graphql: { ...prev.graphql, variables: formattedVars },
            }));
          }
        } catch {
          // Ignore invalid JSON while editing
        }
        return;
      }

      let nextQuery = active.draft.graphql.query;
      let nextVars = active.draft.graphql.variables;
      try {
        nextQuery = formatGraphQL(active.draft.graphql.query);
      } catch {
        // Ignore invalid GraphQL syntax while editing
      }
      try {
        nextVars = formatVariablesJson(active.draft.graphql.variables);
      } catch {
        // Ignore invalid JSON variables while editing
      }
      if (nextQuery !== active.draft.graphql.query || nextVars !== active.draft.graphql.variables) {
        updateDraft(active.id, (prev) => ({
          ...prev,
          graphql: { ...prev.graphql, query: nextQuery, variables: nextVars },
        }));
      }
      return;
    }
    if (active.draft.body.mode === 'json') {
      try {
        const formatted = JSON.stringify(JSON.parse(active.draft.body.content), null, 2);
        if (formatted !== active.draft.body.content) {
          updateDraft(active.id, (prev) => ({
            ...prev,
            body: { mode: 'json', content: formatted },
          }));
        }
      } catch {
        // Ignore invalid JSON
      }
    }
  }, [tabs, activeTabId, updateDraft]);

  const handleSaveActiveTab = React.useCallback(async () => {
    const active = tabs.find((t) => t.id === activeTabId);
    if (!active) return;
    if (active.savedRequestId && active.collectionId) {
      const saved = await upsertSavedRequest({
        id: active.savedRequestId,
        collectionId: active.collectionId,
        folderId: active.folderId,
        draft: active.draft,
      });
      markTabSaved(active.id, saved);
      showToast('Request saved.');
    } else {
      setSaveModalTabId(active.id);
    }
  }, [tabs, activeTabId, upsertSavedRequest, markTabSaved, showToast]);

  useGlobalShortcuts(
    {
      sendRequest: () => void sendTabRequest(activeTabId),
      cancelRequest: () => void cancelTabRequest(activeTabId),
      newTab: () => newTab('rest'),
      closeTab: () => closeTab(activeTabId),
      nextTab: () => nextTab(),
      prevTab: () => prevTab(),
      saveRequest: () => void handleSaveActiveTab(),
      commandPalette: () => setCommandPaletteOpen((v) => !v),
      focusUrl: () => {
        urlInputRef.current?.focus();
        urlInputRef.current?.select();
      },
      toggleSidebar: () => setSidebarOpen((v) => !v),
      toggleLayout: () => void toggleLayout(),
      toggleTheme: () => void toggleTheme(),
      formatBody: handleFormatActiveBody,
      openSettings: () => openSettings('general'),
      openCodeSnippet: () => setCodeSnippetOpen(true),
      importCurl: () => setImportCurlOpen(true),
      openCookies: () => setCookiesOpen(true),
      openEnvironments: () => setEnvOpen(true),
      newCollection: () => {
        setSidebarOpen(true);
        setCreateCollectionTrigger((n) => n + 1);
      },
    },
    { paused: recordingShortcut },
  );

  return (
    <TooltipProvider delayDuration={300} disableHoverableContent={false}>
      <AppShell
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        commandPaletteOpen={commandPaletteOpen}
        setCommandPaletteOpen={setCommandPaletteOpen}
        settingsOpen={settingsOpen}
        setSettingsOpen={(nextOpen) => {
          if (nextOpen) {
            openSettings('general');
          } else {
            setSettingsOpen(false);
          }
        }}
        onOpenGitSyncSettings={() => openSettings('git-sync')}
        onOpenRemoteUpdates={() => void handleOpenRemoteUpdates()}
        onOpenImportCollection={openImportCollection}
        onDiscoverGraphQL={openDiscoverGraphQL}
        gitSyncStatus={gitSyncStatus}
        importCurlOpen={importCurlOpen}
        setImportCurlOpen={setImportCurlOpen}
        codeSnippetOpen={codeSnippetOpen}
        setCodeSnippetOpen={setCodeSnippetOpen}
        envOpen={envOpen}
        setEnvOpen={setEnvOpen}
        cookiesOpen={cookiesOpen}
        setCookiesOpen={setCookiesOpen}
        saveModalTabId={saveModalTabId}
        setSaveModalTabId={setSaveModalTabId}
        createCollectionTrigger={createCollectionTrigger}
        urlInputRef={urlInputRef}
        onPasteCurlInUrl={handlePasteCurlInUrl}
        extraModals={
          <>
            <ImportCurlModal open={importCurlOpen} onOpenChange={setImportCurlOpen} />
            <ImportCollectionModal
              open={importCollectionModal.open}
              onOpenChange={(nextOpen) =>
                setImportCollectionModal((prev) => ({ ...prev, open: nextOpen }))
              }
              initialTargetCollectionId={importCollectionModal.collectionId}
              initialTargetFolderId={importCollectionModal.folderId}
              onImported={showToast}
            />
            <DiscoverGraphQLModal
              open={discoverGqlModal.open}
              onOpenChange={(nextOpen) =>
                setDiscoverGqlModal((prev) => ({ ...prev, open: nextOpen }))
              }
              collectionId={discoverGqlModal.collectionId}
              folderId={discoverGqlModal.folderId}
              onGenerated={showToast}
            />
            <GitRemoteUpdateModal
              open={remoteUpdateModalOpen}
              onOpenChange={setRemoteUpdateModalOpen}
              updateInfo={remoteUpdate}
              snoozeMins={gitSyncStatus?.fetchSnoozeMins ?? 30}
              onPull={handlePullRemoteUpdates}
              onSnooze={snoozeRemoteNotifications}
              onMuteSession={muteRemoteNotificationsForSession}
              onOpenGitSettings={() => openSettings('git-sync')}
            />
            <CodeSnippetModal open={codeSnippetOpen} onOpenChange={setCodeSnippetOpen} />
            <CommandPalette
              open={commandPaletteOpen}
              onOpenChange={setCommandPaletteOpen}
              onSendRequest={() => void sendTabRequest(activeTabId)}
              onFormatBody={handleFormatActiveBody}
              onImportCurl={() => setImportCurlOpen(true)}
              onImportCollection={() => openImportCollection()}
              onOpenCodeSnippet={() => setCodeSnippetOpen(true)}
              onToggleSidebar={() => setSidebarOpen((v) => !v)}
              onOpenCookies={() => setCookiesOpen(true)}
              onOpenEnvironments={() => setEnvOpen(true)}
              onOpenSettings={() => openSettings('general')}
              onNewCollection={() => {
                setSidebarOpen(true);
                setCreateCollectionTrigger((n) => n + 1);
              }}
            />
            <SettingsModal
              open={settingsOpen}
              onOpenChange={setSettingsOpen}
              onRecordingChange={setRecordingShortcut}
              initialTab={settingsTab}
              onGitSyncStatusChange={handleGitSyncStatusChange}
              onRemoteUpdateFound={(info) => presentRemoteUpdateNotification(info, true)}
              onOpenImportCollection={() => openImportCollection()}
            />
            <Toaster />
          </>
        }
      />
    </TooltipProvider>
  );
}

export default App;
