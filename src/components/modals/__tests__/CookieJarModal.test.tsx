import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { CookieJarModal } from '@/components/modals/CookieJarModal';
import { TooltipProvider } from '@/components/ui/tooltip';
import { setTauriBridgeAdapter } from '@/lib/tauri';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/useSettingsStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

describe('CookieJarModal', () => {
  beforeEach(() => {
    setTauriBridgeAdapter(null);
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, isLoaded: true });
    useWorkspaceStore.setState({
      cookies: [
        {
          id: 'c1',
          domain: 'api.riftql.dev',
          path: '/',
          name: 'session',
          value: 'tok_123',
          httpOnly: true,
          secure: true,
          hostOnly: true,
          updatedAt: '2026-11-25T00:00:00Z',
        },
      ],
    });
  });

  it('toggles automatic cookie sending, adds a cookie, filters, and deletes', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <CookieJarModal open onOpenChange={() => {}} />
      </TooltipProvider>,
    );

    const toggle = screen.getByRole('switch', { name: /enable automatic cookie jar/i });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await user.click(toggle);
    expect(useSettingsStore.getState().settings.sendCookies).toBe(false);

    await user.type(screen.getByLabelText('Cookie domain'), 'auth.local');
    await user.type(screen.getByLabelText('Cookie name'), 'refresh');
    await user.type(screen.getByLabelText('Cookie value'), 'r99');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(useWorkspaceStore.getState().cookies).toHaveLength(2);

    await user.type(screen.getByLabelText('Filter cookies'), 'auth.local');
    expect(screen.queryByText('api.riftql.dev')).not.toBeInTheDocument();
    expect(screen.getByText('auth.local')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /delete cookie refresh/i }));
    expect(useWorkspaceStore.getState().cookies).toHaveLength(1);
  });
});
