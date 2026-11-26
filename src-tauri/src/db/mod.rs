pub mod collections;
pub mod cookies;
pub mod environments;
pub mod history;
pub mod migrations;
pub mod session;
pub mod settings;
pub mod storage_config;

#[cfg(test)]
mod tests;

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::Connection;

use crate::db::storage_config::{resolve_active_data_dir, save_storage_config, DB_FILE_NAME};
use crate::error::{AppError, AppResult};
use crate::models::StorageInfo;

pub struct Database {
    conn: Mutex<Connection>,
    default_data_dir: PathBuf,
    current_data_dir: Mutex<PathBuf>,
}

fn ensure_writable_dir(dir: &Path) -> AppResult<()> {
    std::fs::create_dir_all(dir)?;
    let probe = dir.join(".riftql-write-test");
    std::fs::write(&probe, b"ok")?;
    let _ = std::fs::remove_file(&probe);
    Ok(())
}

impl Database {
    pub fn open(path: &Path) -> AppResult<Self> {
        let parent = path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."))
            .to_path_buf();
        std::fs::create_dir_all(&parent)?;
        let conn = Connection::open(path)?;
        migrations::run_migrations(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
            default_data_dir: parent.clone(),
            current_data_dir: Mutex::new(parent),
        })
    }

    /// Opens the RiftQL database resolving any custom storage directory configured under `default_data_dir`.
    /// Falls back cleanly to `default_data_dir` if a previously configured custom directory is unavailable.
    pub fn open_with_default_dir(default_data_dir: PathBuf) -> AppResult<Self> {
        std::fs::create_dir_all(&default_data_dir)?;
        let (preferred_dir, is_custom) = resolve_active_data_dir(&default_data_dir);

        if is_custom {
            let db_path = preferred_dir.join(DB_FILE_NAME);
            if ensure_writable_dir(&preferred_dir).is_ok() {
                if let Ok(conn) = Connection::open(&db_path) {
                    if migrations::run_migrations(&conn).is_ok() {
                        return Ok(Self {
                            conn: Mutex::new(conn),
                            default_data_dir,
                            current_data_dir: Mutex::new(preferred_dir),
                        });
                    }
                }
            }
        }

        let fallback_db = default_data_dir.join(DB_FILE_NAME);
        let conn = Connection::open(&fallback_db)?;
        migrations::run_migrations(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
            default_data_dir: default_data_dir.clone(),
            current_data_dir: Mutex::new(default_data_dir),
        })
    }

    pub fn open_in_memory() -> AppResult<Self> {
        let conn = Connection::open_in_memory()?;
        migrations::run_migrations(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
            default_data_dir: PathBuf::from(":memory:"),
            current_data_dir: Mutex::new(PathBuf::from(":memory:")),
        })
    }

    pub fn default_data_dir(&self) -> &Path {
        &self.default_data_dir
    }

    pub fn with_conn<F, T>(&self, f: F) -> AppResult<T>
    where
        F: FnOnce(&mut Connection) -> AppResult<T>,
    {
        let mut guard = self.conn.lock().expect("database mutex poisoned");
        f(&mut guard)
    }

    pub fn storage_info(&self) -> StorageInfo {
        let cur = self
            .current_data_dir
            .lock()
            .expect("current_data_dir mutex poisoned")
            .clone();
        let db_path = cur.join(DB_FILE_NAME);
        StorageInfo {
            current_data_dir: cur.to_string_lossy().to_string(),
            db_path: db_path.to_string_lossy().to_string(),
            default_data_dir: self.default_data_dir.to_string_lossy().to_string(),
            is_custom: cur != self.default_data_dir,
        }
    }

    /// Switches the active SQLite database directory (or resets to default when `new_dir` is `None`),
    /// flushing WAL, optionally migrating the existing DB file if the destination folder has none,
    /// persisting `storage-config.json`, and hot-swapping the active connection.
    pub fn set_data_directory(
        &self,
        new_dir: Option<PathBuf>,
        migrate_existing: bool,
    ) -> AppResult<StorageInfo> {
        let target_dir = match new_dir {
            Some(dir) if !dir.as_os_str().is_empty() => dir,
            Some(_) => {
                return Err(AppError::Validation(
                    "Data directory path cannot be empty".to_string(),
                ));
            }
            None => self.default_data_dir.clone(),
        };

        ensure_writable_dir(&target_dir)?;

        let mut conn_guard = self.conn.lock().expect("database mutex poisoned");
        let mut dir_guard = self
            .current_data_dir
            .lock()
            .expect("current_data_dir mutex poisoned");

        if target_dir == *dir_guard {
            let db_path = target_dir.join(DB_FILE_NAME);
            return Ok(StorageInfo {
                current_data_dir: target_dir.to_string_lossy().to_string(),
                db_path: db_path.to_string_lossy().to_string(),
                default_data_dir: self.default_data_dir.to_string_lossy().to_string(),
                is_custom: target_dir != self.default_data_dir,
            });
        }

        let _ = conn_guard.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");

        let source_db = dir_guard.join(DB_FILE_NAME);
        let target_db = target_dir.join(DB_FILE_NAME);

        // Close current SQLite connection before copying so Windows releases OS file handles
        *conn_guard = Connection::open_in_memory()?;

        let migrate_result: AppResult<Connection> = (|| {
            if migrate_existing && source_db.exists() && !target_db.exists() {
                std::fs::copy(&source_db, &target_db)?;
            }
            let next_conn = Connection::open(&target_db)?;
            migrations::run_migrations(&next_conn)?;
            Ok(next_conn)
        })();

        match migrate_result {
            Ok(next_conn) => {
                *conn_guard = next_conn;
                let is_custom = target_dir != self.default_data_dir;
                save_storage_config(
                    &self.default_data_dir,
                    if is_custom { Some(&target_dir) } else { None },
                )?;
                *dir_guard = target_dir.clone();
                Ok(StorageInfo {
                    current_data_dir: target_dir.to_string_lossy().to_string(),
                    db_path: target_db.to_string_lossy().to_string(),
                    default_data_dir: self.default_data_dir.to_string_lossy().to_string(),
                    is_custom,
                })
            }
            Err(err) => {
                // Reopen source DB cleanly on failure so application remains usable
                if let Ok(restored) = Connection::open(&source_db) {
                    let _ = migrations::run_migrations(&restored);
                    *conn_guard = restored;
                }
                Err(err)
            }
        }
    }
}
