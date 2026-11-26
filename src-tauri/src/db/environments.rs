use std::collections::{HashMap, HashSet};

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::db::collections::{
    list_collections, list_folders, list_saved_requests, upsert_collection, upsert_folder,
    upsert_saved_request,
};
use crate::error::{AppError, AppResult};
use crate::models::{
    EnvironmentRecord, EnvironmentVariable, FolderRecord, LocalSecretsStore, RequestDraft,
    WorkspaceExport,
};

pub fn list_environments(conn: &Connection) -> AppResult<Vec<EnvironmentRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, is_global, variables_json, created_at, updated_at
         FROM environments ORDER BY is_global DESC, created_at ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)? != 0,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
        ))
    })?;

    let mut out = Vec::new();
    for item in rows {
        let (id, name, is_global, vars_json, created_at, updated_at) = item?;
        let variables: Vec<EnvironmentVariable> = serde_json::from_str(&vars_json)?;
        out.push(EnvironmentRecord {
            id,
            name,
            is_global,
            variables,
            created_at,
            updated_at,
        });
    }
    Ok(out)
}

pub fn upsert_environment(
    conn: &Connection,
    id: Option<String>,
    name: String,
    is_global: bool,
    variables: Vec<EnvironmentVariable>,
) -> AppResult<EnvironmentRecord> {
    if name.trim().is_empty() {
        return Err(AppError::Validation(
            "Environment name cannot be empty".to_string(),
        ));
    }
    let now = Utc::now().to_rfc3339();
    let vars_json = serde_json::to_string(&variables)?;

    if let Some(existing_id) = id {
        let existing: Option<(String, bool)> = conn
            .query_row(
                "SELECT created_at, is_global FROM environments WHERE id = ?1",
                params![existing_id],
                |row| Ok((row.get(0)?, row.get::<_, i64>(1)? != 0)),
            )
            .optional()?;

        if let Some((created_at, was_global)) = existing {
            let effective_global = was_global || is_global;
            conn.execute(
                "UPDATE environments
                 SET name = ?2, is_global = ?3, variables_json = ?4, updated_at = ?5
                 WHERE id = ?1",
                params![
                    existing_id,
                    name.trim(),
                    if effective_global { 1 } else { 0 },
                    vars_json,
                    now
                ],
            )?;
            return Ok(EnvironmentRecord {
                id: existing_id,
                name: name.trim().to_string(),
                is_global: effective_global,
                variables,
                created_at,
                updated_at: now,
            });
        }

        conn.execute(
            "INSERT INTO environments (id, name, is_global, variables_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![
                existing_id,
                name.trim(),
                if is_global { 1 } else { 0 },
                vars_json,
                now
            ],
        )?;
        return Ok(EnvironmentRecord {
            id: existing_id,
            name: name.trim().to_string(),
            is_global,
            variables,
            created_at: now.clone(),
            updated_at: now,
        });
    }

    let new_id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO environments (id, name, is_global, variables_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        params![
            new_id,
            name.trim(),
            if is_global { 1 } else { 0 },
            vars_json,
            now
        ],
    )?;
    Ok(EnvironmentRecord {
        id: new_id,
        name: name.trim().to_string(),
        is_global,
        variables,
        created_at: now.clone(),
        updated_at: now,
    })
}

pub fn delete_environment(conn: &Connection, id: &str) -> AppResult<()> {
    let is_global: Option<bool> = conn
        .query_row(
            "SELECT is_global FROM environments WHERE id = ?1",
            params![id],
            |row| Ok(row.get::<_, i64>(0)? != 0),
        )
        .optional()?;

    if is_global == Some(true) {
        return Err(AppError::Validation(
            "Cannot delete the Global environment".to_string(),
        ));
    }

    conn.execute("DELETE FROM environments WHERE id = ?1", params![id])?;
    Ok(())
}

fn redact_secrets(vars: Vec<EnvironmentVariable>) -> Vec<EnvironmentVariable> {
    vars.into_iter()
        .map(|mut v| {
            if v.is_secret {
                v.value.clear();
            }
            v
        })
        .collect()
}

/// Exports collections, folders, requests, and environments while stripping `isSecret` variable values.
pub fn export_workspace(conn: &Connection) -> AppResult<WorkspaceExport> {
    let collections = list_collections(conn)?
        .into_iter()
        .map(|mut c| {
            c.variables = redact_secrets(c.variables);
            c
        })
        .collect();
    let folders = list_folders(conn)?;
    let saved_requests = list_saved_requests(conn)?;
    let environments = list_environments(conn)?
        .into_iter()
        .map(|mut e| {
            e.variables = redact_secrets(e.variables);
            e
        })
        .collect();

    Ok(WorkspaceExport {
        version: 1,
        exported_at: Utc::now().to_rfc3339(),
        collections,
        folders,
        saved_requests,
        environments,
    })
}

pub fn import_workspace(conn: &mut Connection, payload: WorkspaceExport) -> AppResult<()> {
    if payload.version != 1 {
        return Err(AppError::Validation(format!(
            "Unsupported workspace export version: {}",
            payload.version
        )));
    }

    let tx = conn.transaction()?;

    for col in payload.collections {
        upsert_collection(
            &tx,
            Some(col.id),
            col.name,
            col.description,
            Some(col.base_url),
            col.auth,
            col.variables,
            Some(col.sort_order),
        )?;
    }

    // Insert root folders before nested children by doing two passes or ordering
    let mut pending_folders = payload.folders;
    let mut progress = true;
    while !pending_folders.is_empty() && progress {
        progress = false;
        let mut next = Vec::new();
        for folder in pending_folders {
            let parent_ready = match &folder.parent_id {
                None => true,
                Some(pid) => tx
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM folders WHERE id = ?1)",
                        params![pid],
                        |row| row.get::<_, bool>(0),
                    )
                    .unwrap_or(false),
            };
            if parent_ready {
                upsert_folder(
                    &tx,
                    Some(folder.id),
                    folder.collection_id,
                    folder.parent_id,
                    folder.name,
                    Some(folder.base_url),
                    folder.auth,
                    Some(folder.sort_order),
                )?;
                progress = true;
            } else {
                next.push(folder);
            }
        }
        pending_folders = next;
    }

    if !pending_folders.is_empty() {
        return Err(AppError::Validation(
            "Workspace import contains orphaned or cyclic folders".to_string(),
        ));
    }

    for req in payload.saved_requests {
        let draft = RequestDraft {
            id: req.id.clone(),
            name: req.name,
            protocol: req.protocol,
            method: req.method,
            url: req.url,
            params: req.params,
            headers: req.headers,
            auth: req.auth,
            body: req.body,
            graphql: req.graphql,
            settings: req.settings,
        };
        upsert_saved_request(
            &tx,
            Some(req.id),
            req.collection_id,
            req.folder_id,
            draft,
            Some(req.sort_order),
        )?;
    }

    for env in payload.environments {
        if env.is_global {
            let existing_global_id: Option<String> = tx
                .query_row(
                    "SELECT id FROM environments WHERE is_global = 1 LIMIT 1",
                    [],
                    |row| row.get(0),
                )
                .optional()?;
            let target_id = existing_global_id.or(Some(env.id));
            upsert_environment(&tx, target_id, env.name, true, env.variables)?;
        } else {
            upsert_environment(&tx, Some(env.id), env.name, false, env.variables)?;
        }
    }

    tx.commit()?;
    Ok(())
}

fn order_folders_topologically(folders: Vec<FolderRecord>, collection_ids: &HashSet<String>) -> AppResult<Vec<FolderRecord>> {
    for f in &folders {
        if !collection_ids.contains(&f.collection_id) {
            return Err(AppError::Validation(format!(
                "Folder '{}' references missing collection '{}'",
                f.name, f.collection_id
            )));
        }
    }

    let folder_collection_map: HashMap<String, String> = folders
        .iter()
        .map(|f| (f.id.clone(), f.collection_id.clone()))
        .collect();

    for f in &folders {
        if let Some(pid) = &f.parent_id {
            match folder_collection_map.get(pid) {
                None => {
                    return Err(AppError::Validation(format!(
                        "Folder '{}' references missing parent folder '{}'",
                        f.name, pid
                    )));
                }
                Some(parent_col) if parent_col != &f.collection_id => {
                    return Err(AppError::Validation(format!(
                        "Folder '{}' parent '{}' belongs to a different collection",
                        f.name, pid
                    )));
                }
                _ => {}
            }
        }
    }

    let mut ordered = Vec::with_capacity(folders.len());
    let mut inserted = HashSet::new();
    let mut pending = folders;

    while !pending.is_empty() {
        let mut next = Vec::new();
        let mut progressed = false;
        for folder in pending {
            let ready = match &folder.parent_id {
                None => true,
                Some(pid) => inserted.contains(pid),
            };
            if ready {
                inserted.insert(folder.id.clone());
                ordered.push(folder);
                progressed = true;
            } else {
                next.push(folder);
            }
        }
        if !progressed {
            return Err(AppError::Validation(
                "Workspace contains cyclic folder references".to_string(),
            ));
        }
        pending = next;
    }

    Ok(ordered)
}

fn restore_variable_secrets(
    vars: &mut [EnvironmentVariable],
    local_by_id: Option<&HashMap<String, String>>,
    local_by_key: Option<&HashMap<String, String>>,
    fallback_entity: Option<&HashMap<String, String>>,
    fallback_global: Option<&HashMap<String, String>>,
) {
    for var in vars.iter_mut() {
        if var.is_secret && var.value.is_empty() {
            if let Some(val) = local_by_id.and_then(|m| m.get(&var.id)) {
                var.value = val.clone();
                continue;
            }
            if let Some(val) = local_by_key.and_then(|m| m.get(&var.key)) {
                var.value = val.clone();
                continue;
            }
            if let Some(val) = fallback_entity.and_then(|m| m.get(&var.id).or_else(|| m.get(&var.key))) {
                var.value = val.clone();
                continue;
            }
            if let Some(val) = fallback_global.and_then(|m| m.get(&var.id).or_else(|| m.get(&var.key))) {
                var.value = val.clone();
            }
        }
    }
}

/// Replaces collections, folders, saved requests, and environments in SQLite from a parsed
/// workspace tree while preserving existing local secret values, `created_at` timestamps,
/// history, cookies, session tabs, and UI settings.
pub fn reconcile_workspace_from_disk(
    conn: &mut Connection,
    mut payload: WorkspaceExport,
    fallback_secrets: &LocalSecretsStore,
) -> AppResult<()> {
    if payload.version != 1 {
        return Err(AppError::Validation(format!(
            "Unsupported workspace version: {}",
            payload.version
        )));
    }

    let collection_ids: HashSet<String> = payload.collections.iter().map(|c| c.id.clone()).collect();
    let ordered_folders = order_folders_topologically(payload.folders, &collection_ids)?;
    let folder_col_map: HashMap<String, String> = ordered_folders
        .iter()
        .map(|f| (f.id.clone(), f.collection_id.clone()))
        .collect();

    for req in &payload.saved_requests {
        if !collection_ids.contains(&req.collection_id) {
            return Err(AppError::Validation(format!(
                "Request '{}' references missing collection '{}'",
                req.name, req.collection_id
            )));
        }
        if let Some(fid) = &req.folder_id {
            match folder_col_map.get(fid) {
                None => {
                    return Err(AppError::Validation(format!(
                        "Request '{}' references missing folder '{}'",
                        req.name, fid
                    )));
                }
                Some(col_id) if col_id != &req.collection_id => {
                    return Err(AppError::Validation(format!(
                        "Request '{}' folder '{}' belongs to another collection",
                        req.name, fid
                    )));
                }
                _ => {}
            }
        }
    }

    let tx = conn.transaction()?;

    // Snapshot existing created_at timestamps and secret values before replacing tables
    let existing_cols = list_collections(&tx)?;
    let mut col_created_at: HashMap<String, String> = HashMap::new();
    let mut col_secret_by_id: HashMap<String, HashMap<String, String>> = HashMap::new();
    let mut col_secret_by_key: HashMap<String, HashMap<String, String>> = HashMap::new();
    for c in existing_cols {
        col_created_at.insert(c.id.clone(), c.created_at);
        let mut by_id = HashMap::new();
        let mut by_key = HashMap::new();
        for v in c.variables {
            if v.is_secret && !v.value.is_empty() {
                by_id.insert(v.id, v.value.clone());
                by_key.insert(v.key, v.value);
            }
        }
        col_secret_by_id.insert(c.id.clone(), by_id);
        col_secret_by_key.insert(c.id, by_key);
    }

    let folder_created_at: HashMap<String, String> = list_folders(&tx)?
        .into_iter()
        .map(|f| (f.id, f.created_at))
        .collect();
    let req_created_at: HashMap<String, String> = list_saved_requests(&tx)?
        .into_iter()
        .map(|r| (r.id, r.created_at))
        .collect();

    let existing_envs = list_environments(&tx)?;
    let mut existing_global_id: Option<String> = None;
    let mut env_created_at: HashMap<String, String> = HashMap::new();
    let mut env_secret_by_id: HashMap<String, HashMap<String, String>> = HashMap::new();
    let mut env_secret_by_key: HashMap<String, HashMap<String, String>> = HashMap::new();
    for e in existing_envs {
        if e.is_global && existing_global_id.is_none() {
            existing_global_id = Some(e.id.clone());
        }
        env_created_at.insert(e.id.clone(), e.created_at);
        let mut by_id = HashMap::new();
        let mut by_key = HashMap::new();
        for v in e.variables {
            if v.is_secret && !v.value.is_empty() {
                by_id.insert(v.id, v.value.clone());
                by_key.insert(v.key, v.value);
            }
        }
        if e.is_global {
            env_secret_by_id.insert("__global__".to_string(), by_id.clone());
            env_secret_by_key.insert("__global__".to_string(), by_key.clone());
        }
        env_secret_by_id.insert(e.id.clone(), by_id);
        env_secret_by_key.insert(e.id, by_key);
    }

    // Restore local secrets onto incoming collections and environments
    for col in &mut payload.collections {
        restore_variable_secrets(
            &mut col.variables,
            col_secret_by_id.get(&col.id),
            col_secret_by_key.get(&col.id),
            fallback_secrets.collections.get(&col.id),
            None,
        );
    }

    for env in &mut payload.environments {
        if env.is_global {
            restore_variable_secrets(
                &mut env.variables,
                env_secret_by_id
                    .get(&env.id)
                    .or_else(|| env_secret_by_id.get("__global__")),
                env_secret_by_key
                    .get(&env.id)
                    .or_else(|| env_secret_by_key.get("__global__")),
                fallback_secrets.environments.get(&env.id),
                fallback_secrets.environments.get("__global__"),
            );
        } else {
            restore_variable_secrets(
                &mut env.variables,
                env_secret_by_id.get(&env.id),
                env_secret_by_key.get(&env.id),
                fallback_secrets.environments.get(&env.id),
                None,
            );
        }
    }

    // Replace only synced workspace tables; leave history, cookies, session_tabs, app_settings intact.
    tx.execute("DELETE FROM saved_requests", [])?;
    tx.execute("DELETE FROM folders", [])?;
    tx.execute("DELETE FROM collections", [])?;
    tx.execute("DELETE FROM environments WHERE is_global = 0", [])?;

    let now = Utc::now().to_rfc3339();

    for col in payload.collections {
        let created = col_created_at
            .get(&col.id)
            .cloned()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| now.clone());
        let auth_json = serde_json::to_string(&col.auth)?;
        let vars_json = serde_json::to_string(&col.variables)?;
        tx.execute(
            "INSERT INTO collections (id, name, description, base_url, auth_json, variables_json, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                col.id,
                col.name.trim(),
                col.description,
                col.base_url.trim(),
                auth_json,
                vars_json,
                col.sort_order,
                created,
                now
            ],
        )?;
    }

    for folder in ordered_folders {
        let created = folder_created_at
            .get(&folder.id)
            .cloned()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| now.clone());
        let auth_json = serde_json::to_string(&folder.auth)?;
        tx.execute(
            "INSERT INTO folders (id, collection_id, parent_id, name, base_url, auth_json, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                folder.id,
                folder.collection_id,
                folder.parent_id,
                folder.name.trim(),
                folder.base_url.trim(),
                auth_json,
                folder.sort_order,
                created,
                now
            ],
        )?;
    }

    for req in payload.saved_requests {
        let created = req_created_at
            .get(&req.id)
            .cloned()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| now.clone());
        let req_name = if req.name.trim().is_empty() {
            "Untitled Request".to_string()
        } else {
            req.name.trim().to_string()
        };
        let protocol_str = match req.protocol {
            crate::models::RequestProtocol::Rest => "rest",
            crate::models::RequestProtocol::Graphql => "graphql",
        };
        let params_json = serde_json::to_string(&req.params)?;
        let headers_json = serde_json::to_string(&req.headers)?;
        let auth_json = serde_json::to_string(&req.auth)?;
        let body_json = serde_json::to_string(&req.body)?;
        let graphql_json = serde_json::to_string(&req.graphql)?;
        let settings_json = serde_json::to_string(&req.settings)?;
        tx.execute(
            "INSERT INTO saved_requests (
                id, collection_id, folder_id, name, protocol, method, url,
                params_json, headers_json, auth_json, body_json, graphql_json, settings_json,
                sort_order, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
            params![
                req.id,
                req.collection_id,
                req.folder_id,
                req_name,
                protocol_str,
                req.method,
                req.url,
                params_json,
                headers_json,
                auth_json,
                body_json,
                graphql_json,
                settings_json,
                req.sort_order,
                created,
                now
            ],
        )?;
    }

    let mut handled_global = false;
    for env in payload.environments {
        let vars_json = serde_json::to_string(&env.variables)?;
        if env.is_global && !handled_global {
            handled_global = true;
            if let Some(global_id) = &existing_global_id {
                tx.execute(
                    "UPDATE environments
                     SET name = ?2, is_global = 1, variables_json = ?3, updated_at = ?4
                     WHERE id = ?1",
                    params![global_id, env.name.trim(), vars_json, now],
                )?;
                continue;
            }
        }
        let created = env_created_at
            .get(&env.id)
            .cloned()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| now.clone());
        let env_id = if existing_global_id.as_deref() == Some(env.id.as_str()) {
            Uuid::new_v4().to_string()
        } else {
            env.id
        };
        tx.execute(
            "INSERT INTO environments (id, name, is_global, variables_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                env_id,
                env.name.trim(),
                if env.is_global && existing_global_id.is_none() {
                    existing_global_id = Some(env_id.clone());
                    1
                } else {
                    0
                },
                vars_json,
                created,
                now
            ],
        )?;
    }

    tx.commit()?;
    Ok(())
}
