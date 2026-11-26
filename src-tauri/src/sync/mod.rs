pub mod fs_layout;
pub mod git;

#[cfg(test)]
mod tests;

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use chrono::Utc;
use tauri::{AppHandle, Emitter, Manager};

use crate::db::environments::reconcile_workspace_from_disk;
use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::models::{
    FolderInspection, GitCredentials, GitRepoStatus, GitSyncActionResult, GitSyncConfig,
    GitSyncMigrationMode, GitSyncStatus,
};

pub const GIT_SYNC_CONFIG_FILE: &str = "git-sync-config.json";
pub const GIT_SYNC_CREDENTIALS_FILE: &str = "git-sync-credentials.json";
pub const GIT_SYNC_UPDATED_EVENT: &str = "riftql://git-sync-updated";

#[derive(Debug, Default)]
struct GitSyncInner {
    config: GitSyncConfig,
    credentials: Option<GitCredentials>,
    last_fingerprint: Option<u64>,
    last_error_fingerprint: Option<u64>,
    last_synced_at: Option<String>,
    last_error: Option<String>,
}

pub struct GitSyncManager {
    config_dir: PathBuf,
    inner: Mutex<GitSyncInner>,
}

fn load_config_from_dir(config_dir: &Path) -> GitSyncConfig {
    let path = config_dir.join(GIT_SYNC_CONFIG_FILE);
    let Ok(raw) = fs::read_to_string(&path) else {
        return GitSyncConfig::default();
    };
    serde_json::from_str::<GitSyncConfig>(&raw).unwrap_or_default()
}

fn save_config_to_dir(config_dir: &Path, config: &GitSyncConfig) -> AppResult<()> {
    fs::create_dir_all(config_dir)?;
    let path = config_dir.join(GIT_SYNC_CONFIG_FILE);
    let mut json = serde_json::to_string_pretty(config)?;
    json.push('\n');
    fs::write(path, json.as_bytes())?;
    Ok(())
}

fn load_credentials_from_dir(config_dir: &Path) -> Option<GitCredentials> {
    let path = config_dir.join(GIT_SYNC_CREDENTIALS_FILE);
    let raw = fs::read_to_string(&path).ok()?;
    let parsed = serde_json::from_str::<GitCredentials>(&raw).ok()?;
    if parsed.password.is_empty() {
        None
    } else {
        Some(parsed)
    }
}

fn save_credentials_to_dir(
    config_dir: &Path,
    creds: Option<&GitCredentials>,
) -> AppResult<()> {
    let path = config_dir.join(GIT_SYNC_CREDENTIALS_FILE);
    match creds.filter(|c| !c.password.is_empty()) {
        Some(c) => {
            fs::create_dir_all(config_dir)?;
            let mut json = serde_json::to_string_pretty(c)?;
            json.push('\n');
            fs::write(&path, json.as_bytes())?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
            }
        }
        None => {
            if path.exists() {
                fs::remove_file(&path)?;
            }
        }
    }
    Ok(())
}

fn clean_opt(value: Option<String>) -> Option<String> {
    value
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn resolve_credentials(
    existing: Option<&GitCredentials>,
    username: Option<String>,
    password: Option<String>,
) -> Option<GitCredentials> {
    let clean_user = clean_opt(username);
    let clean_pass = password.filter(|p| !p.is_empty());

    if let Some(pw) = clean_pass {
        return Some(GitCredentials {
            username: clean_user.unwrap_or_default(),
            password: pw,
        });
    }

    existing.map(|e| GitCredentials {
        username: clean_user.unwrap_or_else(|| e.username.clone()),
        password: e.password.clone(),
    })
}

fn build_status(inner: &GitSyncInner) -> GitSyncStatus {
    let git = match inner.config.folder_path.as_deref() {
        Some(path) if !path.trim().is_empty() => git::inspect_repo(Path::new(path)),
        _ => GitRepoStatus {
            git_available: git::git_version().is_some(),
            git_version: git::git_version(),
            ..GitRepoStatus::default()
        },
    };

    let has_credentials = inner
        .credentials
        .as_ref()
        .is_some_and(|c| !c.password.is_empty());
    let auth_username = inner
        .credentials
        .as_ref()
        .map(|c| c.username.clone())
        .filter(|u| !u.is_empty());

    GitSyncStatus {
        enabled: inner.config.enabled,
        folder_path: inner.config.folder_path.clone(),
        remote_url: inner
            .config
            .remote_url
            .clone()
            .or_else(|| git.remote_url.clone()),
        branch: inner
            .config
            .branch
            .clone()
            .or_else(|| git.branch.clone()),
        auto_sync: inner.config.auto_sync,
        auth_username,
        has_credentials,
        last_synced_at: inner.last_synced_at.clone(),
        last_error: inner.last_error.clone(),
        git,
    }
}

impl GitSyncManager {
    pub fn new(config_dir: PathBuf) -> Self {
        let config = load_config_from_dir(&config_dir);
        let credentials = load_credentials_from_dir(&config_dir);
        Self {
            config_dir,
            inner: Mutex::new(GitSyncInner {
                config,
                credentials,
                ..GitSyncInner::default()
            }),
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.inner
            .lock()
            .expect("git sync mutex poisoned")
            .config
            .enabled
    }

    pub fn status(&self) -> GitSyncStatus {
        let guard = self.inner.lock().expect("git sync mutex poisoned");
        build_status(&guard)
    }

    pub fn inspect_folder(folder_path: &str) -> AppResult<FolderInspection> {
        let trimmed = folder_path.trim();
        if trimmed.is_empty() {
            return Err(AppError::Validation(
                "Folder path cannot be empty".to_string(),
            ));
        }
        Ok(fs_layout::inspect_folder(Path::new(trimmed)))
    }

    #[allow(clippy::too_many_arguments)]
    pub fn configure_and_enable(
        &self,
        db: &Database,
        folder_path: String,
        remote_url: Option<String>,
        branch: Option<String>,
        migration_mode: GitSyncMigrationMode,
        init_git: bool,
        auto_sync: bool,
        username: Option<String>,
        password: Option<String>,
    ) -> AppResult<GitSyncActionResult> {
        let trimmed_folder = folder_path.trim().to_string();
        if trimmed_folder.is_empty() {
            return Err(AppError::Validation(
                "Workspace folder path is required".to_string(),
            ));
        }
        let target_dir = PathBuf::from(&trimmed_folder);
        let clean_remote = clean_opt(remote_url);
        let clean_branch = clean_opt(branch);

        let mut guard = self.inner.lock().expect("git sync mutex poisoned");
        let effective_creds = resolve_credentials(guard.credentials.as_ref(), username, password);
        let mut workspace_reloaded = false;
        let message: String;

        match migration_mode {
            GitSyncMigrationMode::CloneRepo => {
                let url = clean_remote.as_deref().ok_or_else(|| {
                    AppError::Validation(
                        "A Git repository URL is required to clone".to_string(),
                    )
                })?;
                git::clone_repo(
                    url,
                    &target_dir,
                    clean_branch.as_deref(),
                    effective_creds.as_ref(),
                )?;
                if fs_layout::has_workspace_files(&target_dir) {
                    let (export, secrets) = fs_layout::read_workspace_from_dir(&target_dir)?;
                    db.with_conn(|conn| reconcile_workspace_from_disk(conn, export, &secrets))?;
                    workspace_reloaded = true;
                    message = format!(
                        "Cloned repository and imported workspace from '{}'.",
                        target_dir.display()
                    );
                } else {
                    db.with_conn(|conn| fs_layout::write_workspace_to_dir(&target_dir, conn))?;
                    message = format!(
                        "Cloned empty repository and migrated SQLite workspace to '{}'.",
                        target_dir.display()
                    );
                }
            }
            GitSyncMigrationMode::MigrateToFolder => {
                fs::create_dir_all(&target_dir)?;
                if init_git || clean_remote.is_some() {
                    git::init_repo(&target_dir, clean_remote.as_deref(), clean_branch.as_deref())?;
                }
                db.with_conn(|conn| fs_layout::write_workspace_to_dir(&target_dir, conn))?;
                message = format!(
                    "Migrated SQLite workspace to '{}' and enabled Git sync.",
                    target_dir.display()
                );
            }
            GitSyncMigrationMode::ImportFromFolder => {
                if !target_dir.exists() {
                    return Err(AppError::Validation(format!(
                        "Folder '{}' does not exist",
                        target_dir.display()
                    )));
                }
                let (export, secrets) = fs_layout::read_workspace_from_dir(&target_dir)?;
                if init_git {
                    git::init_repo(&target_dir, clean_remote.as_deref(), clean_branch.as_deref())?;
                } else if let Some(url) = clean_remote.as_deref() {
                    let repo = git::inspect_repo(&target_dir);
                    if repo.is_git_repo {
                        git::configure_origin_remote(&target_dir, url)?;
                    }
                }
                fs_layout::ensure_gitignore(&target_dir)?;
                db.with_conn(|conn| reconcile_workspace_from_disk(conn, export, &secrets))?;
                workspace_reloaded = true;
                message = format!(
                    "Imported workspace from '{}' and enabled Git sync.",
                    target_dir.display()
                );
            }
        }

        let repo = git::inspect_repo(&target_dir);
        let fp = fs_layout::compute_dir_fingerprint(&target_dir)?;

        guard.config = GitSyncConfig {
            enabled: true,
            folder_path: Some(trimmed_folder),
            remote_url: clean_remote.or(repo.remote_url),
            branch: clean_branch.or(repo.branch),
            auto_sync,
        };
        guard.credentials = effective_creds;
        guard.last_fingerprint = Some(fp);
        guard.last_error_fingerprint = None;
        guard.last_synced_at = Some(Utc::now().to_rfc3339());
        guard.last_error = None;

        save_config_to_dir(&self.config_dir, &guard.config)?;
        save_credentials_to_dir(&self.config_dir, guard.credentials.as_ref())?;

        Ok(GitSyncActionResult {
            status: build_status(&guard),
            message,
            workspace_reloaded,
        })
    }

    pub fn save_git_credentials(
        &self,
        username: Option<String>,
        password: Option<String>,
        clear: bool,
    ) -> AppResult<GitSyncStatus> {
        let mut guard = self.inner.lock().expect("git sync mutex poisoned");
        if clear {
            guard.credentials = None;
            save_credentials_to_dir(&self.config_dir, None)?;
            return Ok(build_status(&guard));
        }

        let resolved = resolve_credentials(guard.credentials.as_ref(), username, password)
            .ok_or_else(|| {
                AppError::Validation(
                    "Enter a Personal Access Token or Password to save HTTPS credentials."
                        .to_string(),
                )
            })?;
        guard.credentials = Some(resolved);
        save_credentials_to_dir(&self.config_dir, guard.credentials.as_ref())?;
        Ok(build_status(&guard))
    }

    pub fn disable(&self) -> AppResult<GitSyncStatus> {
        let mut guard = self.inner.lock().expect("git sync mutex poisoned");
        guard.config.enabled = false;
        guard.last_error = None;
        guard.last_error_fingerprint = None;
        save_config_to_dir(&self.config_dir, &guard.config)?;
        Ok(build_status(&guard))
    }

    pub fn sync_to_disk(&self, db: &Database) -> AppResult<GitSyncActionResult> {
        let mut guard = self.inner.lock().expect("git sync mutex poisoned");
        let folder = guard
            .config
            .folder_path
            .clone()
            .filter(|s| !s.trim().is_empty())
            .ok_or_else(|| {
                AppError::Validation("No Git sync workspace folder configured".to_string())
            })?;

        let root = PathBuf::from(&folder);
        let fp = db.with_conn(|conn| fs_layout::write_workspace_to_dir(&root, conn))?;
        guard.last_fingerprint = Some(fp);
        guard.last_error_fingerprint = None;
        guard.last_synced_at = Some(Utc::now().to_rfc3339());
        guard.last_error = None;

        Ok(GitSyncActionResult {
            status: build_status(&guard),
            message: format!("Exported workspace files to '{}'.", root.display()),
            workspace_reloaded: false,
        })
    }

    pub fn sync_from_disk(&self, db: &Database) -> AppResult<GitSyncActionResult> {
        let mut guard = self.inner.lock().expect("git sync mutex poisoned");
        let folder = guard
            .config
            .folder_path
            .clone()
            .filter(|s| !s.trim().is_empty())
            .ok_or_else(|| {
                AppError::Validation("No Git sync workspace folder configured".to_string())
            })?;

        let root = PathBuf::from(&folder);
        let (export, secrets) = fs_layout::read_workspace_from_dir(&root)?;
        db.with_conn(|conn| reconcile_workspace_from_disk(conn, export, &secrets))?;

        let fp = fs_layout::compute_dir_fingerprint(&root)?;
        guard.last_fingerprint = Some(fp);
        guard.last_error_fingerprint = None;
        guard.last_synced_at = Some(Utc::now().to_rfc3339());
        guard.last_error = None;

        Ok(GitSyncActionResult {
            status: build_status(&guard),
            message: format!("Reloaded workspace files from '{}'.", root.display()),
            workspace_reloaded: true,
        })
    }

    /// Invoked after workspace mutations (collections, folders, saved requests, environments).
    /// Non-fatal so local SQLite saves continue to succeed cleanly even if disk target is offline.
    pub fn on_workspace_mutated(&self, db: &Database) {
        let mut guard = self.inner.lock().expect("git sync mutex poisoned");
        if !guard.config.enabled || !guard.config.auto_sync {
            return;
        }
        let Some(folder) = guard
            .config
            .folder_path
            .clone()
            .filter(|s| !s.trim().is_empty())
        else {
            return;
        };

        let root = PathBuf::from(folder);
        match db.with_conn(|conn| fs_layout::write_workspace_to_dir(&root, conn)) {
            Ok(fp) => {
                guard.last_fingerprint = Some(fp);
                guard.last_error_fingerprint = None;
                guard.last_synced_at = Some(Utc::now().to_rfc3339());
                guard.last_error = None;
            }
            Err(err) => {
                guard.last_error = Some(err.to_string());
            }
        }
    }

    pub fn git_init_workspace(
        &self,
        db: &Database,
        folder_path: Option<String>,
        remote_url: Option<String>,
        branch: Option<String>,
    ) -> AppResult<GitSyncActionResult> {
        let mut guard = self.inner.lock().expect("git sync mutex poisoned");
        let resolved_folder = clean_opt(folder_path)
            .or_else(|| guard.config.folder_path.clone())
            .ok_or_else(|| {
                AppError::Validation("Select a workspace folder before initializing Git".to_string())
            })?;
        let clean_remote = clean_opt(remote_url).or_else(|| guard.config.remote_url.clone());
        let clean_branch = clean_opt(branch).or_else(|| guard.config.branch.clone());

        let root = PathBuf::from(&resolved_folder);
        git::init_repo(&root, clean_remote.as_deref(), clean_branch.as_deref())?;

        if guard.config.enabled && !fs_layout::has_workspace_files(&root) {
            let fp = db.with_conn(|conn| fs_layout::write_workspace_to_dir(&root, conn))?;
            guard.last_fingerprint = Some(fp);
        }

        let repo = git::inspect_repo(&root);
        guard.config.folder_path = Some(resolved_folder);
        guard.config.remote_url = clean_remote.or(repo.remote_url);
        guard.config.branch = clean_branch.or(repo.branch);
        guard.last_error = None;
        save_config_to_dir(&self.config_dir, &guard.config)?;

        Ok(GitSyncActionResult {
            status: build_status(&guard),
            message: format!("Initialized Git repository in '{}'.", root.display()),
            workspace_reloaded: false,
        })
    }

    pub fn git_pull_workspace(&self, db: &Database) -> AppResult<GitSyncActionResult> {
        let mut guard = self.inner.lock().expect("git sync mutex poisoned");
        let folder = guard
            .config
            .folder_path
            .clone()
            .filter(|s| !s.trim().is_empty())
            .ok_or_else(|| {
                AppError::Validation("No Git sync workspace folder configured".to_string())
            })?;

        let root = PathBuf::from(&folder);
        let pull_msg = git::pull_repo(&root, guard.credentials.as_ref())?;
        let mut reloaded = false;

        if fs_layout::has_workspace_files(&root) {
            let (export, secrets) = fs_layout::read_workspace_from_dir(&root)?;
            db.with_conn(|conn| reconcile_workspace_from_disk(conn, export, &secrets))?;
            reloaded = true;
        }

        let repo = git::inspect_repo(&root);
        let fp = fs_layout::compute_dir_fingerprint(&root)?;
        guard.last_fingerprint = Some(fp);
        guard.last_error_fingerprint = None;
        guard.last_synced_at = Some(Utc::now().to_rfc3339());
        guard.last_error = None;
        guard.config.branch = repo.branch.or_else(|| guard.config.branch.clone());
        guard.config.remote_url = repo.remote_url.or_else(|| guard.config.remote_url.clone());
        let _ = save_config_to_dir(&self.config_dir, &guard.config);

        Ok(GitSyncActionResult {
            status: build_status(&guard),
            message: pull_msg,
            workspace_reloaded: reloaded,
        })
    }

    pub fn git_commit_push_workspace(
        &self,
        db: &Database,
        message: String,
        push: bool,
    ) -> AppResult<GitSyncActionResult> {
        let mut guard = self.inner.lock().expect("git sync mutex poisoned");
        let folder = guard
            .config
            .folder_path
            .clone()
            .filter(|s| !s.trim().is_empty())
            .ok_or_else(|| {
                AppError::Validation("No Git sync workspace folder configured".to_string())
            })?;

        let root = PathBuf::from(&folder);
        if guard.config.enabled {
            let fp = db.with_conn(|conn| fs_layout::write_workspace_to_dir(&root, conn))?;
            guard.last_fingerprint = Some(fp);
            guard.last_synced_at = Some(Utc::now().to_rfc3339());
        }

        let git_msg = git::commit_and_push(&root, &message, push, guard.credentials.as_ref())?;
        guard.last_error = None;

        Ok(GitSyncActionResult {
            status: build_status(&guard),
            message: git_msg,
            workspace_reloaded: false,
        })
    }

    /// Checks whether tracked files in the active sync directory changed externally
    /// (e.g. from `git pull`, `git checkout`, or manual editor saves) and reconciles them into SQLite.
    pub fn poll_external_changes(&self, db: &Database) -> AppResult<bool> {
        let mut guard = self.inner.lock().expect("git sync mutex poisoned");
        if !guard.config.enabled {
            return Ok(false);
        }
        let Some(folder) = guard
            .config
            .folder_path
            .clone()
            .filter(|s| !s.trim().is_empty())
        else {
            return Ok(false);
        };

        let root = PathBuf::from(&folder);
        if !root.exists() || !fs_layout::has_workspace_files(&root) {
            return Ok(false);
        }

        let current_fp = fs_layout::compute_dir_fingerprint(&root)?;
        if guard.last_fingerprint == Some(current_fp)
            || guard.last_error_fingerprint == Some(current_fp)
        {
            return Ok(false);
        }

        match fs_layout::read_workspace_from_dir(&root).and_then(|(export, secrets)| {
            db.with_conn(|conn| reconcile_workspace_from_disk(conn, export, &secrets))
        }) {
            Ok(()) => {
                guard.last_fingerprint = Some(current_fp);
                guard.last_error_fingerprint = None;
                guard.last_synced_at = Some(Utc::now().to_rfc3339());
                guard.last_error = None;
                Ok(true)
            }
            Err(err) => {
                guard.last_error_fingerprint = Some(current_fp);
                guard.last_error = Some(err.to_string());
                Err(err)
            }
        }
    }
}

pub fn spawn_watcher(app_handle: AppHandle) {
    let _ = std::thread::Builder::new()
        .name("riftql-git-sync-watcher".to_string())
        .spawn(move || loop {
            std::thread::sleep(Duration::from_secs(2));
            let sync = app_handle.state::<GitSyncManager>();
            let db = app_handle.state::<Database>();
            if let Ok(true) = sync.poll_external_changes(&db) {
                let status = sync.status();
                let _ = app_handle.emit(GIT_SYNC_UPDATED_EVENT, status);
            }
        });
}
