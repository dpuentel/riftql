export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'OPTIONS'
  | 'HEAD';

export type RequestProtocol = 'rest' | 'graphql';

export interface KeyValueItem {
  id: string;
  key: string;
  value: string;
  description?: string;
  enabled: boolean;
}

export type FormDataItemType = 'text' | 'file';

export interface FormDataItem {
  id: string;
  key: string;
  value: string;
  filePath?: string;
  fileName?: string;
  itemType: FormDataItemType;
  enabled: boolean;
}

export type ApiKeyTarget = 'header' | 'query';

export type AuthConfig =
  | { type: 'inherit' }
  | { type: 'none' }
  | { type: 'bearer'; token: string }
  | { type: 'basic'; username: string; password: string }
  | { type: 'apiKey'; key: string; value: string; addTo: ApiKeyTarget };

export type RawBodyLanguage = 'text' | 'xml' | 'html' | 'javascript';

export type RequestBody =
  | { mode: 'none' }
  | { mode: 'json'; content: string }
  | { mode: 'raw'; content: string; language: RawBodyLanguage }
  | { mode: 'urlEncoded'; items: KeyValueItem[] }
  | { mode: 'formData'; items: FormDataItem[] }
  | { mode: 'graphql' };

export interface GraphQLConfig {
  query: string;
  variables: string;
  operationName?: string;
}

export interface RequestSettings {
  verifySsl?: boolean;
  followRedirects?: boolean;
  sendCookies?: boolean;
  timeoutMs?: number;
}

export interface RequestDraft {
  id: string;
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

export interface HeaderPair {
  key: string;
  value: string;
}

export interface ParsedResponseCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: string;
  maxAge?: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: string;
}

export interface HttpExecutionRequest {
  requestId: string;
  method: string;
  url: string;
  headers: HeaderPair[];
  body: RequestBody;
  graphql?: GraphQLConfig;
  verifySsl: boolean;
  followRedirects: boolean;
  maxRedirects: number;
  timeoutMs: number;
  sendCookies: boolean;
}

export type ResponseBodyKind = 'text' | 'image' | 'binary' | 'large-text';

export interface HttpExecutionResponse {
  responseId: string;
  status: number;
  statusText: string;
  durationMs: number;
  sizeBytes: number;
  finalUrl: string;
  redirectCount: number;
  headers: HeaderPair[];
  cookies: ParsedResponseCookie[];
  contentType?: string;
  bodyKind: ResponseBodyKind;
  bodyText?: string;
  bodyBase64?: string;
  truncated: boolean;
}

export interface RequestErrorInfo {
  code?: string;
  message: string;
}
