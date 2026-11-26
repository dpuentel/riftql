import * as React from 'react';
import { BookOpen, ChevronDown, ChevronUp, Loader2, RefreshCw, Wand2 } from 'lucide-react';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { SchemaDocsPanel } from '@/components/graphql/SchemaDocsPanel';
import { ActionTooltip } from '@/components/ui/action-tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  appendOperationToDocument,
  buildOperationFromField,
  extractOperations,
  formatGraphQL,
  mergeVariablesJson,
  type GraphQLRootOperationKind,
} from '@/lib/graphql';
import { resolveEndpointKey, useSchemaStore } from '@/store/useSchemaStore';
import { useTabsStore } from '@/store/useTabsStore';

const MIN_VARS_HEIGHT = 72;
const MAX_VARS_HEIGHT = 480;
const DEFAULT_VARS_HEIGHT = 140;

const MIN_DOCS_WIDTH = 220;
const MAX_DOCS_WIDTH = 640;
const DEFAULT_DOCS_WIDTH = 320;

function readStoredNumber(key: string, fallback: number, min: number, max: number): number {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = Number(localStorage.getItem(key));
    if (Number.isFinite(raw) && raw >= min && raw <= max) {
      return raw;
    }
  } catch {
    // ignore storage errors
  }
  return fallback;
}

function writeStoredNumber(key: string, value: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, String(Math.round(value)));
  } catch {
    // ignore storage errors
  }
}

export function GraphQLEditor() {
  const tab = useTabsStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const updateDraft = useTabsStore((s) => s.updateDraft);

  const byEndpoint = useSchemaStore((s) => s.byEndpoint);
  const fetchSchemaForTab = useSchemaStore((s) => s.fetchSchemaForTab);

  const [showDocs, setShowDocs] = React.useState(false);
  const [docsFocusType, setDocsFocusType] = React.useState<string | undefined>();
  const [showVariables, setShowVariables] = React.useState(true);
  const [variablesHeight, setVariablesHeight] = React.useState(() =>
    readStoredNumber('riftql-gql-vars-height', DEFAULT_VARS_HEIGHT, MIN_VARS_HEIGHT, MAX_VARS_HEIGHT),
  );
  const [docsWidth, setDocsWidth] = React.useState(() =>
    readStoredNumber('riftql-gql-docs-width', DEFAULT_DOCS_WIDTH, MIN_DOCS_WIDTH, MAX_DOCS_WIDTH),
  );

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const editorColumnRef = React.useRef<HTMLDivElement | null>(null);
  const dragModeRef = React.useRef<'vars' | 'docs' | null>(null);
  const varsHeightRef = React.useRef(variablesHeight);
  const docsWidthRef = React.useRef(docsWidth);

  varsHeightRef.current = variablesHeight;
  docsWidthRef.current = docsWidth;

  React.useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const mode = dragModeRef.current;
      if (!mode) return;

      if (mode === 'vars' && editorColumnRef.current) {
        const rect = editorColumnRef.current.getBoundingClientRect();
        const maxPossible = Math.min(MAX_VARS_HEIGHT, Math.max(MIN_VARS_HEIGHT, rect.height - 170));
        const next = Math.min(
          maxPossible,
          Math.max(MIN_VARS_HEIGHT, rect.bottom - e.clientY - 32),
        );
        setVariablesHeight(next);
      } else if (mode === 'docs' && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const maxPossible = Math.min(MAX_DOCS_WIDTH, Math.max(MIN_DOCS_WIDTH, rect.width - 240));
        const next = Math.min(
          maxPossible,
          Math.max(MIN_DOCS_WIDTH, rect.right - e.clientX),
        );
        setDocsWidth(next);
      }
    };

    const handlePointerUp = () => {
      if (dragModeRef.current === 'vars') {
        writeStoredNumber('riftql-gql-vars-height', varsHeightRef.current);
      } else if (dragModeRef.current === 'docs') {
        writeStoredNumber('riftql-gql-docs-width', docsWidthRef.current);
      }
      dragModeRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const operations = React.useMemo(
    () => (tab ? extractOperations(tab.draft.graphql.query) : []),
    [tab?.draft.graphql.query],
  );

  if (!tab) return null;

  const { draft } = tab;
  const endpointKey = resolveEndpointKey(draft.url, tab.collectionId);
  const schemaEntry = endpointKey ? byEndpoint[endpointKey] : undefined;
  const namedOperations = operations.filter((op) => Boolean(op.name));

  const handleFormatQuery = () => {
    try {
      const formatted = formatGraphQL(draft.graphql.query);
      updateDraft(tab.id, (prev) => ({
        ...prev,
        graphql: { ...prev.graphql, query: formatted },
      }));
    } catch {
      // Keep current text if GraphQL query has syntax errors
    }
  };

  const handleFetchSchema = async () => {
    const schema = await fetchSchemaForTab(tab);
    if (schema) {
      setShowDocs(true);
    }
  };

  const handleInsertOperation = (
    operationKind: GraphQLRootOperationKind,
    fieldName: string,
  ) => {
    if (!schemaEntry?.schema) return;
    const generated = buildOperationFromField(schemaEntry.schema, operationKind, fieldName);
    updateDraft(tab.id, (prev) => {
      const appended = appendOperationToDocument(prev.graphql.query, generated);
      const nextVars = mergeVariablesJson(prev.graphql.variables, generated.variables);
      return {
        ...prev,
        graphql: {
          ...prev.graphql,
          query: appended.query,
          variables: nextVars,
          operationName: appended.operationName,
        },
      };
    });
    if (Object.keys(generated.variables).length > 0) {
      setShowVariables(true);
    }
  };

  return (
    <div ref={containerRef} className="flex h-full min-h-0">
      <div ref={editorColumnRef} className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* GraphQL Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {namedOperations.length > 0 && (
              <Select
                value={draft.graphql.operationName || namedOperations[0]?.name || ''}
                onValueChange={(opName) =>
                  updateDraft(tab.id, (prev) => ({
                    ...prev,
                    graphql: { ...prev.graphql, operationName: opName },
                  }))
                }
              >
                <SelectTrigger className="h-6 w-44 text-[0.75rem]" aria-label="Operation">
                  <SelectValue placeholder="Operation" />
                </SelectTrigger>
                <SelectContent>
                  {namedOperations.map((op) => (
                    <SelectItem key={op.name!} value={op.name!}>
                      <span className="font-mono-code">
                        {op.operation} {op.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <ActionTooltip label="Format Query" actionId="formatBody">
              <Button size="xs" variant="secondary" onClick={handleFormatQuery}>
                <Wand2 className="h-3 w-3" />
                <span>Format</span>
              </Button>
            </ActionTooltip>
          </div>

          <div className="flex items-center gap-1.5">
            {schemaEntry?.error && (
              <Badge variant="destructive" title={schemaEntry.error}>
                Introspection failed
              </Badge>
            )}
            {schemaEntry?.schema && !schemaEntry.error && (
              <Badge variant="success">Schema Loaded</Badge>
            )}

            <ActionTooltip label="Fetch / Refresh GraphQL Schema">
              <Button
                size="xs"
                variant="secondary"
                disabled={!endpointKey || schemaEntry?.loading}
                onClick={() => void handleFetchSchema()}
              >
                {schemaEntry?.loading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                <span>{schemaEntry?.schema ? 'Refresh Schema' : 'Fetch Schema'}</span>
              </Button>
            </ActionTooltip>

            <ActionTooltip label="Toggle Schema Docs">
              <Button
                size="xs"
                variant={showDocs ? 'default' : 'secondary'}
                onClick={() => setShowDocs((v) => !v)}
              >
                <BookOpen className="h-3 w-3" />
                <span>Docs</span>
              </Button>
            </ActionTooltip>
          </div>
        </div>

        {/* Query Editor */}
        <div className="min-h-[120px] flex-1">
          <CodeEditor
            value={draft.graphql.query}
            language="graphql"
            graphqlSchema={schemaEntry?.schema}
            onShowInDocs={(_field, type, parentType) => {
              const target = type || parentType;
              if (target) {
                setDocsFocusType(target);
                setShowDocs(true);
              }
            }}
            onChange={(query) =>
              updateDraft(tab.id, (prev) => ({
                ...prev,
                graphql: { ...prev.graphql, query },
              }))
            }
            placeholder="query GetUser($id: ID!) { ... }"
            ariaLabel="GraphQL query editor"
          />
        </div>

        {/* Resizable Handle for Variables Panel */}
        {showVariables && (
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize Variables panel"
            onPointerDown={() => {
              dragModeRef.current = 'vars';
            }}
            className="group flex h-2 shrink-0 cursor-row-resize items-center justify-center select-none"
          >
            <div className="h-[2px] w-12 rounded-full bg-[var(--border-subtle)] transition-colors group-hover:bg-[var(--accent)]" />
          </div>
        )}

        {/* Collapsible & Resizable Variables Panel */}
        <div className="flex shrink-0 flex-col rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <button
            type="button"
            onClick={() => setShowVariables((v) => !v)}
            className="flex cursor-pointer items-center justify-between px-2.5 py-1.5 text-[0.75rem] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <span>Variables (JSON)</span>
            {showVariables ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </button>
          {showVariables && (
            <div
              style={{ height: `${variablesHeight}px` }}
              className="border-t border-[var(--border-subtle)]"
            >
              <CodeEditor
                value={draft.graphql.variables}
                language="json"
                onChange={(variables) =>
                  updateDraft(tab.id, (prev) => ({
                    ...prev,
                    graphql: { ...prev.graphql, variables },
                  }))
                }
                placeholder='{"id": "1"}'
                className="rounded-t-none border-0"
                ariaLabel="GraphQL variables editor"
              />
            </div>
          )}
        </div>
      </div>

      {showDocs && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize Schema Docs panel"
            onPointerDown={() => {
              dragModeRef.current = 'docs';
            }}
            className="group flex w-2 shrink-0 cursor-col-resize items-center justify-center select-none"
          >
            <div className="h-12 w-[2px] rounded-full bg-[var(--border-subtle)] transition-colors group-hover:bg-[var(--accent)]" />
          </div>
          <SchemaDocsPanel
            schema={schemaEntry?.schema}
            initialTypeName={docsFocusType}
            width={docsWidth}
            onInsertOperation={handleInsertOperation}
            onClose={() => setShowDocs(false)}
          />
        </>
      )}
    </div>
  );
}
