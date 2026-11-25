import * as React from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { CodeSnippetModal } from '@/components/modals/CodeSnippetModal';
import { ImportCurlModal } from '@/components/modals/ImportCurlModal';
import { TooltipProvider } from '@/components/ui/tooltip';
import { isCurlCommand, parseCurlCommand } from '@/lib/curl-parser';
import { useTabsStore } from '@/store/useTabsStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

export function App() {
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace);
  const loadSessionTabs = useTabsStore((s) => s.loadSessionTabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const updateDraft = useTabsStore((s) => s.updateDraft);

  const [importCurlOpen, setImportCurlOpen] = React.useState(false);
  const [codeSnippetOpen, setCodeSnippetOpen] = React.useState(false);
  const [toastMsg, setToastMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    void (async () => {
      await loadWorkspace();
      await loadSessionTabs();
    })();
  }, [loadWorkspace, loadSessionTabs]);

  const showToast = React.useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 2600);
  }, []);

  const handlePasteCurlInUrl = React.useCallback(
    (pasted: string): boolean => {
      if (!isCurlCommand(pasted)) return false;
      try {
        const parsed = parseCurlCommand(pasted);
        updateDraft(activeTabId, () => parsed);
        showToast('Imported cURL command into active tab.');
        return true;
      } catch {
        return false;
      }
    },
    [activeTabId, updateDraft, showToast],
  );

  return (
    <TooltipProvider delayDuration={300} disableHoverableContent={false}>
      <AppShell
        importCurlOpen={importCurlOpen}
        setImportCurlOpen={setImportCurlOpen}
        codeSnippetOpen={codeSnippetOpen}
        setCodeSnippetOpen={setCodeSnippetOpen}
        onPasteCurlInUrl={handlePasteCurlInUrl}
        extraModals={
          <>
            <ImportCurlModal open={importCurlOpen} onOpenChange={setImportCurlOpen} />
            <CodeSnippetModal open={codeSnippetOpen} onOpenChange={setCodeSnippetOpen} />
            {toastMsg && (
              <div
                role="status"
                aria-live="polite"
                className="pointer-events-none fixed right-4 bottom-4 z-50 rounded-md border border-[var(--accent)]/40 bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-primary)] shadow-lg"
              >
                {toastMsg}
              </div>
            )}
          </>
        }
      />
    </TooltipProvider>
  );
}

export default App;
