import * as React from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useTabsStore } from '@/store/useTabsStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

export function App() {
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace);
  const loadSessionTabs = useTabsStore((s) => s.loadSessionTabs);

  React.useEffect(() => {
    void (async () => {
      await loadWorkspace();
      await loadSessionTabs();
    })();
  }, [loadWorkspace, loadSessionTabs]);

  return (
    <TooltipProvider delayDuration={300} disableHoverableContent={false}>
      <AppShell />
    </TooltipProvider>
  );
}

export default App;
