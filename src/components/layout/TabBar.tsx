import { Plus, X } from 'lucide-react';
import { ActionTooltip } from '@/components/ui/action-tooltip';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { getMethodColorClass } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useTabsStore } from '@/store/useTabsStore';

export function TabBar() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const selectTab = useTabsStore((s) => s.selectTab);
  const closeTab = useTabsStore((s) => s.closeTab);
  const newTab = useTabsStore((s) => s.newTab);
  const duplicateTab = useTabsStore((s) => s.duplicateTab);

  const handleCloseOthers = (keepId: string) => {
    for (const t of tabs) {
      if (t.id !== keepId) closeTab(t.id);
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Open request tabs"
      className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rift-scroll px-1"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const badgeLabel =
          tab.draft.protocol === 'graphql' ? 'GQL' : tab.draft.method.toUpperCase();

        return (
          <ContextMenu key={tab.id}>
            <ContextMenuTrigger asChild>
              <div
                role="tab"
                aria-selected={isActive}
                tabIndex={0}
                onClick={() => selectTab(tab.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectTab(tab.id);
                  }
                }}
                onMouseDown={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    closeTab(tab.id);
                  }
                }}
                className={cn(
                  'group relative flex h-7 max-w-[190px] min-w-[110px] shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs transition-colors select-none',
                  isActive
                    ? 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)]'
                    : 'border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                )}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-2 top-0 h-[1.5px] rounded-full bg-[var(--accent)]"
                  />
                )}
                <span
                  className={cn(
                    'shrink-0 font-mono-code text-[10px] font-semibold tracking-tight',
                    getMethodColorClass(badgeLabel),
                  )}
                >
                  {badgeLabel}
                </span>
                <span className="truncate font-medium">{tab.title}</span>
                {tab.isLoading ? (
                  <span
                    aria-label="Sending"
                    className="ml-auto h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--accent)]"
                  />
                ) : tab.isDirty ? (
                  <span
                    aria-label="Unsaved changes"
                    className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)] group-hover:hidden"
                  />
                ) : null}

                <ActionTooltip label="Close Tab" actionId="closeTab">
                  <button
                    type="button"
                    aria-label={`Close ${tab.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    className={cn(
                      'ml-auto inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                      tab.isDirty && !tab.isLoading
                        ? 'hidden group-hover:inline-flex'
                        : 'opacity-0 group-hover:opacity-100',
                      isActive && !tab.isDirty && 'opacity-70',
                    )}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </ActionTooltip>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => duplicateTab(tab.id)}>
                Duplicate Tab
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => closeTab(tab.id)}>Close Tab</ContextMenuItem>
              <ContextMenuItem
                disabled={tabs.length <= 1}
                onSelect={() => handleCloseOthers(tab.id)}
              >
                Close Other Tabs
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}

      <ActionTooltip label="New Request Tab" actionId="newTab">
        <button
          type="button"
          aria-label="New Request Tab"
          onClick={() => newTab('rest')}
          className="ml-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </ActionTooltip>
    </div>
  );
}
