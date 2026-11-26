use chrono::Utc;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::error::AppResult;

const MIGRATION_V1: &str = r#"
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    auth_json TEXT NOT NULL,
    variables_json TEXT NOT NULL DEFAULT '[]',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    auth_json TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_folders_collection ON folders(collection_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);

CREATE TABLE IF NOT EXISTS saved_requests (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    protocol TEXT NOT NULL,
    method TEXT NOT NULL,
    url TEXT NOT NULL,
    params_json TEXT NOT NULL,
    headers_json TEXT NOT NULL,
    auth_json TEXT NOT NULL,
    body_json TEXT NOT NULL,
    graphql_json TEXT NOT NULL,
    settings_json TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_saved_requests_collection ON saved_requests(collection_id);
CREATE INDEX IF NOT EXISTS idx_saved_requests_folder ON saved_requests(folder_id);

CREATE TABLE IF NOT EXISTS environments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_global INTEGER NOT NULL DEFAULT 0,
    variables_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS history_entries (
    id TEXT PRIMARY KEY,
    method TEXT NOT NULL,
    protocol TEXT NOT NULL,
    url TEXT NOT NULL,
    request_snapshot_json TEXT NOT NULL,
    status INTEGER NOT NULL,
    status_text TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    size_bytes INTEGER NOT NULL,
    response_headers_json TEXT NOT NULL,
    response_body TEXT,
    response_content_type TEXT,
    is_binary INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_history_created_at ON history_entries(created_at DESC);

CREATE TABLE IF NOT EXISTS session_tabs (
    id TEXT PRIMARY KEY,
    saved_request_id TEXT,
    title TEXT NOT NULL,
    is_dirty INTEGER NOT NULL DEFAULT 0,
    draft_json TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cookies (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    path TEXT NOT NULL,
    name TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at INTEGER,
    secure INTEGER NOT NULL DEFAULT 0,
    http_only INTEGER NOT NULL DEFAULT 0,
    same_site TEXT,
    host_only INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    UNIQUE(domain, path, name)
);

CREATE INDEX IF NOT EXISTS idx_cookies_domain ON cookies(domain);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"#;

fn column_exists(conn: &Connection, table: &str, column: &str) -> AppResult<bool> {
    let sql = format!("PRAGMA table_info({table})");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    for col in rows {
        if col? == column {
            return Ok(true);
        }
    }
    Ok(false)
}

pub fn run_migrations(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;",
    )?;

    conn.execute_batch(MIGRATION_V1)?;

    let v1_applied: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = 1)",
        [],
        |row| row.get(0),
    )?;

    let now = Utc::now().to_rfc3339();
    if !v1_applied {
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?1)",
            params![now],
        )?;
    }

    let v2_applied: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = 2)",
        [],
        |row| row.get(0),
    )?;

    if !v2_applied {
        if !column_exists(conn, "collections", "base_url")? {
            conn.execute_batch(
                "ALTER TABLE collections ADD COLUMN base_url TEXT NOT NULL DEFAULT '';",
            )?;
        }
        if !column_exists(conn, "folders", "base_url")? {
            conn.execute_batch(
                "ALTER TABLE folders ADD COLUMN base_url TEXT NOT NULL DEFAULT '';",
            )?;
        }
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?1)",
            params![now],
        )?;
    }

    // Ensure a Global environment row always exists
    let global_exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM environments WHERE is_global = 1)",
        [],
        |row| row.get(0),
    )?;

    if !global_exists {
        conn.execute(
            "INSERT INTO environments (id, name, is_global, variables_json, created_at, updated_at)
             VALUES (?1, 'Global', 1, '[]', ?2, ?2)",
            params![Uuid::new_v4().to_string(), now],
        )?;
    }

    Ok(())
}
