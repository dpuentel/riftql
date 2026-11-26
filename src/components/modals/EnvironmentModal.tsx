import * as React from 'react';
import {
  CopyPlus,
  Download,
  Eye,
  EyeOff,
  Globe,
  Layers,
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
  const updateEnvironmentLocal = useWorkspaceStore((s) => s.updateEnvironmentLocal);
  const persistEnvironment = useWorkspaceStore((s) => s.persistEnvironment);
  const deleteEnvironment = useWorkspaceStore((s) => s.deleteEnvironment);
  const activeEnvironmentId = useSettingsStore((s) => s.settings.activeEnvironmentId);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const [selectedId, setSelectedId] = React.useState<string>('');
  const [newEnvName, setNewEnvName] = React.useState('');
  const [envNameDraft, setEnvNameDraft] = React.useState('');
  const [revealedIds, setRevealedIds] = React.useState<Set<string>>(new Set());
  const [statusMsg, setStatusMsg] = React.useState<string | null>(null);

  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [bulkKey, setBulkKey] = React.useState('');
  const [bulkValue, setBulkValue] = React.useState('');
  const [bulkSecret, setBulkSecret] = React.useState(false);
  const [bulkIncludeGlobal, setBulkIncludeGlobal] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const wasOpenRef = React.useRef(false);
  const envNameFocusedRef = React.useRef(false);
  const debounceTimersRef = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const flushPendingEnvSaves = React.useCallback(() => {
    for (const [envId, timer] of debounceTimersRef.current.entries()) {
      clearTimeout(timer);
      debounceTimersRef.current.delete(envId);
      void persistEnvironment(envId);
    }
  }, [persistEnvironment]);

  const schedulePersistEnv = React.useCallback(
    (envId: string) => {
      const prevTimer = debounceTimersRef.current.get(envId);
      if (prevTimer) {
        clearTimeout(prevTimer);
      }
      const nextTimer = setTimeout(() => {
        debounceTimersRef.current.delete(envId);
        void persistEnvironment(envId);
      }, 200);
      debounceTimersRef.current.set(envId, nextTimer);
    },
    [persistEnvironment],
  );

  React.useEffect(() => {
    return () => {
      for (const timer of debounceTimersRef.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  // Initialize selected environment only when opening the modal (not on every variable edit)
  React.useEffect(() => {
    if (open && !wasOpenRef.current) {
      const preferred =
        environments.find((e) => e.id === activeEnvironmentId) ?? environments[0];
      if (preferred) {
        setSelectedId(preferred.id);
      }
      setStatusMsg(null);
      setBulkIncludeGlobal(!environments.some((e) => !e.isGlobal));
    } else if (!open && wasOpenRef.current) {
      flushPendingEnvSaves();
      setBulkOpen(false);
    }
    wasOpenRef.current = open;
  }, [open, activeEnvironmentId, environments, flushPendingEnvSaves]);

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
    flushPendingEnvSaves();
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
      flushPendingEnvSaves();
      await upsertEnvironment({
        id: selectedEnv.id,
        name: trimmed,
        isGlobal: false,
        variables: selectedEnv.variables,
      });
    }
  };

  const updateVariablesImmediate = async (
    env: EnvironmentRecord,
    nextVars: EnvironmentVariable[],
  ) => {
    const pendingTimer = debounceTimersRef.current.get(env.id);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      debounceTimersRef.current.delete(env.id);
    }
    await upsertEnvironment({
      id: env.id,
      name: env.name,
      isGlobal: env.isGlobal,
      variables: nextVars,
    });
  };

  const handleTypingVariables = (
    env: EnvironmentRecord,
    nextVars: EnvironmentVariable[],
  ) => {
    updateEnvironmentLocal(env.id, { variables: nextVars });
    schedulePersistEnv(env.id);
  };

  const propagateVariableToTargets = async (
    key: string,
    value: string,
    isSecret: boolean,
    enabled: boolean,
    targets: EnvironmentRecord[],
  ) => {
    const trimmedKey = key.trim();
    if (!trimmedKey || targets.length === 0) return { added: 0, skipped: 0 };

    flushPendingEnvSaves();
    let added = 0;
    let skipped = 0;

    for (const env of targets) {
      const alreadyHas = env.variables.some((v) => v.key.trim() === trimmedKey);
      if (alreadyHas) {
        skipped += 1;
        continue;
      }
      await upsertEnvironment({
        id: env.id,
        name: env.name,
        isGlobal: env.isGlobal,
        variables: [
          ...env.variables,
          {
            id: nanoid(),
            key: trimmedKey,
            value,
            isSecret,
            enabled,
          },
        ],
      });
      added += 1;
    }
    return { added, skipped };
  };

  const handleBulkCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedKey = bulkKey.trim();
    if (!trimmedKey) return;

    const customEnvs = environments.filter((env) => !env.isGlobal);
    const includeGlobalEffective = bulkIncludeGlobal || customEnvs.length === 0;
    const targets = environments.filter((env) => includeGlobalEffective || !env.isGlobal);

    const { added, skipped } = await propagateVariableToTargets(
      trimmedKey,
      bulkValue,
      bulkSecret,
      true,
      targets,
    );

    setBulkKey('');
    setBulkValue('');
    setBulkSecret(false);
    setBulkOpen(false);
    setStatusMsg(
      skipped > 0
        ? `Added "${trimmedKey}" to ${added} environment(s) (${skipped} already had it).`
        : `Added "${trimmedKey}" to ${added} environment(s).`,
    );
  };

  const handleCopyRowToAll = async (sourceEnv: EnvironmentRecord, variable: EnvironmentVariable) => {
    const trimmedKey = variable.key.trim();
    if (!trimmedKey) return;
    const otherCustom = environments.filter((e) => !e.isGlobal && e.id !== sourceEnv.id);
    const targets =
      otherCustom.length > 0
        ? otherCustom
        : environments.filter((e) => e.id !== sourceEnv.id);
    if (targets.length === 0) {
      setStatusMsg('Create another environment first to copy variables across environments.');
      return;
    }

    const { added, skipped } = await propagateVariableToTargets(
      trimmedKey,
      variable.value,
      variable.isSecret,
      variable.enabled,
      targets,
    );
    setStatusMsg(
      skipped > 0
        ? `Copied "${trimmedKey}" to ${added} environment(s) (${skipped} already defined it).`
        : `Copied "${trimmedKey}" to ${added} environment(s).`,
    );
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
      flushPendingEnvSaves();
      const latestEnvs = useWorkspaceStore.getState().environments;
      const stripped = stripSecretsForExport(latestEnvs);
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
      flushPendingEnvSaves();
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

  const customEnvCount = environments.filter((e) => !e.isGlobal).length;
  const bulkTargetCount =
    bulkIncludeGlobal || customEnvCount === 0 ? environments.length : customEnvCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        resizable
        storageKey="riftql-env-modal-size"
        minWidth={560}
        minHeight={380}
        className="h-[520px] max-w-4xl"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Manage Environments</DialogTitle>
          <DialogDescription>
            Define <code className="font-mono-code">{'{{variables}}'}</code> with precedence:
            Active Environment &gt; Collection &gt; Global. Secret values are masked and excluded
            on export.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-[200px_1fr] gap-3">
          {/* Environments list */}
          <div className="flex min-h-0 flex-col gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2">
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
                      onClick={() => {
                        flushPendingEnvSaves();
                        setSelectedId(env.id);
                      }}
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
                          onClick={() => {
                            flushPendingEnvSaves();
                            void deleteEnvironment(env.id);
                          }}
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
                          updateEnvironmentLocal(selectedEnv.id, { name: next });
                          schedulePersistEnv(selectedEnv.id);
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

              {bulkOpen && (
                <form
                  onSubmit={(e) => void handleBulkCreate(e)}
                  className="flex flex-col gap-2 rounded border border-[var(--accent)]/40 bg-[var(--bg-surface)] p-2"
                >
                  <div className="flex items-center justify-between text-[0.75rem] font-medium text-[var(--text-primary)]">
                    <span className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-[var(--accent)]" />
                      <span>Create Variable in {bulkTargetCount} Environment(s)</span>
                    </span>
                    {customEnvCount > 0 && (
                      <label className="flex cursor-pointer items-center gap-1.5 text-[0.6875rem] text-[var(--text-secondary)]">
                        <input
                          type="checkbox"
                          aria-label="Include Global environment"
                          checked={bulkIncludeGlobal}
                          onChange={(e) => setBulkIncludeGlobal(e.target.checked)}
                          className="h-3 w-3 accent-[var(--accent)]"
                        />
                        <span>Include Global</span>
                      </label>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Input
                      autoFocus
                      value={bulkKey}
                      aria-label="Bulk variable key"
                      placeholder="variable_key"
                      onChange={(e) => setBulkKey(e.target.value)}
                      className="h-7 min-w-[120px] flex-1 font-mono-code text-xs"
                    />
                    <Input
                      value={bulkValue}
                      aria-label="Bulk variable value"
                      placeholder="default value"
                      onChange={(e) => setBulkValue(e.target.value)}
                      className="h-7 min-w-[140px] flex-1 font-mono-code text-xs"
                    />
                    <ActionTooltip label={bulkSecret ? 'Secret variable' : 'Plain variable'}>
                      <button
                        type="button"
                        aria-label="Bulk variable secret"
                        onClick={() => setBulkSecret((v) => !v)}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded border ${
                          bulkSecret
                            ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent)]'
                            : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {bulkSecret ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
                      </button>
                    </ActionTooltip>
                    <Button
                      type="submit"
                      size="xs"
                      variant="default"
                      aria-label="Create variable across environments"
                      disabled={!bulkKey.trim()}
                    >
                      Apply
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => setBulkOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}

              <div className="min-h-0 flex-1 overflow-auto rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] rift-scroll">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 text-[0.75rem] text-[var(--text-secondary)]">
                      <th className="w-8 px-2 py-1 text-center">On</th>
                      <th className="px-2 py-1">Variable</th>
                      <th className="px-2 py-1">Value</th>
                      <th className="w-20 px-1 py-1 text-center">Secret</th>
                      <th className="w-14 px-1 py-1" />
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
                                void updateVariablesImmediate(
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
                              onBlur={() => flushPendingEnvSaves()}
                              onChange={(e) =>
                                handleTypingVariables(
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
                                onBlur={() => flushPendingEnvSaves()}
                                onChange={(e) =>
                                  handleTypingVariables(
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
                                  void updateVariablesImmediate(
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
                            <div className="inline-flex items-center gap-0.5">
                              {v.key.trim().length > 0 && environments.length > 1 && (
                                <ActionTooltip label="Copy to All Other Environments">
                                  <button
                                    type="button"
                                    aria-label={`Copy ${v.key} to all environments`}
                                    onClick={() => void handleCopyRowToAll(selectedEnv, v)}
                                    className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]"
                                  >
                                    <CopyPlus className="h-3 w-3" />
                                  </button>
                                </ActionTooltip>
                              )}
                              <ActionTooltip label="Delete Variable">
                                <button
                                  type="button"
                                  aria-label="Delete variable"
                                  onClick={() =>
                                    void updateVariablesImmediate(
                                      selectedEnv,
                                      selectedEnv.variables.filter((item) => item.id !== v.id),
                                    )
                                  }
                                  className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--text-secondary)] hover:text-[#F87171]"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </ActionTooltip>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      void updateVariablesImmediate(selectedEnv, [
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
                  <ActionTooltip label="Create a variable in all environments">
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => setBulkOpen((v) => !v)}
                    >
                      <Layers className="h-3 w-3" />
                      <span>Add to All Envs</span>
                    </Button>
                  </ActionTooltip>
                </div>

                {statusMsg && (
                  <span className="truncate text-[0.75rem] text-[var(--accent)]" title={statusMsg}>
                    {statusMsg}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 justify-between">
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
