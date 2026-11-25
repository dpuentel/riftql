import { invoke } from '@tauri-apps/api/core';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';

export type TauriBridgeAdapter = {
  invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
  openFile: (options?: { title?: string; multiple?: boolean }) => Promise<string | null>;
  saveFile: (options?: { title?: string; defaultPath?: string }) => Promise<string | null>;
};

let customAdapter: TauriBridgeAdapter | null = null;

export function setTauriBridgeAdapter(adapter: TauriBridgeAdapter | null): void {
  customAdapter = adapter;
}

export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window;
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
}): Promise<string | null> {
  if (customAdapter) {
    return customAdapter.openFile({ title: options?.title, multiple: false });
  }
  if (!isTauriRuntime()) {
    return null;
  }
  const selected = await openDialog({
    title: options?.title ?? 'Select file',
    multiple: false,
    directory: false,
  });
  return typeof selected === 'string' ? selected : null;
}

export async function pickSaveFile(options?: {
  title?: string;
  defaultPath?: string;
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
  });
  return typeof selected === 'string' ? selected : null;
}
