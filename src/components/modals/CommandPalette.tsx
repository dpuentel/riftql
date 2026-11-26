import * as React from 'react';
import { Command } from 'cmdk';
import {
  Code2,
  Columns2,
  Cookie,
  FolderPlus,
  FolderUp,
  Globe,
  Import,
  PanelLeft,
  Plus,
  Search,
  Send,
  Settings,
  SunMoon,
  Wand2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { getMethodColorClass } from '@/lib/format';
import { formatShortcutForDisplay, getEffectiveShortcuts } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useTabsStore } from '@/store/useTabsStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import type { ShortcutActionId } from '@/types/shortcuts';

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSendRequest: () => void;
  onFormatBody: () => void;
  onImportCurl: () => void;
  onImportCollection?: () => void;
  onOpenCodeSnippet: () => void;
  onToggleSidebar: () => void;
  onOpenCookies: () => void;
  onOpenEnvironments: () => void;
  onOpenSettings: () => void;
  onNewCollection: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  onSendRequest,
  onFormatBody,
  onImportCurl,
  onImportCollection,
  onOpenCodeSnippet,
  onToggleSidebar,
  onOpenCookies,
  onOpenEnvironments,
  onOpenSettings,
  onNewCollection,
}: CommandPaletteProps) {
  const [query, setQuery] = React.useState('');

  const customShortcuts = useSettingsStore((s) => s.settings.customShortcuts);
  const activeEnvId = useSettingsStore((s) => s.settings.activeEnvironmentId);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);
  const toggleLayout = useSettingsStore((s) => s.toggleLayout);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const savedRequests = useWorkspaceStore((s) => s.savedRequests);
  const collections = useWorkspaceStore((s) => s.collections);
  const environments = useWorkspaceStore((s) => s.environments);

  const newTab = useTabsStore((s) => s.newTab);
  const openSavedRequest = useTabsStore((s) => s.openSavedRequest);

  React.useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const bindings = React.useMemo(
    () => getEffectiveShortcuts(customShortcuts),
    [customShortcuts],
  );
  const shortcutLabel = (id: ShortcutActionId) =>
    formatShortcutForDisplay(bindings[id]);

  const collectionNames = React.useMemo(
    () => new Map(collections.map((c) => [c.id, c.name])),
    [collections],
  );

  const runAndClose = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  const quickActions: Array<{
    id: string;
    label: string;
    icon: React.ReactNode;
    shortcutId?: ShortcutActionId;
    onSelect: () => void;
  }> = [
    {
      id: 'new-rest-tab',
      label: 'New REST Request Tab',
      icon: <Plus className="h-3.5 w-3.5" />,
      shortcutId: 'newTab',
      onSelect: () => newTab('rest'),
    },
    {
      id: 'new-gql-tab',
      label: 'New GraphQL Request Tab',
      icon: <Plus className="h-3.5 w-3.5 text-[#E879F9]" />,
      onSelect: () => newTab('graphql'),
    },
    {
      id: 'send-request',
      label: 'Send Active Request',
      icon: <Send className="h-3.5 w-3.5 text-[var(--accent)]" />,
      shortcutId: 'sendRequest',
      onSelect: onSendRequest,
    },
    {
      id: 'format-body',
      label: 'Format Request Body / GraphQL Query',
      icon: <Wand2 className="h-3.5 w-3.5" />,
      shortcutId: 'formatBody',
      onSelect: onFormatBody,
    },
    {
      id: 'import-curl',
      label: 'Import cURL Command',
      icon: <Import className="h-3.5 w-3.5" />,
      shortcutId: 'importCurl',
      onSelect: onImportCurl,
    },
    ...(onImportCollection
      ? [
          {
            id: 'import-collection',
            label: 'Import Collection / Spec (Postman, Altair, Insomnia, OpenAPI)',
            icon: <FolderUp className="h-3.5 w-3.5" />,
            onSelect: onImportCollection,
          },
        ]
      : []),
    {
      id: 'copy-snippet',
      label: 'Copy as Code Snippet',
      icon: <Code2 className="h-3.5 w-3.5" />,
      shortcutId: 'openCodeSnippet',
      onSelect: onOpenCodeSnippet,
    },
    {
      id: 'new-collection',
      label: 'New Collection',
      icon: <FolderPlus className="h-3.5 w-3.5" />,
      shortcutId: 'newCollection',
      onSelect: onNewCollection,
    },
    {
      id: 'toggle-sidebar',
      label: 'Toggle Sidebar',
      icon: <PanelLeft className="h-3.5 w-3.5" />,
      shortcutId: 'toggleSidebar',
      onSelect: onToggleSidebar,
    },
    {
      id: 'toggle-layout',
      label: 'Toggle Horizontal / Vertical Split',
      icon: <Columns2 className="h-3.5 w-3.5" />,
      shortcutId: 'toggleLayout',
      onSelect: () => void toggleLayout(),
    },
    {
      id: 'toggle-theme',
      label: 'Toggle Dark / Light Theme',
      icon: <SunMoon className="h-3.5 w-3.5" />,
      shortcutId: 'toggleTheme',
      onSelect: () => void toggleTheme(),
    },
    {
      id: 'manage-cookies',
      label: 'Manage Domain Cookie Jar',
      icon: <Cookie className="h-3.5 w-3.5" />,
      shortcutId: 'openCookies',
      onSelect: onOpenCookies,
    },
    {
      id: 'manage-envs',
      label: 'Manage Environments',
      icon: <Globe className="h-3.5 w-3.5" />,
      shortcutId: 'openEnvironments',
      onSelect: onOpenEnvironments,
    },
    {
      id: 'open-settings',
      label: 'Open Settings & Shortcuts',
      icon: <Settings className="h-3.5 w-3.5" />,
      shortcutId: 'openSettings',
      onSelect: onOpenSettings,
    },
  ];

  const customEnvs = environments.filter((e) => !e.isGlobal);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose={false} className="max-w-xl overflow-hidden p-0">
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search saved requests, workspace commands, and environments.
        </DialogDescription>

        <Command className="flex flex-col bg-[var(--bg-surface)] text-[var(--text-primary)]">
          <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Type a command, request name, or environment…"
              aria-label="Command palette search"
              className="w-full bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none"
            />
          </div>

          <Command.List className="max-h-80 overflow-auto p-1.5 rift-scroll">
            <Command.Empty className="py-8 text-center text-xs text-[var(--text-secondary)]">
              No matching commands or requests.
            </Command.Empty>

            <Command.Group
              heading="Quick Actions"
              className="px-1 py-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
            >
              {quickActions.map((act) => (
                <Command.Item
                  key={act.id}
                  value={act.label}
                  onSelect={() => runAndClose(act.onSelect)}
                  className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs font-normal normal-case tracking-normal text-[var(--text-primary)] aria-selected:bg-[var(--accent-muted)]"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-secondary)]">{act.icon}</span>
                    <span>{act.label}</span>
                  </div>
                  {act.shortcutId && (
                    <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1.5 py-0.5 font-mono-code text-[0.6875rem] text-[var(--text-secondary)]">
                      {shortcutLabel(act.shortcutId)}
                    </kbd>
                  )}
                </Command.Item>
              ))}
            </Command.Group>

            {savedRequests.length > 0 && (
              <Command.Group
                heading="Saved Requests"
                className="mt-1 px-1 py-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
              >
                {savedRequests.map((req) => {
                  const badge = req.protocol === 'graphql' ? 'GQL' : req.method;
                  const colName = collectionNames.get(req.collectionId) ?? '';
                  return (
                    <Command.Item
                      key={req.id}
                      value={`${req.name} ${req.url} ${colName}`}
                      onSelect={() => runAndClose(() => openSavedRequest(req))}
                      className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs font-normal normal-case tracking-normal text-[var(--text-primary)] aria-selected:bg-[var(--accent-muted)]"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            'w-9 shrink-0 font-mono-code text-[0.6875rem] font-semibold',
                            getMethodColorClass(badge),
                          )}
                        >
                          {badge}
                        </span>
                        <span className="truncate font-medium">{req.name}</span>
                        {colName && (
                          <span className="truncate text-[0.75rem] text-[var(--text-secondary)]">
                            {colName}
                          </span>
                        )}
                      </div>
                      <span className="max-w-[160px] truncate font-mono-code text-[0.6875rem] text-[var(--text-tertiary)]">
                        {req.url}
                      </span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}

            <Command.Group
              heading="Switch Environment"
              className="mt-1 px-1 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]"
            >
              <Command.Item
                value="No Environment Clear Active"
                onSelect={() =>
                  runAndClose(() => void updateSettings({ activeEnvironmentId: undefined }))
                }
                className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs font-normal normal-case tracking-normal text-[var(--text-primary)] aria-selected:bg-[var(--accent-muted)]"
              >
                <span>No Environment</span>
                {!activeEnvId && (
                  <span className="font-mono-code text-[0.6875rem] text-[var(--accent)]">Active</span>
                )}
              </Command.Item>
              {customEnvs.map((env) => (
                <Command.Item
                  key={env.id}
                  value={`Environment ${env.name}`}
                  onSelect={() =>
                    runAndClose(() => void updateSettings({ activeEnvironmentId: env.id }))
                  }
                  className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs font-normal normal-case tracking-normal text-[var(--text-primary)] aria-selected:bg-[var(--accent-muted)]"
                >
                  <div className="flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5 text-[var(--accent)]" />
                    <span>{env.name}</span>
                  </div>
                  {activeEnvId === env.id && (
                    <span className="font-mono-code text-[0.6875rem] text-[var(--accent)]">
                      Active
                    </span>
                  )}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
