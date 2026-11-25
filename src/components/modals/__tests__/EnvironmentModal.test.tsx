import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { EnvironmentModal } from '@/components/modals/EnvironmentModal';
import { TooltipProvider } from '@/components/ui/tooltip';
import { setTauriBridgeAdapter } from '@/lib/tauri';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/store/useSettingsStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

describe('EnvironmentModal', () => {
  beforeEach(() => {
    setTauriBridgeAdapter(null);
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS }, isLoaded: true });
    useWorkspaceStore.setState({
      environments: [
        {
          id: 'g1',
          name: 'Global',
          isGlobal: true,
          variables: [
            { id: 'v1', key: 'api_secret', value: 'hidden123', isSecret: true, enabled: true },
          ],
          createdAt: '',
          updatedAt: '',
        },
      ],
    });
  });

  it('masks secrets until revealed and creates + activates custom environments', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider>
        <EnvironmentModal open onOpenChange={() => {}} />
      </TooltipProvider>,
    );

    const valInput = screen.getByLabelText('Variable value') as HTMLInputElement;
    expect(valInput.type).toBe('password');

    await user.click(screen.getByRole('button', { name: /reveal secret/i }));
    expect((screen.getByLabelText('Variable value') as HTMLInputElement).type).toBe('text');

    await user.type(screen.getByLabelText('New environment name'), 'Staging');
    await user.click(screen.getByRole('button', { name: /create environment/i }));

    expect(useWorkspaceStore.getState().environments).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: /set active/i }));
    expect(useSettingsStore.getState().settings.activeEnvironmentId).toBeDefined();
  });
});
