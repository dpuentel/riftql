import type {
  AuthConfig,
  GraphQLConfig,
  KeyValueItem,
  RequestBody,
  RequestProtocol,
  RequestSettings,
} from '@/types/api';
import type {
  CollectionRecord,
  EnvironmentRecord,
  EnvironmentVariable,
  FolderRecord,
  SavedRequestRecord,
  WorkspaceExport,
} from '@/types/storage';

export type ImportSourceFormat =
  | 'postman-collection'
  | 'postman-environment'
  | 'altair-collection'
  | 'altair-query'
  | 'altair-environment'
  | 'insomnia-v4'
  | 'openapi-3'
  | 'swagger-2'
  | 'riftql-workspace';

export interface ParsedImportRequest {
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
}

export interface ParsedImportFolder {
  name: string;
  baseUrl?: string;
  auth: AuthConfig;
  folders: ParsedImportFolder[];
  requests: ParsedImportRequest[];
}

export interface ParsedImportCollection {
  name: string;
  description: string;
  baseUrl?: string;
  auth: AuthConfig;
  variables: EnvironmentVariable[];
  folders: ParsedImportFolder[];
  requests: ParsedImportRequest[];
}

export interface ParsedImportEnvironment {
  name: string;
  variables: EnvironmentVariable[];
}

export interface ImportParseResult {
  format: ImportSourceFormat;
  formatLabel: string;
  sourceName: string;
  collections: ParsedImportCollection[];
  environments: ParsedImportEnvironment[];
  warnings: string[];
}

export type ImportDestinationMode = 'new-collection' | 'existing-collection';

export interface ImportDestinationOptions {
  mode: ImportDestinationMode;
  newCollectionName?: string;
  targetCollectionId?: string;
  targetFolderId?: string;
  wrapInSubfolder?: boolean;
  subfolderName?: string;
  importEnvironments?: boolean;
}

export interface ExistingWorkspaceContext {
  collections: CollectionRecord[];
  folders: FolderRecord[];
  savedRequests: SavedRequestRecord[];
  environments: EnvironmentRecord[];
}

export interface ImportStats {
  collections: number;
  folders: number;
  requests: number;
  restRequests: number;
  graphqlRequests: number;
  environments: number;
}

export interface ImportBuildSummary {
  collections: number;
  folders: number;
  requests: number;
  environments: number;
  targetName: string;
}

export interface BuiltWorkspaceImport {
  exportPayload: WorkspaceExport;
  summary: ImportBuildSummary;
}
