use std::fs;
use std::path::Path;
use std::process::Command;

use tempfile::TempDir;

use crate::db::collections::{
    list_collections, list_folders, list_saved_requests, upsert_collection, upsert_folder,
    upsert_saved_request,
};
use crate::db::environments::{list_environments, upsert_environment};
use crate::db::history::{list_history, record_history};
use crate::db::settings::{get_app_settings, save_app_settings};
use crate::db::Database;
use crate::models::{
    AppSettings, AuthConfig, EnvironmentVariable, GitCredentials, GitSyncMigrationMode,
    GraphQLConfig, HeaderPair, KeyValueItem, NewHistoryEntryInput, RequestBody, RequestDraft,
    RequestProtocol, RequestSettings,
};
use crate::sync::fs_layout::{
    compute_dir_fingerprint, has_workspace_files, inspect_folder, read_workspace_from_dir,
    write_workspace_to_dir, SECRETS_FILE_NAME, WORKSPACE_MANIFEST_FILE,
};
use crate::sync::git;
use crate::sync::{GitSyncManager, GIT_SYNC_CREDENTIALS_FILE};

fn sample_rest_draft(name: &str, url: &str) -> RequestDraft {
    RequestDraft {
        id: String::new(),
        name: name.to_string(),
        protocol: RequestProtocol::Rest,
        method: "GET".to_string(),
        url: url.to_string(),
        params: vec![KeyValueItem {
            id: "p1".to_string(),
            key: "page".to_string(),
            value: "1".to_string(),
            description: None,
            enabled: true,
        }],
        headers: vec![KeyValueItem {
            id: "h1".to_string(),
            key: "Accept".to_string(),
            value: "application/json".to_string(),
            description: None,
            enabled: true,
        }],
        auth: AuthConfig::Inherit,
        body: RequestBody::None,
        graphql: GraphQLConfig::default(),
        settings: RequestSettings::default(),
    }
}

fn sample_gql_draft(name: &str, url: &str) -> RequestDraft {
    RequestDraft {
        id: String::new(),
        name: name.to_string(),
        protocol: RequestProtocol::Graphql,
        method: "POST".to_string(),
        url: url.to_string(),
        params: vec![],
        headers: vec![],
        auth: AuthConfig::Inherit,
        body: RequestBody::Graphql,
        graphql: GraphQLConfig {
            query: "query Users { users { id name } }".to_string(),
            variables: "{}".to_string(),
            operation_name: Some("Users".to_string()),
        },
        settings: RequestSettings::default(),
    }
}

fn configure_git_identity(repo_dir: &Path) {
    let run = |args: &[&str]| {
        let out = Command::new("git")
            .current_dir(repo_dir)
            .args(args)
            .output()
            .expect("git config failed");
        assert!(
            out.status.success(),
            "git {} failed: {}",
            args.join(" "),
            String::from_utf8_lossy(&out.stderr)
        );
    };
    run(&["config", "user.name", "RiftQL Test"]);
    run(&["config", "user.email", "test@riftql.local"]);
}

fn assert_no_secret_in_dir(dir: &Path, secret: &str) {
    for entry in fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.file_name().and_then(|n| n.to_str()) == Some(SECRETS_FILE_NAME) {
            continue;
        }
        if path.file_name().and_then(|n| n.to_str()) == Some(".git") {
            continue;
        }
        if path.is_dir() {
            assert_no_secret_in_dir(&path, secret);
        } else if path.is_file() {
            let text = fs::read_to_string(&path).unwrap_or_default();
            assert!(
                !text.contains(secret),
                "tracked file '{}' leaked secret '{}'",
                path.display(),
                secret
            );
        }
    }
}

#[test]
fn deterministic_layout_roundtrips_redacts_secrets_and_preserves_local_secrets() {
    let temp = TempDir::new().unwrap();
    let sync_dir = temp.path().join("workspace");
    let db = Database::open_in_memory().unwrap();

    db.with_conn(|conn| {
        let envs = list_environments(conn)?;
        let global = envs.into_iter().find(|e| e.is_global).unwrap();
        upsert_environment(
            conn,
            Some(global.id),
            "Global".to_string(),
            true,
            vec![
                EnvironmentVariable {
                    id: "gv1".into(),
                    key: "host".into(),
                    value: "https://api.example.com".into(),
                    is_secret: false,
                    enabled: true,
                },
                EnvironmentVariable {
                    id: "gv2".into(),
                    key: "global_secret".into(),
                    value: "SUPER_SECRET_GLOBAL_999".into(),
                    is_secret: true,
                    enabled: true,
                },
            ],
        )?;

        upsert_environment(
            conn,
            None,
            "Staging".to_string(),
            false,
            vec![EnvironmentVariable {
                id: "sv1".into(),
                key: "api_key".into(),
                value: "SUPER_SECRET_STAGING_888".into(),
                is_secret: true,
                enabled: true,
            }],
        )?;

        let col = upsert_collection(
            conn,
            None,
            "Billing API".to_string(),
            "Core billing endpoints".to_string(),
            Some("https://billing.local".to_string()),
            AuthConfig::Bearer {
                token: "{{col_token}}".to_string(),
            },
            vec![EnvironmentVariable {
                id: "cv1".into(),
                key: "col_token".into(),
                value: "SUPER_SECRET_COL_777".into(),
                is_secret: true,
                enabled: true,
            }],
            Some(1),
        )?;

        let parent = upsert_folder(
            conn,
            None,
            col.id.clone(),
            None,
            "Users".to_string(),
            Some("/users".to_string()),
            AuthConfig::Inherit,
            Some(0),
        )?;
        let child = upsert_folder(
            conn,
            None,
            col.id.clone(),
            Some(parent.id.clone()),
            "Profiles".to_string(),
            Some("/profiles".to_string()),
            AuthConfig::Inherit,
            Some(0),
        )?;

        upsert_saved_request(
            conn,
            None,
            col.id.clone(),
            None,
            sample_rest_draft("Health Check", "/health"),
            Some(0),
        )?;
        upsert_saved_request(
            conn,
            None,
            col.id,
            Some(child.id),
            sample_gql_draft("Get Profiles", "/graphql"),
            Some(1),
        )?;

        let fp1 = write_workspace_to_dir(&sync_dir, conn)?;
        let fp2 = write_workspace_to_dir(&sync_dir, conn)?;
        assert_eq!(fp1, fp2);

        Ok(())
    })
    .unwrap();

    assert!(sync_dir.join(WORKSPACE_MANIFEST_FILE).exists());
    assert!(sync_dir.join(".gitignore").exists());
    assert!(sync_dir.join(SECRETS_FILE_NAME).exists());
    let gitignore = fs::read_to_string(sync_dir.join(".gitignore")).unwrap();
    assert!(gitignore.contains(SECRETS_FILE_NAME));

    assert_no_secret_in_dir(&sync_dir, "SUPER_SECRET_GLOBAL_999");
    assert_no_secret_in_dir(&sync_dir, "SUPER_SECRET_STAGING_888");
    assert_no_secret_in_dir(&sync_dir, "SUPER_SECRET_COL_777");

    let inspection = inspect_folder(&sync_dir);
    assert!(inspection.has_riftql_workspace);
    assert_eq!(inspection.collection_count, 1);
    assert_eq!(inspection.environment_count, 2);

    // Simulate second machine without .riftql.secrets.json that already holds its own local secret
    fs::remove_file(sync_dir.join(SECRETS_FILE_NAME)).unwrap();
    let db2 = Database::open_in_memory().unwrap();
    db2.with_conn(|conn2| {
        let g2 = list_environments(conn2)?
            .into_iter()
            .find(|e| e.is_global)
            .unwrap();
        upsert_environment(
            conn2,
            Some(g2.id),
            "Global".to_string(),
            true,
            vec![EnvironmentVariable {
                id: "local-id".into(),
                key: "global_secret".into(),
                value: "MACHINE_LOCAL_SECRET".into(),
                is_secret: true,
                enabled: true,
            }],
        )?;

        let (export, secrets) = read_workspace_from_dir(&sync_dir)?;
        crate::db::environments::reconcile_workspace_from_disk(conn2, export, &secrets)?;

        let cols = list_collections(conn2)?;
        assert_eq!(cols.len(), 1);
        assert_eq!(cols[0].name, "Billing API");
        assert_eq!(cols[0].base_url, "https://billing.local");
        assert_eq!(list_folders(conn2)?.len(), 2);
        assert_eq!(list_saved_requests(conn2)?.len(), 2);

        let envs = list_environments(conn2)?;
        let global = envs.iter().find(|e| e.is_global).unwrap();
        let secret_var = global
            .variables
            .iter()
            .find(|v| v.key == "global_secret")
            .unwrap();
        assert_eq!(secret_var.value, "MACHINE_LOCAL_SECRET");

        Ok(())
    })
    .unwrap();
}

#[test]
fn auto_sync_prunes_stale_files_and_watcher_reconciles_external_changes_safely() {
    let temp = TempDir::new().unwrap();
    let app_data_dir = temp.path().join("appdata");
    let sync_dir = temp.path().join("workspace-folder");
    fs::create_dir_all(&sync_dir).unwrap();
    fs::write(sync_dir.join("README.md"), "# Team API Repo\n").unwrap();

    let db = Database::open_with_default_dir(app_data_dir.clone()).unwrap();
    let (col_id, req_keep_id, req_delete_id) = {
        let mut s = AppSettings::default();
        s.ui_font_size = 18;
        db.with_conn(|conn| {
            save_app_settings(conn, &s)?;
            record_history(
                conn,
                NewHistoryEntryInput {
                    id: None,
                    method: "GET".into(),
                    protocol: RequestProtocol::Rest,
                    url: "https://example.com".into(),
                    request_snapshot: sample_rest_draft("Hist", "https://example.com"),
                    status: 200,
                    status_text: "OK".into(),
                    duration_ms: 12,
                    size_bytes: 2,
                    response_headers: vec![HeaderPair {
                        key: "content-type".into(),
                        value: "application/json".into(),
                    }],
                    response_body: Some("{}".into()),
                    response_content_type: Some("application/json".into()),
                    is_binary: false,
                },
            )?;
            let col = upsert_collection(
                conn,
                None,
                "Core".into(),
                "".into(),
                None,
                AuthConfig::None,
                vec![],
                None,
            )?;
            let r1 = upsert_saved_request(
                conn,
                None,
                col.id.clone(),
                None,
                sample_rest_draft("Old Name", "https://api.test/one"),
                None,
            )?;
            let r2 = upsert_saved_request(
                conn,
                None,
                col.id.clone(),
                None,
                sample_rest_draft("To Remove Externally", "https://api.test/two"),
                None,
            )?;
            Ok((col.id, r1.id, r2.id))
        })
        .unwrap()
    };

    let sync = GitSyncManager::new(app_data_dir);
    let enabled = sync
        .configure_and_enable(
            &db,
            sync_dir.to_string_lossy().to_string(),
            None,
            None,
            GitSyncMigrationMode::MigrateToFolder,
            false,
            true,
            None,
            None,
        )
        .unwrap();
    assert!(enabled.status.enabled);
    assert!(!enabled.workspace_reloaded);

    // Self-writes shouldn't trigger external reload
    assert!(!sync.poll_external_changes(&db).unwrap());

    // Rename req_keep -> auto-sync removes stale old-name file and preserves README.md
    let col_dir_name = crate::sync::fs_layout::slugify_entity("Core", &col_id);
    let old_req_file = sync_dir
        .join("collections")
        .join(&col_dir_name)
        .join("requests")
        .join(format!(
            "{}.json",
            crate::sync::fs_layout::slugify_entity("Old Name", &req_keep_id)
        ));
    assert!(old_req_file.exists());

    db.with_conn(|conn| {
        upsert_saved_request(
            conn,
            Some(req_keep_id.clone()),
            col_id.clone(),
            None,
            sample_rest_draft("Renamed Endpoint", "https://api.test/one"),
            None,
        )?;
        Ok(())
    })
    .unwrap();
    sync.on_workspace_mutated(&db);

    assert!(!old_req_file.exists());
    let new_req_file = sync_dir
        .join("collections")
        .join(&col_dir_name)
        .join("requests")
        .join(format!(
            "{}.json",
            crate::sync::fs_layout::slugify_entity("Renamed Endpoint", &req_keep_id)
        ));
    assert!(new_req_file.exists());
    assert_eq!(
        fs::read_to_string(sync_dir.join("README.md")).unwrap(),
        "# Team API Repo\n"
    );
    assert!(!sync.poll_external_changes(&db).unwrap());

    // Simulate external deletion (e.g. git pull removed a request file)
    let del_req_file = sync_dir
        .join("collections")
        .join(&col_dir_name)
        .join("requests")
        .join(format!(
            "{}.json",
            crate::sync::fs_layout::slugify_entity("To Remove Externally", &req_delete_id)
        ));
    assert!(del_req_file.exists());
    fs::remove_file(&del_req_file).unwrap();

    assert!(sync.poll_external_changes(&db).unwrap());
    db.with_conn(|conn| {
        let reqs = list_saved_requests(conn)?;
        assert_eq!(reqs.len(), 1);
        assert_eq!(reqs[0].id, req_keep_id);
        // History and app settings remain intact
        assert_eq!(list_history(conn)?.len(), 1);
        assert_eq!(get_app_settings(conn)?.ui_font_size, 18);
        Ok(())
    })
    .unwrap();

    // Corrupt external JSON leaves SQLite intact and surfaces error on status
    fs::write(&new_req_file, "{ invalid json").unwrap();
    assert!(sync.poll_external_changes(&db).is_err());
    assert!(sync.status().last_error.is_some());
    db.with_conn(|conn| {
        assert_eq!(list_saved_requests(conn)?.len(), 1);
        Ok(())
    })
    .unwrap();
}

#[test]
fn git_sync_config_persists_across_reopen_and_disable_returns_to_sqlite_mode() {
    let temp = TempDir::new().unwrap();
    let app_data_dir = temp.path().join("appdata");
    let sync_dir = temp.path().join("sync-folder");
    let db = Database::open_with_default_dir(app_data_dir.clone()).unwrap();

    db.with_conn(|conn| {
        upsert_collection(
            conn,
            None,
            "Persisted Collection".into(),
            "".into(),
            None,
            AuthConfig::None,
            vec![],
            None,
        )?;
        Ok(())
    })
    .unwrap();

    {
        let manager = GitSyncManager::new(app_data_dir.clone());
        let res = manager
            .configure_and_enable(
                &db,
                sync_dir.to_string_lossy().to_string(),
                None,
                None,
                GitSyncMigrationMode::MigrateToFolder,
                false,
                true,
                None,
                None,
            )
            .unwrap();
        assert!(res.status.enabled);
        assert!(has_workspace_files(&sync_dir));
    }

    // Reopen simulates app restart
    let reopened = GitSyncManager::new(app_data_dir.clone());
    assert!(reopened.is_enabled());
    assert_eq!(
        reopened.status().folder_path.as_deref(),
        Some(sync_dir.to_string_lossy().as_ref())
    );

    let fp_before_disable = compute_dir_fingerprint(&sync_dir).unwrap();
    let disabled_status = reopened.disable().unwrap();
    assert!(!disabled_status.enabled);

    let reopened_disabled = GitSyncManager::new(app_data_dir);
    assert!(!reopened_disabled.is_enabled());

    // Mutate SQLite while sync is disabled -> disk folder must remain untouched
    db.with_conn(|conn| {
        upsert_collection(
            conn,
            None,
            "SQLite Only Collection".into(),
            "".into(),
            None,
            AuthConfig::None,
            vec![],
            None,
        )?;
        Ok(())
    })
    .unwrap();
    reopened_disabled.on_workspace_mutated(&db);
    assert_eq!(compute_dir_fingerprint(&sync_dir).unwrap(), fp_before_disable);
}

#[test]
fn git_workflow_init_commit_push_clone_and_pull_roundtrip() {
    if git::git_version().is_none() {
        return;
    }

    let temp = TempDir::new().unwrap();
    let bare_remote = temp.path().join("remote.git");
    let init_bare = Command::new("git")
        .args(["init", "--bare"])
        .arg(&bare_remote)
        .output()
        .unwrap();
    assert!(init_bare.status.success());

    // Machine A setup
    let app_a = temp.path().join("app-a");
    let ws_a = temp.path().join("ws-a");
    let db_a = Database::open_with_default_dir(app_a.clone()).unwrap();
    let (col_id, req_id) = db_a
        .with_conn(|conn| {
            let envs = list_environments(conn)?;
            let global = envs.into_iter().find(|e| e.is_global).unwrap();
            upsert_environment(
                conn,
                Some(global.id),
                "Global".into(),
                true,
                vec![EnvironmentVariable {
                    id: "secret-a".into(),
                    key: "token".into(),
                    value: "MACHINE_A_PRIVATE_TOKEN".into(),
                    is_secret: true,
                    enabled: true,
                }],
            )?;
            let col = upsert_collection(
                conn,
                None,
                "Orders".into(),
                "".into(),
                Some("https://orders.test".into()),
                AuthConfig::None,
                vec![],
                None,
            )?;
            let req = upsert_saved_request(
                conn,
                None,
                col.id.clone(),
                None,
                sample_rest_draft("List Orders", "/v1/orders"),
                None,
            )?;
            Ok((col.id, req.id))
        })
        .unwrap();

    let mgr_a = GitSyncManager::new(app_a);
    mgr_a
        .configure_and_enable(
            &db_a,
            ws_a.to_string_lossy().to_string(),
            Some(bare_remote.to_string_lossy().to_string()),
            Some("main".to_string()),
            GitSyncMigrationMode::MigrateToFolder,
            true,
            true,
            None,
            None,
        )
        .unwrap();
    configure_git_identity(&ws_a);

    let push_res_a = mgr_a
        .git_commit_push_workspace(&db_a, "feat: initial workspace".into(), true)
        .unwrap();
    assert!(push_res_a.status.git.is_git_repo);
    assert_eq!(push_res_a.status.git.branch.as_deref(), Some("main"));
    assert_eq!(push_res_a.status.git.changed_files, 0);

    // Machine B clones bare remote and edits request
    let app_b = temp.path().join("app-b");
    let ws_b = temp.path().join("ws-b");
    let db_b = Database::open_with_default_dir(app_b.clone()).unwrap();
    let mgr_b = GitSyncManager::new(app_b);
    let clone_res_b = mgr_b
        .configure_and_enable(
            &db_b,
            ws_b.to_string_lossy().to_string(),
            Some(bare_remote.to_string_lossy().to_string()),
            Some("main".to_string()),
            GitSyncMigrationMode::CloneRepo,
            false,
            true,
            None,
            None,
        )
        .unwrap();
    assert!(clone_res_b.workspace_reloaded);
    configure_git_identity(&ws_b);

    // Update request in Machine B SQLite -> auto-sync writes -> commit & push
    db_b.with_conn(|conn| {
        let mut draft = sample_rest_draft("List Orders V2", "/v2/orders");
        draft.id = req_id.clone();
        upsert_saved_request(conn, Some(req_id.clone()), col_id.clone(), None, draft, None)?;
        Ok(())
    })
    .unwrap();
    mgr_b.on_workspace_mutated(&db_b);
    mgr_b
        .git_commit_push_workspace(&db_b, "feat: upgrade orders endpoint to v2".into(), true)
        .unwrap();

    // Machine A pulls -> reloads SQLite with V2 endpoint AND keeps Machine A local secret intact
    let pull_res_a = mgr_a.git_pull_workspace(&db_a).unwrap();
    assert!(pull_res_a.workspace_reloaded);

    db_a.with_conn(|conn| {
        let reqs = list_saved_requests(conn)?;
        assert_eq!(reqs.len(), 1);
        assert_eq!(reqs[0].name, "List Orders V2");
        assert_eq!(reqs[0].url, "/v2/orders");

        let envs = list_environments(conn)?;
        let global = envs.into_iter().find(|e| e.is_global).unwrap();
        let tok = global.variables.iter().find(|v| v.key == "token").unwrap();
        assert_eq!(tok.value, "MACHINE_A_PRIVATE_TOKEN");
        Ok(())
    })
    .unwrap();
}

#[test]
fn git_https_credential_helper_supplies_credentials_and_persists_locally() {
    if git::git_version().is_none() {
        return;
    }

    let creds = GitCredentials {
        username: "dpuente".to_string(),
        password: "pat_$%!secret'\" value".to_string(),
    };
    let (resolved_user, resolved_pass) = git::test_credential_fill(
        "https://git-php.dinalab.com/dpuente/riftql-workspace/",
        &creds,
    )
    .expect("git credential fill should work with ephemeral helper");
    assert_eq!(resolved_user, "dpuente");
    assert_eq!(resolved_pass, "pat_$%!secret'\" value");

    // Verify default username fallback ("git") for token-only auth
    let token_only = GitCredentials {
        username: String::new(),
        password: "glpat-xyz".to_string(),
    };
    let (tok_user, tok_pass) = git::test_credential_fill(
        "https://git-php.dinalab.com/dpuente/riftql-workspace/",
        &token_only,
    )
    .expect("token-only credential fill");
    assert_eq!(tok_user, "git");
    assert_eq!(tok_pass, "glpat-xyz");

    // Verify local credential persistence outside workspace dir and clean git remote URL
    let temp = TempDir::new().unwrap();
    let app_data_dir = temp.path().join("appdata");
    let sync_dir = temp.path().join("workspace");
    let db = Database::open_with_default_dir(app_data_dir.clone()).unwrap();

    let manager = GitSyncManager::new(app_data_dir.clone());
    let enabled = manager
        .configure_and_enable(
            &db,
            sync_dir.to_string_lossy().to_string(),
            Some("https://git-php.dinalab.com/dpuente/riftql-workspace/".to_string()),
            Some("main".to_string()),
            GitSyncMigrationMode::MigrateToFolder,
            true,
            true,
            Some("dpuente".to_string()),
            Some("pat-secret-token-123".to_string()),
        )
        .unwrap();
    assert!(enabled.status.has_credentials);
    assert_eq!(enabled.status.auth_username.as_deref(), Some("dpuente"));
    assert!(app_data_dir.join(GIT_SYNC_CREDENTIALS_FILE).exists());
    assert!(!sync_dir.join(GIT_SYNC_CREDENTIALS_FILE).exists());

    // `.git/config` must NOT contain plaintext token
    let git_config = fs::read_to_string(sync_dir.join(".git").join("config")).unwrap();
    assert!(!git_config.contains("pat-secret-token-123"));

    // Survives restart without leaking password in status
    let reopened = GitSyncManager::new(app_data_dir.clone());
    let status = reopened.status();
    assert!(status.has_credentials);
    assert_eq!(status.auth_username.as_deref(), Some("dpuente"));

    // Clearing credentials removes local file cleanly
    let cleared = reopened.save_git_credentials(None, None, true).unwrap();
    assert!(!cleared.has_credentials);
    assert_eq!(cleared.auth_username, None);
    assert!(!app_data_dir.join(GIT_SYNC_CREDENTIALS_FILE).exists());
}
