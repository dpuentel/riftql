import {
  hasNativeFileBridge,
  invokeCommand,
  pickOpenFile,
  pickSaveFile,
} from '@/lib/tauri';

const JSON_FILTERS = [{ name: 'JSON', extensions: ['json'] }];

export interface ExportFileResult {
  saved: boolean;
  path?: string;
}

/**
 * Exports JSON text using a native Tauri save dialog when running inside Desktop WebView,
 * falling back to a Blob download anchor in standalone browser environments.
 */
export async function exportJsonFile(
  defaultFileName: string,
  content: string,
  title = 'Export JSON',
): Promise<ExportFileResult> {
  if (hasNativeFileBridge()) {
    const selectedPath = await pickSaveFile({
      title,
      defaultPath: defaultFileName,
      filters: JSON_FILTERS,
    });
    if (!selectedPath) {
      return { saved: false };
    }
    await invokeCommand('write_text_file_cmd', {
      path: selectedPath,
      content,
    });
    return { saved: true, path: selectedPath };
  }

  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultFileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return { saved: true };
}

/**
 * Opens a native file dialog and reads JSON text in Tauri runtime.
 * Returns `null` when native bridge is unavailable or when user cancels.
 */
export async function importJsonFileViaDialog(title = 'Import JSON'): Promise<string | null> {
  if (!hasNativeFileBridge()) {
    return null;
  }
  const selectedPath = await pickOpenFile({
    title,
    filters: JSON_FILTERS,
  });
  if (!selectedPath) {
    return null;
  }
  return invokeCommand<string>('read_text_file_cmd', { path: selectedPath });
}
