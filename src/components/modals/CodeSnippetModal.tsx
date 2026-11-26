import * as React from 'react';
import { Check, Code2, Copy } from 'lucide-react';
import { CodeEditor } from '@/components/editor/CodeEditor';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { resolveEffectiveAuth } from '@/lib/auth';
import {
  generateCodeSnippet,
  type CodeSnippetTarget,
} from '@/lib/code-generators';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useTabsStore } from '@/store/useTabsStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

interface CodeSnippetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TARGETS: Array<{ id: CodeSnippetTarget; label: string }> = [
  { id: 'curl', label: 'cURL' },
  { id: 'fetch', label: 'fetch (JS)' },
  { id: 'axios', label: 'axios' },
  { id: 'python-requests', label: 'Python' },
  { id: 'httpie', label: 'HTTPie' },
];

export function CodeSnippetModal({ open, onOpenChange }: CodeSnippetModalProps) {
  const [target, setTarget] = React.useState<CodeSnippetTarget>('curl');
  const [resolveVars, setResolveVars] = React.useState(true);
  const [copied, setCopied] = React.useState(false);

  const tab = useTabsStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const activeEnvironmentId = useSettingsStore((s) => s.settings.activeEnvironmentId);
  const environments = useWorkspaceStore((s) => s.environments);
  const collections = useWorkspaceStore((s) => s.collections);
  const folders = useWorkspaceStore((s) => s.folders);

  const snippet = React.useMemo(() => {
    if (!tab) return '';
    const globalEnv = environments.find((e) => e.isGlobal);
    const activeEnv = activeEnvironmentId
      ? environments.find((e) => e.id === activeEnvironmentId)
      : undefined;
    const collection = tab.collectionId
      ? collections.find((c) => c.id === tab.collectionId)
      : undefined;

    const effective = resolveEffectiveAuth(
      tab.draft.auth,
      tab.folderId,
      tab.collectionId,
      folders,
      collections,
    );

    return generateCodeSnippet(
      target,
      tab.draft,
      {
        globalEnvironment: globalEnv,
        activeEnvironment: activeEnv,
        collectionVariables: collection?.variables,
      },
      {
        resolveVariables: resolveVars,
        effectiveAuth: effective.auth,
      },
    );
  }, [tab, target, resolveVars, environments, activeEnvironmentId, collections, folders]);

  const handleCopy = async () => {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-[var(--accent)]" />
            <span>Copy as Code Snippet</span>
          </DialogTitle>
          <DialogDescription>
            Generate a ready-to-run snippet for your active REST or GraphQL request.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-0.5">
              {TARGETS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTarget(t.id)}
                  className={cn(
                    'cursor-pointer rounded px-2.5 py-1 text-[0.75rem] font-medium transition-colors',
                    target === t.id
                      ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <span>Resolve variables</span>
              <Switch
                aria-label="Resolve variables"
                checked={resolveVars}
                onCheckedChange={setResolveVars}
              />
            </label>
          </div>

          <div className="h-72">
            <CodeEditor
              value={snippet}
              language="text"
              readOnly
              ariaLabel="Generated code snippet"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="default" onClick={() => void handleCopy()}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Snippet'}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
