import * as React from 'react';
import {
  Braces,
  Code2,
  Import,
  Save,
  Send,
  Square,
} from 'lucide-react';
import { AuthEditor } from '@/components/request/AuthEditor';
import { BodyEditor } from '@/components/request/BodyEditor';
import { GraphQLEditor } from '@/components/request/GraphQLEditor';
import { KeyValueEditor } from '@/components/request/KeyValueEditor';
import { ActionTooltip } from '@/components/ui/action-tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getMethodColorClass } from '@/lib/format';
import { syncParamsFromUrl, syncUrlFromParams } from '@/lib/url-params';
import { cn } from '@/lib/utils';
import { findVariableMatches } from '@/lib/variables';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useTabsStore } from '@/store/useTabsStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import type { HttpMethod, KeyValueItem, RequestDraft } from '@/types/api';

const HTTP_METHODS: HttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'HEAD',
];

export interface RequestPaneProps {
  urlInputRef?: React.RefObject<HTMLInputElement | null>;
  onOpenSaveModal?: (tabId: string) => void;
  onOpenCodeSnippet?: () => void;
  onOpenImportCurl?: () => void;
  onPasteCurlInUrl?: (curlCommand: string) => boolean;
  renderGraphQLEditor?: (
    draft: RequestDraft,
    onChange: (updater: (d: RequestDraft) => RequestDraft) => void,
    tabId: string,
  ) => React.ReactNode;
}

export function RequestPane({
  urlInputRef,
  onOpenSaveModal,
  onOpenCodeSnippet,
  onOpenImportCurl,
  onPasteCurlInUrl,
  renderGraphQLEditor,
}: RequestPaneProps) {
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const tab = useTabsStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const updateDraft = useTabsStore((s) => s.updateDraft);
  const sendTabRequest = useTabsStore((s) => s.sendTabRequest);
  const cancelTabRequest = useTabsStore((s) => s.cancelTabRequest);
  const markTabSaved = useTabsStore((s) => s.markTabSaved);

  const settings = useSettingsStore((s) => s.settings);
  const environments = useWorkspaceStore((s) => s.environments);
  const collections = useWorkspaceStore((s) => s.collections);
  const upsertSavedRequest = useWorkspaceStore((s) => s.upsertSavedRequest);

  const [activeSubTab, setActiveSubTab] = React.useState<string>('params');

  React.useEffect(() => {
    if (tab?.draft.protocol === 'graphql') {
      setActiveSubTab('graphql');
    } else if (activeSubTab === 'graphql') {
      setActiveSubTab('body');
    }
  }, [tab?.id, tab?.draft.protocol]);

  if (!tab) return null;

  const { draft } = tab;
  const selectorValue = draft.protocol === 'graphql' ? 'GQL' : draft.method;

  const globalEnv = environments.find((e) => e.isGlobal);
  const activeEnv = settings.activeEnvironmentId
    ? environments.find((e) => e.id === settings.activeEnvironmentId)
    : undefined;
  const collection = tab.collectionId
    ? collections.find((c) => c.id === tab.collectionId)
    : undefined;

  const urlVars = findVariableMatches(draft.url, {
    globalEnvironment: globalEnv,
    activeEnvironment: activeEnv,
    collectionVariables: collection?.variables,
  });

  const handleMethodSelect = (value: string) => {
    updateDraft(tab.id, (prev) => {
      if (value === 'GQL') {
        return {
          ...prev,
          protocol: 'graphql',
          method: 'POST',
          body: { mode: 'graphql' },
          graphql: prev.graphql.query
            ? prev.graphql
            : { query: 'query {\n  \n}', variables: '{}' },
        };
      }
      return {
        ...prev,
        protocol: 'rest',
        method: value,
        body: prev.body.mode === 'graphql' ? { mode: 'none' } : prev.body,
      };
    });
  };

  const handleUrlChange = (nextUrl: string) => {
    updateDraft(tab.id, (prev) => ({
      ...prev,
      url: nextUrl,
      params: syncParamsFromUrl(nextUrl, prev.params),
    }));
  };

  const handleParamsChange = (nextParams: KeyValueItem[]) => {
    updateDraft(tab.id, (prev) => ({
      ...prev,
      params: nextParams,
      url: syncUrlFromParams(prev.url, nextParams),
    }));
  };

  const handleSave = async () => {
    if (tab.savedRequestId && tab.collectionId) {
      const saved = await upsertSavedRequest({
        id: tab.savedRequestId,
        collectionId: tab.collectionId,
        folderId: tab.folderId,
        draft,
      });
      markTabSaved(tab.id, saved);
    } else {
      onOpenSaveModal?.(tab.id);
    }
  };

  const cycleOverride = (key: 'verifySsl' | 'sendCookies' | 'followRedirects') => {
    updateDraft(tab.id, (prev) => {
      const cur = prev.settings[key];
      const next = cur === undefined ? true : cur === true ? false : undefined;
      return {
        ...prev,
        settings: { ...prev.settings, [key]: next },
      };
    });
  };

  const formatOverrideLabel = (
    label: string,
    overrideVal: boolean | undefined,
    globalVal: boolean,
  ) => {
    if (overrideVal === undefined) return `${label}: Default (${globalVal ? 'On' : 'Off'})`;
    return `${label}: ${overrideVal ? 'On' : 'Off'}`;
  };

  const enabledParamsCount = draft.params.filter((p) => p.enabled && p.key.trim()).length;
  const enabledHeadersCount = draft.headers.filter((h) => h.enabled && h.key.trim()).length;

  return (
    <section
      aria-label="Request builder"
      className="flex h-full min-h-0 flex-col bg-[var(--bg-base)]"
    >
      {/* Top URL & Action Bar */}
      <div className="flex flex-col gap-1.5 border-b border-[var(--border-subtle)] px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <Select value={selectorValue} onValueChange={handleMethodSelect}>
            <SelectTrigger
              aria-label="Request method or protocol"
              className={cn(
                'h-8 w-[96px] shrink-0 font-mono-code text-xs font-semibold',
                getMethodColorClass(selectorValue),
              )}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HTTP_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  <span className={cn('font-mono-code font-semibold', getMethodColorClass(m))}>
                    {m}
                  </span>
                </SelectItem>
              ))}
              <SelectItem value="GQL">
                <span className={cn('font-mono-code font-semibold', getMethodColorClass('GQL'))}>
                  GQL
                </span>
              </SelectItem>
            </SelectContent>
          </Select>

          <div className="relative flex min-w-0 flex-1 items-center">
            <Input
              ref={urlInputRef}
              value={draft.url}
              placeholder="https://api.example.com/v1/resource or paste cURL..."
              aria-label="Request URL"
              onChange={(e) => handleUrlChange(e.target.value)}
              onPaste={(e) => {
                const pasted = e.clipboardData?.getData('text') ?? '';
                if (onPasteCurlInUrl && onPasteCurlInUrl(pasted)) {
                  e.preventDefault();
                }
              }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void sendTabRequest(activeTabId);
                }
              }}
              className={cn(
                'h-8 font-mono-code text-xs',
                urlVars.length > 0 && 'pr-16',
              )}
            />

            {urlVars.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Inspect URL variables"
                    className="absolute right-1.5 inline-flex items-center gap-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono-code text-[10px] text-[var(--accent)] hover:border-[var(--accent)]"
                  >
                    <Braces className="h-2.5 w-2.5" />
                    <span>{urlVars.length}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80">
                  <div className="mb-1.5 text-[11px] font-semibold text-[var(--text-primary)]">
                    Resolved URL Variables
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {urlVars.map((v) => (
                      <div
                        key={v.name}
                        className="flex items-center justify-between gap-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-mono-code text-[11px] text-[var(--accent)]">
                            {`{{${v.name}}}`}
                          </span>
                          <Badge variant={v.source === 'unresolved' ? 'warning' : 'default'}>
                            {v.source}
                          </Badge>
                        </div>
                        <span className="max-w-[130px] truncate font-mono-code text-[11px] text-[var(--text-secondary)]">
                          {v.source === 'unresolved'
                            ? 'Unresolved'
                            : v.isSecret
                              ? '••••••'
                              : v.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {tab.isLoading ? (
            <ActionTooltip label="Cancel Request" actionId="cancelRequest">
              <Button
                variant="destructive"
                size="md"
                onClick={() => void cancelTabRequest(tab.id)}
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                <span>Cancel</span>
              </Button>
            </ActionTooltip>
          ) : (
            <ActionTooltip label="Send Request" actionId="sendRequest">
              <Button
                variant="default"
                size="md"
                onClick={() => void sendTabRequest(tab.id)}
              >
                <Send className="h-3.5 w-3.5" />
                <span>Send</span>
              </Button>
            </ActionTooltip>
          )}
        </div>

        {/* Secondary Micro-Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <ActionTooltip label="Save Request" actionId="saveRequest">
              <Button size="xs" variant="ghost" onClick={() => void handleSave()}>
                <Save className="h-3 w-3" />
                <span>Save</span>
              </Button>
            </ActionTooltip>
            <ActionTooltip label="Copy as Code Snippet" actionId="openCodeSnippet">
              <Button size="xs" variant="ghost" onClick={onOpenCodeSnippet}>
                <Code2 className="h-3 w-3" />
                <span>Code</span>
              </Button>
            </ActionTooltip>
            <ActionTooltip label="Import cURL" actionId="importCurl">
              <Button size="xs" variant="ghost" onClick={onOpenImportCurl}>
                <Import className="h-3 w-3" />
                <span>Import cURL</span>
              </Button>
            </ActionTooltip>
          </div>

          <div className="flex items-center gap-1">
            <ActionTooltip label="Toggle SSL Verification Override">
              <button
                type="button"
                onClick={() => cycleOverride('verifySsl')}
                className={cn(
                  'cursor-pointer rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                  draft.settings.verifySsl === false
                    ? 'border-[#FBBF24]/40 bg-[#FBBF24]/10 text-[#D97706] dark:text-[#FBBF24]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                )}
              >
                {formatOverrideLabel('SSL', draft.settings.verifySsl, settings.verifySsl)}
              </button>
            </ActionTooltip>
            <ActionTooltip label="Toggle Cookie Jar Override">
              <button
                type="button"
                onClick={() => cycleOverride('sendCookies')}
                className={cn(
                  'cursor-pointer rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                  draft.settings.sendCookies === false
                    ? 'border-[#FBBF24]/40 bg-[#FBBF24]/10 text-[#D97706] dark:text-[#FBBF24]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                )}
              >
                {formatOverrideLabel('Cookies', draft.settings.sendCookies, settings.sendCookies)}
              </button>
            </ActionTooltip>
            <ActionTooltip label="Toggle Redirects Override">
              <button
                type="button"
                onClick={() => cycleOverride('followRedirects')}
                className="cursor-pointer rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                {formatOverrideLabel(
                  'Redirects',
                  draft.settings.followRedirects,
                  settings.followRedirects,
                )}
              </button>
            </ActionTooltip>
          </div>
        </div>
      </div>

      {/* Request Sub-tabs */}
      <Tabs
        value={activeSubTab}
        onValueChange={setActiveSubTab}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList>
          {draft.protocol === 'graphql' && (
            <TabsTrigger value="graphql">Query & Variables</TabsTrigger>
          )}
          <TabsTrigger value="params">
            <span>Params</span>
            {enabledParamsCount > 0 && (
              <Badge variant="accent" className="tabular-nums">
                {enabledParamsCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="headers">
            <span>Headers</span>
            {enabledHeadersCount > 0 && (
              <Badge variant="accent" className="tabular-nums">
                {enabledHeadersCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="auth">
            <span>Auth</span>
            {draft.auth.type !== 'none' && draft.auth.type !== 'inherit' && (
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            )}
          </TabsTrigger>
          {draft.protocol === 'rest' && <TabsTrigger value="body">Body</TabsTrigger>}
        </TabsList>

        {draft.protocol === 'graphql' && (
          <TabsContent value="graphql" className="flex min-h-0 flex-col p-3">
            {renderGraphQLEditor ? (
              renderGraphQLEditor(draft, (updater) => updateDraft(tab.id, updater), tab.id)
            ) : (
              <GraphQLEditor />
            )}
          </TabsContent>
        )}

        <TabsContent value="params" className="overflow-auto p-3 rift-scroll">
          <KeyValueEditor
            items={draft.params}
            onChange={handleParamsChange}
            keyPlaceholder="param"
            valuePlaceholder="value"
            emptyHint="No query parameters yet."
          />
        </TabsContent>

        <TabsContent value="headers" className="overflow-auto p-3 rift-scroll">
          <KeyValueEditor
            items={draft.headers}
            onChange={(headers) =>
              updateDraft(tab.id, (prev) => ({ ...prev, headers }))
            }
            keyPlaceholder="Header-Name"
            valuePlaceholder="value"
            emptyHint="No custom headers yet."
          />
        </TabsContent>

        <TabsContent value="auth" className="overflow-auto p-3 rift-scroll">
          <AuthEditor
            auth={draft.auth}
            collectionId={tab.collectionId}
            folderId={tab.folderId}
            onChange={(auth) => updateDraft(tab.id, (prev) => ({ ...prev, auth }))}
          />
        </TabsContent>

        {draft.protocol === 'rest' && (
          <TabsContent value="body" className="flex min-h-0 flex-col p-3">
            <BodyEditor
              body={draft.body}
              onChange={(body) => updateDraft(tab.id, (prev) => ({ ...prev, body }))}
            />
          </TabsContent>
        )}
      </Tabs>
    </section>
  );
}
