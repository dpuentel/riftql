use chrono::Utc;
use rusqlite::{params, Connection};

use crate::error::AppResult;
use crate::models::{RequestDraft, SessionTabRecord};

pub fn list_session_tabs(conn: &Connection) -> AppResult<Vec<SessionTabRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, saved_request_id, title, is_dirty, draft_json, sort_order, is_active, updated_at
         FROM session_tabs
         ORDER BY sort_order ASC, rowid ASC",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, i64>(3)? != 0,
            row.get::<_, String>(4)?,
            row.get::<_, i64>(5)?,
            row.get::<_, i64>(6)? != 0,
            row.get::<_, String>(7)?,
        ))
    })?;

    let mut out = Vec::new();
    for item in rows {
        let (id, saved_request_id, title, is_dirty, draft_json, sort_order, is_active, updated_at) =
            item?;
        let draft: RequestDraft = serde_json::from_str(&draft_json)?;
        out.push(SessionTabRecord {
            id,
            saved_request_id,
            title,
            is_dirty,
            draft,
            sort_order,
            is_active,
            updated_at,
        });
    }
    Ok(out)
}

pub fn save_session_tabs(conn: &mut Connection, tabs: Vec<SessionTabRecord>) -> AppResult<()> {
    let now = Utc::now().to_rfc3339();
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM session_tabs", [])?;

    for (idx, tab) in tabs.into_iter().enumerate() {
        let draft_json = serde_json::to_string(&tab.draft)?;
        tx.execute(
            "INSERT INTO session_tabs (
                id, saved_request_id, title, is_dirty, draft_json, sort_order, is_active, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                tab.id,
                tab.saved_request_id,
                tab.title,
                if tab.is_dirty { 1 } else { 0 },
                draft_json,
                idx as i64,
                if tab.is_active { 1 } else { 0 },
                now,
            ],
        )?;
    }

    tx.commit()?;
    Ok(())
}
