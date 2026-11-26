import { invoke } from '@tauri-apps/api/core';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';

export interface DialogFilter {
  name: string;
  extensions: string[];
}

export type TauriBridgeAdapter = {
  invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
  openFile: (options?: {
    title?: string;
    multiple?: boolean;
    filters?: DialogFilter[];
  }) => Promise<string | null>;
  saveFile: (options?: {
    title?: string;
    defaultPath?: string;
    filters?: DialogFilter[];
  }) => Promise<string | null>;
  openDirectory?: (options?: {
    title?: string;
    defaultPath?: string;
  }) => Promise<string | null>;
  listen?: <T>(
    event: string,
    handler: (payload: T) => void,
  ) => Promise<() => void> | (() => void);
};

let customAdapter: TauriBridgeAdapter | null = null;

export function setTauriBridgeAdapter(adapter: TauriBridgeAdapter | null): void {
  customAdapter = adapter;
}

export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window;
}

export function hasNativeFileBridge(): boolean {
  return Boolean(customAdapter) || isTauriRuntime();
}

export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (customAdapter) {
    return customAdapter.invoke<T>(command, args);
  }
  if (!isTauriRuntime()) {
    throw new Error(`Tauri runtime unavailable for command "${command}"`);
  }
  return invoke<T>(command, args);
}

export async function pickOpenFile(options?: {
  title?: string;
  filters?: DialogFilter[];
}): Promise<string | null> {
  if (customAdapter) {
    return customAdapter.openFile({
      title: options?.title,
      multiple: false,
      filters: options?.filters,
    });
  }
  if (!isTauriRuntime()) {
    return null;
  }
  const selected = await openDialog({
    title: options?.title ?? 'Select file',
    multiple: false,
    directory: false,
    filters: options?.filters,
  });
  return typeof selected === 'string' ? selected : null;
}

export async function pickSaveFile(options?: {
  title?: string;
  defaultPath?: string;
  filters?: DialogFilter[];
}): Promise<string | null> {
  if (customAdapter) {
    return customAdapter.saveFile(options);
  }
  if (!isTauriRuntime()) {
    return null;
  }
  const selected = await saveDialog({
    title: options?.title ?? 'Save file',
    defaultPath: options?.defaultPath,
    filters: options?.filters,
  });
  return typeof selected === 'string' ? selected : null;
}

export async function pickOpenDirectory(options?: {
  title?: string;
  defaultPath?: string;
}): Promise<string | null> {
  if (customAdapter?.openDirectory) {
    return customAdapter.openDirectory(options);
  }
  if (!isTauriRuntime()) {
    return null;
  }
  const selected = await openDialog({
    title: options?.title ?? 'Select folder',
    defaultPath: options?.defaultPath,
    multiple: false,
    directory: true,
  });
  return typeof selected === 'string' ? selected : null;
}

export async function listenEvent<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<() => void> {
  if (customAdapter?.listen) {
    return customAdapter.listen<T>(event, handler);
  }
  if (!isTauriRuntime()) {
    return () => {};
  }
  const { listen } = await import('@tauri-apps/api/event');
  return listen<T>(event, (ev) => {
    handler(ev.payload);
  });
}
