import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FolderPlus,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import { nanoid } from 'nanoid';
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
import { resolveEffectiveAuth } from '@/lib/auth';
import { combineBaseAndRequestUrl, resolveEffectiveBaseUrl } from '@/lib/base-url';
import {
  AUTO_DISCOVERED_FOLDER_NAME,
  buildOperationFromField,
  collectDescendantFolderIds,
  discoverSchemaOperations,
} from '@/lib/graphql';
import { cn } from '@/lib/utils';
import { useSchemaStore } from '@/store/useSchemaStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import type { FolderRecord, SavedRequestRecord } from '@/types/storage';
import type { GraphQLSchema } from 'graphql';

export interface DiscoverGraphQLModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionId?: string;
  folderId?: string;
  onGenerated?: (summaryMessage: string) => void;
}

export function DiscoverGraphQLModal({
  open,
  onOpenChange,
  collectionId,
  folderId,
  onGenerated,
}: DiscoverGraphQLModalProps) {
  const collections = useWorkspaceStore((s) => s.collections);
  const folders = useWorkspaceStore((s) => s.folders);
  const savedRequests = useWorkspaceStore((s) => s.savedRequests);
  const importWorkspace = useWorkspaceStore((s) => s.importWorkspace);

  const fetchSchemaForContainer = useSchemaStore((s) => s.fetchSchemaForContainer);

  const [urlOverride, setUrlOverride] = React.useState('');
  const [resolvedEndpoint, setResolvedEndpoint] = React.useState('');
  const [schema, setSchema] = React.useState<GraphQLSchema | undefined>();
  const [loading, setLoading] = React.useState(false);
  const [scanError, setScanError] = React.useState<string | null>(null);

  const [searchQuery, setSearchQuery] = React.useState('');
  const [includeQueries, setIncludeQueries] = React.useState(true);
  const [includeMutations, setIncludeMutations] = React.useState(true);
  const [hideCovered, setHideCovered] = React.useState(false);
  const [maxDepth, setMaxDepth] = React.useState<number>(2);
  const [selectedKeys, setSelectedKeys] = React.useState<Set<string>>(() => new Set());
  const [generating, setGenerating] = React.useState(false);

  const collection = collectionId
    ? collections.find((c) => c.id === collectionId)
    : undefined;
  const folder = folderId ? folders.find((f) => f.id === folderId) : undefined;

  const inheritedBase = React.useMemo(
    () =>
      collectionId
        ? resolveEffectiveBaseUrl(folderId, collectionId, folders, collections)
        : { baseUrl: '' },
    [collectionId, folderId, folders, collections],
  );

  const effectiveAuth = React.useMemo(
    () =>
      collectionId
        ? resolveEffectiveAuth(
            { type: 'inherit' },
            folderId,
            collectionId,
            folders,
            collections,
          )
        : undefined,
    [collectionId, folderId, folders, collections],
  );

  const existingInScope = React.useMemo(() => {
    if (!collectionId) return [];
    if (!folderId) {
      return savedRequests.filter((r) => r.collectionId === collectionId);
    }
    const allowedFolders = collectDescendantFolderIds(folders, collectionId, folderId);
    return savedRequests.filter(
      (r) =>
        r.collectionId === collectionId &&
        Boolean(r.folderId && allowedFolders.has(r.folderId)),
    );
  }, [savedRequests, folders, collectionId, folderId]);

  const discoveredOps = React.useMemo(
    () => (schema ? discoverSchemaOperations(schema, existingInScope) : []),
    [schema, existingInScope],
  );

  const newOpsCount = React.useMemo(
    () => discoveredOps.filter((op) => !op.alreadyExists).length,
    [discoveredOps],
  );

  const runScan = React.useCallback(
    async (suffixOverride: string) => {
      if (!collectionId) return;
      setLoading(true);
      setScanError(null);
      const res = await fetchSchemaForContainer({
        collectionId,
        folderId,
        urlOverride: suffixOverride,
      });
      setResolvedEndpoint(res.endpoint);
      if (res.schema) {
        setSchema(res.schema);
        const ops = discoverSchemaOperations(res.schema, existingInScope);
        setSelectedKeys(new Set(ops.filter((o) => !o.alreadyExists).map((o) => o.key)));
      } else {
        setSchema(undefined);
        setSelectedKeys(new Set());
        setScanError(res.error || 'Failed to introspect GraphQL schema.');
      }
      setLoading(false);
    },
    [collectionId, folderId, fetchSchemaForContainer, existingInScope],
  );

  const prevOpenRef = React.useRef(false);
  React.useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;
    if (!justOpened) return;

    setUrlOverride('');
    setResolvedEndpoint(inheritedBase.baseUrl);
    setSchema(undefined);
    setScanError(null);
    setSearchQuery('');
    setIncludeQueries(true);
    setIncludeMutations(true);
    setHideCovered(false);
    setMaxDepth(2);
    setSelectedKeys(new Set());
    setGenerating(false);

    if (collectionId) {
      void runScan('');
    }
  }, [open, collectionId, inheritedBase.baseUrl, runScan]);

  const filteredOps = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return discoveredOps.filter((op) => {
      if (op.kind === 'query' && !includeQueries) return false;
      if (op.kind === 'mutation' && !includeMutations) return false;
      if (hideCovered && op.alreadyExists) return false;
      if (!q) return true;
      return (
        op.fieldName.toLowerCase().includes(q) ||
        op.operationName.toLowerCase().includes(q) ||
        (op.description?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [discoveredOps, searchQuery, includeQueries, includeMutations, hideCovered]);

  const toggleOperation = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSelectAllNew = () => {
    setSelectedKeys(
      new Set(
        discoveredOps
          .filter((op) => {
            if (op.alreadyExists) return false;
            if (op.kind === 'query' && !includeQueries) return false;
            if (op.kind === 'mutation' && !includeMutations) return false;
            return true;
          })
          .map((op) => op.key),
      ),
    );
  };

  const handleClearSelection = () => {
    setSelectedKeys(new Set());
  };

  const handleGenerate = async () => {
    if (!schema || !collectionId || selectedKeys.size === 0) return;
    setGenerating(true);
    setScanError(null);

    try {
      const selectedOps = discoveredOps.filter((op) => selectedKeys.has(op.key));
      const ts = new Date().toISOString();

      const existingAutoFolder = folders.find(
        (f) =>
          f.collectionId === collectionId &&
          (f.parentId ?? undefined) === folderId &&
          f.name.trim().toUpperCase() === AUTO_DISCOVERED_FOLDER_NAME,
      );

      const maxFolderSort = folders
        .filter(
          (f) =>
            f.collectionId === collectionId && (f.parentId ?? undefined) === folderId,
        )
        .reduce((max, f) => Math.max(max, f.sortOrder), -1);

      const targetSubfolder: FolderRecord | undefined = existingAutoFolder
        ? undefined
        : {
            id: nanoid(),
            collectionId,
            ...(folderId ? { parentId: folderId } : {}),
            name: AUTO_DISCOVERED_FOLDER_NAME,
            baseUrl: '',
            auth: { type: 'inherit' },
            sortOrder: maxFolderSort + 1,
            createdAt: ts,
            updatedAt: ts,
          };

      const targetFolderId = existingAutoFolder?.id ?? targetSubfolder!.id;
      const startSortOrder = existingAutoFolder
        ? savedRequests
            .filter(
              (r) =>
                r.collectionId === collectionId && r.folderId === existingAutoFolder.id,
            )
            .reduce((max, r) => Math.max(max, r.sortOrder), -1) + 1
        : 0;

      const relativeUrl = urlOverride.trim();
      const newRequests: SavedRequestRecord[] = selectedOps.map((op, idx) => {
        const generated = buildOperationFromField(schema, op.kind, op.fieldName, {
          maxDepth,
        });
        return {
          id: nanoid(),
          collectionId,
          folderId: targetFolderId,
          name: op.fieldName,
          protocol: 'graphql',
          method: 'POST',
          url: relativeUrl,
          params: [],
          headers: [],
          auth: { type: 'inherit' },
          body: { mode: 'graphql' },
          graphql: {
            query: generated.operationText,
            variables: JSON.stringify(generated.variables, null, 2),
            operationName: generated.operationName,
          },
          settings: {},
          sortOrder: startSortOrder + idx,
          createdAt: ts,
          updatedAt: ts,
        };
      });

      await importWorkspace({
        version: 1,
        exportedAt: ts,
        collections: [],
        folders: targetSubfolder ? [targetSubfolder] : [],
        savedRequests: newRequests,
        environments: [],
      });

      const containerLabel = folder
        ? `${collection?.name ?? ''} / ${folder.name}`
        : collection?.name ?? 'Collection';
      onGenerated?.(
        `Generated ${newRequests.length} GraphQL request${newRequests.length === 1 ? '' : 's'} into "${containerLabel} / ${AUTO_DISCOVERED_FOLDER_NAME}".`,
      );
      onOpenChange(false);
    } catch (err) {
      setScanError(
        err instanceof Error ? err.message : 'Failed to generate GraphQL requests.',
      );
    } finally {
      setGenerating(false);
    }
  };

  const targetTitle = folder
    ? `${collection?.name ?? 'Collection'} / ${folder.name}`
    : collection?.name ?? 'Collection';
  const combinedDisplayUrl = combineBaseAndRequestUrl(
    inheritedBase.baseUrl,
    urlOverride.trim(),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        resizable
        storageKey="riftql-discover-gql-modal-size"
        minWidth={560}
        minHeight={440}
        className="max-w-2xl"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#E879F9]" />
            <span>Discover GraphQL Schema</span>
            <Badge variant="default" className="ml-1 truncate">
              {targetTitle}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Introspects the GraphQL schema using this container&rsquo;s Base URL &amp; Auth and
            generates missing operations inside{' '}
            <code className="font-mono-code text-[var(--text-primary)]">
              {AUTO_DISCOVERED_FOLDER_NAME}
            </code>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          {/* Endpoint & Scan Bar */}
          <div className="flex flex-col gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[0.75rem]">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="text-[var(--text-secondary)]">Endpoint:</span>
                <span
                  title={resolvedEndpoint || combinedDisplayUrl}
                  className="truncate font-mono-code text-[var(--accent)]"
                >
                  {resolvedEndpoint || combinedDisplayUrl || '(No URL configured)'}
                </span>
              </div>
              {effectiveAuth && effectiveAuth.auth.type !== 'none' && (
                <Badge variant="success">Auth: {effectiveAuth.auth.type}</Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Input
                value={urlOverride}
                aria-label="GraphQL endpoint subpath or URL override"
                onChange={(e) => setUrlOverride(e.target.value)}
                placeholder={
                  inheritedBase.baseUrl
                    ? `Optional suffix (e.g. /graphql appended to ${inheritedBase.baseUrl})`
                    : 'https://api.example.com/graphql'
                }
                className="flex-1 font-mono-code text-xs"
              />
              <Button
                type="button"
                size="xs"
                variant="secondary"
                disabled={loading || !collectionId}
                onClick={() => void runScan(urlOverride)}
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                <span>{loading ? 'Scanning…' : 'Scan Schema'}</span>
              </Button>
            </div>
          </div>

          {scanError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-[#F87171]/40 bg-[#F87171]/10 px-3 py-2 text-xs text-[#DC2626] dark:text-[#F87171]"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{scanError}</span>
            </div>
          )}

          {schema && (
            <>
              {/* Filter & Options Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="relative min-w-[12rem] flex-1">
                  <Search className="pointer-events-none absolute top-1.5 left-2 h-3.5 w-3.5 text-[var(--text-secondary)]" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter queries & mutations..."
                    aria-label="Filter discovered operations"
                    className="h-7 pl-7 text-xs"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[0.75rem]">
                  <label className="flex cursor-pointer items-center gap-1 text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={includeQueries}
                      onChange={(e) => setIncludeQueries(e.target.checked)}
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                    <span>Queries</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-1 text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={includeMutations}
                      onChange={(e) => setIncludeMutations(e.target.checked)}
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                    <span>Mutations</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-1 text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={hideCovered}
                      onChange={(e) => setHideCovered(e.target.checked)}
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                    <span>Hide existing</span>
                  </label>
                  <Select
                    value={String(maxDepth)}
                    onValueChange={(val) => setMaxDepth(Number(val) || 2)}
                  >
                    <SelectTrigger aria-label="Selection set depth" className="h-7 w-24 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Depth: 1</SelectItem>
                      <SelectItem value="2">Depth: 2</SelectItem>
                      <SelectItem value="3">Depth: 3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Summary & Bulk Selection Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[0.75rem] text-[var(--text-secondary)]">
                <div className="flex items-center gap-2 tabular-nums">
                  <Badge variant="accent">{newOpsCount} new</Badge>
                  <Badge>{discoveredOps.length - newOpsCount} already covered</Badge>
                  <span>{selectedKeys.size} selected</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button type="button" size="xs" variant="ghost" onClick={handleSelectAllNew}>
                    Select All New
                  </Button>
                  <Button type="button" size="xs" variant="ghost" onClick={handleClearSelection}>
                    Clear
                  </Button>
                </div>
              </div>

              {/* Operations List */}
              <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-1.5 rift-scroll">
                {filteredOps.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[var(--text-secondary)]">
                    No matching operations found in schema.
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {filteredOps.map((op) => {
                      const checked = selectedKeys.has(op.key);
                      return (
                        <label
                          key={op.key}
                          className={cn(
                            'flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-xs transition-colors',
                            checked
                              ? 'bg-[var(--accent-muted)]/70'
                              : 'hover:bg-[var(--bg-hover)]',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOperation(op.key)}
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
                          />
                          <span
                            className={cn(
                              'mt-0.5 w-9 shrink-0 rounded border px-1 py-0.25 text-center font-mono-code text-[0.6875rem] font-semibold',
                              op.kind === 'query'
                                ? 'border-[#059669]/30 bg-[#059669]/10 text-[#059669] dark:text-[#34D399]'
                                : 'border-[#D97706]/30 bg-[#D97706]/10 text-[#D97706] dark:text-[#FBBF24]',
                            )}
                          >
                            {op.kind === 'query' ? 'QRY' : 'MUT'}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={cn(
                                  'font-mono-code font-medium text-[var(--text-primary)]',
                                  op.isDeprecated && 'line-through opacity-70',
                                )}
                              >
                                {op.fieldName}
                              </span>
                              {op.argsCount > 0 && (
                                <Badge className="tabular-nums">
                                  {op.argsCount} arg{op.argsCount === 1 ? '' : 's'}
                                </Badge>
                              )}
                              {op.alreadyExists && (
                                <Badge
                                  variant="success"
                                  title={`Covered by: ${op.existingRequestNames.join(', ')}`}
                                >
                                  <CheckCircle2 className="mr-1 h-3 w-3" />
                                  Covered ({op.existingRequestNames[0]})
                                </Badge>
                              )}
                            </div>
                            {op.description && (
                              <p className="mt-0.5 line-clamp-2 text-[0.75rem] text-[var(--text-secondary)]">
                                {op.description}
                              </p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {!schema && !loading && !scanError && (
            <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-[var(--border-subtle)] p-6 text-center text-xs text-[var(--text-secondary)]">
              Enter or verify a GraphQL URL above and click Scan Schema.
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0">
          <Button
            type="button"
            variant="ghost"
            disabled={generating}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="default"
            disabled={!schema || selectedKeys.size === 0 || generating}
            onClick={() => void handleGenerate()}
          >
            <FolderPlus className="h-3.5 w-3.5" />
            <span>
              {generating
                ? 'Generating…'
                : `Generate Selected (${selectedKeys.size})`}
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
