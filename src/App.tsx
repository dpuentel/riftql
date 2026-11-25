import { TooltipProvider } from '@/components/ui/tooltip';
import { RiftLogo } from '@/components/brand/RiftLogo';
import { ActionTooltip } from '@/components/ui/action-tooltip';
import { Button } from '@/components/ui/button';

export function App() {
  return (
    <TooltipProvider delayDuration={300} disableHoverableContent={false}>
      <main className="flex h-screen w-screen items-center justify-center bg-[var(--bg-base)] text-[var(--text-primary)]">
        <div className="flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-3 text-sm">
          <RiftLogo size={22} />
          <span className="font-medium tracking-tight">RiftQL</span>
          <ActionTooltip label="New Request" shortcut="Ctrl+T">
            <Button size="xs" variant="default">
              Ready
            </Button>
          </ActionTooltip>
        </div>
      </main>
    </TooltipProvider>
  );
}

export default App;
