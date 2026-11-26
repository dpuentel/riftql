import * as React from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Copy,
  Database as DatabaseIcon,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FolderGit2,
  FolderOpen,
  FolderUp,
  GitBranch,
  GitCommit,
  KeyRound,
  Keyboard,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Type,
  Upload,
} from 'lucide-react';
import { ActionTooltip } from '@/components/ui/action-tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DEFAULT_SHORTCUTS,
  detectShortcutConflict,
  formatShortcutForDisplay,
  getEffectiveShortcuts,
  keyboardEventToCombo,
} from '@/lib/shortcuts';
import { formatBytes, formatRelativeTime } from '@/lib/format';
import { exportJsonFile, importJsonFileViaDialog } from '@/lib/file-io';
import {
  hasNativeFileBridge,
  invokeCommand,
  pickOpenDirectory,
} from '@/lib/tauri';
import { cn } from '@/lib/utils';
import {
  MAX_CODE_FONT_SIZE,
  MAX_UI_FONT_SIZE,
  MIN_CODE_FONT_SIZE,
  MIN_UI_FONT_SIZE,
  useSettingsStore,
} from '@/store/useSettingsStore';
import { useTabsStore } from '@/store/useTabsStore';
import { useUpdaterStore } from '@/store/useUpdaterStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import type { ShortcutActionId, ShortcutDefinition } from '@/types/shortcuts';
import type {
  FolderInspection,
  GitRemoteUpdateInfo,
  GitSyncActionResult,
  GitSyncMigrationMode,
  GitSyncStatus,
  SplitLayout,
  StorageInfo,
  ThemePreference,
  WorkspaceExport,
} from '@/types/storage';

export type SettingsTab = 'general' | 'network' | 'shortcuts' | 'data' | 'git-sync' | 'updates';

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
}

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecordingChange?: (recording: boolean) => void;
  initialTab?: SettingsTab;
  onGitSyncStatusChange?: (status: GitSyncStatus) => void;
  onRemoteUpdateFound?: (info: GitRemoteUpdateInfo) => void;
  onOpenImportCollection?: () => void;
}

export function SettingsModal({
  open,
  onOpenChange,
  onRecordingChange,
  initialTab = 'general',
  onGitSyncStatusChange,
  onRemoteUpdateFound,
  onOpenImportCollection,
}: SettingsModalProps) {
  const settings = useSettingsStore((s) => s.settings);
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const setShortcut = useSettingsStore((s) => s.setShortcut);
  const resetShortcut = useSettingsStore((s) => s.resetShortcut);
  const resetAllShortcuts = useSettingsStore((s) => s.resetAllShortcuts);

  const exportWorkspace = useWorkspaceStore((s) => s.exportWorkspace);
  const importWorkspace = useWorkspaceStore((s) => s.importWorkspace);
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace);
  const loadSessionTabs = useTabsStore((s) => s.loadSessionTabs);
  const syncTabsWithWorkspace = useTabsStore((s) => s.syncTabsWithWorkspace);

  const currentVersion = useUpdaterStore((s) => s.currentVersion);
  const runtimeInfo = useUpdaterStore((s) => s.runtimeInfo);
  const updateInfo = useUpdaterStore((s) => s.updateInfo);
  const checkingUpdates = useUpdaterStore((s) => s.checking);
  const installingUpdate = useUpdaterStore((s) => s.installing);
  const updateProgress = useUpdaterStore((s) => s.progress);
  const updaterError = useUpdaterStore((s) => s.error);
  const lastCheckedAt = useUpdaterStore((s) => s.lastCheckedAt);
  const initRuntimeInfo = useUpdaterStore((s) => s.initRuntimeInfo);
  const checkForUpdates = useUpdaterStore((s) => s.checkForUpdates);
  const installUpdate = useUpdaterStore((s) => s.installUpdate);
  const openReleaseUrl = useUpdaterStore((s) => s.openReleaseUrl);

  const [activeTab, setActiveTab] = React.useState<SettingsTab>(initialTab);
  const [shortcutFilter, setShortcutFilter] = React.useState('');
  const [recordingId, setRecordingId] = React.useState<ShortcutActionId | null>(null);
  const [conflictInfo, setConflictInfo] = React.useState<{
    actionId: ShortcutActionId;
    combo: string;
    conflictsWith: ShortcutDefinition;
  } | null>(null);
  const [dataMessage, setDataMessage] = React.useState<string | null>(null);
  const [storageInfo, setStorageInfo] = React.useState<StorageInfo | null>(null);
  const [migrateOnMove, setMigrateOnMove] = React.useState(true);
  const [changingDir, setChangingDir] = React.useState(false);
  const [copiedPath, setCopiedPath] = React.useState(false);

  const [gitSyncStatus, setGitSyncStatus] = React.useState<GitSyncStatus | null>(null);
  const [syncFolderInput, setSyncFolderInput] = React.useState('');
  const [syncRemoteInput, setSyncRemoteInput] = React.useState('');
  const [syncBranchInput, setSyncBranchInput] = React.useState('');
  const [syncAutoSync, setSyncAutoSync] = React.useState(true);
  const [syncAutoPush, setSyncAutoPush] = React.useState(false);
  const [syncAutoPushDelaySecs, setSyncAutoPushDelaySecs] = React.useState(15);
  const [syncAutoFetch, setSyncAutoFetch] = React.useState(false);
  const [syncAutoFetchIntervalMins, setSyncAutoFetchIntervalMins] = React.useState(5);
  const [syncFetchSnoozeMins, setSyncFetchSnoozeMins] = React.useState(30);
  const [migrationMode, setMigrationMode] =
    React.useState<GitSyncMigrationMode>('migrate-to-folder');
  const [initGitOnEnable, setInitGitOnEnable] = React.useState(true);
  const [folderInspection, setFolderInspection] = React.useState<FolderInspection | null>(null);
  const [commitMessage, setCommitMessage] = React.useState('chore(riftql): sync workspace');
  const [gitUsername, setGitUsername] = React.useState('');
  const [gitPassword, setGitPassword] = React.useState('');
  const [showGitPassword, setShowGitPassword] = React.useState(false);
  const [showAuthFields, setShowAuthFields] = React.useState(false);
  const [gitSyncBusy, setGitSyncBusy] = React.useState(false);
  const [gitSyncMessage, setGitSyncMessage] = React.useState<string | null>(null);
  const [gitSyncError, setGitSyncError] = React.useState<string | null>(null);
  const importInputRef = React.useRef<HTMLInputElement | null>(null);
  const onGitSyncStatusChangeRef = React.useRef(onGitSyncStatusChange);
  onGitSyncStatusChangeRef.current = onGitSyncStatusChange;

  React.useEffect(() => {
    onRecordingChange?.(recordingId !== null);
  }, [recordingId, onRecordingChange]);

  const inspectSyncFolder = React.useCallback(async (path: string) => {
    const trimmed = path.trim();
    if (!trimmed || !hasNativeFileBridge()) {
      setFolderInspection(null);
      return null;
    }
    try {
      const inspected = await invokeCommand<FolderInspection>('inspect_git_sync_folder_cmd', {
        folderPath: trimmed,
      });
      if (inspected && typeof inspected.exists === 'boolean') {
        setFolderInspection(inspected);
        if (inspected.hasRiftqlWorkspace) {
          setMigrationMode('import-from-folder');
        }
        return inspected;
      }
    } catch {
      setFolderInspection(null);
    }
    return null;
  }, []);

  const applyGitSyncStatus = React.useCallback((status: GitSyncStatus) => {
    setGitSyncStatus(status);
    onGitSyncStatusChangeRef.current?.(status);
    if (status.folderPath !== undefined) {
      setSyncFolderInput(status.folderPath ?? '');
    }
    if (status.remoteUrl !== undefined) {
      setSyncRemoteInput(status.remoteUrl ?? '');
    }
    if (status.branch !== undefined) {
      setSyncBranchInput(status.branch ?? '');
    }
    if (status.authUsername !== undefined) {
      setGitUsername(status.authUsername ?? '');
    }
    setSyncAutoSync(status.autoSync);
    setSyncAutoPush(Boolean(status.autoPush));
    setSyncAutoPushDelaySecs(status.autoPushDelaySecs ?? 15);
    setSyncAutoFetch(Boolean(status.autoFetch));
    setSyncAutoFetchIntervalMins(status.autoFetchIntervalMins ?? 5);
    setSyncFetchSnoozeMins(status.fetchSnoozeMins ?? 30);
  }, []);

  React.useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  React.useEffect(() => {
    if (!open) {
      setRecordingId(null);
      setConflictInfo(null);
      setDataMessage(null);
      setCopiedPath(false);
      setGitSyncMessage(null);
      setGitSyncError(null);
      setGitPassword('');
      setShowGitPassword(false);
      return;
    }

    if (hasNativeFileBridge()) {
      void initRuntimeInfo();

      void invokeCommand<StorageInfo>('get_storage_info_cmd')
        .then((info) => {
          if (info && typeof info.currentDataDir === 'string') setStorageInfo(info);
        })
        .catch(() => {
          // Ignore when command mock doesn't return StorageInfo
        });

      void invokeCommand<GitSyncStatus>('get_git_sync_status_cmd')
        .then((status) => {
          if (status && typeof status.enabled === 'boolean') {
            applyGitSyncStatus(status);
            if (status.folderPath) {
              void inspectSyncFolder(status.folderPath);
            }
          }
        })
        .catch(() => {
          // Ignore when command mock doesn't implement get_git_sync_status_cmd
        });
    }
  }, [open, applyGitSyncStatus, inspectSyncFolder, initRuntimeInfo]);

  const effectiveShortcuts = React.useMemo(
    () => getEffectiveShortcuts(settings.customShortcuts),
    [settings.customShortcuts],
  );

  React.useEffect(() => {
    if (!recordingId) return;

    const handleKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setRecordingId(null);
        return;
      }

      const combo = keyboardEventToCombo(e);
      if (!combo) return;

      const conflict = detectShortcutConflict(recordingId, combo, effectiveShortcuts);
      if (conflict) {
        setConflictInfo({
          actionId: recordingId,
          combo,
          conflictsWith: conflict,
        });
        setRecordingId(null);
        return;
      }

      setConflictInfo(null);
      void setShortcut(recordingId, combo);
      setRecordingId(null);
    };

    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [recordingId, effectiveShortcuts, setShortcut]);

  const handleExportWorkspace = async () => {
    try {
      const data = await exportWorkspace();
      const json = JSON.stringify(data, null, 2);
      const result = await exportJsonFile(
        'riftql-workspace.json',
        json,
        'Export Workspace JSON',
      );
      if (!result.saved) return;
      setDataMessage(
        result.path
          ? `Exported workspace JSON to ${result.path} (secret variable values stripped).`
          : 'Exported workspace JSON (secret variable values stripped).',
      );
    } catch (err) {
      setDataMessage(
        err instanceof Error ? err.message : 'Failed to export workspace JSON.',
      );
    }
  };

  const importWorkspaceFromText = async (text: string) => {
    try {
      const parsed = JSON.parse(text) as WorkspaceExport;
      await importWorkspace(parsed);
      setDataMessage('Workspace imported successfully.');
    } catch (err) {
      setDataMessage(
        err instanceof Error ? err.message : 'Invalid RiftQL workspace JSON file.',
      );
    }
  };

  const handleImportWorkspaceClick = async () => {
    if (hasNativeFileBridge()) {
      try {
        const text = await importJsonFileViaDialog('Import Workspace JSON');
        if (text !== null) {
          await importWorkspaceFromText(text);
        }
      } catch (err) {
        setDataMessage(
          err instanceof Error ? err.message : 'Failed to read RiftQL workspace JSON file.',
        );
      }
      return;
    }
    importInputRef.current?.click();
  };

  const handleImportWorkspace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importWorkspaceFromText(await file.text());
    } finally {
      e.target.value = '';
    }
  };

  const applyDataDirectoryChange = async (newDir: string | null) => {
    setChangingDir(true);
    try {
      const updated = await invokeCommand<StorageInfo>('set_data_directory_cmd', {
        newDir,
        migrateExisting: migrateOnMove,
      });
      setStorageInfo(updated);
      await loadWorkspace();
      await loadSessionTabs();
      setDataMessage(
        updated.isCustom
          ? `Data storage moved to ${updated.currentDataDir}.`
          : `Data storage reset to default (${updated.currentDataDir}).`,
      );
    } catch (err) {
      setDataMessage(
        err instanceof Error ? err.message : 'Failed to change data storage folder.',
      );
    } finally {
      setChangingDir(false);
    }
  };

  const handleChangeDataDir = async () => {
    const picked = await pickOpenDirectory({
      title: 'Select RiftQL Data Storage Folder',
      defaultPath: storageInfo?.currentDataDir,
    });
    if (!picked) return;
    await applyDataDirectoryChange(picked);
  };

  const handleCopyDataPath = async () => {
    if (!storageInfo) return;
    try {
      await navigator.clipboard.writeText(storageInfo.currentDataDir);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 1500);
    } catch {
      // Clipboard unavailable
    }
  };

  const handleSyncActionResult = async (result: GitSyncActionResult) => {
    applyGitSyncStatus(result.status);
    setGitSyncError(null);
    setGitSyncMessage(result.message);
    if (result.workspaceReloaded) {
      await loadWorkspace();
      syncTabsWithWorkspace(useWorkspaceStore.getState().savedRequests);
    }
    if (result.status.folderPath) {
      await inspectSyncFolder(result.status.folderPath);
    }
  };

  const handlePickSyncFolder = async () => {
    const picked = await pickOpenDirectory({
      title: 'Select Git-Friendly Workspace Folder',
      defaultPath: syncFolderInput || undefined,
    });
    if (!picked) return;
    setSyncFolderInput(picked);
    setGitSyncError(null);
    const inspected = await inspectSyncFolder(picked);
    if (inspected) {
      if (inspected.git.remoteUrl && !syncRemoteInput.trim()) {
        setSyncRemoteInput(inspected.git.remoteUrl);
      }
      if (inspected.git.branch && !syncBranchInput.trim()) {
        setSyncBranchInput(inspected.git.branch);
      }
      if (!inspected.hasRiftqlWorkspace && inspected.isEmpty && syncRemoteInput.trim()) {
        setMigrationMode('clone-repo');
      } else if (inspected.hasRiftqlWorkspace) {
        setMigrationMode('import-from-folder');
      } else {
        setMigrationMode('migrate-to-folder');
      }
    }
  };

  const handleConfigureAndEnableSync = async () => {
    const folderPath = syncFolderInput.trim();
    if (!folderPath) {
      setGitSyncError('Select or enter a target folder path first.');
      return;
    }
    setGitSyncBusy(true);
    setGitSyncError(null);
    setGitSyncMessage(null);
    try {
      const result = await invokeCommand<GitSyncActionResult>('configure_git_sync_cmd', {
        folderPath,
        remoteUrl: syncRemoteInput.trim() || null,
        branch: syncBranchInput.trim() || null,
        migrationMode,
        initGit: initGitOnEnable,
        autoSync: syncAutoSync,
        username: gitUsername.trim() || null,
        password: gitPassword.trim() ? gitPassword : null,
      });
      setGitPassword('');
      await handleSyncActionResult(result);
    } catch (err) {
      setGitSyncError(extractErrorMessage(err, 'Failed to enable Git workspace sync.'));
    } finally {
      setGitSyncBusy(false);
    }
  };

  const handleSaveGitCredentials = async (clear = false) => {
    setGitSyncBusy(true);
    setGitSyncError(null);
    setGitSyncMessage(null);
    try {
      const updated = await invokeCommand<GitSyncStatus>('save_git_credentials_cmd', {
        username: clear ? null : gitUsername.trim() || null,
        password: clear ? null : gitPassword.trim() ? gitPassword : null,
        clear,
      });
      if (clear) {
        setGitUsername('');
      }
      setGitPassword('');
      applyGitSyncStatus(updated);
      setGitSyncMessage(
        clear ? 'Cleared saved Git HTTPS credentials.' : 'Saved Git HTTPS credentials locally.',
      );
    } catch (err) {
      setGitSyncError(
        extractErrorMessage(
          err,
          clear ? 'Failed to clear Git credentials.' : 'Failed to save Git credentials.',
        ),
      );
    } finally {
      setGitSyncBusy(false);
    }
  };

  const handleToggleGitSync = async (nextEnabled: boolean) => {
    if (!nextEnabled) {
      setGitSyncBusy(true);
      setGitSyncError(null);
      try {
        const updated = await invokeCommand<GitSyncStatus>('disable_git_sync_cmd');
        applyGitSyncStatus(updated);
        setGitSyncMessage('Git workspace sync disabled. RiftQL continues using local SQLite.');
      } catch (err) {
        setGitSyncError(extractErrorMessage(err, 'Failed to disable Git workspace sync.'));
      } finally {
        setGitSyncBusy(false);
      }
      return;
    }

    if (!syncFolderInput.trim()) {
      setGitSyncError('Choose a local folder below first, then enable Git workspace sync.');
      return;
    }
    await handleConfigureAndEnableSync();
  };

  const handleManualSync = async (direction: 'to-disk' | 'from-disk') => {
    setGitSyncBusy(true);
    setGitSyncError(null);
    setGitSyncMessage(null);
    try {
      const result = await invokeCommand<GitSyncActionResult>('sync_git_workspace_now_cmd', {
        direction,
      });
      await handleSyncActionResult(result);
    } catch (err) {
      setGitSyncError(extractErrorMessage(err, 'Manual workspace sync failed.'));
    } finally {
      setGitSyncBusy(false);
    }
  };

  const handleGitInitRepo = async () => {
    setGitSyncBusy(true);
    setGitSyncError(null);
    setGitSyncMessage(null);
    try {
      const result = await invokeCommand<GitSyncActionResult>('git_init_workspace_cmd', {
        folderPath: syncFolderInput.trim() || null,
        remoteUrl: syncRemoteInput.trim() || null,
        branch: syncBranchInput.trim() || null,
      });
      await handleSyncActionResult(result);
    } catch (err) {
      setGitSyncError(extractErrorMessage(err, 'Failed to initialize Git repository.'));
    } finally {
      setGitSyncBusy(false);
    }
  };

  const handleSaveAutomationOptions = async (patch: {
    autoSync?: boolean;
    autoPush?: boolean;
    autoPushDelaySecs?: number;
    autoFetch?: boolean;
    autoFetchIntervalMins?: number;
    fetchSnoozeMins?: number;
  }) => {
    const nextAutoSync = patch.autoSync ?? syncAutoSync;
    const nextAutoPush = patch.autoPush ?? syncAutoPush;
    const nextDelay = patch.autoPushDelaySecs ?? syncAutoPushDelaySecs;
    const nextAutoFetch = patch.autoFetch ?? syncAutoFetch;
    const nextFetchInterval = patch.autoFetchIntervalMins ?? syncAutoFetchIntervalMins;
    const nextSnooze = patch.fetchSnoozeMins ?? syncFetchSnoozeMins;

    setSyncAutoSync(nextAutoSync);
    setSyncAutoPush(nextAutoPush);
    setSyncAutoPushDelaySecs(nextDelay);
    setSyncAutoFetch(nextAutoFetch);
    setSyncAutoFetchIntervalMins(nextFetchInterval);
    setSyncFetchSnoozeMins(nextSnooze);

    if (!hasNativeFileBridge()) return;
    setGitSyncError(null);
    try {
      const updated = await invokeCommand<GitSyncStatus>('update_git_sync_options_cmd', {
        autoSync: nextAutoSync,
        autoPush: nextAutoPush,
        autoPushDelaySecs: nextDelay,
        autoFetch: nextAutoFetch,
        autoFetchIntervalMins: nextFetchInterval,
        fetchSnoozeMins: nextSnooze,
      });
      if (updated && typeof updated.enabled === 'boolean') {
        applyGitSyncStatus(updated);
      }
      setGitSyncMessage('Saved Git sync automation preferences.');
    } catch (err) {
      setGitSyncError(extractErrorMessage(err, 'Failed to save automation settings.'));
    }
  };

  const handleGitFetchNow = async () => {
    setGitSyncBusy(true);
    setGitSyncError(null);
    setGitSyncMessage(null);
    try {
      const result = await invokeCommand<GitSyncActionResult>('git_fetch_workspace_cmd');
      await handleSyncActionResult(result);
      if (result.status.remoteUpdate) {
        onRemoteUpdateFound?.(result.status.remoteUpdate);
      }
    } catch (err) {
      setGitSyncError(extractErrorMessage(err, 'Git fetch failed.'));
    } finally {
      setGitSyncBusy(false);
    }
  };

  const handleGitPull = async () => {
    setGitSyncBusy(true);
    setGitSyncError(null);
    setGitSyncMessage(null);
    try {
      const result = await invokeCommand<GitSyncActionResult>('git_pull_workspace_cmd', {
        rebase: false,
      });
      await handleSyncActionResult(result);
    } catch (err) {
      setGitSyncError(extractErrorMessage(err, 'Git pull failed.'));
    } finally {
      setGitSyncBusy(false);
    }
  };

  const handleGitCommitPush = async (push: boolean) => {
    setGitSyncBusy(true);
    setGitSyncError(null);
    setGitSyncMessage(null);
    try {
      const result = await invokeCommand<GitSyncActionResult>('git_commit_push_workspace_cmd', {
        message: commitMessage.trim() || 'chore(riftql): sync workspace',
        push,
      });
      await handleSyncActionResult(result);
    } catch (err) {
      setGitSyncError(extractErrorMessage(err, push ? 'Git commit & push failed.' : 'Git commit failed.'));
    } finally {
      setGitSyncBusy(false);
    }
  };

  const handleRefreshGitStatus = async () => {
    if (!hasNativeFileBridge()) return;
    setGitSyncBusy(true);
    try {
      const status = await invokeCommand<GitSyncStatus>('get_git_sync_status_cmd');
      if (status && typeof status.enabled === 'boolean') {
        applyGitSyncStatus(status);
      }
      if (syncFolderInput.trim()) {
        await inspectSyncFolder(syncFolderInput);
      }
    } catch (err) {
      setGitSyncError(extractErrorMessage(err, 'Failed to refresh Git status.'));
    } finally {
      setGitSyncBusy(false);
    }
  };

  const filteredShortcuts = DEFAULT_SHORTCUTS.filter((def) => {
    const q = shortcutFilter.trim().toLowerCase();
    if (!q) return true;
    return (
      def.label.toLowerCase().includes(q) ||
      def.category.toLowerCase().includes(q) ||
      formatShortcutForDisplay(effectiveShortcuts[def.id]).toLowerCase().includes(q)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        resizable
        storageKey="riftql-settings-modal-size"
        minWidth={560}
        minHeight={420}
        className="max-w-2xl"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-[var(--accent)]" />
            <span>RiftQL Settings</span>
          </DialogTitle>
          <DialogDescription>
            Customize appearance, HTTP networking defaults, keyboard shortcuts, and workspace data.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as SettingsTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="network">Network</TabsTrigger>
            <TabsTrigger value="shortcuts">
              <Keyboard className="h-3.5 w-3.5" />
              <span>Shortcuts</span>
            </TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
            <TabsTrigger value="git-sync">
              <GitBranch className="h-3.5 w-3.5" />
              <span>Git Sync</span>
            </TabsTrigger>
            <TabsTrigger value="updates">
              <Download className="h-3.5 w-3.5" />
              <span>Updates</span>
              {updateInfo?.available && (
                <span
                  aria-label="Update available"
                  className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
                />
              )}
            </TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general" className="min-h-0 flex-1 flex flex-col gap-4 overflow-y-auto pt-3 pr-1 rift-scroll">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-[var(--text-primary)]">Theme</span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'dark', label: 'Dark' },
                    { id: 'light', label: 'Light' },
                    {
                      id: 'system',
                      label: `System (Currently ${resolvedTheme === 'dark' ? 'Dark' : 'Light'})`,
                    },
                  ] as Array<{ id: ThemePreference; label: string }>
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => void updateSettings({ theme: opt.id })}
                    className={cn(
                      'cursor-pointer rounded-md border px-3 py-2 text-xs font-medium transition-colors',
                      settings.theme === opt.id
                        ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--text-primary)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-[var(--text-primary)]">
                Default Split Layout
              </span>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'horizontal', label: 'Horizontal (Side-by-Side)' },
                    { id: 'vertical', label: 'Vertical (Stacked)' },
                  ] as Array<{ id: SplitLayout; label: string }>
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => void updateSettings({ layout: opt.id })}
                    className={cn(
                      'cursor-pointer rounded-md border px-3 py-2 text-xs font-medium transition-colors',
                      settings.layout === opt.id
                        ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--text-primary)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Typography / Font Sizes */}
            <div className="flex flex-col gap-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                <Type className="h-3.5 w-3.5 text-[var(--accent)]" />
                <span>Typography &amp; Font Size</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="ui-font-size-slider"
                    className="text-xs font-medium text-[var(--text-primary)]"
                  >
                    Interface Font Size
                  </label>
                  <Badge variant="accent" className="font-mono-code tabular-nums">
                    {settings.uiFontSize}px
                  </Badge>
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    [
                      { label: 'Compact', size: 14 },
                      { label: 'Default', size: 16 },
                      { label: 'Comfortable', size: 18 },
                      { label: 'Large', size: 20 },
                    ] as const
                  ).map((preset) => (
                    <button
                      key={preset.size}
                      type="button"
                      onClick={() => void updateSettings({ uiFontSize: preset.size })}
                      className={cn(
                        'cursor-pointer rounded border px-2 py-1 text-[0.75rem] font-medium transition-colors',
                        settings.uiFontSize === preset.size
                          ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--text-primary)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                      )}
                    >
                      {preset.label} ({preset.size}px)
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="icon-sm"
                    variant="secondary"
                    aria-label="Decrease interface font size"
                    disabled={settings.uiFontSize <= MIN_UI_FONT_SIZE}
                    onClick={() =>
                      void updateSettings({ uiFontSize: settings.uiFontSize - 1 })
                    }
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <input
                    id="ui-font-size-slider"
                    type="range"
                    min={MIN_UI_FONT_SIZE}
                    max={MAX_UI_FONT_SIZE}
                    step={1}
                    value={settings.uiFontSize}
                    aria-label="Interface font size"
                    onChange={(e) =>
                      void updateSettings({ uiFontSize: Number(e.target.value) })
                    }
                    className="flex-1 cursor-pointer accent-[var(--accent)]"
                  />
                  <Button
                    size="icon-sm"
                    variant="secondary"
                    aria-label="Increase interface font size"
                    disabled={settings.uiFontSize >= MAX_UI_FONT_SIZE}
                    onClick={() =>
                      void updateSettings({ uiFontSize: settings.uiFontSize + 1 })
                    }
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 border-t border-[var(--border-subtle)] pt-2.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="code-font-size-slider"
                    className="text-xs font-medium text-[var(--text-primary)]"
                  >
                    Code Editor Font Size
                  </label>
                  <Badge variant="accent" className="font-mono-code tabular-nums">
                    {settings.codeFontSize}px
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="icon-sm"
                    variant="secondary"
                    aria-label="Decrease code font size"
                    disabled={settings.codeFontSize <= MIN_CODE_FONT_SIZE}
                    onClick={() =>
                      void updateSettings({ codeFontSize: settings.codeFontSize - 1 })
                    }
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <input
                    id="code-font-size-slider"
                    type="range"
                    min={MIN_CODE_FONT_SIZE}
                    max={MAX_CODE_FONT_SIZE}
                    step={1}
                    value={settings.codeFontSize}
                    aria-label="Code font size"
                    onChange={(e) =>
                      void updateSettings({ codeFontSize: Number(e.target.value) })
                    }
                    className="flex-1 cursor-pointer accent-[var(--accent)]"
                  />
                  <Button
                    size="icon-sm"
                    variant="secondary"
                    aria-label="Increase code font size"
                    disabled={settings.codeFontSize >= MAX_CODE_FONT_SIZE}
                    onClick={() =>
                      void updateSettings({ codeFontSize: settings.codeFontSize + 1 })
                    }
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>

                <pre
                  style={{ fontSize: `${settings.codeFontSize}px` }}
                  className="overflow-hidden rounded border border-[var(--border-subtle)] bg-[var(--cm-bg)] px-2.5 py-1.5 font-mono-code text-[var(--text-primary)]"
                >
                  {'query GetUser($id: ID!) { user(id: $id) { name } }'}
                </pre>
              </div>
            </div>
          </TabsContent>

          {/* Network Tab */}
          <TabsContent value="network" className="min-h-0 flex-1 flex flex-col gap-3 overflow-y-auto pt-3 pr-1 rift-scroll">
            <label className="flex items-center justify-between rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2">
              <div>
                <div className="text-xs font-medium text-[var(--text-primary)]">
                  Verify SSL Certificates
                </div>
                <div className="text-[0.75rem] text-[var(--text-secondary)]">
                  Disable to allow self-signed certificates on localhost/staging.
                </div>
              </div>
              <Switch
                aria-label="Verify SSL certificates"
                checked={settings.verifySsl}
                onCheckedChange={(verifySsl) => void updateSettings({ verifySsl })}
              />
            </label>

            <label className="flex items-center justify-between rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2">
              <div>
                <div className="text-xs font-medium text-[var(--text-primary)]">
                  Follow Redirects
                </div>
                <div className="text-[0.75rem] text-[var(--text-secondary)]">
                  Automatically follow 3xx redirect responses up to max hops.
                </div>
              </div>
              <Switch
                aria-label="Follow redirects"
                checked={settings.followRedirects}
                onCheckedChange={(followRedirects) => void updateSettings({ followRedirects })}
              />
            </label>

            <label className="flex items-center justify-between rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2">
              <div>
                <div className="text-xs font-medium text-[var(--text-primary)]">
                  Automatic Domain Cookie Jar
                </div>
                <div className="text-[0.75rem] text-[var(--text-secondary)]">
                  Capture Set-Cookie headers and resend matching cookies per domain.
                </div>
              </div>
              <Switch
                aria-label="Automatic cookie jar"
                checked={settings.sendCookies}
                onCheckedChange={(sendCookies) => void updateSettings({ sendCookies })}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[0.75rem] font-medium text-[var(--text-secondary)]">
                  Max Redirects
                </label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={settings.maxRedirects}
                  aria-label="Max redirects"
                  onChange={(e) =>
                    void updateSettings({
                      maxRedirects: Math.max(1, Number(e.target.value) || 10),
                    })
                  }
                  className="font-mono-code tabular-nums"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[0.75rem] font-medium text-[var(--text-secondary)]">
                  Default Timeout (ms)
                </label>
                <Input
                  type="number"
                  min={500}
                  step={500}
                  value={settings.timeoutMs}
                  aria-label="Default timeout ms"
                  onChange={(e) =>
                    void updateSettings({
                      timeoutMs: Math.max(500, Number(e.target.value) || 30_000),
                    })
                  }
                  className="font-mono-code tabular-nums"
                />
              </div>
            </div>
          </TabsContent>

          {/* Shortcuts Tab */}
          <TabsContent value="shortcuts" className="min-h-0 flex-1 flex flex-col gap-2.5 overflow-hidden pt-3">
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1.5 left-2.5 h-3.5 w-3.5 text-[var(--text-secondary)]" />
                <Input
                  value={shortcutFilter}
                  onChange={(e) => setShortcutFilter(e.target.value)}
                  placeholder="Filter keyboard shortcuts..."
                  aria-label="Filter shortcuts"
                  className="pl-8"
                />
              </div>
              <Button
                size="xs"
                variant="secondary"
                onClick={() => {
                  setConflictInfo(null);
                  void resetAllShortcuts();
                }}
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset All</span>
              </Button>
            </div>

            {conflictInfo && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-[#FBBF24]/40 bg-[#FBBF24]/10 px-3 py-2 text-xs text-[#D97706] dark:text-[#FBBF24]">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    <strong className="font-mono-code">
                      {formatShortcutForDisplay(conflictInfo.combo)}
                    </strong>{' '}
                    is already assigned to <strong>{conflictInfo.conflictsWith.label}</strong>.
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => {
                      void setShortcut(conflictInfo.actionId, conflictInfo.combo);
                      setConflictInfo(null);
                    }}
                  >
                    Assign Anyway
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => setConflictInfo(null)}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            )}

            <div className="min-h-[14rem] flex-1 overflow-auto rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] rift-scroll">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 text-[0.75rem] text-[var(--text-secondary)]">
                    <th className="px-2.5 py-1.5">Action</th>
                    <th className="px-2.5 py-1.5">Category</th>
                    <th className="px-2.5 py-1.5 text-right">Shortcut</th>
                    <th className="w-10 px-1 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {filteredShortcuts.map((def) => {
                    const isRecording = recordingId === def.id;
                    const isCustom = Boolean(settings.customShortcuts[def.id]);
                    const display = formatShortcutForDisplay(effectiveShortcuts[def.id]);
                    return (
                      <tr
                        key={def.id}
                        className="border-b border-[var(--border-subtle)]/70 last:border-b-0 hover:bg-[var(--bg-hover)]"
                      >
                        <td className="px-2.5 py-1.5 font-medium text-[var(--text-primary)]">
                          {def.label}
                        </td>
                        <td className="px-2.5 py-1.5">
                          <Badge>{def.category}</Badge>
                        </td>
                        <td className="px-2.5 py-1.5 text-right">
                          <button
                            type="button"
                            aria-label={`Record shortcut for ${def.label}`}
                            onClick={() => {
                              setConflictInfo(null);
                              setRecordingId(isRecording ? null : def.id);
                            }}
                            className={cn(
                              'cursor-pointer rounded border px-2 py-0.5 font-mono-code text-[0.75rem] transition-colors',
                              isRecording
                                ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent)]'
                                : isCustom
                                  ? 'border-[var(--accent)]/40 bg-[var(--bg-surface)] text-[var(--text-primary)]'
                                  : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                            )}
                          >
                            {isRecording ? 'Press keys…' : display}
                          </button>
                        </td>
                        <td className="px-1 py-1.5 text-center">
                          {isCustom && (
                            <ActionTooltip label="Reset to Default">
                              <button
                                type="button"
                                aria-label={`Reset shortcut for ${def.label}`}
                                onClick={() => void resetShortcut(def.id)}
                                className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                              >
                                <RotateCcw className="h-3 w-3" />
                              </button>
                            </ActionTooltip>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* Data Tab */}
          <TabsContent value="data" className="min-h-0 flex-1 flex flex-col gap-3 overflow-y-auto pt-3 pr-1 rift-scroll">
            {/* Local Data Storage Location */}
            <div className="flex flex-col gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                  <DatabaseIcon className="h-3.5 w-3.5 text-[var(--accent)]" />
                  <span>Local Data Directory</span>
                </div>
                {storageInfo && (
                  <Badge variant={storageInfo.isCustom ? 'accent' : 'default'}>
                    {storageInfo.isCustom ? 'Custom Folder' : 'System Default'}
                  </Badge>
                )}
              </div>

              {storageInfo ? (
                <>
                  <div className="flex items-center justify-between gap-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5">
                    <div className="min-w-0 flex-1">
                      <div
                        title={storageInfo.currentDataDir}
                        className="truncate font-mono-code text-[0.75rem] text-[var(--text-primary)] select-all"
                      >
                        {storageInfo.currentDataDir}
                      </div>
                      <div
                        title={storageInfo.dbPath}
                        className="truncate font-mono-code text-[0.6875rem] text-[var(--text-secondary)]"
                      >
                        Database: {storageInfo.dbPath}
                      </div>
                    </div>
                    <ActionTooltip label="Copy Directory Path">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Copy data directory path"
                        onClick={() => void handleCopyDataPath()}
                      >
                        {copiedPath ? (
                          <Check className="h-3.5 w-3.5 text-[#34D399]" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </ActionTooltip>
                  </div>

                  <label className="flex cursor-pointer items-center gap-2 text-[0.75rem] text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={migrateOnMove}
                      onChange={(e) => setMigrateOnMove(e.target.checked)}
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                    <span>Copy current database if destination folder has no riftql.db yet</span>
                  </label>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      size="xs"
                      disabled={changingDir}
                      onClick={() => void handleChangeDataDir()}
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      <span>Change Folder…</span>
                    </Button>
                    {storageInfo.isCustom && (
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={changingDir}
                        onClick={() => void applyDataDirectoryChange(null)}
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Reset to Default</span>
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-[0.75rem] text-[var(--text-secondary)]">
                  Default app data location: <code className="font-mono-code">~/.local/share/com.riftql.app</code>{' '}
                  (Linux) · <code className="font-mono-code">%APPDATA%\com.riftql.app</code> (Windows).
                </div>
              )}
            </div>

            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 text-xs text-[var(--text-secondary)]">
              Export your collections, nested folders, saved requests, and environments as JSON.
              Variables flagged as secret are automatically stripped before export.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => void handleImportWorkspace(e)}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleExportWorkspace()}
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export Workspace JSON</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleImportWorkspaceClick()}
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Import Workspace JSON</span>
              </Button>
              {onOpenImportCollection && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenImportCollection();
                  }}
                >
                  <FolderUp className="h-3.5 w-3.5" />
                  <span>Import External (Postman, Altair, OpenAPI)…</span>
                </Button>
              )}
            </div>
            {dataMessage && (
              <div className="text-xs text-[var(--accent)]">{dataMessage}</div>
            )}
          </TabsContent>

          {/* Git Sync Tab */}
          <TabsContent
            value="git-sync"
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pt-3 pr-1 rift-scroll"
          >
            {!hasNativeFileBridge() ? (
              <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 text-xs text-[var(--text-secondary)]">
                Git-friendly filesystem synchronization requires the RiftQL desktop runtime.
              </div>
            ) : (
              <>
                {/* Master Enable/Disable Toggle */}
                <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                      <FolderGit2 className="h-3.5 w-3.5 text-[var(--accent)]" />
                      <span>Git-Friendly Workspace Sync</span>
                      <Badge variant={gitSyncStatus?.enabled ? 'accent' : 'default'}>
                        {gitSyncStatus?.enabled ? 'Enabled' : 'SQLite Only'}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[0.75rem] text-[var(--text-secondary)]">
                      Store collections, nested folders, requests &amp; non-secret environments as
                      clean Git-diffable JSON files. Secret values remain local-only.
                    </p>
                  </div>
                  <Switch
                    aria-label="Enable Git-friendly workspace sync"
                    disabled={gitSyncBusy}
                    checked={Boolean(gitSyncStatus?.enabled)}
                    onCheckedChange={(checked) => void handleToggleGitSync(checked)}
                  />
                </div>

                {/* Folder & Git Repository Selection */}
                <div className="flex flex-col gap-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="git-sync-folder-input"
                      className="text-xs font-medium text-[var(--text-primary)]"
                    >
                      Workspace Folder Path
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="git-sync-folder-input"
                        value={syncFolderInput}
                        aria-label="Git sync workspace folder"
                        placeholder="/path/to/api-workspace"
                        onChange={(e) => {
                          setSyncFolderInput(e.target.value);
                          setGitSyncError(null);
                        }}
                        onBlur={() => void inspectSyncFolder(syncFolderInput)}
                        className="flex-1 font-mono-code text-xs"
                      />
                      <Button
                        type="button"
                        size="xs"
                        variant="secondary"
                        disabled={gitSyncBusy}
                        onClick={() => void handlePickSyncFolder()}
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        <span>Browse…</span>
                      </Button>
                    </div>
                  </div>

                  {folderInspection && (
                    <div className="flex flex-wrap items-center gap-1.5 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-[0.75rem] text-[var(--text-secondary)]">
                      {folderInspection.hasRiftqlWorkspace ? (
                        <span className="text-[var(--text-primary)]">
                          Detected RiftQL workspace ({folderInspection.collectionCount}{' '}
                          {folderInspection.collectionCount === 1 ? 'collection' : 'collections'},{' '}
                          {folderInspection.environmentCount}{' '}
                          {folderInspection.environmentCount === 1 ? 'env' : 'envs'})
                        </span>
                      ) : folderInspection.isEmpty ? (
                        <span>Folder is empty and ready for migration or Git clone.</span>
                      ) : (
                        <span>Existing folder without RiftQL workspace manifest yet.</span>
                      )}
                      {folderInspection.git.isGitRepo && (
                        <Badge variant="default" className="ml-auto font-mono-code">
                          git: {folderInspection.git.branch ?? 'HEAD'}
                        </Badge>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="flex flex-col gap-1 sm:col-span-2">
                      <label
                        htmlFor="git-sync-remote-input"
                        className="text-[0.75rem] font-medium text-[var(--text-secondary)]"
                      >
                        Git Repository URL (optional)
                      </label>
                      <Input
                        id="git-sync-remote-input"
                        value={syncRemoteInput}
                        aria-label="Git repository URL"
                        placeholder="https://github.com/org/api-specs.git"
                        onChange={(e) => {
                          const next = e.target.value;
                          setSyncRemoteInput(next);
                          if (
                            next.trim() &&
                            folderInspection &&
                            folderInspection.isEmpty &&
                            !folderInspection.hasRiftqlWorkspace
                          ) {
                            setMigrationMode('clone-repo');
                          }
                        }}
                        className="font-mono-code text-xs"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="git-sync-branch-input"
                        className="text-[0.75rem] font-medium text-[var(--text-secondary)]"
                      >
                        Branch (optional)
                      </label>
                      <Input
                        id="git-sync-branch-input"
                        value={syncBranchInput}
                        aria-label="Git branch"
                        placeholder="main"
                        onChange={(e) => setSyncBranchInput(e.target.value)}
                        className="font-mono-code text-xs"
                      />
                    </div>
                  </div>

                  {syncRemoteInput.trim().toLowerCase().startsWith('http') ||
                  gitSyncStatus?.hasCredentials ||
                  showAuthFields ? (
                    <div className="flex flex-col gap-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[0.75rem] font-medium text-[var(--text-primary)]">
                          <KeyRound className="h-3.5 w-3.5 text-[var(--accent)]" />
                          <span>HTTPS Authentication (Optional)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {gitSyncStatus?.hasCredentials && (
                            <>
                              <Badge variant="accent">Saved locally</Badge>
                              <Button
                                type="button"
                                size="xs"
                                variant="ghost"
                                disabled={gitSyncBusy}
                                onClick={() => void handleSaveGitCredentials(true)}
                              >
                                Clear Credentials
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Input
                          value={gitUsername}
                          aria-label="Git HTTPS username"
                          placeholder="Username (or git / oauth2)"
                          onChange={(e) => setGitUsername(e.target.value)}
                          className="font-mono-code text-xs"
                        />
                        <div className="flex items-center gap-1">
                          <Input
                            type={showGitPassword ? 'text' : 'password'}
                            value={gitPassword}
                            aria-label="Git HTTPS password or token"
                            placeholder={
                              gitSyncStatus?.hasCredentials
                                ? '•••••••• (saved — leave blank to keep)'
                                : 'Personal Access Token or Password'
                            }
                            onChange={(e) => setGitPassword(e.target.value)}
                            className="flex-1 font-mono-code text-xs"
                          />
                          <ActionTooltip
                            label={showGitPassword ? 'Hide token / password' : 'Show token / password'}
                          >
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              aria-label={
                                showGitPassword ? 'Hide Git password' : 'Show Git password'
                              }
                              onClick={() => setShowGitPassword((v) => !v)}
                            >
                              {showGitPassword ? (
                                <EyeOff className="h-3.5 w-3.5" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </ActionTooltip>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-[0.6875rem] text-[var(--text-secondary)]">
                        <span>
                          Stored locally in RiftQL app data (never inside{' '}
                          <code className="font-mono-code">.git/config</code> or workspace JSON). SSH
                          URLs (<code className="font-mono-code">git@...</code>) work without this.
                        </span>
                        {(gitPassword.trim() || gitSyncStatus?.hasCredentials) && (
                          <Button
                            type="button"
                            size="xs"
                            variant="secondary"
                            disabled={gitSyncBusy || (!gitPassword.trim() && !gitSyncStatus?.hasCredentials)}
                            onClick={() => void handleSaveGitCredentials(false)}
                          >
                            Save Credentials
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-[0.6875rem] text-[var(--text-secondary)]">
                      <span>Private HTTPS repositories need a username &amp; token/password.</span>
                      <button
                        type="button"
                        onClick={() => setShowAuthFields(true)}
                        className="cursor-pointer font-medium text-[var(--accent)] hover:underline"
                      >
                        HTTPS credentials…
                      </button>
                    </div>
                  )}

                  <div className="flex flex-col gap-2.5 border-t border-[var(--border-subtle)] pt-2.5">
                    <label className="flex cursor-pointer items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-medium text-[var(--text-primary)]">
                          Auto-Sync Changes to Folder
                        </div>
                        <div className="text-[0.75rem] text-[var(--text-secondary)]">
                          Write JSON updates automatically when requests, folders, or environments change.
                        </div>
                      </div>
                      <Switch
                        aria-label="Auto-sync workspace changes to disk"
                        checked={syncAutoSync}
                        onCheckedChange={(checked) =>
                          void handleSaveAutomationOptions({ autoSync: checked })
                        }
                      />
                    </label>

                    <div className="flex flex-col gap-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5">
                      <label className="flex cursor-pointer items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-medium text-[var(--text-primary)]">
                            Auto-Commit &amp; Push Changes
                          </div>
                          <div className="text-[0.75rem] text-[var(--text-secondary)]">
                            Automatically commit &amp; push edits to <code className="font-mono-code">origin</code> after a quiet delay.
                          </div>
                        </div>
                        <Switch
                          aria-label="Auto-commit and push changes to Git"
                          disabled={!syncAutoSync}
                          checked={syncAutoPush}
                          onCheckedChange={(checked) =>
                            void handleSaveAutomationOptions({ autoPush: checked })
                          }
                        />
                      </label>
                      {syncAutoPush && (
                        <div className="flex items-center justify-between gap-2 pl-0.5 text-[0.75rem] text-[var(--text-secondary)]">
                          <span>Quiet delay before committing &amp; pushing</span>
                          <Select
                            value={String(syncAutoPushDelaySecs)}
                            onValueChange={(val) =>
                              void handleSaveAutomationOptions({
                                autoPushDelaySecs: Number(val),
                              })
                            }
                          >
                            <SelectTrigger
                              aria-label="Auto-push delay"
                              className="h-7 w-28 text-xs"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="10">10 seconds</SelectItem>
                              <SelectItem value="15">15 seconds</SelectItem>
                              <SelectItem value="30">30 seconds</SelectItem>
                              <SelectItem value="60">60 seconds</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5">
                      <label className="flex cursor-pointer items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-medium text-[var(--text-primary)]">
                            Auto-Fetch Remote Updates
                          </div>
                          <div className="text-[0.75rem] text-[var(--text-secondary)]">
                            Periodically check <code className="font-mono-code">origin</code> for new commits and notify before pulling.
                          </div>
                        </div>
                        <Switch
                          aria-label="Auto-fetch remote Git updates"
                          checked={syncAutoFetch}
                          onCheckedChange={(checked) =>
                            void handleSaveAutomationOptions({ autoFetch: checked })
                          }
                        />
                      </label>
                      {syncAutoFetch && (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <div className="flex items-center justify-between gap-2 text-[0.75rem] text-[var(--text-secondary)]">
                            <span>Check every</span>
                            <Select
                              value={String(syncAutoFetchIntervalMins)}
                              onValueChange={(val) =>
                                void handleSaveAutomationOptions({
                                  autoFetchIntervalMins: Number(val),
                                })
                              }
                            >
                              <SelectTrigger
                                aria-label="Auto-fetch interval"
                                className="h-7 w-28 text-xs"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">1 min</SelectItem>
                                <SelectItem value="5">5 min</SelectItem>
                                <SelectItem value="15">15 min</SelectItem>
                                <SelectItem value="30">30 min</SelectItem>
                                <SelectItem value="60">60 min</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-[0.75rem] text-[var(--text-secondary)]">
                            <span>Snooze duration</span>
                            <Select
                              value={String(syncFetchSnoozeMins)}
                              onValueChange={(val) =>
                                void handleSaveAutomationOptions({
                                  fetchSnoozeMins: Number(val),
                                })
                              }
                            >
                              <SelectTrigger
                                aria-label="Remote update snooze duration"
                                className="h-7 w-28 text-xs"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="15">15 min</SelectItem>
                                <SelectItem value="30">30 min</SelectItem>
                                <SelectItem value="60">60 min</SelectItem>
                                <SelectItem value="120">2 hours</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Migration & Initialization Section */}
                <div className="flex flex-col gap-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    Migration &amp; Activation
                  </div>

                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                    {(
                      [
                        {
                          id: 'migrate-to-folder',
                          title: 'Migrate SQLite → Folder',
                          desc: 'Export current workspace into this folder',
                        },
                        {
                          id: 'import-from-folder',
                          title: 'Import Folder → SQLite',
                          desc: 'Load existing RiftQL files into SQLite',
                        },
                        {
                          id: 'clone-repo',
                          title: 'Clone Git Repo',
                          desc: 'Clone remote URL into empty folder',
                        },
                      ] as Array<{
                        id: GitSyncMigrationMode;
                        title: string;
                        desc: string;
                      }>
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setMigrationMode(opt.id)}
                        className={cn(
                          'flex cursor-pointer flex-col gap-0.5 rounded-md border px-2.5 py-2 text-left transition-colors',
                          migrationMode === opt.id
                            ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--text-primary)]'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                        )}
                      >
                        <span className="text-xs font-medium">{opt.title}</span>
                        <span className="text-[0.6875rem] opacity-80">{opt.desc}</span>
                      </button>
                    ))}
                  </div>

                  {migrationMode !== 'clone-repo' && (
                    <label className="flex cursor-pointer items-center gap-2 text-[0.75rem] text-[var(--text-secondary)]">
                      <input
                        type="checkbox"
                        checked={initGitOnEnable}
                        onChange={(e) => setInitGitOnEnable(e.target.checked)}
                        className="h-3.5 w-3.5 accent-[var(--accent)]"
                      />
                      <span>
                        Initialize Git repository (<code className="font-mono-code">git init</code>)
                        if folder is not a repository yet
                      </span>
                    </label>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="xs"
                      variant="default"
                      disabled={gitSyncBusy || !syncFolderInput.trim()}
                      onClick={() => void handleConfigureAndEnableSync()}
                    >
                      {migrationMode === 'migrate-to-folder'
                        ? gitSyncStatus?.enabled
                          ? 'Migrate & Update Sync Folder'
                          : 'Migrate SQLite → Folder & Enable'
                        : migrationMode === 'import-from-folder'
                          ? gitSyncStatus?.enabled
                            ? 'Import Folder & Update Sync'
                            : 'Import Folder → SQLite & Enable'
                          : 'Clone Repo & Enable Sync'}
                    </Button>

                    {gitSyncStatus?.enabled && (
                      <>
                        <Button
                          type="button"
                          size="xs"
                          variant="secondary"
                          disabled={gitSyncBusy}
                          onClick={() => void handleManualSync('to-disk')}
                        >
                          <ArrowUpFromLine className="h-3 w-3" />
                          <span>Export SQLite → Folder</span>
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="secondary"
                          disabled={gitSyncBusy}
                          onClick={() => void handleManualSync('from-disk')}
                        >
                          <ArrowDownToLine className="h-3 w-3" />
                          <span>Reload Folder → SQLite</span>
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Git Repository Actions & Status */}
                {(gitSyncStatus?.enabled ||
                  folderInspection?.git.isGitRepo ||
                  gitSyncStatus?.git.isGitRepo) && (
                  <div className="flex flex-col gap-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                        <GitBranch className="h-3.5 w-3.5 text-[var(--accent)]" />
                        <span>Git Repository</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(() => {
                          const repo = folderInspection?.git ?? gitSyncStatus?.git;
                          if (!repo) return null;
                          if (!repo.gitAvailable) {
                            return <Badge>Git CLI not found (folder-only sync)</Badge>;
                          }
                          if (!repo.isGitRepo) {
                            return <Badge>Not initialized</Badge>;
                          }
                          return (
                            <>
                              <Badge variant="accent" className="font-mono-code">
                                {repo.branch ?? 'HEAD'}
                              </Badge>
                              <Badge className="tabular-nums">
                                {repo.changedFiles} pending
                              </Badge>
                              {(repo.ahead > 0 || repo.behind > 0) && (
                                <Badge className="font-mono-code tabular-nums">
                                  ↑{repo.ahead} ↓{repo.behind}
                                </Badge>
                              )}
                            </>
                          );
                        })()}
                        <ActionTooltip label="Refresh Git & Sync Status">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label="Refresh Git status"
                            disabled={gitSyncBusy}
                            onClick={() => void handleRefreshGitStatus()}
                          >
                            <RefreshCw className={cn('h-3.5 w-3.5', gitSyncBusy && 'animate-spin')} />
                          </Button>
                        </ActionTooltip>
                      </div>
                    </div>

                    {(() => {
                      const repo = folderInspection?.git ?? gitSyncStatus?.git;
                      if (!repo?.gitAvailable) {
                        return (
                          <p className="text-[0.75rem] text-[var(--text-secondary)]">
                            Install <code className="font-mono-code">git</code> and add it to PATH to
                            commit, pull, or push directly from RiftQL. Folder file sync continues to
                            work automatically.
                          </p>
                        );
                      }
                      if (!repo.isGitRepo) {
                        return (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[0.75rem] text-[var(--text-secondary)]">
                              This folder is currently synced locally without Git version control.
                            </span>
                            <Button
                              type="button"
                              size="xs"
                              variant="secondary"
                              disabled={gitSyncBusy || !syncFolderInput.trim()}
                              onClick={() => void handleGitInitRepo()}
                            >
                              <GitBranch className="h-3 w-3" />
                              <span>Init Git Repo</span>
                            </Button>
                          </div>
                        );
                      }
                      const hasRemote = Boolean(repo.remoteUrl || syncRemoteInput.trim());
                      return (
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              size="xs"
                              variant="secondary"
                              disabled={gitSyncBusy || !hasRemote}
                              onClick={() => void handleGitFetchNow()}
                            >
                              <RefreshCw className={cn('h-3 w-3', gitSyncBusy && 'animate-spin')} />
                              <span>Fetch Now</span>
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              variant="secondary"
                              disabled={gitSyncBusy || !hasRemote}
                              onClick={() => void handleGitPull()}
                            >
                              <ArrowDownToLine className="h-3 w-3" />
                              <span>Git Pull</span>
                            </Button>
                            {repo.remoteUrl && (
                              <span className="truncate font-mono-code text-[0.6875rem] text-[var(--text-secondary)]">
                                origin: {repo.remoteUrl}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Input
                              value={commitMessage}
                              onChange={(e) => setCommitMessage(e.target.value)}
                              aria-label="Git commit message"
                              placeholder="chore(riftql): sync workspace"
                              className="min-w-[12rem] flex-1 font-mono-code text-xs"
                            />
                            <Button
                              type="button"
                              size="xs"
                              variant="secondary"
                              disabled={gitSyncBusy}
                              onClick={() => void handleGitCommitPush(false)}
                            >
                              <GitCommit className="h-3 w-3" />
                              <span>Commit</span>
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              variant="default"
                              disabled={gitSyncBusy || !hasRemote}
                              onClick={() => void handleGitCommitPush(true)}
                            >
                              <ArrowUpFromLine className="h-3 w-3" />
                              <span>Commit &amp; Push</span>
                            </Button>
                          </div>
                        </div>
                      );
                    })()}

                    {(gitSyncStatus?.lastSyncedAt ||
                      gitSyncStatus?.lastFetchedAt ||
                      gitSyncStatus?.lastFetchError) && (
                      <div className="flex flex-wrap gap-3 text-[0.6875rem] text-[var(--text-tertiary)]">
                        {gitSyncStatus.lastSyncedAt && (
                          <span>
                            Last synced: {new Date(gitSyncStatus.lastSyncedAt).toLocaleString()}
                          </span>
                        )}
                        {gitSyncStatus.lastFetchedAt && (
                          <span>
                            Last fetched: {new Date(gitSyncStatus.lastFetchedAt).toLocaleString()}
                          </span>
                        )}
                        {gitSyncStatus.lastFetchError && (
                          <span className="text-[#D97706] dark:text-[#FBBF24]">
                            Last auto-fetch offline/failed: {gitSyncStatus.lastFetchError}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {(gitSyncError || gitSyncStatus?.lastError) && (
                  <div className="flex items-start gap-2 rounded-md border border-[#F87171]/40 bg-[#F87171]/10 px-3 py-2 text-xs text-[#F87171]">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{gitSyncError ?? gitSyncStatus?.lastError}</span>
                  </div>
                )}

                {gitSyncMessage && (
                  <div className="text-xs text-[var(--accent)]">{gitSyncMessage}</div>
                )}
              </>
            )}
          </TabsContent>

          {/* Updates Tab */}
          <TabsContent
            value="updates"
            className="min-h-0 flex-1 flex flex-col gap-3 overflow-y-auto pt-3 pr-1 rift-scroll"
          >
            <div className="flex flex-col gap-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-[var(--text-primary)]">
                      Current Version
                    </span>
                    <Badge variant="default" className="font-mono-code tabular-nums">
                      v{currentVersion}
                    </Badge>
                    {checkingUpdates ? (
                      <Badge variant="default">Checking…</Badge>
                    ) : updateInfo?.available ? (
                      <Badge variant="accent" className="font-mono-code tabular-nums">
                        v{updateInfo.availableVersion} available
                      </Badge>
                    ) : updateInfo ? (
                      <Badge variant="success">Up to date</Badge>
                    ) : null}
                    {runtimeInfo && (
                      <Badge variant="default" className="font-mono-code">
                        {runtimeInfo.platform}/{runtimeInfo.arch}
                        {runtimeInfo.isAppimage ? ' (AppImage)' : ''}
                      </Badge>
                    )}
                  </div>
                  <div className="text-[0.75rem] text-[var(--text-secondary)]">
                    {lastCheckedAt ? (
                      <span className="tabular-nums">
                        Last checked: {formatRelativeTime(lastCheckedAt)}
                      </span>
                    ) : (
                      <span>
                        Checks GitHub Releases (signed manifests) for newer desktop builds.
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    disabled={checkingUpdates || installingUpdate}
                    onClick={() => void checkForUpdates()}
                  >
                    <RefreshCw
                      className={cn('h-3.5 w-3.5', checkingUpdates && 'animate-spin')}
                    />
                    <span>{checkingUpdates ? 'Checking…' : 'Check for Updates'}</span>
                  </Button>

                  {updateInfo?.available && updateInfo.canAutoInstall && (
                    <Button
                      type="button"
                      size="xs"
                      variant="default"
                      disabled={checkingUpdates || installingUpdate}
                      onClick={() => void installUpdate()}
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>{installingUpdate ? 'Updating…' : 'Update Now'}</span>
                    </Button>
                  )}

                  {updateInfo?.available && !updateInfo.canAutoInstall && (
                    <Button
                      type="button"
                      size="xs"
                      variant="default"
                      onClick={() => void openReleaseUrl()}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>Download from GitHub</span>
                    </Button>
                  )}
                </div>
              </div>

              {installingUpdate && (
                <div className="flex flex-col gap-1.5 border-t border-[var(--border-subtle)] pt-2.5">
                  <progress
                    aria-label="Update download progress"
                    className="rift-progress h-2 w-full"
                    max={100}
                    value={updateProgress?.percent ?? undefined}
                  />
                  <div
                    role="status"
                    aria-live="polite"
                    className="flex items-center justify-between text-[0.75rem] text-[var(--text-secondary)] tabular-nums"
                  >
                    <span>
                      {updateProgress?.stage === 'installing'
                        ? 'Verifying signature & installing update…'
                        : updateProgress?.stage === 'restarting'
                          ? 'Restarting RiftQL…'
                          : 'Downloading update package…'}
                    </span>
                    <span className="font-mono-code">
                      {formatBytes(updateProgress?.downloadedBytes ?? 0)}
                      {updateProgress?.totalBytes
                        ? ` / ${formatBytes(updateProgress.totalBytes)}`
                        : ''}
                      {typeof updateProgress?.percent === 'number'
                        ? ` (${updateProgress.percent}%)`
                        : ''}
                    </span>
                  </div>
                </div>
              )}

              {updateInfo?.available &&
                !updateInfo.canAutoInstall &&
                updateInfo.autoInstallUnavailableReason && (
                  <div className="flex items-start gap-2 rounded-md border border-[#D97706]/30 bg-[#D97706]/10 px-2.5 py-2 text-[0.75rem] text-[#D97706] dark:border-[#FBBF24]/30 dark:text-[#FBBF24]">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{updateInfo.autoInstallUnavailableReason}</span>
                  </div>
                )}

              {updaterError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-[#F87171]/40 bg-[#F87171]/10 px-2.5 py-2 text-[0.75rem] text-[#DC2626] dark:text-[#F87171]"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{updaterError}</span>
                </div>
              )}

              {updateInfo?.available && updateInfo.releaseNotes && (
                <div className="flex flex-col gap-1 border-t border-[var(--border-subtle)] pt-2.5">
                  <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    Release Notes (v{updateInfo.availableVersion})
                  </span>
                  <div className="max-h-48 overflow-y-auto rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2.5 font-mono-code text-[0.75rem] whitespace-pre-wrap text-[var(--text-secondary)] rift-scroll">
                    {updateInfo.releaseNotes}
                  </div>
                </div>
              )}
            </div>

            <label className="flex items-center justify-between rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2">
              <div>
                <div className="text-xs font-medium text-[var(--text-primary)]">
                  Check for updates on startup
                </div>
                <div className="text-[0.75rem] text-[var(--text-secondary)]">
                  Silently checks for new RiftQL releases in the background when online.
                </div>
              </div>
              <Switch
                aria-label="Check for updates on startup"
                checked={settings.autoCheckUpdates ?? true}
                onCheckedChange={(autoCheckUpdates) => void updateSettings({ autoCheckUpdates })}
              />
            </label>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="default" size="sm" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
