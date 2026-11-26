use tauri::State;

use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::models::{
    FolderInspection, GitSyncActionResult, GitSyncMigrationMode, GitSyncStatus,
};
use crate::sync::GitSyncManager;

#[tauri::command]
pub fn get_git_sync_status_cmd(sync: State<GitSyncManager>) -> AppResult<GitSyncStatus> {
    Ok(sync.status())
}

#[tauri::command]
pub fn inspect_git_sync_folder_cmd(folder_path: String) -> AppResult<FolderInspection> {
    GitSyncManager::inspect_folder(&folder_path)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn configure_git_sync_cmd(
    db: State<Database>,
    sync: State<GitSyncManager>,
    folder_path: String,
    remote_url: Option<String>,
    branch: Option<String>,
    migration_mode: GitSyncMigrationMode,
    init_git: bool,
    auto_sync: bool,
    username: Option<String>,
    password: Option<String>,
) -> AppResult<GitSyncActionResult> {
    sync.configure_and_enable(
        &db,
        folder_path,
        remote_url,
        branch,
        migration_mode,
        init_git,
        auto_sync,
        username,
        password,
    )
}

#[tauri::command]
pub fn save_git_credentials_cmd(
    sync: State<GitSyncManager>,
    username: Option<String>,
    password: Option<String>,
    clear: bool,
) -> AppResult<GitSyncStatus> {
    sync.save_git_credentials(username, password, clear)
}

#[tauri::command]
pub fn update_git_sync_options_cmd(
    sync: State<GitSyncManager>,
    auto_sync: bool,
    auto_push: bool,
    auto_push_delay_secs: u64,
    auto_fetch: bool,
    auto_fetch_interval_mins: u64,
    fetch_snooze_mins: u64,
) -> AppResult<GitSyncStatus> {
    sync.update_automation_options(
        auto_sync,
        auto_push,
        auto_push_delay_secs,
        auto_fetch,
        auto_fetch_interval_mins,
        fetch_snooze_mins,
    )
}

#[tauri::command]
pub fn disable_git_sync_cmd(sync: State<GitSyncManager>) -> AppResult<GitSyncStatus> {
    sync.disable()
}

#[tauri::command]
pub fn sync_git_workspace_now_cmd(
    db: State<Database>,
    sync: State<GitSyncManager>,
    direction: String,
) -> AppResult<GitSyncActionResult> {
    match direction.trim().to_ascii_lowercase().as_str() {
        "to-disk" | "push" | "export" => sync.sync_to_disk(&db),
        "from-disk" | "pull" | "import" => sync.sync_from_disk(&db),
        other => Err(AppError::Validation(format!(
            "Unsupported sync direction '{other}'. Expected 'to-disk' or 'from-disk'."
        ))),
    }
}

#[tauri::command]
pub fn git_init_workspace_cmd(
    db: State<Database>,
    sync: State<GitSyncManager>,
    folder_path: Option<String>,
    remote_url: Option<String>,
    branch: Option<String>,
) -> AppResult<GitSyncActionResult> {
    sync.git_init_workspace(&db, folder_path, remote_url, branch)
}

#[tauri::command]
pub fn git_fetch_workspace_cmd(sync: State<GitSyncManager>) -> AppResult<GitSyncActionResult> {
    sync.git_fetch_workspace()
}

#[tauri::command]
pub fn git_pull_workspace_cmd(
    db: State<Database>,
    sync: State<GitSyncManager>,
    rebase: Option<bool>,
) -> AppResult<GitSyncActionResult> {
    sync.git_pull_workspace_with_strategy(&db, rebase.unwrap_or(false))
}

#[tauri::command]
pub fn git_commit_push_workspace_cmd(
    db: State<Database>,
    sync: State<GitSyncManager>,
    message: String,
    push: bool,
) -> AppResult<GitSyncActionResult> {
    sync.git_commit_push_workspace(&db, message, push)
}
