use chrono::Utc;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::error::AppResult;
use crate::models::{HeaderPair, HistoryEntry, NewHistoryEntryInput, RequestDraft, RequestProtocol};

pub const MAX_HISTORY_ENTRIES: usize = 200;
pub const MAX_HISTORY_BODY_BYTES: usize = 500_000;

pub fn list_history(conn: &Connection) -> AppResult<Vec<HistoryEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, method, protocol, url, request_snapshot_json, status, status_text,
                duration_ms, size_bytes, response_headers_json, response_body,
                response_content_type, is_binary, created_at
         FROM history_entries
         ORDER BY created_at DESC, rowid DESC
         LIMIT ?1",
    )?;

    let rows = stmt.query_map(params![MAX_HISTORY_ENTRIES as i64], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, i64>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, i64>(7)?,
            row.get::<_, i64>(8)?,
            row.get::<_, String>(9)?,
            row.get::<_, Option<String>>(10)?,
            row.get::<_, Option<String>>(11)?,
            row.get::<_, i64>(12)? != 0,
            row.get::<_, String>(13)?,
        ))
    })?;

    let mut out = Vec::new();
    for item in rows {
        let (
            id,
            method,
            protocol_str,
            url,
            snapshot_json,
            status,
            status_text,
            duration_ms,
            size_bytes,
            headers_json,
            response_body,
            response_content_type,
            is_binary,
            created_at,
        ) = item?;

        let protocol = match protocol_str.as_str() {
            "graphql" => RequestProtocol::Graphql,
            _ => RequestProtocol::Rest,
        };
        let request_snapshot: RequestDraft = serde_json::from_str(&snapshot_json)?;
        let response_headers: Vec<HeaderPair> = serde_json::from_str(&headers_json)?;

        out.push(HistoryEntry {
            id,
            method,
            protocol,
            url,
            request_snapshot,
            status,
            status_text,
            duration_ms,
            size_bytes,
            response_headers,
            response_body,
            response_content_type,
            is_binary,
            created_at,
        });
    }
    Ok(out)
}

pub fn record_history(conn: &Connection, input: NewHistoryEntryInput) -> AppResult<HistoryEntry> {
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let created_at = Utc::now().to_rfc3339();
    let protocol_str = match input.protocol {
        RequestProtocol::Rest => "rest",
        RequestProtocol::Graphql => "graphql",
    };

    let retained_body = if input.is_binary {
        None
    } else {
        input
            .response_body
            .filter(|b| b.len() <= MAX_HISTORY_BODY_BYTES)
    };

    let snapshot_json = serde_json::to_string(&input.request_snapshot)?;
    let headers_json = serde_json::to_string(&input.response_headers)?;

    conn.execute(
        "INSERT INTO history_entries (
            id, method, protocol, url, request_snapshot_json, status, status_text,
            duration_ms, size_bytes, response_headers_json, response_body,
            response_content_type, is_binary, created_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            id,
            input.method,
            protocol_str,
            input.url,
            snapshot_json,
            input.status,
            input.status_text,
            input.duration_ms,
            input.size_bytes,
            headers_json,
            retained_body,
            input.response_content_type,
            if input.is_binary { 1 } else { 0 },
            created_at,
        ],
    )?;

    // Prune entries older than the newest MAX_HISTORY_ENTRIES
    conn.execute(
        "DELETE FROM history_entries
         WHERE id NOT IN (
             SELECT id FROM history_entries
             ORDER BY created_at DESC, rowid DESC
             LIMIT ?1
         )",
        params![MAX_HISTORY_ENTRIES as i64],
    )?;

    Ok(HistoryEntry {
        id,
        method: input.method,
        protocol: input.protocol,
        url: input.url,
        request_snapshot: input.request_snapshot,
        status: input.status,
        status_text: input.status_text,
        duration_ms: input.duration_ms,
        size_bytes: input.size_bytes,
        response_headers: input.response_headers,
        response_body: retained_body,
        response_content_type: input.response_content_type,
        is_binary: input.is_binary,
        created_at,
    })
}

pub fn delete_history_entry(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM history_entries WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn clear_history(conn: &Connection) -> AppResult<()> {
    conn.execute("DELETE FROM history_entries", [])?;
    Ok(())
}
