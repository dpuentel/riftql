import * as React from 'react';
import {
  ArrowDownAZ,
  Check,
  ChevronDown,
  ChevronRight,
  Cookie,
  Folder,
  FolderPlus,
  FolderUp,
  GitBranch,
  Globe,
  History,
  Layers,
  Link2,
  Pencil,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
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
import { resolveEffectiveBaseUrl } from '@/lib/base-url';
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
import type {
  CollectionRecord,
  FolderRecord,
  GitSyncStatus,
  HistoryEntry,
  SavedRequestRecord,
} from '@/types/storage';

export type DragPayload =
  | { kind: 'request'; id: string }
  | { kind: 'folder'; id: string };

export type DropTarget =
  | { kind: 'collection'; collectionId: string }
  | { kind: 'folder'; collectionId: string; folderId: string };

export function canDropDraggedItem(
  dragged: DragPayload,
  target: DropTarget,
  folders: FolderRecord[],
  savedRequests: SavedRequestRecord[],
): boolean {
  if (dragged.kind === 'request') {
    const req = savedRequests.find((r) => r.id === dragged.id);
    if (!req) return false;
    const targetFolderId = target.kind === 'folder' ? target.folderId : undefined;
    if (
      req.collectionId === target.collectionId &&
      (req.folderId ?? undefined) === targetFolderId
    ) {
      return false;
    }
    return true;
  }

  const fld = folders.find((f) => f.id === dragged.id);
  if (!fld) return false;

  if (target.kind === 'collection') {
    return !(fld.collectionId === target.collectionId && !fld.parentId);
  }

  if (target.folderId === fld.id) return false;
  if (
    fld.collectionId === target.collectionId &&
    (fld.parentId ?? undefined) === target.folderId
  ) {
    return false;
  }

  const folderMap = new Map(folders.map((f) => [f.id, f]));
  const visited = new Set<string>();
  let cursor: string | undefined = target.folderId;
  while (cursor && !visited.has(cursor)) {
    if (cursor === fld.id) return false;
    visited.add(cursor);
    cursor = folderMap.get(cursor)?.parentId;
  }
  return true;
}

interface SidebarProps {
  onOpenEnvironments: () => void;
  onOpenCookies: () => void;
  onOpenSettings: () => void;
  onOpenGitSyncSettings?: () => void;
  onOpenRemoteUpdates?: () => void;
  onOpenImportCollection?: (target?: { collectionId?: string; folderId?: string }) => void;
  onDiscoverGraphQL?: (target: { collectionId: string; folderId?: string }) => void;
  gitSyncStatus?: GitSyncStatus | null;
  onEditCollection: (collection: CollectionRecord) => void;
  onEditFolder: (folder: FolderRecord) => void;
  createCollectionTrigger?: number;
  width?: number;
}

type SidebarView = 'collections' | 'history' | 'environments';

type RenameTarget = {
  kind: 'collection' | 'folder' | 'request';
  id: string;
};

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

const HOVER_ACTION_TRAY =
  'flex w-0 shrink-0 items-center overflow-hidden opacity-0 pointer-events-none group-hover:w-auto group-hover:overflow-visible group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:w-auto group-focus-within:overflow-visible group-focus-within:opacity-100 group-focus-within:pointer-events-auto';

export function Sidebar({
  onOpenEnvironments,
  onOpenCookies,
  onOpenSettings,
  onOpenGitSyncSettings,
  onOpenRemoteUpdates,
  onOpenImportCollection,
  onDiscoverGraphQL,
  gitSyncStatus,
  onEditCollection,
  onEditFolder,
  createCollectionTrigger,
  width,
}: SidebarProps) {
  const [view, setView] = React.useState<SidebarView>('collections');
  const [search, setSearch] = React.useState('');
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
  const [creatingCollection, setCreatingCollection] = React.useState(false);
  const [newCollectionName, setNewCollectionName] = React.useState('');
  const [renamingItem, setRenamingItem] = React.useState<RenameTarget | null>(null);
  const [renameDraft, setRenameDraft] = React.useState('');
  const [confirmDelete, setConfirmDelete] = React.useState<RenameTarget | null>(null);
  const [draggedItem, setDraggedItem] = React.useState<DragPayload | null>(null);
  const [dropTarget, setDropTarget] = React.useState<DropTarget | null>(null);
  const skipRenameBlurRef = React.useRef(false);
  const draggedItemRef = React.useRef<DragPayload | null>(null);
  const hoverExpandTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const renameSavedRequest = useWorkspaceStore((s) => s.renameSavedRequest);
  const moveSavedRequest = useWorkspaceStore((s) => s.moveSavedRequest);
  const moveFolder = useWorkspaceStore((s) => s.moveFolder);
  const sortSavedRequests = useWorkspaceStore((s) => s.sortSavedRequests);
  const deleteSavedRequest = useWorkspaceStore((s) => s.deleteSavedRequest);
  const clearHistory = useWorkspaceStore((s) => s.clearHistory);

  const openSavedRequest = useTabsStore((s) => s.openSavedRequest);
  const openHistoryEntry = useTabsStore((s) => s.openHistoryEntry);
  const syncSavedRequestRename = useTabsStore((s) => s.syncSavedRequestRename);
  const syncMovedSavedRequest = useTabsStore((s) => s.syncMovedSavedRequest);
  const syncMovedCollectionRequests = useTabsStore((s) => s.syncMovedCollectionRequests);
  const detachDeletedSavedRequests = useTabsStore((s) => s.detachDeletedSavedRequests);
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

  const startRename = (kind: RenameTarget['kind'], id: string, currentName: string) => {
    skipRenameBlurRef.current = false;
    setConfirmDelete(null);
    setRenamingItem({ kind, id });
    setRenameDraft(currentName);
  };

  const cancelRename = () => {
    skipRenameBlurRef.current = true;
    setRenamingItem(null);
    setRenameDraft('');
  };

  const commitRename = async () => {
    if (skipRenameBlurRef.current) {
      skipRenameBlurRef.current = false;
      return;
    }
    const target = renamingItem;
    const trimmed = renameDraft.trim();
    setRenamingItem(null);
    setRenameDraft('');
    if (!target || !trimmed) return;

    if (target.kind === 'collection') {
      const col = collections.find((c) => c.id === target.id);
      if (col && col.name !== trimmed) {
        await upsertCollection({
          id: col.id,
          name: trimmed,
          description: col.description,
          baseUrl: col.baseUrl,
          auth: col.auth,
          variables: col.variables,
          sortOrder: col.sortOrder,
        });
      }
      return;
    }

    if (target.kind === 'folder') {
      const folder = folders.find((f) => f.id === target.id);
      if (folder && folder.name !== trimmed) {
        await upsertFolder({
          id: folder.id,
          collectionId: folder.collectionId,
          parentId: folder.parentId,
          name: trimmed,
          baseUrl: folder.baseUrl,
          auth: folder.auth,
          sortOrder: folder.sortOrder,
        });
      }
      return;
    }

    if (target.kind === 'request') {
      const req = savedRequests.find((r) => r.id === target.id);
      if (req && req.name !== trimmed) {
        const updated = await renameSavedRequest(req.id, trimmed);
        if (updated) {
          syncSavedRequestRename(updated.id, updated.name);
        }
      }
    }
  };

  const handleDeleteCollection = async (collectionId: string) => {
    const affectedRequestIds = new Set(
      savedRequests.filter((r) => r.collectionId === collectionId).map((r) => r.id),
    );
    setConfirmDelete(null);
    await deleteCollection(collectionId);
    detachDeletedSavedRequests(affectedRequestIds);
  };

  const handleDeleteFolder = async (folderId: string) => {
    const toRemove = new Set<string>([folderId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of folders) {
        if (f.parentId && toRemove.has(f.parentId) && !toRemove.has(f.id)) {
          toRemove.add(f.id);
          changed = true;
        }
      }
    }
    const affectedRequestIds = new Set(
      savedRequests
        .filter((r) => r.folderId && toRemove.has(r.folderId))
        .map((r) => r.id),
    );
    setConfirmDelete(null);
    await deleteFolder(folderId);
    detachDeletedSavedRequests(affectedRequestIds);
  };

  const handleDeleteRequest = async (requestId: string) => {
    setConfirmDelete(null);
    await deleteSavedRequest(requestId);
    detachDeletedSavedRequests(new Set([requestId]));
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
    startRename('folder', folder.id, folder.name);
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

  const clearHoverExpand = () => {
    if (hoverExpandTimerRef.current) {
      clearTimeout(hoverExpandTimerRef.current);
      hoverExpandTimerRef.current = null;
    }
  };

  React.useEffect(() => () => clearHoverExpand(), []);

  const scheduleHoverExpand = (containerId: string) => {
    if (expandedIds.has(containerId)) return;
    clearHoverExpand();
    hoverExpandTimerRef.current = setTimeout(() => {
      setExpandedIds((prev) => new Set(prev).add(containerId));
    }, 450);
  };

  const clearDragState = () => {
    clearHoverExpand();
    draggedItemRef.current = null;
    setDraggedItem(null);
    setDropTarget(null);
  };

  const resolveDragPayload = (e: React.DragEvent): DragPayload | null => {
    if (draggedItemRef.current) return draggedItemRef.current;
    try {
      const raw = e.dataTransfer?.getData('text/plain');
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === 'object' &&
        'kind' in parsed &&
        'id' in parsed &&
        (parsed.kind === 'request' || parsed.kind === 'folder') &&
        typeof parsed.id === 'string'
      ) {
        return { kind: parsed.kind, id: parsed.id };
      }
    } catch {
      // Ignore invalid or restricted drag payload
    }
    return null;
  };

  const handleDragStartItem = (e: React.DragEvent, payload: DragPayload) => {
    e.stopPropagation();
    draggedItemRef.current = payload;
    setDraggedItem(payload);
    try {
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify(payload));
      }
    } catch {
      // Ignore synthetic DragEvent implementations without dataTransfer setters
    }
  };

  const handleDragOverTarget = (e: React.DragEvent, target: DropTarget) => {
    const payload = resolveDragPayload(e);
    if (!payload || !canDropDraggedItem(payload, target, folders, savedRequests)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    try {
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
    } catch {
      // Ignore read-only dataTransfer in test runners
    }
    setDropTarget(target);
    scheduleHoverExpand(target.kind === 'folder' ? target.folderId : target.collectionId);
  };

  const handleDragLeaveTarget = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    clearHoverExpand();
    setDropTarget(null);
  };

  const handleDropOnTarget = async (e: React.DragEvent, target: DropTarget) => {
    const payload = resolveDragPayload(e);
    clearDragState();
    if (!payload || !canDropDraggedItem(payload, target, folders, savedRequests)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(target.collectionId);
      if (target.kind === 'folder') next.add(target.folderId);
      return next;
    });

    if (payload.kind === 'request') {
      const targetFolderId = target.kind === 'folder' ? target.folderId : undefined;
      const moved = await moveSavedRequest(payload.id, target.collectionId, targetFolderId);
      if (moved) {
        syncMovedSavedRequest(moved.id, moved.collectionId, moved.folderId);
      }
      return;
    }

    const targetParentId = target.kind === 'folder' ? target.folderId : undefined;
    const movedReqIds = await moveFolder(payload.id, target.collectionId, targetParentId);
    syncMovedCollectionRequests(new Set(movedReqIds), target.collectionId);
  };

  const handleSortRequests = async (
    collectionId: string,
    folderId?: string,
    direction: 'asc' | 'desc' = 'asc',
  ) => {
    await sortSavedRequests(collectionId, folderId, direction);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(collectionId);
      if (folderId) next.add(folderId);
      return next;
    });
  };

  const q = search.trim().toLowerCase();
  const newCollectionShortcut = formatShortcutForDisplay(
    getEffectiveShortcuts(settings.customShortcuts).newCollection,
  );

  const renderFolderTree = (collectionId: string, parentId?: string, depth: number = 1) => {
    const childFolders = folders.filter(
      (f) => f.collectionId === collectionId && (f.parentId ?? undefined) === parentId,
    );
    const childRequests = savedRequests
      .filter(
        (r) =>
          r.collectionId === collectionId &&
          (r.folderId ?? undefined) === parentId &&
          (!q ||
            r.name.toLowerCase().includes(q) ||
            r.url.toLowerCase().includes(q)),
      )
      .slice()
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt),
      );

    return (
      <>
        {childFolders.map((folder) => {
          const isOpen = expandedIds.has(folder.id) || q.length > 0;
          const isRenaming =
            renamingItem?.kind === 'folder' && renamingItem.id === folder.id;
          const isConfirmingDelete =
            confirmDelete?.kind === 'folder' && confirmDelete.id === folder.id;
          const folderTarget: DropTarget = {
            kind: 'folder',
            collectionId,
            folderId: folder.id,
          };
          const isDraggedFolder =
            draggedItem?.kind === 'folder' && draggedItem.id === folder.id;
          const isFolderDropActive =
            dropTarget?.kind === 'folder' && dropTarget.folderId === folder.id;
          const folderHasBaseUrl = Boolean(
            resolveEffectiveBaseUrl(folder.id, collectionId, folders, collections).baseUrl.trim(),
          );

          return (
            <div key={folder.id}>
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div
                    draggable={!isRenaming && !isConfirmingDelete}
                    onDragStart={(e) =>
                      handleDragStartItem(e, { kind: 'folder', id: folder.id })
                    }
                    onDragEnd={clearDragState}
                    onDragOver={(e) => handleDragOverTarget(e, folderTarget)}
                    onDragLeave={handleDragLeaveTarget}
                    onDrop={(e) => void handleDropOnTarget(e, folderTarget)}
                    data-drop-target={`folder:${folder.id}`}
                    style={{ paddingLeft: `${depth * 12}px` }}
                    className={cn(
                      'group flex items-center gap-1 rounded px-1.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                      !isRenaming && !isConfirmingDelete && 'cursor-grab active:cursor-grabbing',
                      isDraggedFolder && 'opacity-50',
                      isFolderDropActive &&
                        'bg-[var(--accent-muted)] ring-1 ring-inset ring-[var(--accent)]',
                    )}
                  >
                    {isRenaming ? (
                      <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                        <Input
                          autoFocus
                          value={renameDraft}
                          aria-label="Rename folder"
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onBlur={() => void commitRename()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void commitRename();
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelRename();
                            }
                          }}
                          className="h-6 px-1.5 text-xs"
                        />
                      </div>
                    ) : isConfirmingDelete ? (
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-1">
                        <span className="truncate text-[0.75rem] font-medium text-[#F87171]">
                          Delete &ldquo;{folder.name}&rdquo;?
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          <ActionTooltip label="Confirm Delete Folder">
                            <button
                              type="button"
                              aria-label={`Confirm delete ${folder.name}`}
                              onClick={() => void handleDeleteFolder(folder.id)}
                              className="inline-flex h-5 items-center gap-0.5 rounded bg-[#DC2626]/20 px-1.5 text-[0.6875rem] font-medium text-[#DC2626] hover:bg-[#DC2626]/30 dark:text-[#F87171]"
                            >
                              <Check className="h-3 w-3" />
                              <span>Delete</span>
                            </button>
                          </ActionTooltip>
                          <ActionTooltip label="Cancel Delete">
                            <button
                              type="button"
                              aria-label="Cancel delete"
                              onClick={() => setConfirmDelete(null)}
                              className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </ActionTooltip>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleExpand(folder.id)}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            startRename('folder', folder.id, folder.name);
                          }}
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
                          {folder.baseUrl?.trim() && (
                            <span title={`Base URL: ${folder.baseUrl.trim()}`} className="shrink-0">
                              <Link2 className="h-3 w-3 text-[var(--accent)]" />
                            </span>
                          )}
                        </button>
                        <div className={HOVER_ACTION_TRAY}>
                          <ActionTooltip label="New Request">
                            <button
                              type="button"
                              aria-label={`Add request to ${folder.name}`}
                              onClick={() => void handleAddRequest(collectionId, folder.id)}
                              className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </ActionTooltip>
                          <ActionTooltip label="New Subfolder">
                            <button
                              type="button"
                              aria-label={`New subfolder in ${folder.name}`}
                              onClick={() => void handleAddFolder(collectionId, folder.id)}
                              className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                            >
                              <FolderPlus className="h-3 w-3" />
                            </button>
                          </ActionTooltip>
                          <ActionTooltip label="Rename Folder">
                            <button
                              type="button"
                              aria-label={`Rename ${folder.name}`}
                              onClick={() => startRename('folder', folder.id, folder.name)}
                              className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          </ActionTooltip>
                          <ActionTooltip label="Sort Requests A-Z">
                            <button
                              type="button"
                              aria-label={`Sort requests in ${folder.name}`}
                              onClick={() => void handleSortRequests(collectionId, folder.id, 'asc')}
                              className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                            >
                              <ArrowDownAZ className="h-3 w-3" />
                            </button>
                          </ActionTooltip>
                          <ActionTooltip label="Folder Settings">
                            <button
                              type="button"
                              aria-label={`Settings for ${folder.name}`}
                              onClick={() => onEditFolder(folder)}
                              className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                            >
                              <SlidersHorizontal className="h-3 w-3" />
                            </button>
                          </ActionTooltip>
                          {onDiscoverGraphQL && folderHasBaseUrl && (
                            <ActionTooltip label="Discover GraphQL Schema">
                              <button
                                type="button"
                                aria-label={`Discover GraphQL schema for ${folder.name}`}
                                onClick={() => onDiscoverGraphQL({ collectionId, folderId: folder.id })}
                                className="inline-flex h-5 w-5 items-center justify-center rounded text-[#E879F9] hover:bg-[var(--bg-elevated)]"
                              >
                                <Sparkles className="h-3 w-3" />
                              </button>
                            </ActionTooltip>
                          )}
                          <ActionTooltip label="Delete Folder">
                            <button
                              type="button"
                              aria-label={`Delete ${folder.name}`}
                              onClick={() => {
                                setRenamingItem(null);
                                setConfirmDelete({ kind: 'folder', id: folder.id });
                              }}
                              className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[#F87171]"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </ActionTooltip>
                        </div>
                      </>
                    )}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => void handleAddRequest(collectionId, folder.id)}>
                    New Request
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => void handleAddFolder(collectionId, folder.id)}>
                    New Subfolder
                  </ContextMenuItem>
                  {onOpenImportCollection && (
                    <ContextMenuItem
                      onSelect={() => onOpenImportCollection({ collectionId, folderId: folder.id })}
                    >
                      Import Into Folder…
                    </ContextMenuItem>
                  )}
                  <ContextMenuItem onSelect={() => startRename('folder', folder.id, folder.name)}>
                    Rename Folder
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => void handleSortRequests(collectionId, folder.id, 'asc')}
                  >
                    Sort Requests A → Z
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => void handleSortRequests(collectionId, folder.id, 'desc')}
                  >
                    Sort Requests Z → A
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => onEditFolder(folder)}>
                    Folder Settings / Auth
                  </ContextMenuItem>
                  {onDiscoverGraphQL && folderHasBaseUrl && (
                    <ContextMenuItem
                      onSelect={() => onDiscoverGraphQL({ collectionId, folderId: folder.id })}
                    >
                      Discover GraphQL Schema…
                    </ContextMenuItem>
                  )}
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onSelect={() => void handleDeleteFolder(folder.id)}
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
          const isRenaming =
            renamingItem?.kind === 'request' && renamingItem.id === req.id;
          const isDraggedRequest =
            draggedItem?.kind === 'request' && draggedItem.id === req.id;

          return (
            <ContextMenu key={req.id}>
              <ContextMenuTrigger asChild>
                <div
                  draggable={!isRenaming}
                  onDragStart={(e) =>
                    handleDragStartItem(e, { kind: 'request', id: req.id })
                  }
                  onDragEnd={clearDragState}
                  style={{ paddingLeft: `${depth * 12 + 16}px` }}
                  className={cn(
                    'group flex items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-colors',
                    !isRenaming && 'cursor-grab active:cursor-grabbing',
                    isDraggedRequest && 'opacity-50',
                    isSelected
                      ? 'bg-[var(--accent-muted)] text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                  )}
                >
                  {isRenaming ? (
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span
                        className={cn(
                          'w-9 shrink-0 font-mono-code text-[0.6875rem] font-semibold',
                          getMethodColorClass(badge),
                        )}
                      >
                        {badge}
                      </span>
                      <Input
                        autoFocus
                        value={renameDraft}
                        aria-label="Rename request"
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={() => void commitRename()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void commitRename();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelRename();
                          }
                        }}
                        className="h-6 px-1.5 text-xs"
                      />
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => openSavedRequest(req)}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          startRename('request', req.id, req.name);
                        }}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
                      >
                        <span
                          className={cn(
                            'w-9 shrink-0 font-mono-code text-[0.6875rem] font-semibold',
                            getMethodColorClass(badge),
                          )}
                        >
                          {badge}
                        </span>
                        <span className="truncate">{req.name}</span>
                      </button>
                      <div className={HOVER_ACTION_TRAY}>
                        <ActionTooltip label="Rename Request">
                          <button
                            type="button"
                            aria-label={`Rename ${req.name}`}
                            onClick={() => startRename('request', req.id, req.name)}
                            className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        </ActionTooltip>
                        <ActionTooltip label="Delete Request">
                          <button
                            type="button"
                            aria-label={`Delete ${req.name}`}
                            onClick={() => void handleDeleteRequest(req.id)}
                            className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[#F87171]"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </ActionTooltip>
                      </div>
                    </>
                  )}
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => openSavedRequest(req)}>Open in Tab</ContextMenuItem>
                <ContextMenuItem onSelect={() => startRename('request', req.id, req.name)}>
                  Rename Request
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onSelect={() => void handleDeleteRequest(req.id)}
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
      style={width ? { width: `${width}px` } : undefined}
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-base)] select-none',
        !width && 'w-64',
      )}
    >
      {/* View Switcher */}
      <div className="grid grid-cols-3 gap-1 border-b border-[var(--border-subtle)] p-1.5">
        <button
          type="button"
          onClick={() => setView('collections')}
          className={cn(
            'flex cursor-pointer items-center justify-center gap-1 rounded px-2 py-1 text-[0.75rem] font-medium transition-colors',
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
            'flex cursor-pointer items-center justify-center gap-1 rounded px-2 py-1 text-[0.75rem] font-medium transition-colors',
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
            'flex cursor-pointer items-center justify-center gap-1 rounded px-2 py-1 text-[0.75rem] font-medium transition-colors',
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
          <div className="flex shrink-0 items-center gap-1">
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
            {onOpenImportCollection && (
              <ActionTooltip label="Import Collection / Spec">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Import Collection"
                  onClick={() => onOpenImportCollection()}
                >
                  <FolderUp className="h-3.5 w-3.5" />
                </Button>
              </ActionTooltip>
            )}
          </div>
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
              <div className="flex flex-col items-center gap-2 px-3 py-8 text-center text-xs text-[var(--text-secondary)]">
                <div>
                  No collections yet. Press{' '}
                  <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1 py-0.5 font-mono-code text-[0.6875rem]">
                    {newCollectionShortcut}
                  </kbd>{' '}
                  to create one.
                </div>
                {onOpenImportCollection && (
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    onClick={() => onOpenImportCollection()}
                  >
                    <FolderUp className="h-3.5 w-3.5" />
                    <span>Import Postman / Altair / OpenAPI</span>
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {collections.map((col) => {
                  const isOpen = expandedIds.has(col.id) || q.length > 0;
                  const isRenaming =
                    renamingItem?.kind === 'collection' && renamingItem.id === col.id;
                  const isConfirmingDelete =
                    confirmDelete?.kind === 'collection' && confirmDelete.id === col.id;
                  const colTarget: DropTarget = {
                    kind: 'collection',
                    collectionId: col.id,
                  };
                  const isCollectionDropActive =
                    dropTarget?.kind === 'collection' && dropTarget.collectionId === col.id;

                  return (
                    <div key={col.id}>
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <div
                            onDragOver={(e) => handleDragOverTarget(e, colTarget)}
                            onDragLeave={handleDragLeaveTarget}
                            onDrop={(e) => void handleDropOnTarget(e, colTarget)}
                            data-drop-target={`collection:${col.id}`}
                            className={cn(
                              'group flex items-center gap-1 rounded px-1.5 py-1 text-xs hover:bg-[var(--bg-hover)]',
                              isCollectionDropActive &&
                                'bg-[var(--accent-muted)] ring-1 ring-inset ring-[var(--accent)]',
                            )}
                          >
                            {isRenaming ? (
                              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                <Input
                                  autoFocus
                                  value={renameDraft}
                                  aria-label="Rename collection"
                                  onChange={(e) => setRenameDraft(e.target.value)}
                                  onBlur={() => void commitRename()}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      void commitRename();
                                    } else if (e.key === 'Escape') {
                                      e.preventDefault();
                                      cancelRename();
                                    }
                                  }}
                                  className="h-6 px-1.5 text-xs"
                                />
                              </div>
                            ) : isConfirmingDelete ? (
                              <div className="flex min-w-0 flex-1 items-center justify-between gap-1">
                                <span className="truncate text-[0.75rem] font-medium text-[#F87171]">
                                  Delete &ldquo;{col.name}&rdquo;?
                                </span>
                                <div className="flex shrink-0 items-center gap-1">
                                  <ActionTooltip label="Confirm Delete Collection">
                                    <button
                                      type="button"
                                      aria-label={`Confirm delete ${col.name}`}
                                      onClick={() => void handleDeleteCollection(col.id)}
                                      className="inline-flex h-5 items-center gap-0.5 rounded bg-[#DC2626]/20 px-1.5 text-[0.6875rem] font-medium text-[#DC2626] hover:bg-[#DC2626]/30 dark:text-[#F87171]"
                                    >
                                      <Check className="h-3 w-3" />
                                      <span>Delete</span>
                                    </button>
                                  </ActionTooltip>
                                  <ActionTooltip label="Cancel Delete">
                                    <button
                                      type="button"
                                      aria-label="Cancel delete"
                                      onClick={() => setConfirmDelete(null)}
                                      className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </ActionTooltip>
                                </div>
                              </div>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(col.id)}
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    startRename('collection', col.id, col.name);
                                  }}
                                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left font-medium text-[var(--text-primary)]"
                                >
                                  {isOpen ? (
                                    <ChevronDown className="h-3 w-3 shrink-0 text-[var(--text-secondary)]" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3 shrink-0 text-[var(--text-secondary)]" />
                                  )}
                                  <span className="truncate">{col.name}</span>
                                  {col.baseUrl?.trim() && (
                                    <span title={`Base URL: ${col.baseUrl.trim()}`} className="shrink-0">
                                      <Link2 className="h-3 w-3 text-[var(--accent)]" />
                                    </span>
                                  )}
                                </button>
                                <div className={HOVER_ACTION_TRAY}>
                                  <ActionTooltip label="New Request">
                                    <button
                                      type="button"
                                      aria-label={`New request in ${col.name}`}
                                      onClick={() => void handleAddRequest(col.id)}
                                      className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                                    >
                                      <Plus className="h-3 w-3" />
                                    </button>
                                  </ActionTooltip>
                                  <ActionTooltip label="New Folder">
                                    <button
                                      type="button"
                                      aria-label={`New folder in ${col.name}`}
                                      onClick={() => void handleAddFolder(col.id)}
                                      className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                                    >
                                      <FolderPlus className="h-3 w-3" />
                                    </button>
                                  </ActionTooltip>
                                  <ActionTooltip label="Rename Collection">
                                    <button
                                      type="button"
                                      aria-label={`Rename ${col.name}`}
                                      onClick={() => startRename('collection', col.id, col.name)}
                                      className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  </ActionTooltip>
                                  <ActionTooltip label="Sort Requests A-Z">
                                    <button
                                      type="button"
                                      aria-label={`Sort requests in ${col.name}`}
                                      onClick={() => void handleSortRequests(col.id, undefined, 'asc')}
                                      className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                                    >
                                      <ArrowDownAZ className="h-3 w-3" />
                                    </button>
                                  </ActionTooltip>
                                  <ActionTooltip label="Collection Settings">
                                    <button
                                      type="button"
                                      aria-label={`Settings for ${col.name}`}
                                      onClick={() => onEditCollection(col)}
                                      className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                                    >
                                      <SlidersHorizontal className="h-3 w-3" />
                                    </button>
                                  </ActionTooltip>
                                  {onDiscoverGraphQL && Boolean(col.baseUrl?.trim()) && (
                                    <ActionTooltip label="Discover GraphQL Schema">
                                      <button
                                        type="button"
                                        aria-label={`Discover GraphQL schema for ${col.name}`}
                                        onClick={() => onDiscoverGraphQL({ collectionId: col.id })}
                                        className="inline-flex h-5 w-5 items-center justify-center rounded text-[#E879F9] hover:bg-[var(--bg-elevated)]"
                                      >
                                        <Sparkles className="h-3 w-3" />
                                      </button>
                                    </ActionTooltip>
                                  )}
                                  <ActionTooltip label="Delete Collection">
                                    <button
                                      type="button"
                                      aria-label={`Delete ${col.name}`}
                                      onClick={() => {
                                        setRenamingItem(null);
                                        setConfirmDelete({ kind: 'collection', id: col.id });
                                      }}
                                      className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[#F87171]"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </ActionTooltip>
                                </div>
                              </>
                            )}
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem onSelect={() => void handleAddRequest(col.id)}>
                            New Request
                          </ContextMenuItem>
                          <ContextMenuItem onSelect={() => void handleAddFolder(col.id)}>
                            New Folder
                          </ContextMenuItem>
                          {onOpenImportCollection && (
                            <ContextMenuItem
                              onSelect={() => onOpenImportCollection({ collectionId: col.id })}
                            >
                              Import Into Collection…
                            </ContextMenuItem>
                          )}
                          <ContextMenuItem
                            onSelect={() => startRename('collection', col.id, col.name)}
                          >
                            Rename Collection
                          </ContextMenuItem>
                          <ContextMenuItem
                            onSelect={() => void handleSortRequests(col.id, undefined, 'asc')}
                          >
                            Sort Requests A → Z
                          </ContextMenuItem>
                          <ContextMenuItem
                            onSelect={() => void handleSortRequests(col.id, undefined, 'desc')}
                          >
                            Sort Requests Z → A
                          </ContextMenuItem>
                          <ContextMenuItem onSelect={() => onEditCollection(col)}>
                            Collection Settings &amp; Auth
                          </ContextMenuItem>
                          {onDiscoverGraphQL && Boolean(col.baseUrl?.trim()) && (
                            <ContextMenuItem
                              onSelect={() => onDiscoverGraphQL({ collectionId: col.id })}
                            >
                              Discover GraphQL Schema…
                            </ContextMenuItem>
                          )}
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            onSelect={() => void handleDeleteCollection(col.id)}
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
                    <div className="px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
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
                                  'font-mono-code text-[0.6875rem] font-semibold',
                                  getMethodColorClass(label),
                                )}
                              >
                                {label}
                              </span>
                              <span className="truncate font-mono-code text-[0.75rem] text-[var(--text-primary)]">
                                {item.url}
                              </span>
                            </div>
                            <span
                              className={cn(
                                'shrink-0 rounded border px-1 font-mono-code text-[0.6875rem] tabular-nums',
                                getStatusBadgeClasses(item.status),
                              )}
                            >
                              {item.status}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[0.6875rem] text-[var(--text-tertiary)] tabular-nums">
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
      <div className="flex items-center justify-between gap-1 border-t border-[var(--border-subtle)] px-2 py-1.5">
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

        <div className="flex items-center gap-0.5">
          {gitSyncStatus?.enabled && (
            <>
              <ActionTooltip
                label={
                  gitSyncStatus.isPushing
                    ? 'Pushing changes to Git remote…'
                    : gitSyncStatus.lastError
                      ? `Git Sync Error: ${gitSyncStatus.lastError}`
                      : `Git Sync Active: ${gitSyncStatus.folderPath ?? ''}`
                }
                side="top"
              >
                <Button
                  size="xs"
                  variant="ghost"
                  aria-label="Open Git Sync Settings"
                  onClick={onOpenGitSyncSettings ?? onOpenSettings}
                  className="max-w-[7rem] gap-1 px-1.5 font-mono-code text-[0.6875rem]"
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      gitSyncStatus.isPushing
                        ? 'animate-pulse bg-[#60A5FA]'
                        : gitSyncStatus.lastError
                          ? 'bg-[#F87171]'
                          : 'bg-[#34D399]',
                    )}
                  />
                  <GitBranch className="h-3 w-3 shrink-0 text-[var(--accent)]" />
                  <span className="truncate">
                    {gitSyncStatus.isPushing
                      ? 'Pushing…'
                      : gitSyncStatus.git.branch || 'Synced'}
                  </span>
                </Button>
              </ActionTooltip>
              {(gitSyncStatus.remoteUpdate?.behind ?? gitSyncStatus.git.behind) > 0 && (
                <ActionTooltip
                  label={`${gitSyncStatus.remoteUpdate?.behind ?? gitSyncStatus.git.behind} incoming commit(s) on remote — click to review & pull`}
                  side="top"
                >
                  <button
                    type="button"
                    aria-label="Review remote Git updates"
                    onClick={onOpenRemoteUpdates ?? onOpenGitSyncSettings ?? onOpenSettings}
                    className="inline-flex h-5 cursor-pointer items-center rounded border border-[#60A5FA]/40 bg-[#60A5FA]/15 px-1.5 font-mono-code text-[0.6875rem] font-semibold text-[#2563EB] hover:bg-[#60A5FA]/25 dark:text-[#60A5FA] tabular-nums"
                  >
                    ↓{gitSyncStatus.remoteUpdate?.behind ?? gitSyncStatus.git.behind}
                  </button>
                </ActionTooltip>
              )}
            </>
          )}

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
      </div>
    </aside>
  );
}
