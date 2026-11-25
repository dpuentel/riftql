import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { KeyValueEditor } from '@/components/request/KeyValueEditor';
import { TooltipProvider } from '@/components/ui/tooltip';
import { setTauriBridgeAdapter } from '@/lib/tauri';
import type { FormDataItem, KeyValueItem } from '@/types/api';

describe('KeyValueEditor', () => {
  it('adds, edits, toggles, and removes key-value rows', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const items: KeyValueItem[] = [
      { id: '1', key: 'Accept', value: 'application/json', enabled: true },
    ];

    render(
      <TooltipProvider>
        <KeyValueEditor items={items} onChange={onChange} />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: /add row/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as KeyValueItem[];
    expect(next).toHaveLength(2);

    await user.click(screen.getByRole('checkbox', { name: /enable accept/i }));
    expect(onChange.mock.calls[1][0][0].enabled).toBe(false);

    await user.click(screen.getByRole('button', { name: /remove row/i }));
    expect(onChange.mock.calls[2][0]).toHaveLength(0);
  });

  it('picks local files in form-data file mode via Tauri dialog bridge', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    setTauriBridgeAdapter({
      invoke: vi.fn(),
      openFile: vi.fn(async () => 'C:\\tmp\\avatar.png'),
      saveFile: vi.fn(async () => null),
    });

    const items: FormDataItem[] = [
      { id: 'f1', key: 'avatar', value: '', itemType: 'file', enabled: true },
    ];

    render(
      <TooltipProvider>
        <KeyValueEditor items={items} allowFile onChange={onChange} />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: /choose file/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0]).toMatchObject({
      filePath: 'C:\\tmp\\avatar.png',
      fileName: 'avatar.png',
    });
    setTauriBridgeAdapter(null);
  });
});
