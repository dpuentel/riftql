import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GitRemoteUpdateModal } from '@/components/modals/GitRemoteUpdateModal';
import type { GitRemoteUpdateInfo } from '@/types/storage';

const SAMPLE_UPDATE: GitRemoteUpdateInfo = {
  repoName: 'riftql-workspace',
  branch: 'main',
  remoteUrl: 'https://git.example.com/team/riftql-workspace.git',
  behind: 2,
  ahead: 0,
  changedFiles: 0,
  remoteHead: 'a1b2c3d',
  commits: [
    {
      hash: 'a1b2c3d',
      author: 'Ana',
      message: 'feat(orders): add refund mutation',
      date: '2 minutes ago',
    },
    {
      hash: 'e4f5g6h',
      author: 'Carlos',
      message: 'fix: update staging baseUrl',
      date: '1 hour ago',
    },
  ],
};

describe('GitRemoteUpdateModal', () => {
  it('displays incoming commits and triggers clean fast-forward pull', async () => {
    const user = userEvent.setup();
    const onPull = vi.fn(async () => undefined);
    const onOpenChange = vi.fn();

    render(
      <GitRemoteUpdateModal
        open
        onOpenChange={onOpenChange}
        updateInfo={SAMPLE_UPDATE}
        snoozeMins={30}
        onPull={onPull}
        onSnooze={vi.fn()}
        onMuteSession={vi.fn()}
      />,
    );

    expect(screen.getByText(/Remote Updates in riftql-workspace/i)).toBeInTheDocument();
    expect(screen.getByText('feat(orders): add refund mutation')).toBeInTheDocument();
    expect(screen.getByText('fix: update staging baseUrl')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /pull now/i }));

    await waitFor(() => {
      expect(onPull).toHaveBeenCalledWith(false);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('offers Rebase & Autostash when local changes exist and supports snooze / session mute', async () => {
    const user = userEvent.setup();
    const onPull = vi.fn(async () => undefined);
    const onSnooze = vi.fn();
    const onMuteSession = vi.fn();

    const { rerender } = render(
      <GitRemoteUpdateModal
        open
        onOpenChange={vi.fn()}
        updateInfo={{ ...SAMPLE_UPDATE, changedFiles: 2, ahead: 1 }}
        snoozeMins={30}
        onPull={onPull}
        onSnooze={onSnooze}
        onMuteSession={onMuteSession}
      />,
    );

    expect(screen.getByText(/local changes or unpushed commits detected/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /later \(30m\)/i }));
    expect(onSnooze).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /mute for session/i }));
    expect(onMuteSession).toHaveBeenCalledTimes(1);

    rerender(
      <GitRemoteUpdateModal
        open
        onOpenChange={vi.fn()}
        updateInfo={{ ...SAMPLE_UPDATE, changedFiles: 2, ahead: 1 }}
        snoozeMins={30}
        onPull={onPull}
        onSnooze={onSnooze}
        onMuteSession={onMuteSession}
      />,
    );
    await user.click(screen.getByRole('button', { name: /pull \(rebase & autostash\)/i }));
    expect(onPull).toHaveBeenCalledWith(true);
  });
});
