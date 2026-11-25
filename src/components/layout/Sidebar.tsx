import * as React from 'react';
import {
  ChevronDown,
  ChevronRight,
  Cookie,
  Folder,
  FolderPlus,
  Globe,
  History,
  Layers,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { ActionTooltip } from '@/components/ui/action-tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Input } from '@/components/ui/input';
import {
  formatDuration,
  formatRelativeTime,
  getMethodColorClass,
  getStatusBadgeClasses,
} from '@/lib/format';
import { formatShortcutForDisplay, getEffectiveShortcuts } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/store/useSettingsStore';
import { createEmptyDraft, useTabsStore } from '@/store/useTabsStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import type { CollectionRecord, FolderRecord, HistoryEntry } from '@/types/storage';

interface SidebarProps {
  onOpenEnvironments: () => void;
  onOpenCookies: () => void;
  onOpenSettings: () => void;
  onEditCollection: (collection: CollectionRecord) => void;
  onEditFolder: (folder: FolderRecord) => void;
  createCollectionTrigger?: number;
}

type SidebarView = 'collections' | 'history' | 'environments';

function groupHistoryByDay(entries: HistoryEntry[]): Array<{ label: string; items: HistoryEntry[] }> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;

  const today: HistoryEntry[] = [];
  const yesterday: HistoryEntry[] = [];
  const older: HistoryEntry[] = [];

  for (const item of entries) {
    const ts = Date.parse(item.createdAt);
    if (ts >= startOfToday) today.push(item);
    else if (ts >= startOfYesterday) yesterday.push(item);
    else older.push(item);
  }

  return [
    { label: 'Today', items: today },
    { label: 'Yesterday', items: yesterday },
    { label: 'Older', items: older },
  ].filter((g) => g.items.length > 0);
}

export function Sidebar({
  onOpenEnvironments,
  onOpenCookies,
  onOpenSettings,
  onEditCollection,
  onEditFolder,
  createCollectionTrigger,
}: SidebarProps) {
  const [view, setView] = React.useState<SidebarView>('collections');
  const [search, setSearch] = React.useState('');
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
  const [creatingCollection, setCreatingCollection] = React.useState(false);
  const [newCollectionName, setNewCollectionName] = React.useState('');

  const collections = useWorkspaceStore((s) => s.collections);
  const folders = useWorkspaceStore((s) => s.folders);
  const savedRequests = useWorkspaceStore((s) => s.savedRequests);
  const history = useWorkspaceStore((s) => s.history);
  const environments = useWorkspaceStore((s) => s.environments);
  const cookies = useWorkspaceStore((s) => s.cookies);

  const upsertCollection = useWorkspaceStore((s) => s.upsertCollection);
  const deleteCollection = useWorkspaceStore((s) => s.deleteCollection);
  const upsertFolder = useWorkspaceStore((s) => s.upsertFolder);
  const deleteFolder = useWorkspaceStore((s) => s.deleteFolder);
  const upsertSavedRequest = useWorkspaceStore((s) => s.upsertSavedRequest);
  const deleteSavedRequest = useWorkspaceStore((s) => s.deleteSavedRequest);
  const clearHistory = useWorkspaceStore((s) => s.clearHistory);

  const openSavedRequest = useTabsStore((s) => s.openSavedRequest);
  const openHistoryEntry = useTabsStore((s) => s.openHistoryEntry);
  const activeSavedRequestId = useTabsStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId)?.savedRequestId,
  );

  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  React.useEffect(() => {
    if (createCollectionTrigger && createCollectionTrigger > 0) {
      setView('collections');
      setCreatingCollection(true);
    }
  }, [createCollectionTrigger]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCollectionName.trim();
    if (!trimmed) return;
    const created = await upsertCollection({ name: trimmed });
    setExpandedIds((prev) => new Set(prev).add(created.id));
    setNewCollectionName('');
    setCreatingCollection(false);
  };

  const handleAddFolder = async (collectionId: string, parentId?: string) => {
    const folder = await upsertFolder({
      collectionId,
      parentId,
      name: 'New Folder',
    });
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(collectionId);
      if (parentId) next.add(parentId);
      next.add(folder.id);
      return next;
    });
  };

  const handleAddRequest = async (collectionId: string, folderId?: string) => {
    const draft = createEmptyDraft('rest');
    draft.name = 'New Request';
    const saved = await upsertSavedRequest({
      collectionId,
      folderId,
      draft,
    });
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(collectionId);
      if (folderId) next.add(folderId);
      return next;
    });
    openSavedRequest(saved);
  };

  const q = search.trim().toLowerCase();
  const newCollectionShortcut = formatShortcutForDisplay(
    getEffectiveShortcuts(settings.customShortcuts).newCollection,
  );

  const renderFolderTree = (collectionId: string, parentId?: string, depth: number = 1) => {
    const childFolders = folders.filter(
      (f) => f.collectionId === collectionId && (f.parentId ?? undefined) === parentId,
    );
    const childRequests = savedRequests.filter(
      (r) =>
        r.collectionId === collectionId &&
        (r.folderId ?? undefined) === parentId &&
        (!q ||
          r.name.toLowerCase().includes(q) ||
          r.url.toLowerCase().includes(q)),
    );

    return (
      <>
        {childFolders.map((folder) => {
          const isOpen = expandedIds.has(folder.id) || q.length > 0;
          return (
            <div key={folder.id}>
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div
                    style={{ paddingLeft: `${depth * 12}px` }}
                    className="group flex items-center gap-1 rounded px-1.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpand(folder.id)}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3 w-3 shrink-0" />
                      ) : (
                        <ChevronRight className="h-3 w-3 shrink-0" />
                      )}
                      <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]" />
                      <span className="truncate font-medium text-[var(--text-primary)]">
                        {folder.name}
                      </span>
                    </button>
                    <ActionTooltip label="Add Request">
                      <button
                        type="button"
                        aria-label={`Add request to ${folder.name}`}
                        onClick={() => void handleAddRequest(collectionId, folder.id)}
                        className="hidden h-5 w-5 items-center justify-center rounded group-hover:inline-flex hover:bg-[var(--bg-elevated)]"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </ActionTooltip>
                    <ActionTooltip label="Folder Settings">
                      <button
                        type="button"
                        aria-label={`Settings for ${folder.name}`}
                        onClick={() => onEditFolder(folder)}
                        className="hidden h-5 w-5 items-center justify-center rounded group-hover:inline-flex hover:bg-[var(--bg-elevated)]"
                      >
                        <MoreHorizontal className="h-3 w-3" />
                      </button>
                    </ActionTooltip>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => void handleAddRequest(collectionId, folder.id)}>
                    New Request
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => void handleAddFolder(collectionId, folder.id)}>
                    New Subfolder
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => onEditFolder(folder)}>
                    Folder Settings / Auth
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onSelect={() => void deleteFolder(folder.id)}
                    className="text-[#F87171]"
                  >
                    Delete Folder
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>

              {isOpen && renderFolderTree(collectionId, folder.id, depth + 1)}
            </div>
          );
        })}

        {childRequests.map((req) => {
          const badge = req.protocol === 'graphql' ? 'GQL' : req.method;
          const isSelected = activeSavedRequestId === req.id;
          return (
            <ContextMenu key={req.id}>
              <ContextMenuTrigger asChild>
                <div
                  style={{ paddingLeft: `${depth * 12 + 16}px` }}
                  className={cn(
                    'group flex items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-colors',
                    isSelected
                      ? 'bg-[var(--accent-muted)] text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => openSavedRequest(req)}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
                  >
                    <span
                      className={cn(
                        'w-9 shrink-0 font-mono-code text-[10px] font-semibold',
                        getMethodColorClass(badge),
                      )}
                    >
                      {badge}
                    </span>
                    <span className="truncate">{req.name}</span>
                  </button>
                  <ActionTooltip label="Delete Request">
                    <button
                      type="button"
                      aria-label={`Delete ${req.name}`}
                      onClick={() => void deleteSavedRequest(req.id)}
                      className="hidden h-5 w-5 items-center justify-center rounded group-hover:inline-flex hover:text-[#F87171]"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </ActionTooltip>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => openSavedRequest(req)}>Open in Tab</ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onSelect={() => void deleteSavedRequest(req.id)}
                  className="text-[#F87171]"
                >
                  Delete Request
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </>
    );
  };

  const filteredHistory = history.filter((h) => {
    if (!q) return true;
    return h.url.toLowerCase().includes(q) || h.method.toLowerCase().includes(q);
  });
  const historyGroups = groupHistoryByDay(filteredHistory);

  return (
    <aside
      aria-label="Workspace sidebar"
      className="flex h-full w-64 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-base)] select-none"
    >
      {/* View Switcher */}
      <div className="grid grid-cols-3 gap-1 border-b border-[var(--border-subtle)] p-1.5">
        <button
          type="button"
          onClick={() => setView('collections')}
          className={cn(
            'flex cursor-pointer items-center justify-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors',
            view === 'collections'
              ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
          )}
        >
          <Layers className="h-3 w-3" />
          <span>Collections</span>
        </button>
        <button
          type="button"
          onClick={() => setView('history')}
          className={cn(
            'flex cursor-pointer items-center justify-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors',
            view === 'history'
              ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
          )}
        >
          <History className="h-3 w-3" />
          <span>History</span>
        </button>
        <button
          type="button"
          onClick={() => setView('environments')}
          className={cn(
            'flex cursor-pointer items-center justify-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors',
            view === 'environments'
              ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
          )}
        >
          <Globe className="h-3 w-3" />
          <span>Envs</span>
        </button>
      </div>

      {/* Filter & Quick Action */}
      <div className="flex items-center gap-1.5 border-b border-[var(--border-subtle)] p-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1.5 left-2 h-3.5 w-3.5 text-[var(--text-secondary)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              view === 'collections'
                ? 'Filter requests...'
                : view === 'history'
                  ? 'Filter history...'
                  : 'Filter environments...'
            }
            aria-label="Sidebar filter"
            className="pl-7"
          />
        </div>
        {view === 'collections' && (
          <ActionTooltip label="New Collection" actionId="newCollection">
            <Button
              size="icon"
              variant="secondary"
              aria-label="New Collection"
              onClick={() => setCreatingCollection((v) => !v)}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </ActionTooltip>
        )}
        {view === 'history' && history.length > 0 && (
          <ActionTooltip label="Clear History">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Clear History"
              onClick={() => void clearHistory()}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </ActionTooltip>
        )}
      </div>

      {creatingCollection && view === 'collections' && (
        <form
          onSubmit={(e) => void handleCreateCollection(e)}
          className="flex gap-1 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2"
        >
          <Input
            autoFocus
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            placeholder="Collection name..."
            aria-label="New collection name"
          />
          <Button type="submit" size="xs" variant="default">
            Add
          </Button>
        </form>
      )}

      {/* Main Content */}
      <div className="min-h-0 flex-1 overflow-auto p-1.5 rift-scroll">
        {view === 'collections' && (
          <>
            {collections.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-[var(--text-secondary)]">
                No collections yet. Press{' '}
                <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1 py-0.5 font-mono-code text-[10px]">
                  {newCollectionShortcut}
                </kbd>{' '}
                to create one.
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {collections.map((col) => {
                  const isOpen = expandedIds.has(col.id) || q.length > 0;
                  return (
                    <div key={col.id}>
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <div className="group flex items-center gap-1 rounded px-1.5 py-1 text-xs hover:bg-[var(--bg-hover)]">
                            <button
                              type="button"
                              onClick={() => toggleExpand(col.id)}
                              className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left font-medium text-[var(--text-primary)]"
                            >
                              {isOpen ? (
                                <ChevronDown className="h-3 w-3 shrink-0 text-[var(--text-secondary)]" />
                              ) : (
                                <ChevronRight className="h-3 w-3 shrink-0 text-[var(--text-secondary)]" />
                              )}
                              <span className="truncate">{col.name}</span>
                            </button>
                            <ActionTooltip label="New Request">
                              <button
                                type="button"
                                aria-label={`New request in ${col.name}`}
                                onClick={() => void handleAddRequest(col.id)}
                                className="hidden h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] group-hover:inline-flex hover:text-[var(--text-primary)]"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </ActionTooltip>
                            <ActionTooltip label="New Folder">
                              <button
                                type="button"
                                aria-label={`New folder in ${col.name}`}
                                onClick={() => void handleAddFolder(col.id)}
                                className="hidden h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] group-hover:inline-flex hover:text-[var(--text-primary)]"
                              >
                                <FolderPlus className="h-3 w-3" />
                              </button>
                            </ActionTooltip>
                            <ActionTooltip label="Collection Settings">
                              <button
                                type="button"
                                aria-label={`Settings for ${col.name}`}
                                onClick={() => onEditCollection(col)}
                                className="hidden h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] group-hover:inline-flex hover:text-[var(--text-primary)]"
                              >
                                <SlidersHorizontal className="h-3 w-3" />
                              </button>
                            </ActionTooltip>
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem onSelect={() => void handleAddRequest(col.id)}>
                            New Request
                          </ContextMenuItem>
                          <ContextMenuItem onSelect={() => void handleAddFolder(col.id)}>
                            New Folder
                          </ContextMenuItem>
                          <ContextMenuItem onSelect={() => onEditCollection(col)}>
                            Collection Settings &amp; Auth
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            onSelect={() => void deleteCollection(col.id)}
                            className="text-[#F87171]"
                          >
                            Delete Collection
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>

                      {isOpen && renderFolderTree(col.id)}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {view === 'history' && (
          <>
            {historyGroups.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-[var(--text-secondary)]">
                No request history yet.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {historyGroups.map((group) => (
                  <div key={group.label} className="flex flex-col gap-0.5">
                    <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      {group.label}
                    </div>
                    {group.items.map((item) => {
                      const label = item.protocol === 'graphql' ? 'GQL' : item.method;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => openHistoryEntry(item)}
                          className="flex cursor-pointer flex-col gap-0.5 rounded px-2 py-1.5 text-left hover:bg-[var(--bg-hover)]"
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span
                                className={cn(
                                  'font-mono-code text-[10px] font-semibold',
                                  getMethodColorClass(label),
                                )}
                              >
                                {label}
                              </span>
                              <span className="truncate font-mono-code text-[11px] text-[var(--text-primary)]">
                                {item.url}
                              </span>
                            </div>
                            <span
                              className={cn(
                                'shrink-0 rounded border px-1 font-mono-code text-[10px] tabular-nums',
                                getStatusBadgeClasses(item.status),
                              )}
                            >
                              {item.status}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-[var(--text-tertiary)] tabular-nums">
                            <span>{formatDuration(item.durationMs)}</span>
                            <span>{formatRelativeTime(item.createdAt)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {view === 'environments' && (
          <div className="flex flex-col gap-1.5 p-1">
            {environments
              .filter((e) => !q || e.name.toLowerCase().includes(q))
              .map((env) => {
                const isActive = settings.activeEnvironmentId === env.id;
                return (
                  <button
                    key={env.id}
                    type="button"
                    onClick={() => {
                      if (!env.isGlobal) {
                        void updateSettings({
                          activeEnvironmentId: isActive ? undefined : env.id,
                        });
                      } else {
                        onOpenEnvironments();
                      }
                    }}
                    className={cn(
                      'flex cursor-pointer items-center justify-between rounded-md border px-2.5 py-2 text-left text-xs transition-colors',
                      isActive
                        ? 'border-[var(--accent)]/40 bg-[var(--accent-muted)] text-[var(--text-primary)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                    )}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      {env.isGlobal && <Globe className="h-3 w-3 text-[var(--accent)]" />}
                      <span className="truncate font-medium text-[var(--text-primary)]">
                        {env.name}
                      </span>
                    </div>
                    <Badge variant={isActive ? 'accent' : 'default'} className="tabular-nums">
                      {env.variables.length}
                    </Badge>
                  </button>
                );
              })}
            <Button
              size="xs"
              variant="secondary"
              className="mt-1"
              onClick={onOpenEnvironments}
            >
              Manage Environments…
            </Button>
          </div>
        )}
      </div>

      {/* Footer Quick Tools */}
      <div className="flex items-center justify-between border-t border-[var(--border-subtle)] px-2 py-1.5">
        <ActionTooltip label="Manage Domain Cookie Jar" actionId="openCookies" side="top">
          <Button size="xs" variant="ghost" onClick={onOpenCookies}>
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                settings.sendCookies ? 'bg-[#34D399]' : 'bg-[#FBBF24]',
              )}
            />
            <Cookie className="h-3.5 w-3.5" />
            <span className="tabular-nums">Cookies ({cookies.length})</span>
          </Button>
        </ActionTooltip>

        <ActionTooltip label="Open Settings" actionId="openSettings" side="top">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Open Settings"
            onClick={onOpenSettings}
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </ActionTooltip>
      </div>
    </aside>
  );
}
