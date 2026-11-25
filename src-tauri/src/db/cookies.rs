use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::error::AppResult;
use crate::models::CookieRecord;

pub fn list_cookies(conn: &Connection) -> AppResult<Vec<CookieRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, domain, path, name, value, expires_at, secure, http_only, same_site, host_only, updated_at
         FROM cookies
         ORDER BY domain ASC, path ASC, name ASC",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(CookieRecord {
            id: row.get(0)?,
            domain: row.get(1)?,
            path: row.get(2)?,
            name: row.get(3)?,
            value: row.get(4)?,
            expires_at: row.get(5)?,
            secure: row.get::<_, i64>(6)? != 0,
            http_only: row.get::<_, i64>(7)? != 0,
            same_site: row.get(8)?,
            host_only: row.get::<_, i64>(9)? != 0,
            updated_at: row.get(10)?,
        })
    })?;

    let mut out = Vec::new();
    for item in rows {
        out.push(item?);
    }
    Ok(out)
}

pub fn upsert_cookie(conn: &Connection, mut cookie: CookieRecord) -> AppResult<CookieRecord> {
    let now = Utc::now().to_rfc3339();
    cookie.domain = cookie.domain.trim().to_ascii_lowercase();
    if cookie.path.trim().is_empty() {
        cookie.path = "/".to_string();
    }
    cookie.updated_at = now.clone();

    if cookie.id.trim().is_empty() {
        let existing_id: Option<String> = conn
            .query_row(
                "SELECT id FROM cookies WHERE domain = ?1 AND path = ?2 AND name = ?3",
                params![cookie.domain, cookie.path, cookie.name],
                |row| row.get(0),
            )
            .optional()?;
        cookie.id = existing_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    }

    conn.execute(
        "INSERT INTO cookies (
            id, domain, path, name, value, expires_at, secure, http_only, same_site, host_only, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(domain, path, name) DO UPDATE SET
            value = excluded.value,
            expires_at = excluded.expires_at,
            secure = excluded.secure,
            http_only = excluded.http_only,
            same_site = excluded.same_site,
            host_only = excluded.host_only,
            updated_at = excluded.updated_at",
        params![
            cookie.id,
            cookie.domain,
            cookie.path,
            cookie.name,
            cookie.value,
            cookie.expires_at,
            if cookie.secure { 1 } else { 0 },
            if cookie.http_only { 1 } else { 0 },
            cookie.same_site,
            if cookie.host_only { 1 } else { 0 },
            cookie.updated_at,
        ],
    )?;

    Ok(cookie)
}

pub fn upsert_cookies_batch(conn: &mut Connection, cookies: Vec<CookieRecord>) -> AppResult<()> {
    let tx = conn.transaction()?;
    for c in cookies {
        // Delete immediately if expired in the past (e.g. Max-Age=0)
        if let Some(exp) = c.expires_at {
            if exp <= Utc::now().timestamp() {
                tx.execute(
                    "DELETE FROM cookies WHERE domain = ?1 AND path = ?2 AND name = ?3",
                    params![c.domain.trim().to_ascii_lowercase(), c.path, c.name],
                )?;
                continue;
            }
        }
        upsert_cookie(&tx, c)?;
    }
    tx.commit()?;
    Ok(())
}

pub fn delete_cookie(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM cookies WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn clear_cookies_by_domain(conn: &Connection, domain: &str) -> AppResult<()> {
    let normalized = domain.trim().to_ascii_lowercase();
    conn.execute(
        "DELETE FROM cookies WHERE domain = ?1",
        params![normalized],
    )?;
    Ok(())
}

pub fn clear_all_cookies(conn: &Connection) -> AppResult<()> {
    conn.execute("DELETE FROM cookies", [])?;
    Ok(())
}
