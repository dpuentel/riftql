import * as React from 'react';
import {
  AlertTriangle,
  Download,
  Keyboard,
  RotateCcw,
  Search,
  Settings,
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
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DEFAULT_SHORTCUTS,
  detectShortcutConflict,
  formatShortcutForDisplay,
  getEffectiveShortcuts,
  keyboardEventToCombo,
} from '@/lib/shortcuts';
import { exportJsonFile, importJsonFileViaDialog } from '@/lib/file-io';
import { hasNativeFileBridge } from '@/lib/tauri';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import type { ShortcutActionId, ShortcutDefinition } from '@/types/shortcuts';
import type { SplitLayout, ThemePreference, WorkspaceExport } from '@/types/storage';

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecordingChange?: (recording: boolean) => void;
}

export function SettingsModal({
  open,
  onOpenChange,
  onRecordingChange,
}: SettingsModalProps) {
  const settings = useSettingsStore((s) => s.settings);
  const resolvedTheme = useSettingsStore((s) => s.resolvedTheme);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const setShortcut = useSettingsStore((s) => s.setShortcut);
  const resetShortcut = useSettingsStore((s) => s.resetShortcut);
  const resetAllShortcuts = useSettingsStore((s) => s.resetAllShortcuts);

  const exportWorkspace = useWorkspaceStore((s) => s.exportWorkspace);
  const importWorkspace = useWorkspaceStore((s) => s.importWorkspace);

  const [shortcutFilter, setShortcutFilter] = React.useState('');
  const [recordingId, setRecordingId] = React.useState<ShortcutActionId | null>(null);
  const [conflictInfo, setConflictInfo] = React.useState<{
    actionId: ShortcutActionId;
    combo: string;
    conflictsWith: ShortcutDefinition;
  } | null>(null);
  const [dataMessage, setDataMessage] = React.useState<string | null>(null);
  const importInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    onRecordingChange?.(recordingId !== null);
  }, [recordingId, onRecordingChange]);

  React.useEffect(() => {
    if (!open) {
      setRecordingId(null);
      setConflictInfo(null);
      setDataMessage(null);
    }
  }, [open]);

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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-[var(--accent)]" />
            <span>RiftQL Settings</span>
          </DialogTitle>
          <DialogDescription>
            Customize appearance, HTTP networking defaults, keyboard shortcuts, and workspace data.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="flex flex-col">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="network">Network</TabsTrigger>
            <TabsTrigger value="shortcuts">
              <Keyboard className="h-3.5 w-3.5" />
              <span>Shortcuts</span>
            </TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general" className="flex flex-col gap-4 pt-3">
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
          </TabsContent>

          {/* Network Tab */}
          <TabsContent value="network" className="flex flex-col gap-3 pt-3">
            <label className="flex items-center justify-between rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2">
              <div>
                <div className="text-xs font-medium text-[var(--text-primary)]">
                  Verify SSL Certificates
                </div>
                <div className="text-[11px] text-[var(--text-secondary)]">
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
                <div className="text-[11px] text-[var(--text-secondary)]">
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
                <div className="text-[11px] text-[var(--text-secondary)]">
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
                <label className="text-[11px] font-medium text-[var(--text-secondary)]">
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
                <label className="text-[11px] font-medium text-[var(--text-secondary)]">
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
          <TabsContent value="shortcuts" className="flex flex-col gap-2.5 pt-3">
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

            <div className="max-h-72 overflow-auto rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] rift-scroll">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 text-[11px] text-[var(--text-secondary)]">
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
                              'cursor-pointer rounded border px-2 py-0.5 font-mono-code text-[11px] transition-colors',
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
          <TabsContent value="data" className="flex flex-col gap-3 pt-3">
            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 text-xs text-[var(--text-secondary)]">
              Export your collections, nested folders, saved requests, and environments as JSON.
              Variables flagged as secret are automatically stripped before export.
            </div>
            <div className="flex items-center gap-2">
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
            </div>
            {dataMessage && (
              <div className="text-xs text-[var(--accent)]">{dataMessage}</div>
            )}
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
