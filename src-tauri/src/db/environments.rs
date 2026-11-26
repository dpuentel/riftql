use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::db::collections::{
    list_collections, list_folders, list_saved_requests, upsert_collection, upsert_folder,
    upsert_saved_request,
};
use crate::error::{AppError, AppResult};
use crate::models::{
    EnvironmentRecord, EnvironmentVariable, RequestDraft, WorkspaceExport,
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
