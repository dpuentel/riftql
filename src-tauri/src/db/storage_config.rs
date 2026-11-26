use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::AppResult;

pub const CONFIG_FILE_NAME: &str = "storage-config.json";
pub const DB_FILE_NAME: &str = "riftql.db";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct StorageConfig {
    #[serde(default)]
    data_dir: Option<String>,
}

/// Resolves the active data directory from bootstrap `<default_data_dir>/storage-config.json`.
/// Returns `(active_dir, is_custom)`.
pub fn resolve_active_data_dir(default_data_dir: &Path) -> (PathBuf, bool) {
    let config_path = default_data_dir.join(CONFIG_FILE_NAME);
    let Ok(raw) = fs::read_to_string(&config_path) else {
        return (default_data_dir.to_path_buf(), false);
    };
    let Ok(parsed) = serde_json::from_str::<StorageConfig>(&raw) else {
        return (default_data_dir.to_path_buf(), false);
    };
    if let Some(dir_str) = parsed.data_dir {
        let trimmed = dir_str.trim();
        if !trimmed.is_empty() {
            let candidate = PathBuf::from(trimmed);
            if candidate != default_data_dir {
                return (candidate, true);
            }
        }
    }
    (default_data_dir.to_path_buf(), false)
}

/// Persists or resets custom data directory pointer inside `<default_data_dir>/storage-config.json`.
pub fn save_storage_config(default_data_dir: &Path, custom_dir: Option<&Path>) -> AppResult<()> {
    fs::create_dir_all(default_data_dir)?;
    let config_path = default_data_dir.join(CONFIG_FILE_NAME);

    match custom_dir {
        Some(dir) => {
            let payload = StorageConfig {
                data_dir: Some(dir.to_string_lossy().to_string()),
            };
            let json = serde_json::to_string_pretty(&payload)?;
            fs::write(config_path, json)?;
        }
        None => {
            if config_path.exists() {
                fs::remove_file(config_path)?;
            }
        }
    }

    Ok(())
}
