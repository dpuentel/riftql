export type ShortcutActionId =
  | 'sendRequest'
  | 'cancelRequest'
  | 'newTab'
  | 'closeTab'
  | 'saveRequest'
  | 'commandPalette'
  | 'focusUrl'
  | 'toggleSidebar'
  | 'toggleLayout'
  | 'toggleTheme'
  | 'formatBody'
  | 'openSettings'
  | 'openCodeSnippet'
  | 'importCurl'
  | 'openCookies'
  | 'openEnvironments'
  | 'newCollection'
  | 'nextTab'
  | 'prevTab';

export interface ShortcutDefinition {
  id: ShortcutActionId;
  label: string;
  category: 'Request' | 'Tabs & Navigation' | 'Workspace' | 'Appearance';
  defaultCombo: string;
}
