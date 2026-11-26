import * as React from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  BellOff,
  Clock,
  GitBranch,
  GitCommit,
  Settings,
} from 'lucide-react';
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
import type { GitRemoteUpdateInfo } from '@/types/storage';

export interface GitRemoteUpdateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  updateInfo: GitRemoteUpdateInfo | null;
  snoozeMins: number;
  onPull: (rebase: boolean) => Promise<void>;
  onSnooze: () => void;
  onMuteSession: () => void;
  onOpenGitSettings?: () => void;
}

export function GitRemoteUpdateModal({
  open,
  onOpenChange,
  updateInfo,
  snoozeMins,
  onPull,
  onSnooze,
  onMuteSession,
  onOpenGitSettings,
}: GitRemoteUpdateModalProps) {
  const [pulling, setPulling] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setPulling(false);
      setErrorMsg(null);
    }
  }, [open, updateInfo?.remoteHead]);

  if (!updateInfo) {
    return null;
  }

  const hasLocalDivergence = updateInfo.changedFiles > 0 || updateInfo.ahead > 0;

  const runPull = async (rebase: boolean) => {
    setPulling(true);
    setErrorMsg(null);
    try {
      await onPull(rebase);
      onOpenChange(false);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Git pull failed.',
      );
    } finally {
      setPulling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <GitBranch className="h-4 w-4 text-[var(--accent)]" />
            <span>Remote Updates in {updateInfo.repoName}</span>
            <Badge variant="accent" className="font-mono-code tabular-nums">
              ↓{updateInfo.behind} on {updateInfo.branch}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            New commits are available on the remote repository. Pull now to sync your collections,
            folders, requests, and non-secret environments (your local secrets remain untouched).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {updateInfo.remoteUrl && (
            <div className="truncate rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2.5 py-1.5 font-mono-code text-[0.75rem] text-[var(--text-secondary)]">
              {updateInfo.remoteUrl}
            </div>
          )}

          {updateInfo.commits.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Incoming Commits
              </span>
              <div className="max-h-52 overflow-y-auto rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-1.5 rift-scroll">
                <div className="flex flex-col gap-1">
                  {updateInfo.commits.map((commit, idx) => (
                    <div
                      key={`${commit.hash}-${idx}`}
                      className="flex items-start gap-2 rounded px-2 py-1.5 text-xs hover:bg-[var(--bg-hover)]"
                    >
                      <GitCommit className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-medium text-[var(--text-primary)]">
                            {commit.message}
                          </span>
                          <span className="shrink-0 font-mono-code text-[0.6875rem] text-[var(--text-tertiary)]">
                            {commit.hash}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[0.6875rem] text-[var(--text-secondary)]">
                          <span>{commit.author}</span>
                          {commit.date && <span>· {commit.date}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {hasLocalDivergence && (
            <div className="flex items-start gap-2 rounded-md border border-[#FBBF24]/40 bg-[#FBBF24]/10 px-3 py-2 text-xs text-[#B45309] dark:text-[#FBBF24]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex flex-col gap-1">
                <span className="font-medium">Local changes or unpushed commits detected</span>
                <span className="text-[0.75rem] opacity-90">
                  Working tree has {updateInfo.changedFiles} uncommitted file(s) and{' '}
                  {updateInfo.ahead} unpushed commit(s). Use{' '}
                  <strong>Pull (Rebase &amp; Autostash)</strong> or review in Git Sync settings.
                </span>
              </div>
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-[#F87171]/40 bg-[#F87171]/10 px-3 py-2 text-xs text-[#DC2626] dark:text-[#F87171]"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={pulling}
              onClick={() => {
                onMuteSession();
                onOpenChange(false);
              }}
            >
              <BellOff className="h-3 w-3" />
              <span>Mute for Session</span>
            </Button>
            {onOpenGitSettings && (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={pulling}
                onClick={() => {
                  onOpenChange(false);
                  onOpenGitSettings();
                }}
              >
                <Settings className="h-3 w-3" />
                <span>Git Settings</span>
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pulling}
              onClick={() => {
                onSnooze();
                onOpenChange(false);
              }}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>Later ({snoozeMins}m)</span>
            </Button>
            {hasLocalDivergence ? (
              <Button
                type="button"
                size="sm"
                variant="default"
                disabled={pulling}
                onClick={() => void runPull(true)}
              >
                <ArrowDownToLine className="h-3.5 w-3.5" />
                <span>{pulling ? 'Pulling…' : 'Pull (Rebase & Autostash)'}</span>
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="default"
                disabled={pulling}
                onClick={() => void runPull(false)}
              >
                <ArrowDownToLine className="h-3.5 w-3.5" />
                <span>{pulling ? 'Pulling…' : 'Pull Now'}</span>
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
