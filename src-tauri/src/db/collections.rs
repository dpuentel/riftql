use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::{
    AuthConfig, CollectionRecord, EnvironmentVariable, FolderRecord, GraphQLConfig,
    KeyValueItem, RequestBody, RequestDraft, RequestProtocol, RequestSettings,
    SavedRequestRecord,
};

pub fn list_collections(conn: &Connection) -> AppResult<Vec<CollectionRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, description, base_url, auth_json, variables_json, sort_order, created_at, updated_at
         FROM collections ORDER BY sort_order ASC, created_at ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        let auth_json: String = row.get(4)?;
        let vars_json: String = row.get(5)?;
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            auth_json,
            vars_json,
            row.get::<_, i64>(6)?,
            row.get::<_, String>(7)?,
            row.get::<_, String>(8)?,
        ))
    })?;

    let mut out = Vec::new();
    for item in rows {
        let (
            id,
            name,
            description,
            base_url,
            auth_json,
            vars_json,
            sort_order,
            created_at,
            updated_at,
        ) = item?;
        let auth: AuthConfig = serde_json::from_str(&auth_json)?;
        let variables: Vec<EnvironmentVariable> = serde_json::from_str(&vars_json)?;
        out.push(CollectionRecord {
            id,
            name,
            description,
            base_url,
            auth,
            variables,
            sort_order,
            created_at,
            updated_at,
        });
    }
    Ok(out)
}

pub fn upsert_collection(
    conn: &Connection,
    id: Option<String>,
    name: String,
    description: String,
    base_url: Option<String>,
    auth: AuthConfig,
    variables: Vec<EnvironmentVariable>,
    sort_order: Option<i64>,
) -> AppResult<CollectionRecord> {
    if name.trim().is_empty() {
        return Err(AppError::Validation(
            "Collection name cannot be empty".to_string(),
        ));
    }
    let now = Utc::now().to_rfc3339();
    let base_url_trimmed = base_url.unwrap_or_default().trim().to_string();
    let auth_json = serde_json::to_string(&auth)?;
    let vars_json = serde_json::to_string(&variables)?;

    if let Some(existing_id) = id {
        let existing_created: Option<String> = conn
            .query_row(
                "SELECT created_at FROM collections WHERE id = ?1",
                params![existing_id],
                |row| row.get(0),
            )
            .optional()?;

        if let Some(created_at) = existing_created {
            let order = sort_order.unwrap_or(0);
            conn.execute(
                "UPDATE collections
                 SET name = ?2, description = ?3, base_url = ?4, auth_json = ?5, variables_json = ?6, sort_order = ?7, updated_at = ?8
                 WHERE id = ?1",
                params![
                    existing_id,
                    name.trim(),
                    description,
                    base_url_trimmed,
                    auth_json,
                    vars_json,
                    order,
                    now
                ],
            )?;
            return Ok(CollectionRecord {
                id: existing_id,
                name: name.trim().to_string(),
                description,
                base_url: base_url_trimmed,
                auth,
                variables,
                sort_order: order,
                created_at,
                updated_at: now,
            });
        }
        let order = sort_order.unwrap_or_else(|| next_collection_sort(conn));
        conn.execute(
            "INSERT INTO collections (id, name, description, base_url, auth_json, variables_json, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
            params![
                existing_id,
                name.trim(),
                description,
                base_url_trimmed,
                auth_json,
                vars_json,
                order,
                now
            ],
        )?;
        return Ok(CollectionRecord {
            id: existing_id,
            name: name.trim().to_string(),
            description,
            base_url: base_url_trimmed,
            auth,
            variables,
            sort_order: order,
            created_at: now.clone(),
            updated_at: now,
        });
    }

    let new_id = Uuid::new_v4().to_string();
    let order = sort_order.unwrap_or_else(|| next_collection_sort(conn));
    conn.execute(
        "INSERT INTO collections (id, name, description, base_url, auth_json, variables_json, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
        params![
            new_id,
            name.trim(),
            description,
            base_url_trimmed,
            auth_json,
            vars_json,
            order,
            now
        ],
    )?;
    Ok(CollectionRecord {
        id: new_id,
        name: name.trim().to_string(),
        description,
        base_url: base_url_trimmed,
        auth,
        variables,
        sort_order: order,
        created_at: now.clone(),
        updated_at: now,
    })
}

pub fn delete_collection(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM collections WHERE id = ?1", params![id])?;
    Ok(())
}

fn next_collection_sort(conn: &Connection) -> i64 {
    conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM collections",
        [],
        |row| row.get(0),
    )
    .unwrap_or(0)
}

pub fn list_folders(conn: &Connection) -> AppResult<Vec<FolderRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, collection_id, parent_id, name, base_url, auth_json, sort_order, created_at, updated_at
         FROM folders ORDER BY sort_order ASC, created_at ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, i64>(6)?,
            row.get::<_, String>(7)?,
            row.get::<_, String>(8)?,
        ))
    })?;

    let mut out = Vec::new();
    for item in rows {
        let (
            id,
            collection_id,
            parent_id,
            name,
            base_url,
            auth_json,
            sort_order,
            created_at,
            updated_at,
        ) = item?;
        let auth: AuthConfig = serde_json::from_str(&auth_json)?;
        out.push(FolderRecord {
            id,
            collection_id,
            parent_id,
            name,
            base_url,
            auth,
            sort_order,
            created_at,
            updated_at,
        });
    }
    Ok(out)
}

fn ensure_no_folder_cycle(
    conn: &Connection,
    folder_id: &str,
    candidate_parent: Option<&str>,
) -> AppResult<()> {
    let mut cursor = candidate_parent.map(str::to_string);
    while let Some(current) = cursor {
        if current == folder_id {
            return Err(AppError::Validation(
                "Cannot move a folder inside itself or one of its descendants".to_string(),
            ));
        }
        cursor = conn
            .query_row(
                "SELECT parent_id FROM folders WHERE id = ?1",
                params![current],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()?
            .flatten();
    }
    Ok(())
}

pub fn upsert_folder(
    conn: &Connection,
    id: Option<String>,
    collection_id: String,
    parent_id: Option<String>,
    name: String,
    base_url: Option<String>,
    auth: AuthConfig,
    sort_order: Option<i64>,
) -> AppResult<FolderRecord> {
    if name.trim().is_empty() {
        return Err(AppError::Validation(
            "Folder name cannot be empty".to_string(),
        ));
    }

    let now = Utc::now().to_rfc3339();
    let base_url_trimmed = base_url.unwrap_or_default().trim().to_string();
    let auth_json = serde_json::to_string(&auth)?;

    if let Some(existing_id) = id {
        ensure_no_folder_cycle(conn, &existing_id, parent_id.as_deref())?;
        let existing_created: Option<String> = conn
            .query_row(
                "SELECT created_at FROM folders WHERE id = ?1",
                params![existing_id],
                |row| row.get(0),
            )
            .optional()?;

        if let Some(created_at) = existing_created {
            let order = sort_order.unwrap_or(0);
            conn.execute(
                "UPDATE folders
                 SET collection_id = ?2, parent_id = ?3, name = ?4, base_url = ?5, auth_json = ?6, sort_order = ?7, updated_at = ?8
                 WHERE id = ?1",
                params![
                    existing_id,
                    collection_id,
                    parent_id,
                    name.trim(),
                    base_url_trimmed,
                    auth_json,
                    order,
                    now
                ],
            )?;
            return Ok(FolderRecord {
                id: existing_id,
                collection_id,
                parent_id,
                name: name.trim().to_string(),
                base_url: base_url_trimmed,
                auth,
                sort_order: order,
                created_at,
                updated_at: now,
            });
        }

        let order = sort_order.unwrap_or(0);
        conn.execute(
            "INSERT INTO folders (id, collection_id, parent_id, name, base_url, auth_json, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
            params![
                existing_id,
                collection_id,
                parent_id,
                name.trim(),
                base_url_trimmed,
                auth_json,
                order,
                now
            ],
        )?;
        return Ok(FolderRecord {
            id: existing_id,
            collection_id,
            parent_id,
            name: name.trim().to_string(),
            base_url: base_url_trimmed,
            auth,
            sort_order: order,
            created_at: now.clone(),
            updated_at: now,
        });
    }

    let new_id = Uuid::new_v4().to_string();
    let order = sort_order.unwrap_or(0);
    conn.execute(
        "INSERT INTO folders (id, collection_id, parent_id, name, base_url, auth_json, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
        params![
            new_id,
            collection_id,
            parent_id,
            name.trim(),
            base_url_trimmed,
            auth_json,
            order,
            now
        ],
    )?;
    Ok(FolderRecord {
        id: new_id,
        collection_id,
        parent_id,
        name: name.trim().to_string(),
        base_url: base_url_trimmed,
        auth,
        sort_order: order,
        created_at: now.clone(),
        updated_at: now,
    })
}

pub fn delete_folder(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM folders WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn list_saved_requests(conn: &Connection) -> AppResult<Vec<SavedRequestRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, collection_id, folder_id, name, protocol, method, url,
                params_json, headers_json, auth_json, body_json, graphql_json, settings_json,
                sort_order, created_at, updated_at
         FROM saved_requests ORDER BY sort_order ASC, created_at ASC",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, String>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, String>(9)?,
            row.get::<_, String>(10)?,
            row.get::<_, String>(11)?,
            row.get::<_, String>(12)?,
            row.get::<_, i64>(13)?,
            row.get::<_, String>(14)?,
            row.get::<_, String>(15)?,
        ))
    })?;

    let mut out = Vec::new();
    for item in rows {
        let (
            id,
            collection_id,
            folder_id,
            name,
            protocol_str,
            method,
            url,
            params_json,
            headers_json,
            auth_json,
            body_json,
            graphql_json,
            settings_json,
            sort_order,
            created_at,
            updated_at,
        ) = item?;

        let protocol: RequestProtocol =
            serde_json::from_str(&format!("\"{protocol_str}\"")).unwrap_or(RequestProtocol::Rest);
        let params: Vec<KeyValueItem> = serde_json::from_str(&params_json)?;
        let headers: Vec<KeyValueItem> = serde_json::from_str(&headers_json)?;
        let auth: AuthConfig = serde_json::from_str(&auth_json)?;
        let body: RequestBody = serde_json::from_str(&body_json)?;
        let graphql: GraphQLConfig = serde_json::from_str(&graphql_json)?;
        let settings: RequestSettings = serde_json::from_str(&settings_json)?;

        out.push(SavedRequestRecord {
            id,
            collection_id,
            folder_id,
            name,
            protocol,
            method,
            url,
            params,
            headers,
            auth,
            body,
            graphql,
            settings,
            sort_order,
            created_at,
            updated_at,
        });
    }
    Ok(out)
}

pub fn upsert_saved_request(
    conn: &Connection,
    id: Option<String>,
    collection_id: String,
    folder_id: Option<String>,
    draft: RequestDraft,
    sort_order: Option<i64>,
) -> AppResult<SavedRequestRecord> {
    let request_name = if draft.name.trim().is_empty() {
        "Untitled Request".to_string()
    } else {
        draft.name.trim().to_string()
    };

    let now = Utc::now().to_rfc3339();
    let protocol_str = match draft.protocol {
        RequestProtocol::Rest => "rest",
        RequestProtocol::Graphql => "graphql",
    };
    let params_json = serde_json::to_string(&draft.params)?;
    let headers_json = serde_json::to_string(&draft.headers)?;
    let auth_json = serde_json::to_string(&draft.auth)?;
    let body_json = serde_json::to_string(&draft.body)?;
    let graphql_json = serde_json::to_string(&draft.graphql)?;
    let settings_json = serde_json::to_string(&draft.settings)?;

    let target_id = id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let existing_created: Option<String> = conn
        .query_row(
            "SELECT created_at FROM saved_requests WHERE id = ?1",
            params![target_id],
            |row| row.get(0),
        )
        .optional()?;

    let order = sort_order.unwrap_or(0);

    if let Some(created_at) = existing_created {
        conn.execute(
            "UPDATE saved_requests
             SET collection_id = ?2, folder_id = ?3, name = ?4, protocol = ?5, method = ?6, url = ?7,
                 params_json = ?8, headers_json = ?9, auth_json = ?10, body_json = ?11, graphql_json = ?12,
                 settings_json = ?13, sort_order = ?14, updated_at = ?15
             WHERE id = ?1",
            params![
                target_id,
                collection_id,
                folder_id,
                request_name,
                protocol_str,
                draft.method,
                draft.url,
                params_json,
                headers_json,
                auth_json,
                body_json,
                graphql_json,
                settings_json,
                order,
                now
            ],
        )?;
        Ok(SavedRequestRecord {
            id: target_id,
            collection_id,
            folder_id,
            name: request_name,
            protocol: draft.protocol,
            method: draft.method,
            url: draft.url,
            params: draft.params,
            headers: draft.headers,
            auth: draft.auth,
            body: draft.body,
            graphql: draft.graphql,
            settings: draft.settings,
            sort_order: order,
            created_at,
            updated_at: now,
        })
    } else {
        conn.execute(
            "INSERT INTO saved_requests (
                id, collection_id, folder_id, name, protocol, method, url,
                params_json, headers_json, auth_json, body_json, graphql_json, settings_json,
                sort_order, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15)",
            params![
                target_id,
                collection_id,
                folder_id,
                request_name,
                protocol_str,
                draft.method,
                draft.url,
                params_json,
                headers_json,
                auth_json,
                body_json,
                graphql_json,
                settings_json,
                order,
                now
            ],
        )?;
        Ok(SavedRequestRecord {
            id: target_id,
            collection_id,
            folder_id,
            name: request_name,
            protocol: draft.protocol,
            method: draft.method,
            url: draft.url,
            params: draft.params,
            headers: draft.headers,
            auth: draft.auth,
            body: draft.body,
            graphql: draft.graphql,
            settings: draft.settings,
            sort_order: order,
            created_at: now.clone(),
            updated_at: now,
        })
    }
}

pub fn delete_saved_request(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM saved_requests WHERE id = ?1", params![id])?;
    Ok(())
}
