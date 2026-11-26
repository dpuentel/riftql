import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/Toaster';
import { notify, useNotificationStore } from '@/store/useNotificationStore';

describe('Toaster and useNotificationStore', () => {
  beforeEach(() => {
    notify.clear();
  });

  it('renders notifications with actions, deduplicates updates by id, and dismisses cleanly', async () => {
    const user = userEvent.setup();
    const onLater = vi.fn();

    render(<Toaster />);

    act(() => {
      notify.info('Updates available', {
        id: 'remote-sync',
        durationMs: 0,
        description: '2 new commits on main',
        actions: [
          { label: 'Later (30m)', variant: 'secondary', onClick: onLater },
        ],
      });
    });

    expect(screen.getByText('Updates available')).toBeInTheDocument();
    expect(screen.getByText('2 new commits on main')).toBeInTheDocument();

    // Updating same id replaces in-place instead of duplicating
    act(() => {
      notify.info('Updates available', {
        id: 'remote-sync',
        durationMs: 0,
        description: '3 new commits on main',
        actions: [
          { label: 'Later (30m)', variant: 'secondary', onClick: onLater },
        ],
      });
    });

    expect(useNotificationStore.getState().notifications).toHaveLength(1);
    expect(screen.getByText('3 new commits on main')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Later (30m)' }));
    expect(onLater).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('Updates available')).not.toBeInTheDocument();
  });
});
