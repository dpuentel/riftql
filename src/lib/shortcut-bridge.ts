type ShortcutResolver = (actionId: string) => string | undefined;

let resolver: ShortcutResolver = () => undefined;
const listeners = new Set<() => void>();
let version = 0;

export function registerShortcutResolver(next: ShortcutResolver): void {
  resolver = next;
  notifyShortcutChange();
}

export function notifyShortcutChange(): void {
  version += 1;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeShortcutBridge(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getShortcutBridgeVersion(): number {
  return version;
}

export function resolveActionShortcut(actionId?: string): string | undefined {
  if (!actionId) return undefined;
  return resolver(actionId);
}
