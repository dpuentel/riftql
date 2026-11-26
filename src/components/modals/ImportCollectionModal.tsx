import * as React from 'react';
import {
  AlertTriangle,
  Check,
  FileCode2,
  Folder,
  FolderUp,
  Globe,
  Layers,
  Upload,
} from 'lucide-react';
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
import { buildIndentedFolders } from '@/lib/collections';
import {
  IMPORT_COLLECTION_FILTERS,
  importTextFileViaDialog,
} from '@/lib/file-io';
import { getMethodColorClass } from '@/lib/format';
import {
  buildWorkspaceExportFromImport,
  countImportStats,
  parseImportText,
  type ImportDestinationMode,
  type ImportParseResult,
  type ParsedImportFolder,
} from '@/lib/importers';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

export interface ImportCollectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTargetCollectionId?: string;
  initialTargetFolderId?: string;
  onImported?: (summaryMessage: string) => void;
}

interface PreviewLine {
  key: string;
  depth: number;
  kind: 'collection' | 'folder' | 'request';
  label: string;
  badge?: string;
}

const MAX_PREVIEW_LINES = 36;

function collectPreviewLines(parsed: ImportParseResult): {
  lines: PreviewLine[];
  totalLines: number;
} {
  const lines: PreviewLine[] = [];
  let totalLines = 0;

  const pushLine = (line: PreviewLine) => {
    totalLines += 1;
    if (lines.length < MAX_PREVIEW_LINES) {
      lines.push(line);
    }
  };

  const walkFolder = (folder: ParsedImportFolder, depth: number, prefix: string) => {
    pushLine({
      key: `${prefix}-f`,
      depth,
      kind: 'folder',
      label: folder.name,
    });
    folder.folders.forEach((sub, idx) => walkFolder(sub, depth + 1, `${prefix}-f${idx}`));
    folder.requests.forEach((req, idx) => {
      pushLine({
        key: `${prefix}-r${idx}`,
        depth: depth + 1,
        kind: 'request',
        label: req.name,
        badge: req.protocol === 'graphql' ? 'GQL' : req.method,
      });
    });
  };

  parsed.collections.forEach((col, colIdx) => {
    const baseDepth = parsed.collections.length > 1 ? 1 : 0;
    if (parsed.collections.length > 1) {
      pushLine({
        key: `col-${colIdx}`,
        depth: 0,
        kind: 'collection',
        label: col.name,
      });
    }
    col.folders.forEach((f, idx) => walkFolder(f, baseDepth, `col-${colIdx}-${idx}`));
    col.requests.forEach((req, idx) => {
      pushLine({
        key: `col-${colIdx}-req-${idx}`,
        depth: baseDepth,
        kind: 'request',
        label: req.name,
        badge: req.protocol === 'graphql' ? 'GQL' : req.method,
      });
    });
  });

  return { lines, totalLines };
}

function formatImportToast(summary: {
  collections: number;
  folders: number;
  requests: number;
  environments: number;
  targetName: string;
}): string {
  const parts: string[] = [];
  if (summary.requests > 0) {
    parts.push(`${summary.requests} request${summary.requests === 1 ? '' : 's'}`);
  }
  if (summary.folders > 0) {
    parts.push(`${summary.folders} folder${summary.folders === 1 ? '' : 's'}`);
  }
  if (summary.environments > 0) {
    parts.push(`${summary.environments} environment${summary.environments === 1 ? '' : 's'}`);
  }
  if (parts.length === 0) {
    return summary.collections > 0
      ? `Created empty collection "${summary.targetName}".`
      : 'Import completed.';
  }
  const suffix = summary.targetName ? ` into "${summary.targetName}"` : '';
  return `Imported ${parts.join(', ')}${suffix}.`;
}

export function ImportCollectionModal({
  open,
  onOpenChange,
  initialTargetCollectionId,
  initialTargetFolderId,
  onImported,
}: ImportCollectionModalProps) {
  const collections = useWorkspaceStore((s) => s.collections);
  const folders = useWorkspaceStore((s) => s.folders);
  const savedRequests = useWorkspaceStore((s) => s.savedRequests);
  const environments = useWorkspaceStore((s) => s.environments);
  const importWorkspace = useWorkspaceStore((s) => s.importWorkspace);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [rawText, setRawText] = React.useState('');
  const [loadedFileName, setLoadedFileName] = React.useState<string | undefined>();
  const [mode, setMode] = React.useState<ImportDestinationMode>('new-collection');
  const [newCollectionName, setNewCollectionName] = React.useState('');
  const [targetCollectionId, setTargetCollectionId] = React.useState('');
  const [targetFolderId, setTargetFolderId] = React.useState('__root__');
  const [wrapInSubfolder, setWrapInSubfolder] = React.useState(true);
  const [subfolderName, setSubfolderName] = React.useState('');
  const [importEnvironments, setImportEnvironments] = React.useState(true);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [importing, setImporting] = React.useState(false);

  const prevOpenRef = React.useRef(false);

  React.useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;
    if (!justOpened) return;

    setRawText('');
    setLoadedFileName(undefined);
    setNewCollectionName('');
    setSubfolderName('');
    setImportEnvironments(true);
    setSubmitError(null);
    setImporting(false);

    const matchedCollection =
      initialTargetCollectionId && collections.some((c) => c.id === initialTargetCollectionId)
        ? initialTargetCollectionId
        : undefined;

    if (matchedCollection) {
      setMode('existing-collection');
      setTargetCollectionId(matchedCollection);
      const validFolder =
        initialTargetFolderId &&
        folders.some(
          (f) => f.id === initialTargetFolderId && f.collectionId === matchedCollection,
        );
      setTargetFolderId(validFolder ? initialTargetFolderId : '__root__');
    } else {
      setMode('new-collection');
      setTargetCollectionId(collections[0]?.id ?? '');
      setTargetFolderId('__root__');
    }
  }, [open, initialTargetCollectionId, initialTargetFolderId, collections, folders]);

  const parseState = React.useMemo<{
    parsed?: ImportParseResult;
    error?: string;
  }>(() => {
    if (!rawText.trim()) return {};
    try {
      return { parsed: parseImportText(rawText, loadedFileName) };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : 'Unable to parse import content.',
      };
    }
  }, [rawText, loadedFileName]);

  const parsed = parseState.parsed;
  const stats = React.useMemo(() => (parsed ? countImportStats(parsed) : null), [parsed]);
  const preview = React.useMemo(
    () => (parsed ? collectPreviewLines(parsed) : { lines: [], totalLines: 0 }),
    [parsed],
  );

  // Sync suggested names & smart subfolder wrapping when parsed payload changes
  React.useEffect(() => {
    if (!parsed || !stats) return;
    setNewCollectionName(parsed.sourceName);
    setSubfolderName(parsed.sourceName);
    setWrapInSubfolder(stats.folders > 0 || stats.requests > 1 || stats.collections > 1);
    setSubmitError(null);
  }, [parsed, stats]);

  const folderOptions = React.useMemo(
    () => (targetCollectionId ? buildIndentedFolders(folders, targetCollectionId) : []),
    [folders, targetCollectionId],
  );

  const handleChooseFile = async () => {
    setSubmitError(null);
    const native = await importTextFileViaDialog(
      'Import Collection, Environment, or Spec',
      IMPORT_COLLECTION_FILTERS,
    );
    if (native) {
      setLoadedFileName(native.fileName);
      setRawText(native.content);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleBrowserFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      setLoadedFileName(file.name);
      setRawText(text);
      setSubmitError(null);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to read selected file.');
    }
  };

  const handleConfirmImport = async () => {
    if (!parsed || !stats) return;
    setSubmitError(null);
    setImporting(true);
    try {
      const built = buildWorkspaceExportFromImport(
        parsed,
        {
          mode,
          newCollectionName: newCollectionName.trim() || undefined,
          targetCollectionId: mode === 'existing-collection' ? targetCollectionId : undefined,
          targetFolderId:
            mode === 'existing-collection' && targetFolderId !== '__root__'
              ? targetFolderId
              : undefined,
          wrapInSubfolder: mode === 'existing-collection' ? wrapInSubfolder : undefined,
          subfolderName: subfolderName.trim() || undefined,
          importEnvironments,
        },
        {
          collections,
          folders,
          savedRequests,
          environments,
        },
      );

      if (
        built.summary.collections === 0 &&
        built.summary.folders === 0 &&
        built.summary.requests === 0 &&
        built.summary.environments === 0
      ) {
        setSubmitError('Nothing selected to import.');
        return;
      }

      await importWorkspace(built.exportPayload);
      onImported?.(formatImportToast(built.summary));
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const hasCollectionsOrRequests = Boolean(
    parsed && stats && (stats.collections > 0 || stats.requests > 0),
  );
  const canImport =
    Boolean(parsed) &&
    !importing &&
    (mode === 'new-collection' ||
      !hasCollectionsOrRequests ||
      Boolean(targetCollectionId)) &&
    (hasCollectionsOrRequests || (Boolean(parsed?.environments.length) && importEnvironments));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        resizable
        storageKey="riftql-import-modal-size"
        minWidth={540}
        minHeight={440}
        className="max-w-2xl"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FolderUp className="h-4 w-4 text-[var(--accent)]" />
            <span>Import Collection, Environment, or API Spec</span>
          </DialogTitle>
          <DialogDescription>
            Supports Altair GraphQL (<code className="font-mono-code">.agq/.agc/.agx</code>), Postman
            v2.x &amp; Environments, Insomnia v4, OpenAPI 3.x / Swagger 2.0 JSON, and RiftQL exports.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1 rift-scroll">
          {/* File / Clear Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.agq,.agc,.agx,.txt,application/json"
                className="hidden"
                aria-label="Import collection file input"
                onChange={(e) => void handleBrowserFileChange(e)}
              />
              <Button
                type="button"
                size="xs"
                variant="secondary"
                onClick={() => void handleChooseFile()}
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Choose File…</span>
              </Button>
              {loadedFileName && (
                <Badge variant="default" className="max-w-[220px] truncate font-mono-code">
                  {loadedFileName}
                </Badge>
              )}
            </div>
            {rawText.length > 0 && (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => {
                  setRawText('');
                  setLoadedFileName(undefined);
                  setSubmitError(null);
                }}
              >
                Clear
              </Button>
            )}
          </div>

          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste Postman v2.1 JSON, Altair .agc/.agq/.agx JSON, Insomnia v4 JSON, or OpenAPI 3.x / Swagger 2.0 JSON…"
            aria-label="Import JSON content"
            rows={6}
            className="w-full shrink-0 resize-y rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2.5 font-mono-code text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none"
          />

          {(parseState.error || submitError) && (
            <div
              role="alert"
              className="rounded-md border border-[#F87171]/30 bg-[#F87171]/10 px-3 py-2 text-xs text-[#DC2626] dark:text-[#F87171]"
            >
              {submitError ?? parseState.error}
            </div>
          )}

          {parsed && stats && (
            <div className="flex flex-col gap-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 text-xs">
              {/* Detected Format & Counts */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-[#34D399]" />
                  <span className="font-medium text-[var(--text-primary)]">Detected:</span>
                  <Badge variant="accent">{parsed.formatLabel}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 tabular-nums">
                  {stats.folders > 0 && <Badge>{stats.folders} folders</Badge>}
                  {stats.requests > 0 && (
                    <Badge>
                      {stats.requests} request{stats.requests === 1 ? '' : 's'}
                      {stats.graphqlRequests > 0 && stats.restRequests > 0
                        ? ` (${stats.restRequests} REST, ${stats.graphqlRequests} GQL)`
                        : ''}
                    </Badge>
                  )}
                  {stats.environments > 0 && (
                    <Badge>
                      {stats.environments} env{stats.environments === 1 ? '' : 's'}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Warnings */}
              {parsed.warnings.length > 0 && (
                <div className="flex flex-col gap-1 rounded border border-[#FBBF24]/30 bg-[#FBBF24]/10 px-2.5 py-2 text-[0.75rem] text-[#B45309] dark:text-[#FBBF24]">
                  <div className="flex items-center gap-1.5 font-medium">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>Import notes</span>
                  </div>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {parsed.warnings.slice(0, 5).map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                    {parsed.warnings.length > 5 && (
                      <li>+{parsed.warnings.length - 5} additional notes</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Destination Controls */}
              {hasCollectionsOrRequests && (
                <div className="flex flex-col gap-2.5 border-t border-[var(--border-subtle)] pt-2.5">
                  <span className="text-[0.75rem] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    Destination
                  </span>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setMode('new-collection')}
                      className={cn(
                        'flex cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                        mode === 'new-collection'
                          ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--text-primary)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                      )}
                    >
                      <Layers className="h-3.5 w-3.5" />
                      <span>New Collection</span>
                    </button>
                    <button
                      type="button"
                      disabled={collections.length === 0}
                      onClick={() => {
                        setMode('existing-collection');
                        if (!targetCollectionId && collections[0]) {
                          setTargetCollectionId(collections[0].id);
                          setTargetFolderId('__root__');
                        }
                      }}
                      className={cn(
                        'flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                        collections.length === 0
                          ? 'cursor-not-allowed border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-tertiary)] opacity-60'
                          : mode === 'existing-collection'
                            ? 'cursor-pointer border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--text-primary)]'
                            : 'cursor-pointer border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                      )}
                    >
                      <Folder className="h-3.5 w-3.5" />
                      <span>Existing Collection</span>
                    </button>
                  </div>

                  {mode === 'new-collection' ? (
                    parsed.collections.length <= 1 ? (
                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor="import-new-collection-name"
                          className="text-[0.75rem] font-medium text-[var(--text-secondary)]"
                        >
                          Collection Name
                        </label>
                        <Input
                          id="import-new-collection-name"
                          aria-label="New collection name"
                          value={newCollectionName}
                          onChange={(e) => setNewCollectionName(e.target.value)}
                          placeholder="Imported Collection"
                        />
                      </div>
                    ) : (
                      <div className="text-[0.75rem] text-[var(--text-secondary)]">
                        {parsed.collections.length} collections will be created preserving their
                        original workspace names.
                      </div>
                    )
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-[0.75rem] font-medium text-[var(--text-secondary)]">
                            Target Collection
                          </label>
                          <Select
                            value={targetCollectionId}
                            onValueChange={(val) => {
                              setTargetCollectionId(val);
                              setTargetFolderId('__root__');
                            }}
                          >
                            <SelectTrigger aria-label="Target collection">
                              <SelectValue placeholder="Select collection" />
                            </SelectTrigger>
                            <SelectContent>
                              {collections.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[0.75rem] font-medium text-[var(--text-secondary)]">
                            Target Folder
                          </label>
                          <Select value={targetFolderId} onValueChange={setTargetFolderId}>
                            <SelectTrigger aria-label="Target folder">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__root__">Collection Root</SelectItem>
                              {folderOptions.map(({ folder, label }) => (
                                <SelectItem key={folder.id} value={folder.id}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <label className="flex cursor-pointer items-center gap-2 text-[0.75rem] text-[var(--text-secondary)]">
                        <input
                          type="checkbox"
                          checked={wrapInSubfolder}
                          onChange={(e) => setWrapInSubfolder(e.target.checked)}
                          className="h-3.5 w-3.5 accent-[var(--accent)]"
                        />
                        <span>Wrap imported items inside a new subfolder</span>
                      </label>

                      {wrapInSubfolder && parsed.collections.length <= 1 && (
                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor="import-subfolder-name"
                            className="text-[0.75rem] font-medium text-[var(--text-secondary)]"
                          >
                            Subfolder Name
                          </label>
                          <Input
                            id="import-subfolder-name"
                            aria-label="Subfolder name"
                            value={subfolderName}
                            onChange={(e) => setSubfolderName(e.target.value)}
                            placeholder={parsed.sourceName}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Environments Option */}
              {parsed.environments.length > 0 && (
                <div className="flex flex-col gap-1.5 border-t border-[var(--border-subtle)] pt-2.5">
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-[var(--text-primary)]">
                    <input
                      type="checkbox"
                      checked={importEnvironments}
                      onChange={(e) => setImportEnvironments(e.target.checked)}
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                    <Globe className="h-3.5 w-3.5 text-[var(--accent)]" />
                    <span>
                      Import {parsed.environments.length} environment
                      {parsed.environments.length === 1 ? '' : 's'}
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-1.5 pl-5">
                    {parsed.environments.map((env, idx) => (
                      <Badge key={`${env.name}-${idx}`}>
                        {env.name} ({env.variables.length} vars)
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Item Tree Preview */}
              {preview.lines.length > 0 && (
                <div className="flex flex-col gap-1 border-t border-[var(--border-subtle)] pt-2.5">
                  <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    Preview
                  </span>
                  <div className="max-h-36 overflow-y-auto rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1.5 rift-scroll">
                    {preview.lines.map((line) => (
                      <div
                        key={line.key}
                        style={{ paddingLeft: `${line.depth * 14 + 4}px` }}
                        className="flex items-center gap-1.5 py-0.5 text-[0.75rem]"
                      >
                        {line.kind === 'collection' && (
                          <Layers className="h-3 w-3 shrink-0 text-[var(--accent)]" />
                        )}
                        {line.kind === 'folder' && (
                          <Folder className="h-3 w-3 shrink-0 text-[var(--text-secondary)]" />
                        )}
                        {line.kind === 'request' && (
                          <span
                            className={cn(
                              'w-9 shrink-0 font-mono-code text-[0.6875rem] font-semibold',
                              getMethodColorClass(line.badge ?? 'GET'),
                            )}
                          >
                            {line.badge}
                          </span>
                        )}
                        <span
                          className={cn(
                            'truncate',
                            line.kind === 'request'
                              ? 'text-[var(--text-secondary)]'
                              : 'font-medium text-[var(--text-primary)]',
                          )}
                        >
                          {line.label}
                        </span>
                      </div>
                    ))}
                    {preview.totalLines > preview.lines.length && (
                      <div className="px-1.5 py-1 text-[0.6875rem] text-[var(--text-tertiary)]">
                        +{preview.totalLines - preview.lines.length} more items…
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {!rawText.trim() && (
            <div className="flex items-center gap-2 rounded-md border border-dashed border-[var(--border-subtle)] bg-[var(--bg-base)]/60 px-3 py-2.5 text-[0.75rem] text-[var(--text-secondary)]">
              <FileCode2 className="h-4 w-4 shrink-0 text-[var(--accent)]" />
              <span>
                You can create a new collection or merge imported endpoints directly into any existing
                collection or subfolder. Existing requests are never overwritten.
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0">
          <Button
            type="button"
            variant="ghost"
            disabled={importing}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            disabled={!canImport}
            onClick={() => void handleConfirmImport()}
          >
            {importing ? 'Importing…' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
