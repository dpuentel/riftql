import type { FolderRecord } from '@/types/storage';

/**
 * Returns flattened folder options for a collection indented by nesting depth
 * so folder pickers preserve tree hierarchy without losing order.
 */
export function buildIndentedFolders(
  folders: FolderRecord[],
  collectionId: string,
  parentId?: string,
  depth: number = 0,
): Array<{ folder: FolderRecord; label: string }> {
  const children = folders.filter(
    (f) => f.collectionId === collectionId && (f.parentId ?? undefined) === parentId,
  );
  const result: Array<{ folder: FolderRecord; label: string }> = [];
  for (const child of children) {
    result.push({
      folder: child,
      label: `${'— '.repeat(depth)}${child.name}`,
    });
    result.push(...buildIndentedFolders(folders, collectionId, child.id, depth + 1));
  }
  return result;
}
