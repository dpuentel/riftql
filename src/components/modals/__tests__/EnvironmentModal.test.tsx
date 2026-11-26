import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('keeps non-active environment selected when adding and editing variables (and keeps Global selected when active env differs)', async () => {
    const user = userEvent.setup();
    useWorkspaceStore.setState({
      environments: [
        {
          id: 'g1',
          name: 'Global',
          isGlobal: true,
          variables: [],
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'prod-1',
          name: 'Production',
          isGlobal: false,
          variables: [],
          createdAt: '',
          updatedAt: '',
        },
      ],
    });
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, activeEnvironmentId: 'prod-1' },
      isLoaded: true,
    });

    render(
      <TooltipProvider>
        <EnvironmentModal open onOpenChange={() => {}} />
      </TooltipProvider>,
    );

    // Create a brand new non-active environment "QA"
    await user.type(screen.getByLabelText('New environment name'), 'QA');
    await user.click(screen.getByRole('button', { name: /create environment/i }));

    expect(screen.getByLabelText('Environment name')).toHaveValue('QA');

    // Add a variable and edit its key and value while QA is NOT active
    await user.click(screen.getByRole('button', { name: /add variable/i }));
    await user.type(screen.getByLabelText('Variable key'), 'api_host');
    await user.type(screen.getByLabelText('Variable value'), 'https://qa.local');

    // Must remain on QA, NOT jump back to Production or Global
    expect(screen.getByLabelText('Environment name')).toHaveValue('QA');
    const qaEnv = useWorkspaceStore.getState().environments.find((e) => e.name === 'QA');
    expect(qaEnv?.variables).toHaveLength(1);
    expect(qaEnv?.variables[0]).toMatchObject({ key: 'api_host', value: 'https://qa.local' });

    // Switch manually to Global while Production is active, add a variable and type into it
    await user.click(screen.getByRole('button', { name: 'Global' }));
    expect(screen.getByText('Global Environment')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /add variable/i }));
    await user.type(screen.getByLabelText('Variable key'), 'global_key');
    expect(screen.getByText('Global Environment')).toBeInTheDocument();
    const globalEnv = useWorkspaceStore.getState().environments.find((e) => e.isGlobal);
    expect(globalEnv?.variables[0]?.key).toBe('global_key');
  });

  it('exports environments JSON via native Tauri save dialog with secret values stripped', async () => {
    const user = userEvent.setup();
    const saveCalls: Array<{ cmd: string; args?: Record<string, unknown> }> = [];
    const saveFile = vi.fn(async () => 'C:\\temp\\envs.json');

    setTauriBridgeAdapter({
      invoke: async <T,>(cmd: string, args?: Record<string, unknown>) => {
        saveCalls.push({ cmd, args });
        return undefined as T;
      },
      openFile: vi.fn(async () => null),
      saveFile,
    });

    render(
      <TooltipProvider>
        <EnvironmentModal open onOpenChange={() => {}} />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: /export json/i }));
    expect(saveFile).toHaveBeenCalledTimes(1);
    const writeCall = saveCalls.find((c) => c.cmd === 'write_text_file_cmd');
    expect(writeCall?.args?.path).toBe('C:\\temp\\envs.json');

    const parsed = JSON.parse(String(writeCall?.args?.content)) as {
      environments: Array<{ variables: Array<{ key: string; value: string }> }>;
    };
    expect(parsed.environments[0].variables[0]).toMatchObject({ key: 'api_secret', value: '' });
    expect(screen.getByText(/exported environments to C:\\temp\\envs\.json/i)).toBeInTheDocument();
  });

  it('preserves cursor position when typing in the middle of a variable value', async () => {
    const user = userEvent.setup();
    useWorkspaceStore.setState({
      environments: [
        {
          id: 'g1',
          name: 'Global',
          isGlobal: true,
          variables: [
            {
              id: 'v1',
              key: 'endpoint',
              value: 'https://api.example.com',
              isSecret: false,
              enabled: true,
            },
          ],
          createdAt: '',
          updatedAt: '',
        },
      ],
    });

    // Simulate slow async Tauri persistence response to ensure cursor doesn't reset
    setTauriBridgeAdapter({
      invoke: async <T,>(cmd: string, args?: Record<string, unknown>) => {
        if (cmd === 'upsert_environment_cmd') {
          await new Promise((resolve) => setTimeout(resolve, 40));
          return {
            id: args?.id ?? 'g1',
            name: args?.name ?? 'Global',
            isGlobal: Boolean(args?.isGlobal),
            variables: args?.variables ?? [],
            createdAt: '',
            updatedAt: '',
          } as T;
        }
        return undefined as T;
      },
      openFile: vi.fn(async () => null),
      saveFile: vi.fn(async () => null),
    });

    render(
      <TooltipProvider>
        <EnvironmentModal open onOpenChange={() => {}} />
      </TooltipProvider>,
    );

    const valInput = screen.getByLabelText('Variable value') as HTMLInputElement;
    valInput.focus();
    // Place caret right after "https://api" (index 11), before ".example.com"
    valInput.setSelectionRange(11, 11);
    await user.type(valInput, '-v2', {
      initialSelectionStart: 11,
      initialSelectionEnd: 11,
    });

    expect(valInput.value).toBe('https://api-v2.example.com');
    expect(valInput.selectionStart).toBe(14);
    expect(valInput.selectionEnd).toBe(14);
  });

  it('creates a variable across all environments without overwriting existing keys and supports resizing', async () => {
    const user = userEvent.setup();
    useWorkspaceStore.setState({
      environments: [
        {
          id: 'g1',
          name: 'Global',
          isGlobal: true,
          variables: [],
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'dev-1',
          name: 'Dev',
          isGlobal: false,
          variables: [],
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'prod-1',
          name: 'Prod',
          isGlobal: false,
          variables: [
            {
              id: 'p-existing',
              key: 'tenant_id',
              value: 'prod-existing',
              isSecret: false,
              enabled: true,
            },
          ],
          createdAt: '',
          updatedAt: '',
        },
      ],
    });

    render(
      <TooltipProvider>
        <EnvironmentModal open onOpenChange={() => {}} />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: /add to all envs/i }));
    await user.type(screen.getByLabelText('Bulk variable key'), 'tenant_id');
    await user.type(screen.getByLabelText('Bulk variable value'), 'default-tenant');
    await user.click(screen.getByRole('button', { name: 'Create variable across environments' }));

    const envs = useWorkspaceStore.getState().environments;
    const devVar = envs.find((e) => e.id === 'dev-1')?.variables.find((v) => v.key === 'tenant_id');
    const prodVar = envs.find((e) => e.id === 'prod-1')?.variables.find((v) => v.key === 'tenant_id');
    const globalVar = envs.find((e) => e.id === 'g1')?.variables.find((v) => v.key === 'tenant_id');

    expect(devVar?.value).toBe('default-tenant');
    expect(prodVar?.value).toBe('prod-existing');
    expect(globalVar).toBeUndefined();

    // Drag resize handle
    const handle = screen.getByRole('separator', { name: 'Resize dialog' });
    fireEvent.pointerDown(handle, { clientX: 500, clientY: 500 });
    fireEvent.pointerMove(window, { clientX: 580, clientY: 560 });
    fireEvent.pointerUp(window);

    const dialog = screen.getByRole('dialog');
    expect(dialog.style.width).toMatch(/px$/);
    expect(dialog.style.height).toMatch(/px$/);
  });
});
