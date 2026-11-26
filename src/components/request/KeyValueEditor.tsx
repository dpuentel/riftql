import { FileUp, Plus, Trash2 } from 'lucide-react';
import { nanoid } from 'nanoid';
import { ActionTooltip } from '@/components/ui/action-tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { pickOpenFile } from '@/lib/tauri';
import type { FormDataItem, KeyValueItem } from '@/types/api';

type RowItem = KeyValueItem | FormDataItem;

interface KeyValueEditorProps<T extends RowItem> {
  items: T[];
  onChange: (next: T[]) => void;
  allowFile?: boolean;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  emptyHint?: string;
}

function isFormItem(item: RowItem): item is FormDataItem {
  return 'itemType' in item;
}

function getFileBaseName(fullPath: string): string {
  const parts = fullPath.split(/[/\\]/);
  return parts[parts.length - 1] || fullPath;
}

export function KeyValueEditor<T extends RowItem>({
  items,
  onChange,
  allowFile = false,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  emptyHint = 'No entries yet.',
}: KeyValueEditorProps<T>) {
  const addRow = () => {
    const newRow = allowFile
      ? ({
          id: nanoid(),
          key: '',
          value: '',
          itemType: 'text',
          enabled: true,
        } as unknown as T)
      : ({
          id: nanoid(),
          key: '',
          value: '',
          description: '',
          enabled: true,
        } as unknown as T);
    onChange([...items, newRow]);
  };

  const updateRow = (id: string, patch: Partial<T>) => {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeRow = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  const handleChooseFile = async (item: FormDataItem) => {
    const selected = await pickOpenFile({ title: 'Select form-data attachment' });
    if (!selected) return;
    updateRow(item.id, {
      itemType: 'file',
      filePath: selected,
      fileName: getFileBaseName(selected),
    } as unknown as Partial<T>);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 text-[0.75rem] font-medium text-[var(--text-secondary)]">
              <th className="w-8 px-2 py-1.5 text-center">On</th>
              <th className="px-2 py-1.5">Key</th>
              {allowFile && <th className="w-24 px-2 py-1.5">Type</th>}
              <th className="px-2 py-1.5">Value</th>
              <th className="w-9 px-1 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={allowFile ? 5 : 4}
                  className="px-3 py-4 text-center text-xs text-[var(--text-secondary)]"
                >
                  {emptyHint}
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const formItem = isFormItem(item);
                return (
                  <tr
                    key={item.id}
                    className="border-b border-[var(--border-subtle)]/70 last:border-b-0 hover:bg-[var(--bg-hover)]"
                  >
                    <td className="px-2 py-1 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Enable ${item.key || 'row'}`}
                        checked={item.enabled}
                        onChange={(e) =>
                          updateRow(item.id, { enabled: e.target.checked } as Partial<T>)
                        }
                        className="h-3.5 w-3.5 cursor-pointer rounded accent-[var(--accent)]"
                      />
                    </td>
                    <td className="px-1.5 py-1">
                      <Input
                        value={item.key}
                        placeholder={keyPlaceholder}
                        aria-label="Key"
                        onChange={(e) =>
                          updateRow(item.id, { key: e.target.value } as Partial<T>)
                        }
                        className="h-6 border-transparent bg-transparent font-mono-code focus:border-[var(--accent)] focus:bg-[var(--bg-base)]"
                      />
                    </td>
                    {allowFile && formItem && (
                      <td className="px-1.5 py-1">
                        <select
                          aria-label="Field type"
                          value={item.itemType}
                          onChange={(e) =>
                            updateRow(item.id, {
                              itemType: e.target.value as 'text' | 'file',
                            } as unknown as Partial<T>)
                          }
                          className="h-6 w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1.5 text-[0.75rem] text-[var(--text-primary)]"
                        >
                          <option value="text">Text</option>
                          <option value="file">File</option>
                        </select>
                      </td>
                    )}
                    <td className="px-1.5 py-1">
                      {allowFile && formItem && item.itemType === 'file' ? (
                        <div className="flex items-center gap-2">
                          <Button
                            size="xs"
                            variant="secondary"
                            onClick={() => void handleChooseFile(item)}
                          >
                            <FileUp className="h-3 w-3" />
                            <span>{item.fileName || 'Choose file...'}</span>
                          </Button>
                          {item.filePath && (
                            <span
                              title={item.filePath}
                              className="max-w-[220px] truncate font-mono-code text-[0.75rem] text-[var(--text-secondary)]"
                            >
                              {item.filePath}
                            </span>
                          )}
                        </div>
                      ) : (
                        <Input
                          value={item.value}
                          placeholder={valuePlaceholder}
                          aria-label="Value"
                          onChange={(e) =>
                            updateRow(item.id, { value: e.target.value } as Partial<T>)
                          }
                          className="h-6 border-transparent bg-transparent font-mono-code focus:border-[var(--accent)] focus:bg-[var(--bg-base)]"
                        />
                      )}
                    </td>
                    <td className="px-1 py-1 text-center">
                      <ActionTooltip label="Remove Row">
                        <button
                          type="button"
                          aria-label="Remove row"
                          onClick={() => removeRow(item.id)}
                          className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[#F87171]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </ActionTooltip>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div>
        <ActionTooltip label="Add Key-Value Row">
          <Button size="xs" variant="ghost" onClick={addRow}>
            <Plus className="h-3 w-3" />
            <span>Add row</span>
          </Button>
        </ActionTooltip>
      </div>
    </div>
  );
}
