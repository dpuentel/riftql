import * as React from 'react';
import { AlertTriangle, Download, FileArchive } from 'lucide-react';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  detectContentLanguage,
  formatBytes,
  prettyPrintBody,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import type { HttpExecutionResponse } from '@/types/api';

interface ResponseBodyViewerProps {
  response: HttpExecutionResponse;
  onSaveToFile: () => void;
}

export function ResponseBodyViewer({
  response,
  onSaveToFile,
}: ResponseBodyViewerProps) {
  const [viewMode, setViewMode] = React.useState<'pretty' | 'raw'>('pretty');
  const language = React.useMemo(
    () => detectContentLanguage(response.contentType, response.bodyText),
    [response.contentType, response.bodyText],
  );

  if (response.bodyKind === 'image' && response.bodyBase64) {
    const mime = (response.contentType || 'image/png').split(';')[0].trim();
    const dataUrl = `data:${mime};base64,${response.bodyBase64}`;
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="accent">{mime}</Badge>
            <span className="font-mono-code text-[11px] text-[var(--text-secondary)] tabular-nums">
              {formatBytes(response.sizeBytes)}
            </span>
          </div>
          <Button size="xs" variant="secondary" onClick={onSaveToFile}>
            <Download className="h-3 w-3" />
            <span>Save Image</span>
          </Button>
        </div>
        <div className="rift-checkerboard flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-md border border-[var(--border-subtle)] p-4">
          <img
            src={dataUrl}
            alt="Response preview"
            className="max-h-full max-w-full rounded object-contain shadow"
          />
        </div>
      </div>
    );
  }

  if (response.bodyKind === 'binary') {
    const mime = response.contentType || 'application/octet-stream';
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-center">
          <FileArchive className="h-8 w-8 text-[var(--accent)]" />
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              Binary Response Payload
            </span>
            <span className="font-mono-code text-[11px] text-[var(--text-secondary)] tabular-nums">
              {mime} • {formatBytes(response.sizeBytes)}
            </span>
          </div>
          <Button variant="default" size="sm" onClick={onSaveToFile}>
            <Download className="h-3.5 w-3.5" />
            <span>Save File to Disk</span>
          </Button>
        </div>
      </div>
    );
  }

  if (response.bodyKind === 'large-text') {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#FBBF24]/30 bg-[#FBBF24]/10 px-3 py-2 text-xs text-[#D97706] dark:text-[#FBBF24]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>
              Response exceeds 5 MB ({formatBytes(response.sizeBytes)}) — showing first 250 KB in
              lightweight mode.
            </span>
          </div>
          <Button size="xs" variant="secondary" onClick={onSaveToFile}>
            <Download className="h-3 w-3" />
            <span>Save Full Response</span>
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <CodeEditor
            value={response.bodyText ?? ''}
            language="text"
            readOnly
            lightweight
            ariaLabel="Large response preview"
          />
        </div>
      </div>
    );
  }

  const rawText = response.bodyText ?? '';
  const displayText =
    viewMode === 'pretty' ? prettyPrintBody(rawText, language) : rawText;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('pretty')}
            className={cn(
              'cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
              viewMode === 'pretty'
                ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            )}
          >
            Pretty
          </button>
          <button
            type="button"
            onClick={() => setViewMode('raw')}
            className={cn(
              'cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
              viewMode === 'raw'
                ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            )}
          >
            Raw
          </button>
        </div>

        <Badge className="uppercase">{language}</Badge>
      </div>

      <div className="min-h-0 flex-1">
        <CodeEditor
          value={displayText}
          language={viewMode === 'pretty' ? language : 'text'}
          readOnly
          ariaLabel="Response body viewer"
        />
      </div>
    </div>
  );
}
