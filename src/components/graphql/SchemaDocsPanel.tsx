import * as React from 'react';
import type { GraphQLSchema } from 'graphql';
import { ChevronRight, Plus, Search, X } from 'lucide-react';
import { ActionTooltip } from '@/components/ui/action-tooltip';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  extractSchemaSummary,
  type GraphQLRootOperationKind,
  type SchemaTypeDoc,
} from '@/lib/graphql';
import { cn } from '@/lib/utils';

interface SchemaDocsPanelProps {
  schema?: GraphQLSchema;
  initialTypeName?: string;
  width?: number;
  onInsertOperation?: (operationKind: GraphQLRootOperationKind, fieldName: string) => void;
  onClose?: () => void;
}

export function SchemaDocsPanel({
  schema,
  initialTypeName,
  width,
  onInsertOperation,
  onClose,
}: SchemaDocsPanelProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [breadcrumbs, setBreadcrumbs] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (initialTypeName) {
      setBreadcrumbs([initialTypeName]);
    }
  }, [initialTypeName]);

  const summary = React.useMemo(
    () => (schema ? extractSchemaSummary(schema) : null),
    [schema],
  );

  const typeMap = React.useMemo(() => {
    const map = new Map<string, SchemaTypeDoc>();
    if (summary) {
      for (const t of summary.types) {
        map.set(t.name, t);
      }
    }
    return map;
  }, [summary]);

  const activeTypeName = breadcrumbs[breadcrumbs.length - 1];
  const activeType = activeTypeName ? typeMap.get(activeTypeName) : undefined;

  const pushType = (typeName: string) => {
    if (!typeMap.has(typeName)) return;
    setSearchQuery('');
    setBreadcrumbs((prev) =>
      prev[prev.length - 1] === typeName ? prev : [...prev, typeName],
    );
  };

  const getRootOperationKind = (typeName: string): GraphQLRootOperationKind | undefined => {
    if (!summary) return undefined;
    if (typeName === summary.queryTypeName) return 'query';
    if (typeName === summary.mutationTypeName) return 'mutation';
    if (typeName === summary.subscriptionTypeName) return 'subscription';
    return undefined;
  };

  if (!summary) {
    return (
      <aside
        aria-label="Schema Docs"
        style={width ? { width: `${width}px` } : undefined}
        className={cn(
          'flex h-full shrink-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-surface)]',
          !width && 'w-80',
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3 py-2">
          <span className="text-xs font-semibold text-[var(--text-primary)]">
            Schema Docs
          </span>
          {onClose && (
            <ActionTooltip label="Close Docs">
              <button
                type="button"
                aria-label="Close Schema Docs"
                onClick={onClose}
                className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </ActionTooltip>
          )}
        </div>
        <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-[var(--text-secondary)]">
          Fetch a GraphQL schema to browse types, fields, and arguments.
        </div>
      </aside>
    );
  }

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const matchingTypes = trimmedQuery
    ? summary.types.filter((t) => t.name.toLowerCase().includes(trimmedQuery))
    : [];
  const matchingFields = trimmedQuery
    ? summary.types.flatMap((t) =>
        t.fields
          .filter((f) => f.name.toLowerCase().includes(trimmedQuery))
          .map((f) => ({ parentType: t.name, field: f })),
      )
    : [];

  const activeRootOp = activeType ? getRootOperationKind(activeType.name) : undefined;

  return (
    <aside
      aria-label="Schema Docs"
      style={width ? { width: `${width}px` } : undefined}
      className={cn(
        'flex h-full shrink-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-surface)]',
        !width && 'w-80',
      )}
    >
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3 py-2">
        <span className="text-xs font-semibold text-[var(--text-primary)]">
          Schema Docs
        </span>
        {onClose && (
          <ActionTooltip label="Close Docs">
            <button
              type="button"
              aria-label="Close Schema Docs"
              onClick={onClose}
              className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </ActionTooltip>
        )}
      </div>

      <div className="border-b border-[var(--border-subtle)] p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1.5 left-2.5 h-3.5 w-3.5 text-[var(--text-secondary)]" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search types or fields..."
            aria-label="Search schema"
            className="pl-8"
          />
        </div>
      </div>

      {/* Breadcrumbs */}
      {!trimmedQuery && (
        <div className="flex flex-wrap items-center gap-1 border-b border-[var(--border-subtle)] px-2.5 py-1.5 text-[0.75rem] text-[var(--text-secondary)]">
          <button
            type="button"
            onClick={() => setBreadcrumbs([])}
            className="cursor-pointer font-medium hover:text-[var(--text-primary)]"
          >
            Root
          </button>
          {breadcrumbs.map((name, idx) => (
            <React.Fragment key={`${name}-${idx}`}>
              <ChevronRight className="h-3 w-3 shrink-0" />
              <button
                type="button"
                onClick={() => setBreadcrumbs(breadcrumbs.slice(0, idx + 1))}
                className="cursor-pointer truncate font-mono-code font-medium text-[var(--accent)] hover:underline"
              >
                {name}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-2.5 rift-scroll">
        {trimmedQuery ? (
          <div className="flex flex-col gap-3">
            {matchingTypes.length === 0 && matchingFields.length === 0 && (
              <div className="py-6 text-center text-xs text-[var(--text-secondary)]">
                No matching types or fields.
              </div>
            )}

            {matchingTypes.length > 0 && (
              <div className="flex flex-col gap-1">
                <div className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  Types ({matchingTypes.length})
                </div>
                {matchingTypes.map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => pushType(t.name)}
                    className="flex cursor-pointer items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-[var(--bg-hover)]"
                  >
                    <span className="font-mono-code text-[var(--text-primary)]">{t.name}</span>
                    <Badge>{t.kind}</Badge>
                  </button>
                ))}
              </div>
            )}

            {matchingFields.length > 0 && (
              <div className="flex flex-col gap-1">
                <div className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  Fields ({matchingFields.length})
                </div>
                {matchingFields.map(({ parentType, field }) => {
                  const rootOp = getRootOperationKind(parentType);
                  return (
                    <div
                      key={`${parentType}.${field.name}`}
                      className="flex items-center justify-between gap-1.5 rounded px-2 py-1 hover:bg-[var(--bg-hover)]"
                    >
                      <button
                        type="button"
                        onClick={() => pushType(parentType)}
                        className="min-w-0 flex-1 cursor-pointer text-left text-xs"
                      >
                        <div className="truncate font-mono-code text-[var(--text-primary)]">
                          <span className="text-[var(--text-secondary)]">{parentType}.</span>
                          {field.name}
                          <span className="text-[var(--accent)]">: {field.type}</span>
                        </div>
                      </button>
                      {rootOp && onInsertOperation && (
                        <ActionTooltip label={`Add ${field.name} to Query Editor`}>
                          <button
                            type="button"
                            aria-label={`Add ${field.name} to editor`}
                            onClick={() => onInsertOperation(rootOp, field.name)}
                            className="inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded border border-[var(--accent)]/30 bg-[var(--accent-muted)] px-1.5 py-0.5 text-[0.6875rem] font-medium text-[var(--accent)] hover:border-[var(--accent)]"
                          >
                            <Plus className="h-3 w-3" />
                            <span>Add</span>
                          </button>
                        </ActionTooltip>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : activeType ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono-code text-sm font-semibold text-[var(--text-primary)]">
                {activeType.name}
              </span>
              <Badge variant="accent">{activeType.kind}</Badge>
            </div>
            {activeType.description && (
              <p className="text-xs text-[var(--text-secondary)]">{activeType.description}</p>
            )}

            {activeType.fields.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  Fields
                </div>
                {activeType.fields.map((f) => (
                  <div
                    key={f.name}
                    className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-1 font-mono-code">
                        <span className="font-semibold text-[var(--text-primary)]">{f.name}</span>
                        {f.args.length > 0 && (
                          <span className="text-[var(--text-secondary)]">
                            (
                            {f.args.map((a, idx) => (
                              <React.Fragment key={a.name}>
                                {idx > 0 && ', '}
                                <span className="text-[var(--text-primary)]">{a.name}</span>
                                {': '}
                                <span className="text-[var(--accent)]">{a.type}</span>
                                {a.defaultValue !== undefined && (
                                  <span className="text-[var(--text-tertiary)]">
                                    {' = '}
                                    {a.defaultValue}
                                  </span>
                                )}
                              </React.Fragment>
                            ))}
                            )
                          </span>
                        )}
                        <span>:</span>
                        <button
                          type="button"
                          onClick={() => pushType(f.namedType)}
                          className="cursor-pointer text-[var(--accent)] hover:underline"
                        >
                          {f.type}
                        </button>
                      </div>

                      {activeRootOp && onInsertOperation && (
                        <ActionTooltip label={`Add ${f.name} to Query Editor`}>
                          <button
                            type="button"
                            aria-label={`Add ${f.name} to editor`}
                            onClick={() => onInsertOperation(activeRootOp, f.name)}
                            className="inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded border border-[var(--accent)]/30 bg-[var(--accent-muted)] px-1.5 py-0.5 text-[0.6875rem] font-medium text-[var(--accent)] hover:border-[var(--accent)]"
                          >
                            <Plus className="h-3 w-3" />
                            <span>Add</span>
                          </button>
                        </ActionTooltip>
                      )}
                    </div>
                    {f.isDeprecated && (
                      <div className="mt-1 flex items-center gap-1.5">
                        <Badge variant="warning">Deprecated</Badge>
                        {f.deprecationReason && (
                          <span className="text-[0.75rem] text-[var(--text-secondary)]">
                            {f.deprecationReason}
                          </span>
                        )}
                      </div>
                    )}
                    {f.description && (
                      <p className="mt-1 text-[0.75rem] text-[var(--text-secondary)]">
                        {f.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activeType.enumValues.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  Enum Values
                </div>
                {activeType.enumValues.map((ev) => (
                  <div
                    key={ev.name}
                    className="rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 font-mono-code text-xs"
                  >
                    <div className="font-semibold text-[var(--text-primary)]">{ev.name}</div>
                    {ev.description && (
                      <div className="font-sans text-[0.75rem] text-[var(--text-secondary)]">
                        {ev.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activeType.possibleTypes.length > 0 && (
              <div className="flex flex-col gap-1">
                <div className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  Possible Types
                </div>
                {activeType.possibleTypes.map((pt) => (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => pushType(pt)}
                    className="cursor-pointer rounded px-2 py-1 text-left font-mono-code text-xs text-[var(--accent)] hover:bg-[var(--bg-hover)]"
                  >
                    {pt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <div className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Root Types
              </div>
              {summary.queryTypeName && (
                <button
                  type="button"
                  aria-label={`query ${summary.queryTypeName}`}
                  onClick={() => pushType(summary.queryTypeName!)}
                  className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-[var(--bg-hover)]"
                >
                  <span className="text-[var(--text-secondary)]">query</span>
                  <span className="font-mono-code font-semibold text-[var(--accent)]">
                    {summary.queryTypeName}
                  </span>
                </button>
              )}
              {summary.mutationTypeName && (
                <button
                  type="button"
                  aria-label={`mutation ${summary.mutationTypeName}`}
                  onClick={() => pushType(summary.mutationTypeName!)}
                  className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-[var(--bg-hover)]"
                >
                  <span className="text-[var(--text-secondary)]">mutation</span>
                  <span className="font-mono-code font-semibold text-[var(--accent)]">
                    {summary.mutationTypeName}
                  </span>
                </button>
              )}
              {summary.subscriptionTypeName && (
                <button
                  type="button"
                  aria-label={`subscription ${summary.subscriptionTypeName}`}
                  onClick={() => pushType(summary.subscriptionTypeName!)}
                  className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-[var(--bg-hover)]"
                >
                  <span className="text-[var(--text-secondary)]">subscription</span>
                  <span className="font-mono-code font-semibold text-[var(--accent)]">
                    {summary.subscriptionTypeName}
                  </span>
                </button>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <div className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                All Types ({summary.types.length})
              </div>
              {summary.types.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => pushType(t.name)}
                  className="flex cursor-pointer items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-[var(--bg-hover)]"
                >
                  <span className="truncate font-mono-code text-[var(--text-primary)]">
                    {t.name}
                  </span>
                  <Badge>{t.kind}</Badge>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
