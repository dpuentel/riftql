import * as React from 'react';
import {
  Columns2,
  Command,
  Globe,
  Moon,
  PanelLeft,
  Rows2,
  Settings,
  Sun,
} from 'lucide-react';
import { RiftLogo } from '@/components/brand/RiftLogo';
import { Sidebar } from '@/components/layout/Sidebar';
import { TabBar } from '@/components/layout/TabBar';
import { CollectionSettingsModal } from '@/components/modals/CollectionSettingsModal';
import { CookieJarModal } from '@/components/modals/CookieJarModal';
import { EnvironmentModal } from '@/components/modals/EnvironmentModal';
import { SaveRequestModal } from '@/components/modals/SaveRequestModal';
import { RequestPane } from '@/components/request/RequestPane';
import { ResponsePane } from '@/components/response/ResponsePane';
import { ActionTooltip } from '@/components/ui/action-tooltip';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import type { CollectionRecord, FolderRecord } from '@/types/storage';

export interface AppShellModalSlots {
  commandPaletteOpen?: boolean;
  setCommandPaletteOpen?: (open: boolean) => void;
  settingsOpen?: boolean;
  setSettingsOpen?: (open: boolean) => void;
  importCurlOpen?: boolean;
  setImportCurlOpen?: (open: boolean) => void;
  codeSnippetOpen?: boolean;
  setCodeSnippetOpen?: (open: boolean) => void;
  envOpen?: boolean;
  setEnvOpen?: (open: boolean) => void;
  cookiesOpen?: boolean;
  setCookiesOpen?: (open: boolean) => void;
  sidebarOpen?: boolean;
  setSidebarOpen?: (open: boolean) => void;
  saveModalTabId?: string | null;
  setSaveModalTabId?: (tabId: string | null) => void;
  createCollectionTrigger?: number;
  urlInputRef?: React.RefObject<HTMLInputElement | null>;
  onPasteCurlInUrl?: (command: string) => boolean;
  extraModals?: React.ReactNode;
}

export function AppShell(props: AppShellModalSlots = {}) {
  const [localSidebarOpen, setLocalSidebarOpen] = React.useState(true);
  const [localEnvOpen, setLocalEnvOpen] = React.useState(false);
  const [localCookiesOpen, setLocalCookiesOpen] = React.useState(false);
  const [localSaveTabId, setLocalSaveTabId] = React.useState<string | null>(null);
  const [editingCollection, setEditingCollection] = React.useState<
    CollectionRecord | undefined
  >();
  const [editingFolder, setEditingFolder] = React.useState<FolderRecord | undefined>();
  const [splitRatio, setSplitRatio] = React.useState(0.5);
  const splitContainerRef = React.useRef<HTMLDivElement | null>(null);
  const draggingRef = React.useRef(false);

  const sidebarOpen = props.sidebarOpen ?? localSidebarOpen;
  const setSidebarOpen = props.setSidebarOpen ?? setLocalSidebarOpen;
  const envOpen = props.envOpen ?? localEnvOpen;
  const setEnvOpen = props.setEnvOpen ?? setLocalEnvOpen;
  const cookiesOpen = props.cookiesOpen ?? localCookiesOpen;
  const setCookiesOpen = props.setCookiesOpen ?? setLocalCookiesOpen;
  const saveTabId = props.saveModalTabId !== undefined ? props.saveModalTabId : localSaveTabId;
  const setSaveTabId = props.setSaveModalTabId ?? setLocalSaveTabId;

  const settings = useSettingsStore((s) => s.settings);
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);
  const toggleLayout = useSettingsStore((s) => s.toggleLayout);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const environments = useWorkspaceStore((s) => s.environments);
  const customEnvs = environments.filter((e) => !e.isGlobal);

  const handlePointerMove = React.useCallback(
    (e: PointerEvent) => {
      if (!draggingRef.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      if (settings.layout === 'horizontal') {
        const next = (e.clientX - rect.left) / Math.max(1, rect.width);
        setSplitRatio(Math.min(0.78, Math.max(0.22, next)));
      } else {
        const next = (e.clientY - rect.top) / Math.max(1, rect.height);
        setSplitRatio(Math.min(0.78, Math.max(0.22, next)));
      }
    },
    [settings.layout],
  );

  const stopDragging = React.useCallback(() => {
    draggingRef.current = false;
  }, []);

  React.useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDragging);
    };
  }, [handlePointerMove, stopDragging]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg-base)] text-[var(--text-primary)]">
      {/* Top Window Chrome / Tab Bar */}
      <header className="flex h-10 shrink-0 items-center gap-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-base)] px-2">
        <div className="flex items-center gap-2 pr-1">
          <RiftLogo size={18} />
          <span className="text-xs font-semibold tracking-tight text-[var(--text-primary)]">
            RiftQL
          </span>
        </div>

        <ActionTooltip label="Toggle Sidebar" actionId="toggleSidebar">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Toggle Sidebar"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <PanelLeft className="h-3.5 w-3.5" />
          </Button>
        </ActionTooltip>

        <TabBar />

        {/* Right Controls */}
        <div className="flex shrink-0 items-center gap-1">
          <Select
            value={settings.activeEnvironmentId ?? '__none__'}
            onValueChange={(val) => {
              if (val === '__manage__') {
                setEnvOpen(true);
              } else {
                void updateSettings({
                  activeEnvironmentId: val === '__none__' ? undefined : val,
                });
              }
            }}
          >
            <SelectTrigger
              aria-label="Active environment"
              className="h-7 w-36 text-[0.75rem]"
            >
              <Globe className="h-3 w-3 shrink-0 text-[var(--accent)]" />
              <SelectValue placeholder="No Environment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No Environment</SelectItem>
              {customEnvs.map((env) => (
                <SelectItem key={env.id} value={env.id}>
                  {env.name}
                </SelectItem>
              ))}
              <SelectItem value="__manage__">Manage Environments…</SelectItem>
            </SelectContent>
          </Select>

          <ActionTooltip label="Command Palette" actionId="commandPalette">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Open Command Palette"
              onClick={() => props.setCommandPaletteOpen?.(true)}
            >
              <Command className="h-3.5 w-3.5" />
            </Button>
          </ActionTooltip>

          <ActionTooltip
            label={
              settings.layout === 'horizontal'
                ? 'Switch to Vertical Split'
                : 'Switch to Horizontal Split'
            }
            actionId="toggleLayout"
          >
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Toggle Split Layout"
              onClick={() => void toggleLayout()}
            >
              {settings.layout === 'horizontal' ? (
                <Columns2 className="h-3.5 w-3.5" />
              ) : (
                <Rows2 className="h-3.5 w-3.5" />
              )}
            </Button>
          </ActionTooltip>

          <ActionTooltip label="Toggle Dark / Light Theme" actionId="toggleTheme">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Toggle Theme"
              onClick={() => void toggleTheme()}
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="h-3.5 w-3.5" />
              ) : (
                <Moon className="h-3.5 w-3.5" />
              )}
            </Button>
          </ActionTooltip>

          <ActionTooltip label="Open Settings" actionId="openSettings">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Open Settings"
              onClick={() => props.setSettingsOpen?.(true)}
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </ActionTooltip>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {sidebarOpen && (
          <Sidebar
            onOpenEnvironments={() => setEnvOpen(true)}
            onOpenCookies={() => setCookiesOpen(true)}
            onOpenSettings={() => props.setSettingsOpen?.(true)}
            onEditCollection={(col) => {
              setEditingFolder(undefined);
              setEditingCollection(col);
            }}
            onEditFolder={(folder) => {
              setEditingCollection(undefined);
              setEditingFolder(folder);
            }}
            createCollectionTrigger={props.createCollectionTrigger}
          />
        )}

        <main
          ref={splitContainerRef}
          className={cn(
            'flex min-h-0 min-w-0 flex-1 overflow-hidden',
            settings.layout === 'horizontal' ? 'flex-row' : 'flex-col',
          )}
        >
          <div
            style={
              settings.layout === 'horizontal'
                ? { width: `${splitRatio * 100}%` }
                : { height: `${splitRatio * 100}%` }
            }
            className="min-h-0 min-w-0 shrink-0 overflow-hidden"
          >
            <RequestPane
              urlInputRef={props.urlInputRef}
              onOpenSaveModal={(id) => setSaveTabId(id)}
              onOpenCodeSnippet={() => props.setCodeSnippetOpen?.(true)}
              onOpenImportCurl={() => props.setImportCurlOpen?.(true)}
              onPasteCurlInUrl={props.onPasteCurlInUrl}
            />
          </div>

          {/* Draggable Split Handle */}
          <div
            role="separator"
            aria-orientation={settings.layout === 'horizontal' ? 'vertical' : 'horizontal'}
            onPointerDown={() => {
              draggingRef.current = true;
            }}
            className={cn(
              'shrink-0 bg-[var(--border-subtle)] transition-colors hover:bg-[var(--accent)]',
              settings.layout === 'horizontal'
                ? 'w-[3px] cursor-col-resize'
                : 'h-[3px] cursor-row-resize',
            )}
          />

          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <ResponsePane onOpenCookieJar={() => setCookiesOpen(true)} />
          </div>
        </main>
      </div>

      {/* Workspace Modals */}
      <EnvironmentModal open={envOpen} onOpenChange={setEnvOpen} />
      <CookieJarModal open={cookiesOpen} onOpenChange={setCookiesOpen} />
      <SaveRequestModal
        open={Boolean(saveTabId)}
        tabId={saveTabId}
        onOpenChange={(open) => {
          if (!open) setSaveTabId(null);
        }}
      />
      <CollectionSettingsModal
        open={Boolean(editingCollection || editingFolder)}
        collection={editingCollection}
        folder={editingFolder}
        onOpenChange={(open) => {
          if (!open) {
            setEditingCollection(undefined);
            setEditingFolder(undefined);
          }
        }}
      />

      {props.extraModals}
    </div>
  );
}
