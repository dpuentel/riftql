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
import { extractOperations, formatGraphQL } from '@/lib/graphql';
import { resolveEndpointKey, useSchemaStore } from '@/store/useSchemaStore';
import { useTabsStore } from '@/store/useTabsStore';

export function GraphQLEditor() {
  const tab = useTabsStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const updateDraft = useTabsStore((s) => s.updateDraft);

  const byEndpoint = useSchemaStore((s) => s.byEndpoint);
  const fetchSchemaForTab = useSchemaStore((s) => s.fetchSchemaForTab);

  const [showDocs, setShowDocs] = React.useState(false);
  const [docsFocusType, setDocsFocusType] = React.useState<string | undefined>();
  const [showVariables, setShowVariables] = React.useState(true);

  if (!tab) return null;

  const { draft } = tab;
  const endpointKey = resolveEndpointKey(draft.url, tab.collectionId);
  const schemaEntry = endpointKey ? byEndpoint[endpointKey] : undefined;

  const operations = React.useMemo(
    () => extractOperations(draft.graphql.query),
    [draft.graphql.query],
  );
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

  return (
    <div className="flex h-full min-h-0 gap-2">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
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
                <SelectTrigger className="h-6 w-44 text-[11px]" aria-label="Operation">
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
        <div className="min-h-[140px] flex-1">
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

        {/* Collapsible Variables Panel */}
        <div className="flex flex-col rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <button
            type="button"
            onClick={() => setShowVariables((v) => !v)}
            className="flex cursor-pointer items-center justify-between px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <span>Variables (JSON)</span>
            {showVariables ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </button>
          {showVariables && (
            <div className="h-28 border-t border-[var(--border-subtle)]">
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
        <SchemaDocsPanel
          schema={schemaEntry?.schema}
          initialTypeName={docsFocusType}
          onClose={() => setShowDocs(false)}
        />
      )}
    </div>
  );
}
