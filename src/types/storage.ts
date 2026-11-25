import type {
  AuthConfig,
  GraphQLConfig,
  HeaderPair,
  HttpExecutionResponse,
  KeyValueItem,
  RequestBody,
  RequestDraft,
  RequestErrorInfo,
  RequestProtocol,
  RequestSettings,
} from '@/types/api';

export interface EnvironmentVariable {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
  enabled: boolean;
}

export interface CollectionRecord {
  id: string;
  name: string;
  description: string;
  auth: AuthConfig;
  variables: EnvironmentVariable[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FolderRecord {
  id: string;
  collectionId: string;
  parentId?: string;
  name: string;
  auth: AuthConfig;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SavedRequestRecord {
  id: string;
  collectionId: string;
  folderId?: string;
  name: string;
  protocol: RequestProtocol;
  method: string;
  url: string;
  params: KeyValueItem[];
  headers: KeyValueItem[];
  auth: AuthConfig;
  body: RequestBody;
  graphql: GraphQLConfig;
  settings: RequestSettings;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface EnvironmentRecord {
  id: string;
  name: string;
  isGlobal: boolean;
  variables: EnvironmentVariable[];
  createdAt: string;
  updatedAt: string;
}

export interface CookieRecord {
  id: string;
  domain: string;
  path: string;
  name: string;
  value: string;
  expiresAt?: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: string;
  hostOnly: boolean;
  updatedAt: string;
}

export interface HistoryEntry {
  id: string;
  method: string;
  protocol: RequestProtocol;
  url: string;
  requestSnapshot: RequestDraft;
  status: number;
  statusText: string;
  durationMs: number;
  sizeBytes: number;
  responseHeaders: HeaderPair[];
  responseBody?: string;
  responseContentType?: string;
  isBinary: boolean;
  createdAt: string;
}

export interface NewHistoryEntryInput {
  id?: string;
  method: string;
  protocol: RequestProtocol;
  url: string;
  requestSnapshot: RequestDraft;
  status: number;
  statusText: string;
  durationMs: number;
  sizeBytes: number;
  responseHeaders: HeaderPair[];
  responseBody?: string;
  responseContentType?: string;
  isBinary: boolean;
}

export interface SessionTabRecord {
  id: string;
  savedRequestId?: string;
  title: string;
  isDirty: boolean;
  draft: RequestDraft;
  sortOrder: number;
  isActive: boolean;
  updatedAt: string;
}

export type ThemePreference = 'dark' | 'light' | 'system';
export type SplitLayout = 'horizontal' | 'vertical';

export interface AppSettings {
  theme: ThemePreference;
  layout: SplitLayout;
  verifySsl: boolean;
  followRedirects: boolean;
  maxRedirects: number;
  timeoutMs: number;
  sendCookies: boolean;
  activeEnvironmentId?: string;
  customShortcuts: Record<string, string>;
}

export interface WorkspaceSnapshot {
  collections: CollectionRecord[];
  folders: FolderRecord[];
  savedRequests: SavedRequestRecord[];
  environments: EnvironmentRecord[];
  settings: AppSettings;
}

export interface WorkspaceExport {
  version: number;
  exportedAt: string;
  collections: CollectionRecord[];
  folders: FolderRecord[];
  savedRequests: SavedRequestRecord[];
  environments: EnvironmentRecord[];
}

export interface RequestTab {
  id: string;
  savedRequestId?: string;
  collectionId?: string;
  folderId?: string;
  title: string;
  isDirty: boolean;
  draft: RequestDraft;
  isLoading: boolean;
  inFlightRequestId?: string;
  startedAtMs?: number;
  response?: HttpExecutionResponse;
  error?: RequestErrorInfo;
}
