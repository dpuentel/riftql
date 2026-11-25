import * as React from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { CodeSnippetModal } from '@/components/modals/CodeSnippetModal';
import { CommandPalette } from '@/components/modals/CommandPalette';
import { ImportCurlModal } from '@/components/modals/ImportCurlModal';
import { SettingsModal } from '@/components/modals/SettingsModal';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import { isCurlCommand, parseCurlCommand } from '@/lib/curl-parser';
import { formatGraphQL } from '@/lib/graphql';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useTabsStore } from '@/store/useTabsStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

export function App() {
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace);
  const upsertSavedRequest = useWorkspaceStore((s) => s.upsertSavedRequest);

  const loadSessionTabs = useTabsStore((s) => s.loadSessionTabs);
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const newTab = useTabsStore((s) => s.newTab);
  const closeTab = useTabsStore((s) => s.closeTab);
  const nextTab = useTabsStore((s) => s.nextTab);
  const prevTab = useTabsStore((s) => s.prevTab);
  const updateDraft = useTabsStore((s) => s.updateDraft);
  const markTabSaved = useTabsStore((s) => s.markTabSaved);
  const sendTabRequest = useTabsStore((s) => s.sendTabRequest);
  const cancelTabRequest = useTabsStore((s) => s.cancelTabRequest);

  const toggleTheme = useSettingsStore((s) => s.toggleTheme);
  const toggleLayout = useSettingsStore((s) => s.toggleLayout);

  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [importCurlOpen, setImportCurlOpen] = React.useState(false);
  const [codeSnippetOpen, setCodeSnippetOpen] = React.useState(false);
  const [envOpen, setEnvOpen] = React.useState(false);
  const [cookiesOpen, setCookiesOpen] = React.useState(false);
  const [saveModalTabId, setSaveModalTabId] = React.useState<string | null>(null);
  const [createCollectionTrigger, setCreateCollectionTrigger] = React.useState(0);
  const [recordingShortcut, setRecordingShortcut] = React.useState(false);
  const [toastMsg, setToastMsg] = React.useState<string | null>(null);
  const urlInputRef = React.useRef<HTMLInputElement | null>(null);

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

  const handleFormatActiveBody = React.useCallback(() => {
    const active = tabs.find((t) => t.id === activeTabId);
    if (!active) return;
    if (active.draft.protocol === 'graphql') {
      try {
        const formatted = formatGraphQL(active.draft.graphql.query);
        updateDraft(active.id, (prev) => ({
          ...prev,
          graphql: { ...prev.graphql, query: formatted },
        }));
      } catch {
        // Ignore invalid GraphQL syntax while editing
      }
      return;
    }
    if (active.draft.body.mode === 'json') {
      try {
        const formatted = JSON.stringify(JSON.parse(active.draft.body.content), null, 2);
        updateDraft(active.id, (prev) => ({
          ...prev,
          body: { mode: 'json', content: formatted },
        }));
      } catch {
        // Ignore invalid JSON
      }
    }
  }, [tabs, activeTabId, updateDraft]);

  const handleSaveActiveTab = React.useCallback(async () => {
    const active = tabs.find((t) => t.id === activeTabId);
    if (!active) return;
    if (active.savedRequestId && active.collectionId) {
      const saved = await upsertSavedRequest({
        id: active.savedRequestId,
        collectionId: active.collectionId,
        folderId: active.folderId,
        draft: active.draft,
      });
      markTabSaved(active.id, saved);
      showToast('Request saved.');
    } else {
      setSaveModalTabId(active.id);
    }
  }, [tabs, activeTabId, upsertSavedRequest, markTabSaved, showToast]);

  useGlobalShortcuts(
    {
      sendRequest: () => void sendTabRequest(activeTabId),
      cancelRequest: () => void cancelTabRequest(activeTabId),
      newTab: () => newTab('rest'),
      closeTab: () => closeTab(activeTabId),
      nextTab: () => nextTab(),
      prevTab: () => prevTab(),
      saveRequest: () => void handleSaveActiveTab(),
      commandPalette: () => setCommandPaletteOpen((v) => !v),
      focusUrl: () => {
        urlInputRef.current?.focus();
        urlInputRef.current?.select();
      },
      toggleSidebar: () => setSidebarOpen((v) => !v),
      toggleLayout: () => void toggleLayout(),
      toggleTheme: () => void toggleTheme(),
      formatBody: handleFormatActiveBody,
      openSettings: () => setSettingsOpen(true),
      openCodeSnippet: () => setCodeSnippetOpen(true),
      importCurl: () => setImportCurlOpen(true),
      openCookies: () => setCookiesOpen(true),
      openEnvironments: () => setEnvOpen(true),
      newCollection: () => {
        setSidebarOpen(true);
        setCreateCollectionTrigger((n) => n + 1);
      },
    },
    { paused: recordingShortcut },
  );

  return (
    <TooltipProvider delayDuration={300} disableHoverableContent={false}>
      <AppShell
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        commandPaletteOpen={commandPaletteOpen}
        setCommandPaletteOpen={setCommandPaletteOpen}
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
        importCurlOpen={importCurlOpen}
        setImportCurlOpen={setImportCurlOpen}
        codeSnippetOpen={codeSnippetOpen}
        setCodeSnippetOpen={setCodeSnippetOpen}
        envOpen={envOpen}
        setEnvOpen={setEnvOpen}
        cookiesOpen={cookiesOpen}
        setCookiesOpen={setCookiesOpen}
        saveModalTabId={saveModalTabId}
        setSaveModalTabId={setSaveModalTabId}
        createCollectionTrigger={createCollectionTrigger}
        urlInputRef={urlInputRef}
        onPasteCurlInUrl={handlePasteCurlInUrl}
        extraModals={
          <>
            <ImportCurlModal open={importCurlOpen} onOpenChange={setImportCurlOpen} />
            <CodeSnippetModal open={codeSnippetOpen} onOpenChange={setCodeSnippetOpen} />
            <CommandPalette
              open={commandPaletteOpen}
              onOpenChange={setCommandPaletteOpen}
              onSendRequest={() => void sendTabRequest(activeTabId)}
              onFormatBody={handleFormatActiveBody}
              onImportCurl={() => setImportCurlOpen(true)}
              onOpenCodeSnippet={() => setCodeSnippetOpen(true)}
              onToggleSidebar={() => setSidebarOpen((v) => !v)}
              onOpenCookies={() => setCookiesOpen(true)}
              onOpenEnvironments={() => setEnvOpen(true)}
              onOpenSettings={() => setSettingsOpen(true)}
              onNewCollection={() => {
                setSidebarOpen(true);
                setCreateCollectionTrigger((n) => n + 1);
              }}
            />
            <SettingsModal
              open={settingsOpen}
              onOpenChange={setSettingsOpen}
              onRecordingChange={setRecordingShortcut}
            />
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
