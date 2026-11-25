use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};

use crate::db::collections::{list_collections, list_folders, list_saved_requests};
use crate::db::environments::list_environments;
use crate::error::AppResult;
use crate::models::{AppSettings, WorkspaceSnapshot};

const SETTINGS_KEY: &str = "app_settings";

pub fn get_app_settings(conn: &Connection) -> AppResult<AppSettings> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT value_json FROM app_settings WHERE key = ?1",
            params![SETTINGS_KEY],
            |row| row.get(0),
        )
        .optional()?;

    match raw {
        Some(json) => Ok(serde_json::from_str(&json)?),
        None => Ok(AppSettings::default()),
    }
}

pub fn save_app_settings(conn: &Connection, settings: &AppSettings) -> AppResult<()> {
    let now = Utc::now().to_rfc3339();
    let json = serde_json::to_string(settings)?;
    conn.execute(
        "INSERT INTO app_settings (key, value_json, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET
            value_json = excluded.value_json,
            updated_at = excluded.updated_at",
        params![SETTINGS_KEY, json, now],
    )?;
    Ok(())
}

pub fn get_workspace_snapshot(conn: &Connection) -> AppResult<WorkspaceSnapshot> {
    Ok(WorkspaceSnapshot {
        collections: list_collections(conn)?,
        folders: list_folders(conn)?,
        saved_requests: list_saved_requests(conn)?,
        environments: list_environments(conn)?,
        settings: get_app_settings(conn)?,
    })
}
