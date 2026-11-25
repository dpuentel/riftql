import * as React from 'react';
import { Import } from 'lucide-react';
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
import { parseCurlCommand } from '@/lib/curl-parser';
import { getMethodBadgeClasses } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useTabsStore } from '@/store/useTabsStore';
import type { RequestDraft } from '@/types/api';

interface ImportCurlModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportCurlModal({ open, onOpenChange }: ImportCurlModalProps) {
  const newTab = useTabsStore((s) => s.newTab);
  const [raw, setRaw] = React.useState('');

  React.useEffect(() => {
    if (open) setRaw('');
  }, [open]);

  const parsed = React.useMemo<{ draft?: RequestDraft; error?: string }>(() => {
    if (!raw.trim()) return {};
    try {
      return { draft: parseCurlCommand(raw) };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : 'Unable to parse cURL command.',
      };
    }
  }, [raw]);

  const handleImport = () => {
    if (!parsed.draft) return;
    newTab(parsed.draft.protocol, parsed.draft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Import className="h-4 w-4 text-[var(--accent)]" />
            <span>Import cURL Command</span>
          </DialogTitle>
          <DialogDescription>
            Paste any <code className="font-mono-code">curl</code> command (tip: you can also paste
            it straight into the URL bar).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <textarea
            autoFocus
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={`curl -X POST https://api.example.com/graphql \\\n  -H 'Content-Type: application/json' \\\n  -d '{"query":"{ health }"}'`}
            aria-label="cURL command input"
            rows={7}
            className="w-full resize-y rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2.5 font-mono-code text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none"
          />

          {parsed.error && (
            <div className="rounded-md border border-[#F87171]/30 bg-[#F87171]/10 px-3 py-2 text-xs text-[#DC2626] dark:text-[#F87171]">
              {parsed.error}
            </div>
          )}

          {parsed.draft && (
            <div className="flex flex-col gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'rounded border px-1.5 py-0.5 font-mono-code text-[10px] font-semibold',
                    getMethodBadgeClasses(
                      parsed.draft.protocol === 'graphql' ? 'GQL' : parsed.draft.method,
                    ),
                  )}
                >
                  {parsed.draft.protocol === 'graphql' ? 'GQL' : parsed.draft.method}
                </span>
                <span className="truncate font-mono-code text-[var(--text-primary)]">
                  {parsed.draft.url}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{parsed.draft.headers.length} headers</Badge>
                <Badge>{parsed.draft.params.length} params</Badge>
                <Badge variant="accent">Body: {parsed.draft.body.mode}</Badge>
                {parsed.draft.auth.type !== 'none' && (
                  <Badge variant="success">Auth: {parsed.draft.auth.type}</Badge>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="default"
            disabled={!parsed.draft}
            onClick={handleImport}
          >
            Import into New Tab
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
