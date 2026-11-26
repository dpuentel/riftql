pub mod commands;
pub mod db;
pub mod error;
pub mod http;
pub mod linux_desktop;
pub mod models;
pub mod sync;

use tauri::Manager;

use crate::db::Database;
use crate::http::client::{InFlightRegistry, ResponseBodyCache};
use crate::sync::GitSyncManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if let (Some(window), Some(icon)) = (
                app.get_webview_window("main"),
                app.default_window_icon(),
            ) {
                let _ = window.set_icon(icon.clone());
            }

            #[cfg(target_os = "linux")]
            linux_desktop::ensure_appimage_desktop_integration();

            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data directory");
            let sync_manager = GitSyncManager::new(app_data_dir.clone());
            let database = Database::open_with_default_dir(app_data_dir)
                .expect("failed to open RiftQL SQLite database");

            if sync_manager.is_enabled() {
                let _ = sync_manager.sync_from_disk(&database);
            }

            app.manage(database);
            app.manage(sync_manager);
            app.manage(InFlightRegistry::default());
            app.manage(ResponseBodyCache::default());

            sync::spawn_watcher(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::storage::load_workspace,
            commands::storage::upsert_collection_cmd,
            commands::storage::delete_collection_cmd,
            commands::storage::upsert_folder_cmd,
            commands::storage::delete_folder_cmd,
            commands::storage::upsert_saved_request_cmd,
            commands::storage::delete_saved_request_cmd,
            commands::storage::move_saved_request_cmd,
            commands::storage::move_folder_cmd,
            commands::storage::sort_saved_requests_cmd,
            commands::storage::upsert_environment_cmd,
            commands::storage::delete_environment_cmd,
            commands::storage::list_history_cmd,
            commands::storage::record_history_cmd,
            commands::storage::delete_history_entry_cmd,
            commands::storage::clear_history_cmd,
            commands::storage::list_session_tabs_cmd,
            commands::storage::save_session_tabs_cmd,
            commands::storage::get_app_settings_cmd,
            commands::storage::save_app_settings_cmd,
            commands::storage::export_workspace_cmd,
            commands::storage::import_workspace_cmd,
            commands::storage::write_text_file_cmd,
            commands::storage::read_text_file_cmd,
            commands::storage::get_storage_info_cmd,
            commands::storage::set_data_directory_cmd,
            commands::sync::get_git_sync_status_cmd,
            commands::sync::inspect_git_sync_folder_cmd,
            commands::sync::configure_git_sync_cmd,
            commands::sync::save_git_credentials_cmd,
            commands::sync::update_git_sync_options_cmd,
            commands::sync::disable_git_sync_cmd,
            commands::sync::sync_git_workspace_now_cmd,
            commands::sync::git_init_workspace_cmd,
            commands::sync::git_fetch_workspace_cmd,
            commands::sync::git_pull_workspace_cmd,
            commands::sync::git_commit_push_workspace_cmd,
            commands::cookies::list_cookies_cmd,
            commands::cookies::upsert_cookie_cmd,
            commands::cookies::delete_cookie_cmd,
            commands::cookies::clear_cookies_by_domain_cmd,
            commands::cookies::clear_all_cookies_cmd,
            commands::http::send_http_request_cmd,
            commands::http::cancel_http_request_cmd,
            commands::http::save_response_body_to_file_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running RiftQL");
}
