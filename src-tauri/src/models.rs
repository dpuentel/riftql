use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KeyValueItem {
    pub id: String,
    pub key: String,
    pub value: String,
    #[serde(default)]
    pub description: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FormDataItem {
    pub id: String,
    pub key: String,
    #[serde(default)]
    pub value: String,
    #[serde(default)]
    pub file_path: Option<String>,
    #[serde(default)]
    pub file_name: Option<String>,
    pub item_type: FormDataItemType,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FormDataItemType {
    Text,
    File,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AuthConfig {
    #[default]
    Inherit,
    None,
    Bearer {
        token: String,
    },
    Basic {
        username: String,
        password: String,
    },
    ApiKey {
        key: String,
        value: String,
        add_to: ApiKeyTarget,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ApiKeyTarget {
    Header,
    Query,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(tag = "mode", rename_all = "camelCase")]
pub enum RequestBody {
    #[default]
    None,
    Json {
        content: String,
    },
    Raw {
        content: String,
        language: RawBodyLanguage,
    },
    UrlEncoded {
        items: Vec<KeyValueItem>,
    },
    FormData {
        items: Vec<FormDataItem>,
    },
    Graphql,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum RawBodyLanguage {
    Text,
    Xml,
    Html,
    Javascript,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct GraphQLConfig {
    #[serde(default)]
    pub query: String,
    #[serde(default)]
    pub variables: String,
    #[serde(default)]
    pub operation_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct RequestSettings {
    #[serde(default)]
    pub verify_ssl: Option<bool>,
    #[serde(default)]
    pub follow_redirects: Option<bool>,
    #[serde(default)]
    pub send_cookies: Option<bool>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum RequestProtocol {
    Rest,
    Graphql,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RequestDraft {
    pub id: String,
    pub name: String,
    pub protocol: RequestProtocol,
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub params: Vec<KeyValueItem>,
    #[serde(default)]
    pub headers: Vec<KeyValueItem>,
    #[serde(default)]
    pub auth: AuthConfig,
    #[serde(default)]
    pub body: RequestBody,
    #[serde(default)]
    pub graphql: GraphQLConfig,
    #[serde(default)]
    pub settings: RequestSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentVariable {
    pub id: String,
    pub key: String,
    pub value: String,
    #[serde(default)]
    pub is_secret: bool,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CollectionRecord {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub auth: AuthConfig,
    #[serde(default)]
    pub variables: Vec<EnvironmentVariable>,
    #[serde(default)]
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FolderRecord {
    pub id: String,
    pub collection_id: String,
    #[serde(default)]
    pub parent_id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub auth: AuthConfig,
    #[serde(default)]
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SavedRequestRecord {
    pub id: String,
    pub collection_id: String,
    #[serde(default)]
    pub folder_id: Option<String>,
    pub name: String,
    pub protocol: RequestProtocol,
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub params: Vec<KeyValueItem>,
    #[serde(default)]
    pub headers: Vec<KeyValueItem>,
    #[serde(default)]
    pub auth: AuthConfig,
    #[serde(default)]
    pub body: RequestBody,
    #[serde(default)]
    pub graphql: GraphQLConfig,
    #[serde(default)]
    pub settings: RequestSettings,
    #[serde(default)]
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentRecord {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub is_global: bool,
    #[serde(default)]
    pub variables: Vec<EnvironmentVariable>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HeaderPair {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CookieRecord {
    pub id: String,
    pub domain: String,
    pub path: String,
    pub name: String,
    pub value: String,
    #[serde(default)]
    pub expires_at: Option<i64>,
    #[serde(default)]
    pub secure: bool,
    #[serde(default)]
    pub http_only: bool,
    #[serde(default)]
    pub same_site: Option<String>,
    #[serde(default = "default_true")]
    pub host_only: bool,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ParsedResponseCookie {
    pub name: String,
    pub value: String,
    #[serde(default)]
    pub domain: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub expires: Option<String>,
    #[serde(default)]
    pub max_age: Option<i64>,
    #[serde(default)]
    pub secure: bool,
    #[serde(default)]
    pub http_only: bool,
    #[serde(default)]
    pub same_site: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub method: String,
    pub protocol: RequestProtocol,
    pub url: String,
    pub request_snapshot: RequestDraft,
    pub status: i64,
    pub status_text: String,
    pub duration_ms: i64,
    pub size_bytes: i64,
    #[serde(default)]
    pub response_headers: Vec<HeaderPair>,
    #[serde(default)]
    pub response_body: Option<String>,
    #[serde(default)]
    pub response_content_type: Option<String>,
    #[serde(default)]
    pub is_binary: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NewHistoryEntryInput {
    pub id: Option<String>,
    pub method: String,
    pub protocol: RequestProtocol,
    pub url: String,
    pub request_snapshot: RequestDraft,
    pub status: i64,
    pub status_text: String,
    pub duration_ms: i64,
    pub size_bytes: i64,
    #[serde(default)]
    pub response_headers: Vec<HeaderPair>,
    #[serde(default)]
    pub response_body: Option<String>,
    #[serde(default)]
    pub response_content_type: Option<String>,
    #[serde(default)]
    pub is_binary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionTabRecord {
    pub id: String,
    #[serde(default)]
    pub saved_request_id: Option<String>,
    pub title: String,
    pub is_dirty: bool,
    pub draft: RequestDraft,
    pub sort_order: i64,
    pub is_active: bool,
    pub updated_at: String,
}

fn default_ui_font_size() -> u16 {
    16
}

fn default_code_font_size() -> u16 {
    13
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: String,
    pub layout: String,
    pub verify_ssl: bool,
    pub follow_redirects: bool,
    pub max_redirects: u32,
    pub timeout_ms: u64,
    pub send_cookies: bool,
    #[serde(default)]
    pub active_environment_id: Option<String>,
    #[serde(default)]
    pub custom_shortcuts: HashMap<String, String>,
    #[serde(default = "default_ui_font_size")]
    pub ui_font_size: u16,
    #[serde(default = "default_code_font_size")]
    pub code_font_size: u16,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            layout: "horizontal".to_string(),
            verify_ssl: true,
            follow_redirects: true,
            max_redirects: 10,
            timeout_ms: 30_000,
            send_cookies: true,
            active_environment_id: None,
            custom_shortcuts: HashMap::new(),
            ui_font_size: default_ui_font_size(),
            code_font_size: default_code_font_size(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    pub current_data_dir: String,
    pub db_path: String,
    pub default_data_dir: String,
    pub is_custom: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitSyncConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub folder_path: Option<String>,
    #[serde(default)]
    pub remote_url: Option<String>,
    #[serde(default)]
    pub branch: Option<String>,
    #[serde(default = "default_true")]
    pub auto_sync: bool,
}

impl Default for GitSyncConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            folder_path: None,
            remote_url: None,
            branch: None,
            auto_sync: true,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum GitSyncMigrationMode {
    MigrateToFolder,
    ImportFromFolder,
    CloneRepo,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct GitRepoStatus {
    pub git_available: bool,
    #[serde(default)]
    pub git_version: Option<String>,
    pub is_git_repo: bool,
    #[serde(default)]
    pub branch: Option<String>,
    #[serde(default)]
    pub remote_url: Option<String>,
    #[serde(default)]
    pub changed_files: usize,
    #[serde(default)]
    pub ahead: usize,
    #[serde(default)]
    pub behind: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FolderInspection {
    pub exists: bool,
    pub is_empty: bool,
    pub has_riftql_workspace: bool,
    pub collection_count: usize,
    pub environment_count: usize,
    pub git: GitRepoStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitSyncStatus {
    pub enabled: bool,
    #[serde(default)]
    pub folder_path: Option<String>,
    #[serde(default)]
    pub remote_url: Option<String>,
    #[serde(default)]
    pub branch: Option<String>,
    pub auto_sync: bool,
    #[serde(default)]
    pub last_synced_at: Option<String>,
    #[serde(default)]
    pub last_error: Option<String>,
    pub git: GitRepoStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitSyncActionResult {
    pub status: GitSyncStatus,
    pub message: String,
    pub workspace_reloaded: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct LocalSecretsStore {
    #[serde(default)]
    pub environments: HashMap<String, HashMap<String, String>>,
    #[serde(default)]
    pub collections: HashMap<String, HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub collections: Vec<CollectionRecord>,
    pub folders: Vec<FolderRecord>,
    pub saved_requests: Vec<SavedRequestRecord>,
    pub environments: Vec<EnvironmentRecord>,
    pub settings: AppSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceExport {
    pub version: u32,
    pub exported_at: String,
    pub collections: Vec<CollectionRecord>,
    pub folders: Vec<FolderRecord>,
    pub saved_requests: Vec<SavedRequestRecord>,
    pub environments: Vec<EnvironmentRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HttpExecutionRequest {
    pub request_id: String,
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: Vec<HeaderPair>,
    #[serde(default)]
    pub body: RequestBody,
    #[serde(default)]
    pub graphql: Option<GraphQLConfig>,
    pub verify_ssl: bool,
    pub follow_redirects: bool,
    pub max_redirects: u32,
    pub timeout_ms: u64,
    pub send_cookies: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum ResponseBodyKind {
    Text,
    Image,
    Binary,
    LargeText,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HttpExecutionResponse {
    pub response_id: String,
    pub status: u16,
    pub status_text: String,
    pub duration_ms: u64,
    pub size_bytes: usize,
    pub final_url: String,
    pub redirect_count: u32,
    pub headers: Vec<HeaderPair>,
    pub cookies: Vec<ParsedResponseCookie>,
    pub content_type: Option<String>,
    pub body_kind: ResponseBodyKind,
    pub body_text: Option<String>,
    pub body_base64: Option<String>,
    pub truncated: bool,
}
