use tauri::State;

use crate::db::cookies::{
    clear_all_cookies, clear_cookies_by_domain, delete_cookie, list_cookies, upsert_cookie,
};
use crate::db::Database;
use crate::error::AppResult;
use crate::models::CookieRecord;

#[tauri::command]
pub fn list_cookies_cmd(db: State<Database>) -> AppResult<Vec<CookieRecord>> {
    db.with_conn(|conn| list_cookies(conn))
}

#[tauri::command]
pub fn upsert_cookie_cmd(db: State<Database>, cookie: CookieRecord) -> AppResult<CookieRecord> {
    db.with_conn(|conn| upsert_cookie(conn, cookie))
}

#[tauri::command]
pub fn delete_cookie_cmd(db: State<Database>, id: String) -> AppResult<()> {
    db.with_conn(|conn| delete_cookie(conn, &id))
}

#[tauri::command]
pub fn clear_cookies_by_domain_cmd(db: State<Database>, domain: String) -> AppResult<()> {
    db.with_conn(|conn| clear_cookies_by_domain(conn, &domain))
}

#[tauri::command]
pub fn clear_all_cookies_cmd(db: State<Database>) -> AppResult<()> {
    db.with_conn(|conn| clear_all_cookies(conn))
}
