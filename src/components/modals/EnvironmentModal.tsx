import * as React from 'react';
import {
  Download,
  Eye,
  EyeOff,
  Globe,
  Lock,
  LockOpen,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { nanoid } from 'nanoid';
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
import { exportJsonFile, importJsonFileViaDialog } from '@/lib/file-io';
import { hasNativeFileBridge } from '@/lib/tauri';
import { stripSecretsForExport } from '@/lib/variables';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import type { EnvironmentRecord, EnvironmentVariable } from '@/types/storage';

interface EnvironmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EnvironmentModal({ open, onOpenChange }: EnvironmentModalProps) {
  const environments = useWorkspaceStore((s) => s.environments);
  const upsertEnvironment = useWorkspaceStore((s) => s.upsertEnvironment);
  const deleteEnvironment = useWorkspaceStore((s) => s.deleteEnvironment);
  const activeEnvironmentId = useSettingsStore((s) => s.settings.activeEnvironmentId);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [selectedId, setSelectedId] = React.useState<string>('');
  const [newEnvName, setNewEnvName] = React.useState('');
  const [envNameDraft, setEnvNameDraft] = React.useState('');
  const [revealedIds, setRevealedIds] = React.useState<Set<string>>(new Set());
  const [statusMsg, setStatusMsg] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const wasOpenRef = React.useRef(false);
  const envNameFocusedRef = React.useRef(false);

  // Initialize selected environment only when opening the modal (not on every variable edit)
  React.useEffect(() => {
    if (open && !wasOpenRef.current) {
      const preferred =
        environments.find((e) => e.id === activeEnvironmentId) ?? environments[0];
      if (preferred) {
        setSelectedId(preferred.id);
      }
      setStatusMsg(null);
    }
    wasOpenRef.current = open;
  }, [open, activeEnvironmentId, environments]);

  // Recover selection only if the currently selected environment was deleted
  React.useEffect(() => {
    if (!open || environments.length === 0) return;
    if (!selectedId || !environments.some((e) => e.id === selectedId)) {
      const preferred =
        environments.find((e) => e.id === activeEnvironmentId) ?? environments[0];
      if (preferred) {
        setSelectedId(preferred.id);
      }
    }
  }, [open, selectedId, activeEnvironmentId, environments]);

  const selectedEnv =
    environments.find((e) => e.id === selectedId) ?? environments[0];

  React.useEffect(() => {
    if (!selectedEnv) {
      setEnvNameDraft('');
      return;
    }
    if (!envNameFocusedRef.current) {
      setEnvNameDraft(selectedEnv.name);
    }
  }, [selectedEnv?.id, selectedEnv?.name]);

  const handleCreateEnv = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newEnvName.trim();
    if (!trimmed) return;
    const created = await upsertEnvironment({
      name: trimmed,
      isGlobal: false,
      variables: [],
    });
    setNewEnvName('');
    setSelectedId(created.id);
    setEnvNameDraft(created.name);
  };

  const commitEnvName = async (rawName: string) => {
    if (!selectedEnv || selectedEnv.isGlobal) return;
    const trimmed = rawName.trim();
    if (!trimmed) {
      setEnvNameDraft(selectedEnv.name);
      return;
    }
    if (trimmed !== selectedEnv.name) {
      await upsertEnvironment({
        id: selectedEnv.id,
        name: trimmed,
        isGlobal: false,
        variables: selectedEnv.variables,
      });
    }
  };

  const updateVariables = async (
    env: EnvironmentRecord,
    nextVars: EnvironmentVariable[],
  ) => {
    await upsertEnvironment({
      id: env.id,
      name: env.name,
      isGlobal: env.isGlobal,
      variables: nextVars,
    });
  };

  const toggleReveal = (varId: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(varId)) next.delete(varId);
      else next.add(varId);
      return next;
    });
  };

  const handleExport = async () => {
    try {
      const stripped = stripSecretsForExport(environments);
      const json = JSON.stringify({ version: 1, environments: stripped }, null, 2);
      const result = await exportJsonFile(
        'riftql-environments.json',
        json,
        'Export Environments JSON',
      );
      if (!result.saved) return;
      setStatusMsg(
        result.path
          ? `Exported environments to ${result.path} (secret values stripped).`
          : 'Exported environments (secret values stripped).',
      );
    } catch (err) {
      setStatusMsg(
        err instanceof Error ? err.message : 'Failed to export environments JSON.',
      );
    }
  };

  const importEnvironmentsFromText = async (text: string) => {
    try {
      const parsed = JSON.parse(text) as { environments?: EnvironmentRecord[] };
      const list = Array.isArray(parsed.environments) ? parsed.environments : [];
      for (const item of list) {
        if (item.isGlobal) {
          const existingGlobal = environments.find((env) => env.isGlobal);
          await upsertEnvironment({
            id: existingGlobal?.id,
            name: 'Global',
            isGlobal: true,
            variables: item.variables ?? [],
          });
        } else {
          await upsertEnvironment({
            name: item.name || 'Imported Env',
            isGlobal: false,
            variables: item.variables ?? [],
          });
        }
      }
      setStatusMsg(`Imported ${list.length} environment(s).`);
    } catch {
      setStatusMsg('Invalid environments JSON file.');
    }
  };

  const handleImportClick = async () => {
    if (hasNativeFileBridge()) {
      try {
        const text = await importJsonFileViaDialog('Import Environments JSON');
        if (text !== null) {
          await importEnvironmentsFromText(text);
        }
      } catch (err) {
        setStatusMsg(
          err instanceof Error ? err.message : 'Failed to read environments JSON file.',
        );
      }
      return;
    }
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importEnvironmentsFromText(await file.text());
    } finally {
      e.target.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Manage Environments</DialogTitle>
          <DialogDescription>
            Define <code className="font-mono-code">{'{{variables}}'}</code> with precedence:
            Active Environment &gt; Collection &gt; Global. Secret values are masked and excluded
            on export.
          </DialogDescription>
        </DialogHeader>

        <div className="grid h-[380px] grid-cols-[200px_1fr] gap-3">
          {/* Environments list */}
          <div className="flex flex-col gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2">
            <form onSubmit={(e) => void handleCreateEnv(e)} className="flex gap-1">
              <Input
                value={newEnvName}
                onChange={(e) => setNewEnvName(e.target.value)}
                placeholder="New environment..."
                aria-label="New environment name"
                className="h-7"
              />
              <ActionTooltip label="Create Environment">
                <Button type="submit" size="icon" variant="secondary" aria-label="Create environment">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </ActionTooltip>
            </form>

            <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto rift-scroll">
              {environments.map((env) => {
                const isSelected = selectedEnv?.id === env.id;
                const isActive = activeEnvironmentId === env.id;
                return (
                  <div
                    key={env.id}
                    className={`group flex items-center justify-between rounded px-2 py-1.5 text-xs ${
                      isSelected
                        ? 'bg-[var(--accent-muted)] text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(env.id)}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
                    >
                      {env.isGlobal && <Globe className="h-3 w-3 shrink-0 text-[var(--accent)]" />}
                      <span className="truncate font-medium">{env.name}</span>
                      {isActive && <Badge variant="accent">Active</Badge>}
                    </button>

                    {!env.isGlobal && (
                      <ActionTooltip label="Delete Environment">
                        <button
                          type="button"
                          aria-label={`Delete ${env.name}`}
                          onClick={() => void deleteEnvironment(env.id)}
                          className="ml-1 hidden h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] group-hover:inline-flex hover:text-[#F87171]"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </ActionTooltip>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Variables table */}
          {selectedEnv && (
            <div className="flex min-h-0 flex-col gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {selectedEnv.isGlobal ? (
                    <span className="text-xs font-semibold text-[var(--text-primary)]">
                      Global Environment
                    </span>
                  ) : (
                    <Input
                      value={envNameDraft}
                      aria-label="Environment name"
                      onFocus={() => {
                        envNameFocusedRef.current = true;
                      }}
                      onBlur={() => {
                        envNameFocusedRef.current = false;
                        void commitEnvName(envNameDraft);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        }
                      }}
                      onChange={(e) => {
                        const next = e.target.value;
                        setEnvNameDraft(next);
                        if (next.trim() && next.trim() === next) {
                          void upsertEnvironment({
                            id: selectedEnv.id,
                            name: next,
                            isGlobal: false,
                            variables: selectedEnv.variables,
                          });
                        }
                      }}
                      className="h-7 w-52 font-medium"
                    />
                  )}
                </div>

                {!selectedEnv.isGlobal && (
                  <Button
                    size="xs"
                    variant={
                      activeEnvironmentId === selectedEnv.id ? 'default' : 'secondary'
                    }
                    onClick={() =>
                      void updateSettings({
                        activeEnvironmentId:
                          activeEnvironmentId === selectedEnv.id ? undefined : selectedEnv.id,
                      })
                    }
                  >
                    {activeEnvironmentId === selectedEnv.id
                      ? 'Active Environment'
                      : 'Set Active'}
                  </Button>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-auto rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] rift-scroll">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 text-[0.75rem] text-[var(--text-secondary)]">
                      <th className="w-8 px-2 py-1 text-center">On</th>
                      <th className="px-2 py-1">Variable</th>
                      <th className="px-2 py-1">Value</th>
                      <th className="w-20 px-1 py-1 text-center">Secret</th>
                      <th className="w-8 px-1 py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEnv.variables.map((v) => {
                      const revealed = revealedIds.has(v.id);
                      return (
                        <tr
                          key={v.id}
                          className="border-b border-[var(--border-subtle)]/70 last:border-b-0"
                        >
                          <td className="px-2 py-1 text-center">
                            <input
                              type="checkbox"
                              checked={v.enabled}
                              aria-label={`Enable ${v.key || 'variable'}`}
                              onChange={(e) =>
                                void updateVariables(
                                  selectedEnv,
                                  selectedEnv.variables.map((item) =>
                                    item.id === v.id
                                      ? { ...item, enabled: e.target.checked }
                                      : item,
                                  ),
                                )
                              }
                              className="h-3.5 w-3.5 accent-[var(--accent)]"
                            />
                          </td>
                          <td className="px-1.5 py-1">
                            <Input
                              value={v.key}
                              placeholder="base_url"
                              aria-label="Variable key"
                              onChange={(e) =>
                                void updateVariables(
                                  selectedEnv,
                                  selectedEnv.variables.map((item) =>
                                    item.id === v.id ? { ...item, key: e.target.value } : item,
                                  ),
                                )
                              }
                              className="h-6 border-transparent bg-transparent font-mono-code focus:border-[var(--accent)]"
                            />
                          </td>
                          <td className="px-1.5 py-1">
                            <div className="flex items-center gap-1">
                              <Input
                                type={v.isSecret && !revealed ? 'password' : 'text'}
                                value={v.value}
                                placeholder="value"
                                aria-label="Variable value"
                                onChange={(e) =>
                                  void updateVariables(
                                    selectedEnv,
                                    selectedEnv.variables.map((item) =>
                                      item.id === v.id ? { ...item, value: e.target.value } : item,
                                    ),
                                  )
                                }
                                className="h-6 border-transparent bg-transparent font-mono-code focus:border-[var(--accent)]"
                              />
                              {v.isSecret && (
                                <ActionTooltip label={revealed ? 'Hide Secret' : 'Reveal Secret'}>
                                  <button
                                    type="button"
                                    aria-label={revealed ? 'Hide secret' : 'Reveal secret'}
                                    onClick={() => toggleReveal(v.id)}
                                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                                  >
                                    {revealed ? (
                                      <EyeOff className="h-3 w-3" />
                                    ) : (
                                      <Eye className="h-3 w-3" />
                                    )}
                                  </button>
                                </ActionTooltip>
                              )}
                            </div>
                          </td>
                          <td className="px-1 py-1 text-center">
                            <ActionTooltip
                              label={v.isSecret ? 'Mark as Plain Variable' : 'Mark as Secret'}
                            >
                              <button
                                type="button"
                                aria-label={`Toggle secret for ${v.key || 'variable'}`}
                                onClick={() =>
                                  void updateVariables(
                                    selectedEnv,
                                    selectedEnv.variables.map((item) =>
                                      item.id === v.id
                                        ? { ...item, isSecret: !item.isSecret }
                                        : item,
                                    ),
                                  )
                                }
                                className={`inline-flex h-6 w-6 items-center justify-center rounded ${
                                  v.isSecret
                                    ? 'text-[var(--accent)] bg-[var(--accent-muted)]'
                                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                                }`}
                              >
                                {v.isSecret ? (
                                  <Lock className="h-3 w-3" />
                                ) : (
                                  <LockOpen className="h-3 w-3" />
                                )}
                              </button>
                            </ActionTooltip>
                          </td>
                          <td className="px-1 py-1 text-center">
                            <ActionTooltip label="Delete Variable">
                              <button
                                type="button"
                                aria-label="Delete variable"
                                onClick={() =>
                                  void updateVariables(
                                    selectedEnv,
                                    selectedEnv.variables.filter((item) => item.id !== v.id),
                                  )
                                }
                                className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--text-secondary)] hover:text-[#F87171]"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </ActionTooltip>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between gap-2">
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    void updateVariables(selectedEnv, [
                      ...selectedEnv.variables,
                      {
                        id: nanoid(),
                        key: '',
                        value: '',
                        isSecret: false,
                        enabled: true,
                      },
                    ])
                  }
                >
                  <Plus className="h-3 w-3" />
                  <span>Add Variable</span>
                </Button>

                {statusMsg && (
                  <span className="truncate text-[0.75rem] text-[var(--accent)]" title={statusMsg}>
                    {statusMsg}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="justify-between">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => void handleImportFile(e)}
            />
            <Button
              size="xs"
              variant="secondary"
              onClick={() => void handleImportClick()}
            >
              <Upload className="h-3 w-3" />
              <span>Import JSON</span>
            </Button>
            <Button size="xs" variant="secondary" onClick={() => void handleExport()}>
              <Download className="h-3 w-3" />
              <span>Export JSON (Secrets Stripped)</span>
            </Button>
          </div>
          <Button size="sm" variant="default" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
