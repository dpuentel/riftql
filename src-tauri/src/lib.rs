pub mod commands;
pub mod db;
pub mod error;
pub mod http;
pub mod models;

use tauri::Manager;

use crate::db::Database;
use crate::http::client::{InFlightRegistry, ResponseBodyCache};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data directory");
            let db_path = app_data_dir.join("riftql.db");
            let database = Database::open(&db_path).expect("failed to open RiftQL SQLite database");
            app.manage(database);
            app.manage(InFlightRegistry::default());
            app.manage(ResponseBodyCache::default());
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
