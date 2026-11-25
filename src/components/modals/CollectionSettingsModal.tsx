import * as React from 'react';
import { Lock, LockOpen, Plus, Trash2 } from 'lucide-react';
import { nanoid } from 'nanoid';
import { AuthEditor } from '@/components/request/AuthEditor';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import type { AuthConfig } from '@/types/api';
import type { CollectionRecord, EnvironmentVariable, FolderRecord } from '@/types/storage';

interface CollectionSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection?: CollectionRecord;
  folder?: FolderRecord;
}

export function CollectionSettingsModal({
  open,
  onOpenChange,
  collection,
  folder,
}: CollectionSettingsModalProps) {
  const upsertCollection = useWorkspaceStore((s) => s.upsertCollection);
  const upsertFolder = useWorkspaceStore((s) => s.upsertFolder);

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [auth, setAuth] = React.useState<AuthConfig>({ type: 'none' });
  const [variables, setVariables] = React.useState<EnvironmentVariable[]>([]);

  React.useEffect(() => {
    if (!open) return;
    if (folder) {
      setName(folder.name);
      setAuth(folder.auth);
      setDescription('');
      setVariables([]);
    } else if (collection) {
      setName(collection.name);
      setDescription(collection.description);
      setAuth(collection.auth);
      setVariables(collection.variables);
    }
  }, [open, collection, folder]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (folder) {
      await upsertFolder({
        id: folder.id,
        collectionId: folder.collectionId,
        parentId: folder.parentId,
        name: name.trim(),
        auth,
        sortOrder: folder.sortOrder,
      });
    } else if (collection) {
      await upsertCollection({
        id: collection.id,
        name: name.trim(),
        description,
        auth,
        variables,
        sortOrder: collection.sortOrder,
      });
    }
    onOpenChange(false);
  };

  const title = folder ? `Folder: ${folder.name}` : `Collection: ${collection?.name ?? ''}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Configure shared authorization{collection && !folder ? ' and collection variables' : ''}
            inherited by requests inside.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSave(e)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-[var(--text-secondary)]">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          {!folder && (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-[var(--text-secondary)]">
                Description
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional collection notes..."
              />
            </div>
          )}

          <Tabs defaultValue="auth" className="flex flex-col">
            <TabsList>
              <TabsTrigger value="auth">Auth Inheritance</TabsTrigger>
              {!folder && <TabsTrigger value="variables">Collection Variables</TabsTrigger>}
            </TabsList>

            <TabsContent value="auth" className="pt-3">
              <AuthEditor
                auth={auth}
                allowInherit={Boolean(folder)}
                collectionId={folder?.collectionId}
                folderId={folder?.parentId}
                onChange={setAuth}
              />
            </TabsContent>

            {!folder && (
              <TabsContent value="variables" className="pt-3">
                <div className="flex flex-col gap-2">
                  <div className="max-h-48 overflow-auto rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] rift-scroll">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 text-[11px] text-[var(--text-secondary)]">
                          <th className="w-8 px-2 py-1 text-center">On</th>
                          <th className="px-2 py-1">Key</th>
                          <th className="px-2 py-1">Value</th>
                          <th className="w-12 px-1 py-1 text-center">Secret</th>
                          <th className="w-8 px-1 py-1" />
                        </tr>
                      </thead>
                      <tbody>
                        {variables.map((v) => (
                          <tr
                            key={v.id}
                            className="border-b border-[var(--border-subtle)]/70 last:border-b-0"
                          >
                            <td className="px-2 py-1 text-center">
                              <input
                                type="checkbox"
                                checked={v.enabled}
                                onChange={(e) =>
                                  setVariables((prev) =>
                                    prev.map((x) =>
                                      x.id === v.id ? { ...x, enabled: e.target.checked } : x,
                                    ),
                                  )
                                }
                                className="h-3.5 w-3.5 accent-[var(--accent)]"
                              />
                            </td>
                            <td className="px-1.5 py-1">
                              <Input
                                value={v.key}
                                onChange={(e) =>
                                  setVariables((prev) =>
                                    prev.map((x) =>
                                      x.id === v.id ? { ...x, key: e.target.value } : x,
                                    ),
                                  )
                                }
                                className="h-6 font-mono-code"
                              />
                            </td>
                            <td className="px-1.5 py-1">
                              <Input
                                type={v.isSecret ? 'password' : 'text'}
                                value={v.value}
                                onChange={(e) =>
                                  setVariables((prev) =>
                                    prev.map((x) =>
                                      x.id === v.id ? { ...x, value: e.target.value } : x,
                                    ),
                                  )
                                }
                                className="h-6 font-mono-code"
                              />
                            </td>
                            <td className="px-1 py-1 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setVariables((prev) =>
                                    prev.map((x) =>
                                      x.id === v.id ? { ...x, isSecret: !x.isSecret } : x,
                                    ),
                                  )
                                }
                                className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--text-secondary)] hover:text-[var(--accent)]"
                              >
                                {v.isSecret ? (
                                  <Lock className="h-3 w-3" />
                                ) : (
                                  <LockOpen className="h-3 w-3" />
                                )}
                              </button>
                            </td>
                            <td className="px-1 py-1 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setVariables((prev) => prev.filter((x) => x.id !== v.id))
                                }
                                className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--text-secondary)] hover:text-[#F87171]"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    className="self-start"
                    onClick={() =>
                      setVariables((prev) => [
                        ...prev,
                        { id: nanoid(), key: '', value: '', isSecret: false, enabled: true },
                      ])
                    }
                  >
                    <Plus className="h-3 w-3" />
                    <span>Add Variable</span>
                  </Button>
                </div>
              </TabsContent>
            )}
          </Tabs>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="default">
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
