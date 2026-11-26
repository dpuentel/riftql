import * as React from 'react';
import { Plus } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { buildIndentedFolders } from '@/lib/collections';
import { useTabsStore } from '@/store/useTabsStore';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

interface SaveRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tabId: string | null;
}

export function SaveRequestModal({
  open,
  onOpenChange,
  tabId,
}: SaveRequestModalProps) {
  const tabs = useTabsStore((s) => s.tabs);
  const markTabSaved = useTabsStore((s) => s.markTabSaved);

  const collections = useWorkspaceStore((s) => s.collections);
  const folders = useWorkspaceStore((s) => s.folders);
  const upsertCollection = useWorkspaceStore((s) => s.upsertCollection);
  const upsertSavedRequest = useWorkspaceStore((s) => s.upsertSavedRequest);

  const tab = tabs.find((t) => t.id === tabId);

  const [name, setName] = React.useState('');
  const [collectionId, setCollectionId] = React.useState('');
  const [folderId, setFolderId] = React.useState<string>('__root__');
  const [newCollectionName, setNewCollectionName] = React.useState('');

  React.useEffect(() => {
    if (!open || !tab) return;
    setName(tab.draft.name === 'Untitled Request' ? tab.title : tab.draft.name);
    setCollectionId(tab.collectionId ?? collections[0]?.id ?? '');
    setFolderId(tab.folderId ?? '__root__');
    setNewCollectionName('');
  }, [open, tab, collections]);

  const folderOptions = React.useMemo(
    () => (collectionId ? buildIndentedFolders(folders, collectionId) : []),
    [folders, collectionId],
  );

  const handleCreateCollection = async () => {
    const trimmed = newCollectionName.trim();
    if (!trimmed) return;
    const created = await upsertCollection({ name: trimmed });
    setCollectionId(created.id);
    setFolderId('__root__');
    setNewCollectionName('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tab) return;
    let targetCollectionId = collectionId;
    if (!targetCollectionId) {
      const created = await upsertCollection({
        name: newCollectionName.trim() || 'My Collection',
      });
      targetCollectionId = created.id;
    }

    const saved = await upsertSavedRequest({
      id: tab.savedRequestId,
      collectionId: targetCollectionId,
      folderId: folderId === '__root__' ? undefined : folderId,
      draft: {
        ...tab.draft,
        name: name.trim() || 'Untitled Request',
      },
    });
    markTabSaved(tab.id, saved);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save Request</DialogTitle>
          <DialogDescription>
            Store this request inside a collection or nested folder.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSave(e)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[0.75rem] font-medium text-[var(--text-secondary)]">
              Request Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Get User Profile"
              required
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[0.75rem] font-medium text-[var(--text-secondary)]">
              Collection
            </label>
            {collections.length > 0 && (
              <Select
                value={collectionId}
                onValueChange={(val) => {
                  setCollectionId(val);
                  setFolderId('__root__');
                }}
              >
                <SelectTrigger aria-label="Target collection">
                  <SelectValue placeholder="Select collection" />
                </SelectTrigger>
                <SelectContent>
                  {collections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="mt-1 flex gap-1.5">
              <Input
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder="Or create new collection..."
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void handleCreateCollection()}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create</span>
              </Button>
            </div>
          </div>

          {folderOptions.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-[0.75rem] font-medium text-[var(--text-secondary)]">
                Folder (Optional)
              </label>
              <Select value={folderId} onValueChange={setFolderId}>
                <SelectTrigger aria-label="Target folder">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__root__">Collection Root</SelectItem>
                  {folderOptions.map(({ folder, label }) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="default">
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
