use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::db::collections::{list_collections, list_folders, list_saved_requests};
use crate::db::environments::list_environments;
use crate::error::{AppError, AppResult};
use crate::models::{
    AuthConfig, CollectionRecord, EnvironmentRecord, EnvironmentVariable, FolderInspection,
    FolderRecord, GraphQLConfig, KeyValueItem, LocalSecretsStore, RequestBody, RequestProtocol,
    RequestSettings, SavedRequestRecord, WorkspaceExport,
};
use crate::sync::git;

pub const WORKSPACE_MANIFEST_FILE: &str = "riftql.workspace.json";
pub const SECRETS_FILE_NAME: &str = ".riftql.secrets.json";
const COLLECTIONS_DIR: &str = "collections";
const ENVIRONMENTS_DIR: &str = "environments";
const FOLDERS_DIR: &str = "folders";
const REQUESTS_DIR: &str = "requests";
const GITIGNORE_ENTRIES: &[&str] = &[
    ".riftql.secrets.json",
    "*.db",
    "*.db-wal",
    "*.db-shm",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskWorkspaceManifest {
    pub version: u32,
    #[serde(default = "default_format_json")]
    pub format: String,
}

fn default_format_json() -> String {
    "json".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiskCollectionFile {
    #[serde(default)]
    id: String,
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    base_url: String,
    #[serde(default)]
    auth: AuthConfig,
    #[serde(default)]
    variables: Vec<EnvironmentVariable>,
    #[serde(default)]
    sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiskFolderFile {
    #[serde(default)]
    id: String,
    name: String,
    #[serde(default)]
    base_url: String,
    #[serde(default)]
    auth: AuthConfig,
    #[serde(default)]
    sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiskRequestFile {
    #[serde(default)]
    id: String,
    name: String,
    protocol: RequestProtocol,
    method: String,
    #[serde(default)]
    url: String,
    #[serde(default)]
    params: Vec<KeyValueItem>,
    #[serde(default)]
    headers: Vec<KeyValueItem>,
    #[serde(default)]
    auth: AuthConfig,
    #[serde(default)]
    body: RequestBody,
    #[serde(default)]
    graphql: GraphQLConfig,
    #[serde(default)]
    settings: RequestSettings,
    #[serde(default)]
    sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiskEnvironmentFile {
    #[serde(default)]
    id: String,
    name: String,
    #[serde(default)]
    is_global: bool,
    #[serde(default)]
    variables: Vec<EnvironmentVariable>,
}

pub fn fnv1a_32(bytes: &[u8]) -> u32 {
    let mut hash: u32 = 0x811c_9dc5;
    for &b in bytes {
        hash ^= b as u32;
        hash = hash.wrapping_mul(0x0100_0193);
    }
    hash
}

pub fn fnv1a_64(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for &b in bytes {
        hash ^= b as u64;
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    hash
}

fn fnv1a_64_feed(mut hash: u64, bytes: &[u8]) -> u64 {
    for &b in bytes {
        hash ^= b as u64;
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    hash
}

/// Produces a deterministic, cross-platform safe filename/directory slug suffixed with
/// a short hash of `id` so names stay readable while avoiding collisions and Windows reserved names.
pub fn slugify_entity(name: &str, id: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;

    for ch in name.chars() {
        let lower = ch.to_ascii_lowercase();
        if lower.is_ascii_alphanumeric() {
            slug.push(lower);
            last_dash = false;
        } else if !last_dash && !slug.is_empty() {
            slug.push('-');
            last_dash = true;
        }
        if slug.len() >= 48 {
            break;
        }
    }

    let trimmed = slug.trim_matches('-');
    let base = if trimmed.is_empty() { "item" } else { trimmed };
    format!("{base}--{:08x}", fnv1a_32(id.as_bytes()))
}

fn write_if_changed(path: &Path, content: &str) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let bytes = content.as_bytes();
    if let Ok(existing) = fs::read(path) {
        if existing == bytes {
            return Ok(());
        }
    }
    fs::write(path, bytes)?;
    Ok(())
}

fn serialize_pretty_json<T: Serialize>(value: &T) -> AppResult<String> {
    let mut json = serde_json::to_string_pretty(value)?;
    json.push('\n');
    Ok(json)
}

pub fn ensure_gitignore(root: &Path) -> AppResult<()> {
    fs::create_dir_all(root)?;
    let path = root.join(".gitignore");
    let existing = fs::read_to_string(&path).unwrap_or_default();
    let existing_lines: HashSet<&str> = existing.lines().map(str::trim).collect();

    let mut missing: Vec<&str> = Vec::new();
    for entry in GITIGNORE_ENTRIES {
        if !existing_lines.contains(entry) {
            missing.push(entry);
        }
    }

    if missing.is_empty() {
        return Ok(());
    }

    let mut next = existing;
    if !next.is_empty() && !next.ends_with('\n') {
        next.push('\n');
    }
    if next.is_empty() {
        next.push_str("# RiftQL local-only secrets & SQLite cache\n");
    }
    for entry in missing {
        next.push_str(entry);
        next.push('\n');
    }
    fs::write(path, next.as_bytes())?;
    Ok(())
}

fn redact_and_capture_secrets(
    vars: &[EnvironmentVariable],
    bucket: &mut HashMap<String, String>,
) -> Vec<EnvironmentVariable> {
    vars.iter()
        .cloned()
        .map(|mut v| {
            if v.is_secret {
                if !v.value.is_empty() {
                    bucket.insert(v.id.clone(), v.value.clone());
                    bucket.insert(v.key.clone(), v.value.clone());
                }
                v.value.clear();
            }
            v
        })
        .collect()
}

fn canonical_path(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn prune_stale_files_in_dir(dir: &Path, expected_files: &HashSet<PathBuf>) -> AppResult<()> {
    if !dir.exists() {
        return Ok(());
    }
    let mut entries: Vec<PathBuf> = fs::read_dir(dir)?
        .filter_map(|e| e.ok().map(|entry| entry.path()))
        .collect();
    entries.sort();

    for path in entries {
        if path.is_dir() {
            prune_stale_files_in_dir(&path, expected_files)?;
            let is_empty = fs::read_dir(&path)?.next().is_none();
            if is_empty {
                let _ = fs::remove_dir(&path);
            }
        } else if path.extension().and_then(|e| e.to_str()) == Some("json")
            && !expected_files.contains(&canonical_path(&path))
        {
            fs::remove_file(&path)?;
        }
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn write_folder_tree(
    folder: &FolderRecord,
    folder_dir: &Path,
    folders_by_parent: &HashMap<Option<String>, Vec<FolderRecord>>,
    requests_by_folder: &HashMap<Option<String>, Vec<SavedRequestRecord>>,
    expected_files: &mut HashSet<PathBuf>,
) -> AppResult<()> {
    let folder_file_path = folder_dir.join("folder.json");
    let disk_folder = DiskFolderFile {
        id: folder.id.clone(),
        name: folder.name.clone(),
        base_url: folder.base_url.clone(),
        auth: folder.auth.clone(),
        sort_order: folder.sort_order,
    };
    write_if_changed(&folder_file_path, &serialize_pretty_json(&disk_folder)?)?;
    expected_files.insert(canonical_path(&folder_file_path));

    if let Some(reqs) = requests_by_folder.get(&Some(folder.id.clone())) {
        let reqs_dir = folder_dir.join(REQUESTS_DIR);
        for req in reqs {
            let req_path = reqs_dir.join(format!("{}.json", slugify_entity(&req.name, &req.id)));
            let disk_req = DiskRequestFile {
                id: req.id.clone(),
                name: req.name.clone(),
                protocol: req.protocol.clone(),
                method: req.method.clone(),
                url: req.url.clone(),
                params: req.params.clone(),
                headers: req.headers.clone(),
                auth: req.auth.clone(),
                body: req.body.clone(),
                graphql: req.graphql.clone(),
                settings: req.settings.clone(),
                sort_order: req.sort_order,
            };
            write_if_changed(&req_path, &serialize_pretty_json(&disk_req)?)?;
            expected_files.insert(canonical_path(&req_path));
        }
    }

    if let Some(children) = folders_by_parent.get(&Some(folder.id.clone())) {
        let subfolders_dir = folder_dir.join(FOLDERS_DIR);
        for child in children {
            let child_dir = subfolders_dir.join(slugify_entity(&child.name, &child.id));
            write_folder_tree(
                child,
                &child_dir,
                folders_by_parent,
                requests_by_folder,
                expected_files,
            )?;
        }
    }

    Ok(())
}

/// Writes the SQLite workspace (collections, nested folders, saved requests, non-secret environments)
/// into a deterministic Git-friendly directory structure, keeping secrets out of tracked files.
pub fn write_workspace_to_dir(root: &Path, conn: &Connection) -> AppResult<u64> {
    fs::create_dir_all(root)?;
    ensure_gitignore(root)?;

    let manifest = DiskWorkspaceManifest {
        version: 1,
        format: "json".to_string(),
    };
    write_if_changed(
        &root.join(WORKSPACE_MANIFEST_FILE),
        &serialize_pretty_json(&manifest)?,
    )?;

    let mut collections = list_collections(conn)?;
    collections.sort_by(|a, b| {
        a.sort_order
            .cmp(&b.sort_order)
            .then_with(|| a.name.cmp(&b.name))
            .then_with(|| a.id.cmp(&b.id))
    });

    let mut folders = list_folders(conn)?;
    folders.sort_by(|a, b| {
        a.sort_order
            .cmp(&b.sort_order)
            .then_with(|| a.name.cmp(&b.name))
            .then_with(|| a.id.cmp(&b.id))
    });

    let mut requests = list_saved_requests(conn)?;
    requests.sort_by(|a, b| {
        a.sort_order
            .cmp(&b.sort_order)
            .then_with(|| a.name.cmp(&b.name))
            .then_with(|| a.id.cmp(&b.id))
    });

    let mut environments = list_environments(conn)?;
    environments.sort_by(|a, b| {
        b.is_global
            .cmp(&a.is_global)
            .then_with(|| a.name.cmp(&b.name))
            .then_with(|| a.id.cmp(&b.id))
    });

    let mut secrets_store = LocalSecretsStore::default();
    let mut expected_files: HashSet<PathBuf> = HashSet::new();

    // Environments
    let envs_dir = root.join(ENVIRONMENTS_DIR);
    fs::create_dir_all(&envs_dir)?;
    for env in &environments {
        let mut bucket = HashMap::new();
        let redacted_vars = redact_and_capture_secrets(&env.variables, &mut bucket);
        if !bucket.is_empty() {
            if env.is_global {
                secrets_store
                    .environments
                    .insert("__global__".to_string(), bucket.clone());
            }
            secrets_store.environments.insert(env.id.clone(), bucket);
        }

        let filename = if env.is_global {
            "global.json".to_string()
        } else {
            format!("{}.json", slugify_entity(&env.name, &env.id))
        };
        let env_path = envs_dir.join(filename);
        let disk_env = DiskEnvironmentFile {
            id: env.id.clone(),
            name: env.name.clone(),
            is_global: env.is_global,
            variables: redacted_vars,
        };
        write_if_changed(&env_path, &serialize_pretty_json(&disk_env)?)?;
        expected_files.insert(canonical_path(&env_path));
    }

    // Group folders & requests per collection
    let mut folders_by_col: HashMap<String, HashMap<Option<String>, Vec<FolderRecord>>> =
        HashMap::new();
    for f in folders {
        folders_by_col
            .entry(f.collection_id.clone())
            .or_default()
            .entry(f.parent_id.clone())
            .or_default()
            .push(f);
    }

    let mut reqs_by_col: HashMap<String, HashMap<Option<String>, Vec<SavedRequestRecord>>> =
        HashMap::new();
    for r in requests {
        reqs_by_col
            .entry(r.collection_id.clone())
            .or_default()
            .entry(r.folder_id.clone())
            .or_default()
            .push(r);
    }

    // Collections
    let collections_dir = root.join(COLLECTIONS_DIR);
    fs::create_dir_all(&collections_dir)?;
    for col in &collections {
        let col_dir = collections_dir.join(slugify_entity(&col.name, &col.id));
        let col_file = col_dir.join("collection.json");

        let mut bucket = HashMap::new();
        let redacted_vars = redact_and_capture_secrets(&col.variables, &mut bucket);
        if !bucket.is_empty() {
            secrets_store.collections.insert(col.id.clone(), bucket);
        }

        let disk_col = DiskCollectionFile {
            id: col.id.clone(),
            name: col.name.clone(),
            description: col.description.clone(),
            base_url: col.base_url.clone(),
            auth: col.auth.clone(),
            variables: redacted_vars,
            sort_order: col.sort_order,
        };
        write_if_changed(&col_file, &serialize_pretty_json(&disk_col)?)?;
        expected_files.insert(canonical_path(&col_file));

        let empty_folders = HashMap::new();
        let col_folders = folders_by_col.get(&col.id).unwrap_or(&empty_folders);
        let empty_reqs = HashMap::new();
        let col_reqs = reqs_by_col.get(&col.id).unwrap_or(&empty_reqs);

        if let Some(root_reqs) = col_reqs.get(&None) {
            let reqs_dir = col_dir.join(REQUESTS_DIR);
            for req in root_reqs {
                let req_path = reqs_dir.join(format!("{}.json", slugify_entity(&req.name, &req.id)));
                let disk_req = DiskRequestFile {
                    id: req.id.clone(),
                    name: req.name.clone(),
                    protocol: req.protocol.clone(),
                    method: req.method.clone(),
                    url: req.url.clone(),
                    params: req.params.clone(),
                    headers: req.headers.clone(),
                    auth: req.auth.clone(),
                    body: req.body.clone(),
                    graphql: req.graphql.clone(),
                    settings: req.settings.clone(),
                    sort_order: req.sort_order,
                };
                write_if_changed(&req_path, &serialize_pretty_json(&disk_req)?)?;
                expected_files.insert(canonical_path(&req_path));
            }
        }

        if let Some(root_folders) = col_folders.get(&None) {
            let root_folders_dir = col_dir.join(FOLDERS_DIR);
            for fld in root_folders {
                let fld_dir = root_folders_dir.join(slugify_entity(&fld.name, &fld.id));
                write_folder_tree(fld, &fld_dir, col_folders, col_reqs, &mut expected_files)?;
            }
        }
    }

    // Prune stale files/dirs inside collections/ and environments/
    prune_stale_files_in_dir(&envs_dir, &expected_files)?;
    prune_stale_files_in_dir(&collections_dir, &expected_files)?;

    // Write or clean up untracked local secrets store
    let secrets_path = root.join(SECRETS_FILE_NAME);
    if secrets_store.environments.is_empty() && secrets_store.collections.is_empty() {
        if secrets_path.exists() {
            let _ = fs::remove_file(&secrets_path);
        }
    } else {
        write_if_changed(&secrets_path, &serialize_pretty_json(&secrets_store)?)?;
    }

    compute_dir_fingerprint(root)
}

fn synthetic_id(root: &Path, path: &Path, prefix: &str) -> String {
    let rel = path
        .strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/");
    format!("{prefix}-{:016x}", fnv1a_64(rel.as_bytes()))
}

fn read_json_file<T: for<'de> Deserialize<'de>>(path: &Path) -> AppResult<T> {
    let raw = fs::read_to_string(path).map_err(|err| {
        AppError::Sync(format!("Failed to read '{}': {}", path.display(), err))
    })?;
    serde_json::from_str::<T>(&raw).map_err(|err| {
        AppError::Sync(format!("Failed to parse '{}': {}", path.display(), err))
    })
}

fn sorted_dir_entries(dir: &Path) -> AppResult<Vec<PathBuf>> {
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut paths: Vec<PathBuf> = fs::read_dir(dir)?
        .filter_map(|e| e.ok().map(|entry| entry.path()))
        .collect();
    paths.sort();
    Ok(paths)
}

fn read_requests_dir(
    root: &Path,
    reqs_dir: &Path,
    collection_id: &str,
    folder_id: Option<&str>,
    now: &str,
    out_requests: &mut Vec<SavedRequestRecord>,
) -> AppResult<()> {
    for path in sorted_dir_entries(reqs_dir)? {
        if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("json") {
            let disk: DiskRequestFile = read_json_file(&path)?;
            let id = if disk.id.trim().is_empty() {
                synthetic_id(root, &path, "req")
            } else {
                disk.id
            };
            out_requests.push(SavedRequestRecord {
                id,
                collection_id: collection_id.to_string(),
                folder_id: folder_id.map(str::to_string),
                name: disk.name,
                protocol: disk.protocol,
                method: disk.method,
                url: disk.url,
                params: disk.params,
                headers: disk.headers,
                auth: disk.auth,
                body: disk.body,
                graphql: disk.graphql,
                settings: disk.settings,
                sort_order: disk.sort_order,
                created_at: now.to_string(),
                updated_at: now.to_string(),
            });
        }
    }
    Ok(())
}

fn read_folders_dir(
    root: &Path,
    folders_dir: &Path,
    collection_id: &str,
    parent_id: Option<&str>,
    now: &str,
    out_folders: &mut Vec<FolderRecord>,
    out_requests: &mut Vec<SavedRequestRecord>,
) -> AppResult<()> {
    for dir in sorted_dir_entries(folders_dir)? {
        if !dir.is_dir() {
            continue;
        }
        let folder_json = dir.join("folder.json");
        if !folder_json.exists() {
            continue;
        }
        let disk: DiskFolderFile = read_json_file(&folder_json)?;
        let id = if disk.id.trim().is_empty() {
            synthetic_id(root, &folder_json, "fld")
        } else {
            disk.id
        };
        out_folders.push(FolderRecord {
            id: id.clone(),
            collection_id: collection_id.to_string(),
            parent_id: parent_id.map(str::to_string),
            name: disk.name,
            base_url: disk.base_url,
            auth: disk.auth,
            sort_order: disk.sort_order,
            created_at: now.to_string(),
            updated_at: now.to_string(),
        });

        read_requests_dir(
            root,
            &dir.join(REQUESTS_DIR),
            collection_id,
            Some(&id),
            now,
            out_requests,
        )?;
        read_folders_dir(
            root,
            &dir.join(FOLDERS_DIR),
            collection_id,
            Some(&id),
            now,
            out_folders,
            out_requests,
        )?;
    }
    Ok(())
}

pub fn has_workspace_files(root: &Path) -> bool {
    root.join(WORKSPACE_MANIFEST_FILE).exists()
        || root.join(COLLECTIONS_DIR).exists()
        || root.join(ENVIRONMENTS_DIR).exists()
}

/// Parses collections, nested folders, saved requests, environments, and optional local secrets
/// from a Git-friendly RiftQL workspace folder.
pub fn read_workspace_from_dir(root: &Path) -> AppResult<(WorkspaceExport, LocalSecretsStore)> {
    if !root.exists() || !root.is_dir() {
        return Err(AppError::Validation(format!(
            "Sync directory '{}' does not exist",
            root.display()
        )));
    }
    if !has_workspace_files(root) {
        return Err(AppError::Validation(format!(
            "Directory '{}' does not contain a RiftQL workspace (missing {})",
            root.display(),
            WORKSPACE_MANIFEST_FILE
        )));
    }

    let manifest_path = root.join(WORKSPACE_MANIFEST_FILE);
    if manifest_path.exists() {
        let manifest: DiskWorkspaceManifest = read_json_file(&manifest_path)?;
        if manifest.version != 1 {
            return Err(AppError::Validation(format!(
                "Unsupported workspace manifest version {} in '{}'",
                manifest.version,
                manifest_path.display()
            )));
        }
    }

    let now = Utc::now().to_rfc3339();
    let mut environments: Vec<EnvironmentRecord> = Vec::new();
    for path in sorted_dir_entries(&root.join(ENVIRONMENTS_DIR))? {
        if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("json") {
            let disk: DiskEnvironmentFile = read_json_file(&path)?;
            let id = if disk.id.trim().is_empty() {
                synthetic_id(root, &path, "env")
            } else {
                disk.id
            };
            environments.push(EnvironmentRecord {
                id,
                name: disk.name,
                is_global: disk.is_global,
                variables: disk.variables,
                created_at: now.clone(),
                updated_at: now.clone(),
            });
        }
    }

    let mut collections: Vec<CollectionRecord> = Vec::new();
    let mut folders: Vec<FolderRecord> = Vec::new();
    let mut saved_requests: Vec<SavedRequestRecord> = Vec::new();

    for col_dir in sorted_dir_entries(&root.join(COLLECTIONS_DIR))? {
        if !col_dir.is_dir() {
            continue;
        }
        let col_json = col_dir.join("collection.json");
        if !col_json.exists() {
            continue;
        }
        let disk: DiskCollectionFile = read_json_file(&col_json)?;
        let col_id = if disk.id.trim().is_empty() {
            synthetic_id(root, &col_json, "col")
        } else {
            disk.id
        };
        collections.push(CollectionRecord {
            id: col_id.clone(),
            name: disk.name,
            description: disk.description,
            base_url: disk.base_url,
            auth: disk.auth,
            variables: disk.variables,
            sort_order: disk.sort_order,
            created_at: now.clone(),
            updated_at: now.clone(),
        });

        read_requests_dir(
            root,
            &col_dir.join(REQUESTS_DIR),
            &col_id,
            None,
            &now,
            &mut saved_requests,
        )?;
        read_folders_dir(
            root,
            &col_dir.join(FOLDERS_DIR),
            &col_id,
            None,
            &now,
            &mut folders,
            &mut saved_requests,
        )?;
    }

    let secrets_path = root.join(SECRETS_FILE_NAME);
    let secrets = if secrets_path.exists() {
        fs::read_to_string(&secrets_path)
            .ok()
            .and_then(|s| serde_json::from_str::<LocalSecretsStore>(&s).ok())
            .unwrap_or_default()
    } else {
        LocalSecretsStore::default()
    };

    Ok((
        WorkspaceExport {
            version: 1,
            exported_at: now,
            collections,
            folders,
            saved_requests,
            environments,
        },
        secrets,
    ))
}

fn collect_tracked_json_files(root: &Path, dir: &Path, out: &mut Vec<(String, PathBuf)>) -> AppResult<()> {
    if !dir.exists() {
        return Ok(());
    }
    for path in sorted_dir_entries(dir)? {
        if path.is_dir() {
            collect_tracked_json_files(root, &path, out)?;
        } else if path.extension().and_then(|e| e.to_str()) == Some("json") {
            let rel = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");
            out.push((rel, path));
        }
    }
    Ok(())
}

/// Computes a deterministic 64-bit content hash across `riftql.workspace.json`,
/// `environments/**/*.json`, and `collections/**/*.json` so external edits and `git pull`
/// changes are detected reliably even within the same filesystem timestamp tick.
pub fn compute_dir_fingerprint(root: &Path) -> AppResult<u64> {
    let mut files: Vec<(String, PathBuf)> = Vec::new();
    let manifest_path = root.join(WORKSPACE_MANIFEST_FILE);
    if manifest_path.is_file() {
        files.push((WORKSPACE_MANIFEST_FILE.to_string(), manifest_path));
    }
    collect_tracked_json_files(root, &root.join(ENVIRONMENTS_DIR), &mut files)?;
    collect_tracked_json_files(root, &root.join(COLLECTIONS_DIR), &mut files)?;

    files.sort_by(|a, b| a.0.cmp(&b.0));

    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for (rel, path) in files {
        hash = fnv1a_64_feed(hash, rel.as_bytes());
        hash = fnv1a_64_feed(hash, &[0]);
        let bytes = fs::read(&path)?;
        hash = fnv1a_64_feed(hash, &bytes);
        hash = fnv1a_64_feed(hash, &[0xff]);
    }
    Ok(hash)
}

pub fn inspect_folder(root: &Path) -> FolderInspection {
    let exists = root.exists() && root.is_dir();
    let is_empty = if !exists {
        true
    } else {
        fs::read_dir(root)
            .map(|rd| {
                rd.filter_map(|e| e.ok())
                    .all(|e| e.file_name() == ".git")
            })
            .unwrap_or(true)
    };

    let has_riftql_workspace = exists && has_workspace_files(root);
    let collection_count = if exists && root.join(COLLECTIONS_DIR).is_dir() {
        fs::read_dir(root.join(COLLECTIONS_DIR))
            .map(|rd| {
                rd.filter_map(|e| e.ok())
                    .filter(|e| e.path().is_dir() && e.path().join("collection.json").is_file())
                    .count()
            })
            .unwrap_or(0)
    } else {
        0
    };
    let environment_count = if exists && root.join(ENVIRONMENTS_DIR).is_dir() {
        fs::read_dir(root.join(ENVIRONMENTS_DIR))
            .map(|rd| {
                rd.filter_map(|e| e.ok())
                    .filter(|e| {
                        let p = e.path();
                        p.is_file() && p.extension().and_then(|ext| ext.to_str()) == Some("json")
                    })
                    .count()
            })
            .unwrap_or(0)
    } else {
        0
    };

    let git = git::inspect_repo(root);

    FolderInspection {
        exists,
        is_empty,
        has_riftql_workspace,
        collection_count,
        environment_count,
        git,
    }
}
