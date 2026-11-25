import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { SettingsModal } from '@/components/modals/SettingsModal';
import { TooltipProvider } from '@/components/ui/tooltip';
import { setTauriBridgeAdapter } from '@/lib/tauri';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/useSettingsStore';

describe('SettingsModal', () => {
  beforeEach(async () => {
    setTauriBridgeAdapter(null);
    await useSettingsStore.getState().loadSettings({ ...DEFAULT_SETTINGS });
  });

  it('toggles network settings, records custom shortcuts, detects conflicts, and resets', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <SettingsModal open onOpenChange={() => {}} />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('tab', { name: /network/i }));
    const sslSwitch = screen.getByRole('switch', { name: /verify ssl certificates/i });
    await user.click(sslSwitch);
    expect(useSettingsStore.getState().settings.verifySsl).toBe(false);

    await user.click(screen.getByRole('tab', { name: /shortcuts/i }));
    const recordBtn = screen.getByRole('button', { name: /record shortcut for new request tab/i });
    await user.click(recordBtn);
    expect(recordBtn).toHaveTextContent('Press keys…');

    // Trigger conflict with Command Palette (Mod+K)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByText(/already assigned to/i)).toBeInTheDocument();

    // Assign non-conflicting combo Mod+Alt+T
    await user.click(recordBtn);
    fireEvent.keyDown(window, { key: 't', ctrlKey: true, altKey: true });
    expect(useSettingsStore.getState().settings.customShortcuts.newTab).toBe('Mod+Alt+T');

    await user.click(screen.getByRole('button', { name: /reset all/i }));
    expect(useSettingsStore.getState().settings.customShortcuts).toEqual({});
  });
});
