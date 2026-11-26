use tauri::State;

use crate::db::collections::{
    delete_collection, delete_folder, delete_saved_request, move_folder, move_saved_request,
    upsert_collection, upsert_folder, upsert_saved_request,
};
use crate::db::environments::{
    delete_environment, export_workspace, import_workspace, upsert_environment,
};
use crate::db::history::{clear_history, delete_history_entry, list_history, record_history};
use crate::db::session::{list_session_tabs, save_session_tabs};
use crate::db::settings::{get_app_settings, get_workspace_snapshot, save_app_settings};
use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::models::{
    AppSettings, AuthConfig, CollectionRecord, EnvironmentRecord, EnvironmentVariable,
    FolderRecord, HistoryEntry, NewHistoryEntryInput, RequestDraft, SavedRequestRecord,
    SessionTabRecord, StorageInfo, WorkspaceExport, WorkspaceSnapshot,
};

#[tauri::command]
pub fn load_workspace(db: State<Database>) -> AppResult<WorkspaceSnapshot> {
    db.with_conn(|conn| get_workspace_snapshot(conn))
}

#[tauri::command]
pub fn upsert_collection_cmd(
    db: State<Database>,
    id: Option<String>,
    name: String,
    description: String,
    base_url: Option<String>,
    auth: AuthConfig,
    variables: Vec<EnvironmentVariable>,
    sort_order: Option<i64>,
) -> AppResult<CollectionRecord> {
    db.with_conn(|conn| {
        upsert_collection(conn, id, name, description, base_url, auth, variables, sort_order)
    })
}

#[tauri::command]
pub fn delete_collection_cmd(db: State<Database>, id: String) -> AppResult<()> {
    db.with_conn(|conn| delete_collection(conn, &id))
}

#[tauri::command]
pub fn upsert_folder_cmd(
    db: State<Database>,
    id: Option<String>,
    collection_id: String,
    parent_id: Option<String>,
    name: String,
    base_url: Option<String>,
    auth: AuthConfig,
    sort_order: Option<i64>,
) -> AppResult<FolderRecord> {
    db.with_conn(|conn| {
        upsert_folder(
            conn,
            id,
            collection_id,
            parent_id,
            name,
            base_url,
            auth,
            sort_order,
        )
    })
}

#[tauri::command]
pub fn delete_folder_cmd(db: State<Database>, id: String) -> AppResult<()> {
    db.with_conn(|conn| delete_folder(conn, &id))
}

#[tauri::command]
pub fn upsert_saved_request_cmd(
    db: State<Database>,
    id: Option<String>,
    collection_id: String,
    folder_id: Option<String>,
    draft: RequestDraft,
    sort_order: Option<i64>,
) -> AppResult<SavedRequestRecord> {
    db.with_conn(|conn| upsert_saved_request(conn, id, collection_id, folder_id, draft, sort_order))
}

#[tauri::command]
pub fn delete_saved_request_cmd(db: State<Database>, id: String) -> AppResult<()> {
    db.with_conn(|conn| delete_saved_request(conn, &id))
}

#[tauri::command]
pub fn move_saved_request_cmd(
    db: State<Database>,
    id: String,
    target_collection_id: String,
    target_folder_id: Option<String>,
) -> AppResult<SavedRequestRecord> {
    db.with_conn(|conn| {
        move_saved_request(
            conn,
            &id,
            &target_collection_id,
            target_folder_id.as_deref(),
        )
    })
}

#[tauri::command]
pub fn move_folder_cmd(
    db: State<Database>,
    id: String,
    target_collection_id: String,
    target_parent_id: Option<String>,
) -> AppResult<()> {
    db.with_conn(|conn| {
        move_folder(conn, &id, &target_collection_id, target_parent_id.as_deref())
    })
}

#[tauri::command]
pub fn upsert_environment_cmd(
    db: State<Database>,
    id: Option<String>,
    name: String,
    is_global: bool,
    variables: Vec<EnvironmentVariable>,
) -> AppResult<EnvironmentRecord> {
    db.with_conn(|conn| upsert_environment(conn, id, name, is_global, variables))
}

#[tauri::command]
pub fn delete_environment_cmd(db: State<Database>, id: String) -> AppResult<()> {
    db.with_conn(|conn| delete_environment(conn, &id))
}

#[tauri::command]
pub fn list_history_cmd(db: State<Database>) -> AppResult<Vec<HistoryEntry>> {
    db.with_conn(|conn| list_history(conn))
}

#[tauri::command]
pub fn record_history_cmd(
    db: State<Database>,
    entry: NewHistoryEntryInput,
) -> AppResult<HistoryEntry> {
    db.with_conn(|conn| record_history(conn, entry))
}

#[tauri::command]
pub fn delete_history_entry_cmd(db: State<Database>, id: String) -> AppResult<()> {
    db.with_conn(|conn| delete_history_entry(conn, &id))
}

#[tauri::command]
pub fn clear_history_cmd(db: State<Database>) -> AppResult<()> {
    db.with_conn(|conn| clear_history(conn))
}

#[tauri::command]
pub fn list_session_tabs_cmd(db: State<Database>) -> AppResult<Vec<SessionTabRecord>> {
    db.with_conn(|conn| list_session_tabs(conn))
}

#[tauri::command]
pub fn save_session_tabs_cmd(
    db: State<Database>,
    tabs: Vec<SessionTabRecord>,
) -> AppResult<()> {
    db.with_conn(|conn| save_session_tabs(conn, tabs))
}

#[tauri::command]
pub fn get_app_settings_cmd(db: State<Database>) -> AppResult<AppSettings> {
    db.with_conn(|conn| get_app_settings(conn))
}

#[tauri::command]
pub fn save_app_settings_cmd(db: State<Database>, settings: AppSettings) -> AppResult<()> {
    db.with_conn(|conn| save_app_settings(conn, &settings))
}

#[tauri::command]
pub fn export_workspace_cmd(db: State<Database>) -> AppResult<WorkspaceExport> {
    db.with_conn(|conn| export_workspace(conn))
}

#[tauri::command]
pub fn import_workspace_cmd(db: State<Database>, payload: WorkspaceExport) -> AppResult<()> {
    db.with_conn(|conn| import_workspace(conn, payload))
}

#[tauri::command]
pub fn write_text_file_cmd(path: String, content: String) -> AppResult<()> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation("Destination file path cannot be empty".to_string()));
    }
    let target = std::path::Path::new(trimmed);
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    std::fs::write(target, content.as_bytes())?;
    Ok(())
}

#[tauri::command]
pub fn read_text_file_cmd(path: String) -> AppResult<String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation("Source file path cannot be empty".to_string()));
    }
    Ok(std::fs::read_to_string(trimmed)?)
}

#[tauri::command]
pub fn get_storage_info_cmd(db: State<Database>) -> AppResult<StorageInfo> {
    Ok(db.storage_info())
}

#[tauri::command]
pub fn set_data_directory_cmd(
    db: State<Database>,
    new_dir: Option<String>,
    migrate_existing: bool,
) -> AppResult<StorageInfo> {
    let parsed = match new_dir {
        Some(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                return Err(AppError::Validation(
                    "Data directory path cannot be empty".to_string(),
                ));
            }
            Some(std::path::PathBuf::from(trimmed))
        }
        None => None,
    };
    db.set_data_directory(parsed, migrate_existing)
}
