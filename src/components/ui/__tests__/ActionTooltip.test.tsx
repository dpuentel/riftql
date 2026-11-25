import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ActionTooltip } from '@/components/ui/action-tooltip';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { setTauriBridgeAdapter } from '@/lib/tauri';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/useSettingsStore';

describe('ActionTooltip', () => {
  beforeEach(async () => {
    setTauriBridgeAdapter(null);
    await act(async () => {
      await useSettingsStore.getState().loadSettings({ ...DEFAULT_SETTINGS });
    });
  });

  it('sets native title with live shortcut and updates dynamically when customized', async () => {
    render(
      <TooltipProvider>
        <ActionTooltip label="Send Request" actionId="sendRequest">
          <Button>Send</Button>
        </ActionTooltip>
      </TooltipProvider>,
    );

    const btn = screen.getByRole('button', { name: 'Send' });
    expect(btn.getAttribute('title')).toMatch(/^Send Request \((Ctrl\+Enter|⌘↵)\)$/);

    await act(async () => {
      await useSettingsStore.getState().setShortcut('sendRequest', 'Mod+Shift+S');
    });

    expect(btn.getAttribute('title')).toMatch(/^Send Request \((Ctrl\+Shift\+S|⌘⇧S)\)$/);
  });
});
