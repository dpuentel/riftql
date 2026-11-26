import * as React from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  Loader2,
  Search,
  ShieldAlert,
  Square,
} from 'lucide-react';
import { ResponseBodyViewer } from '@/components/response/ResponseBodyViewer';
import { ResponseCookiesTable } from '@/components/response/ResponseCookiesTable';
import { ActionTooltip } from '@/components/ui/action-tooltip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  formatBytes,
  formatDuration,
  getStatusBadgeClasses,
} from '@/lib/format';
import { formatShortcutForDisplay, getEffectiveShortcuts } from '@/lib/shortcuts';
import { invokeCommand, pickSaveFile } from '@/lib/tauri';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useTabsStore } from '@/store/useTabsStore';

interface ResponsePaneProps {
  onOpenCookieJar?: () => void;
}

export function ResponsePane({ onOpenCookieJar }: ResponsePaneProps) {
  const tab = useTabsStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const cancelTabRequest = useTabsStore((s) => s.cancelTabRequest);
  const updateDraft = useTabsStore((s) => s.updateDraft);
  const sendTabRequest = useTabsStore((s) => s.sendTabRequest);
  const customShortcuts = useSettingsStore((s) => s.settings.customShortcuts);

  const [activeTab, setActiveTab] = React.useState('body');
  const [headerFilter, setHeaderFilter] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const [elapsedMs, setElapsedMs] = React.useState(0);

  React.useEffect(() => {
    if (!tab?.isLoading || !tab.startedAtMs) {
      setElapsedMs(0);
      return;
    }
    const start = tab.startedAtMs;
    setElapsedMs(Math.max(0, Date.now() - start));
    const timer = setInterval(() => {
      setElapsedMs(Math.max(0, Date.now() - start));
    }, 50);
    return () => clearInterval(timer);
  }, [tab?.isLoading, tab?.startedAtMs]);

  if (!tab) return null;

  const sendShortcut = formatShortcutForDisplay(
    getEffectiveShortcuts(customShortcuts).sendRequest,
  );

  const handleCopyBody = async () => {
    if (!tab.response?.bodyText) return;
    try {
      await navigator.clipboard.writeText(tab.response.bodyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable
    }
  };

  const handleSaveToFile = async () => {
    if (!tab.response) return;
    const defaultName = `response-${tab.response.status}.txt`;
    const targetPath = await pickSaveFile({
      title: 'Save response body',
      defaultPath: defaultName,
    });
    if (targetPath) {
      await invokeCommand('save_response_body_to_file_cmd', {
        responseId: tab.response.responseId,
        targetPath,
      });
    }
  };

  if (tab.isLoading) {
    return (
      <section
        aria-label="Response viewer"
        className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--bg-base)] p-6"
      >
        <div className="flex items-center gap-2 text-xs text-[var(--text-primary)]">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
          <span>Sending request…</span>
          <span className="font-mono-code text-[var(--text-secondary)] tabular-nums">
            {formatDuration(elapsedMs)}
          </span>
        </div>
        <ActionTooltip label="Cancel In-Flight Request" actionId="cancelRequest">
          <Button
            size="sm"
            variant="destructive"
            onClick={() => void cancelTabRequest(tab.id)}
          >
            <Square className="h-3 w-3 fill-current" />
            <span>Cancel</span>
          </Button>
        </ActionTooltip>
      </section>
    );
  }

  if (tab.error) {
    const isSslError = /(ssl|tls|cert|certificate|self signed)/i.test(
      tab.error.message,
    );
    return (
      <section
        aria-label="Response viewer"
        className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--bg-base)] p-6"
      >
        <div className="flex max-w-md flex-col items-center gap-2.5 rounded-lg border border-[#DC2626]/30 bg-[#DC2626]/5 p-5 text-center">
          <AlertCircle className="h-6 w-6 text-[#DC2626] dark:text-[#F87171]" />
          <div className="text-xs font-semibold text-[var(--text-primary)]">
            {tab.error.code || 'REQUEST_FAILED'}
          </div>
          <p className="font-mono-code text-[0.75rem] break-all text-[var(--text-secondary)]">
            {tab.error.message}
          </p>
          {isSslError && tab.draft.settings.verifySsl !== false && (
            <Button
              size="xs"
              variant="secondary"
              onClick={() => {
                updateDraft(tab.id, (prev) => ({
                  ...prev,
                  settings: { ...prev.settings, verifySsl: false },
                }));
                void sendTabRequest(tab.id);
              }}
            >
              <ShieldAlert className="h-3 w-3" />
              <span>Disable SSL Verification & Retry</span>
            </Button>
          )}
        </div>
      </section>
    );
  }

  if (!tab.response) {
    return (
      <section
        aria-label="Response viewer"
        className="flex h-full flex-col items-center justify-center gap-2 bg-[var(--bg-base)] p-6 text-center"
      >
        <div className="text-xs font-medium text-[var(--text-secondary)]">
          No response yet.
        </div>
        <div className="text-[0.75rem] text-[var(--text-tertiary)]">
          Press{' '}
          <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1.5 py-0.5 font-mono-code text-[0.6875rem] text-[var(--text-secondary)]">
            {sendShortcut}
          </kbd>{' '}
          to send the request.
        </div>
      </section>
    );
  }

  const { response } = tab;
  const filteredHeaders = response.headers.filter((h) => {
    const q = headerFilter.trim().toLowerCase();
    if (!q) return true;
    return h.key.toLowerCase().includes(q) || h.value.toLowerCase().includes(q);
  });

  return (
    <section
      aria-label="Response viewer"
      className="flex h-full min-h-0 flex-col bg-[var(--bg-base)]"
    >
      {/* Metrics & Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 tabular-nums">
          <span
            className={cn(
              'inline-flex items-center rounded border px-2 py-0.5 font-mono-code text-xs font-semibold',
              getStatusBadgeClasses(response.status),
            )}
          >
            {response.status} {response.statusText}
          </span>
          <span className="font-mono-code text-xs text-[var(--text-secondary)]">
            {formatDuration(response.durationMs)}
          </span>
          <span className="font-mono-code text-xs text-[var(--text-secondary)]">
            {formatBytes(response.sizeBytes)}
          </span>
          {response.redirectCount > 0 && (
            <Badge variant="default" className="tabular-nums">
              {response.redirectCount} redirect{response.redirectCount > 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          {response.bodyText !== undefined && (
            <ActionTooltip label="Copy Response Body">
              <Button size="xs" variant="ghost" onClick={() => void handleCopyBody()}>
                {copied ? (
                  <Check className="h-3 w-3 text-[#34D399]" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </Button>
            </ActionTooltip>
          )}
          <ActionTooltip label="Save Response to File">
            <Button size="xs" variant="ghost" onClick={() => void handleSaveToFile()}>
              <Download className="h-3 w-3" />
              <span>Save</span>
            </Button>
          </ActionTooltip>
        </div>
      </div>

      {/* Response Sub-tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList>
          <TabsTrigger value="body">Body</TabsTrigger>
          <TabsTrigger value="headers">
            <span>Headers</span>
            <Badge className="tabular-nums">{response.headers.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="cookies">
            <span>Cookies</span>
            {response.cookies.length > 0 && (
              <Badge variant="accent" className="tabular-nums">
                {response.cookies.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="body" className="flex min-h-0 flex-col p-3">
          <ResponseBodyViewer
            response={response}
            onSaveToFile={() => void handleSaveToFile()}
          />
        </TabsContent>

        <TabsContent value="headers" className="flex min-h-0 flex-col gap-2 overflow-auto p-3 rift-scroll">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1.5 left-2.5 h-3.5 w-3.5 text-[var(--text-secondary)]" />
            <Input
              value={headerFilter}
              onChange={(e) => setHeaderFilter(e.target.value)}
              placeholder="Filter response headers..."
              aria-label="Filter response headers"
              className="pl-8"
            />
          </div>
          <div className="overflow-auto rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] rift-scroll">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 text-[0.75rem] font-medium text-[var(--text-secondary)]">
                  <th className="w-1/3 px-2.5 py-1.5">Header</th>
                  <th className="px-2.5 py-1.5">Value</th>
                </tr>
              </thead>
              <tbody>
                {filteredHeaders.map((h, i) => (
                  <tr
                    key={`${h.key}-${i}`}
                    className="border-b border-[var(--border-subtle)]/70 last:border-b-0 hover:bg-[var(--bg-hover)]"
                  >
                    <td className="px-2.5 py-1.5 font-mono-code font-medium text-[var(--text-primary)]">
                      {h.key}
                    </td>
                    <td className="px-2.5 py-1.5 font-mono-code break-all text-[var(--text-secondary)]">
                      {h.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="cookies" className="overflow-auto p-3 rift-scroll">
          <ResponseCookiesTable
            cookies={response.cookies}
            onOpenCookieJar={onOpenCookieJar}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
