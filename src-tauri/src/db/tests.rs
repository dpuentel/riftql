use chrono::Utc;
use tempfile::TempDir;

use crate::db::collections::{
    delete_collection, list_collections, list_folders, list_saved_requests, upsert_collection,
    upsert_folder, upsert_saved_request,
};
use crate::db::cookies::{
    clear_cookies_by_domain, delete_cookie, list_cookies, upsert_cookie, upsert_cookies_batch,
};
use crate::db::environments::{
    delete_environment, export_workspace, import_workspace, list_environments, upsert_environment,
};
use crate::db::history::{
    clear_history, list_history, record_history, MAX_HISTORY_BODY_BYTES, MAX_HISTORY_ENTRIES,
};
use crate::db::migrations::run_migrations;
use crate::db::session::{list_session_tabs, save_session_tabs};
use crate::db::settings::{get_app_settings, save_app_settings};
use crate::db::Database;
use crate::models::{
    AppSettings, AuthConfig, CookieRecord, EnvironmentVariable, GraphQLConfig, HeaderPair,
    NewHistoryEntryInput, RequestBody, RequestDraft, RequestProtocol, RequestSettings,
    SessionTabRecord,
};

fn sample_draft(name: &str, url: &str) -> RequestDraft {
    RequestDraft {
        id: "draft-1".to_string(),
        name: name.to_string(),
        protocol: RequestProtocol::Rest,
        method: "GET".to_string(),
        url: url.to_string(),
        params: vec![],
        headers: vec![],
        auth: AuthConfig::Inherit,
        body: RequestBody::None,
        graphql: GraphQLConfig::default(),
        settings: RequestSettings::default(),
    }
}

#[test]
fn migrations_are_idempotent_and_seed_global_env() {
    let db = Database::open_in_memory().expect("open memory db");
    db.with_conn(|conn| {
        run_migrations(conn)?;
        let envs = list_environments(conn)?;
        assert_eq!(envs.len(), 1);
        assert!(envs[0].is_global);
        assert_eq!(envs[0].name, "Global");
        Ok(())
    })
    .unwrap();
}

#[test]
fn nested_folders_prevent_cycles_and_cascade_on_delete() {
    let db = Database::open_in_memory().unwrap();
    db.with_conn(|conn| {
        let col = upsert_collection(
            conn,
            None,
            "Core API".into(),
            "Main endpoints".into(),
            Some("https://api.example.com".into()),
            AuthConfig::Bearer {
                token: "col-secret".into(),
            },
            vec![],
            None,
        )?;
        let root_folder = upsert_folder(
            conn,
            None,
            col.id.clone(),
            None,
            "Users".into(),
            Some("/v1".into()),
            AuthConfig::Inherit,
            None,
        )?;
        let child_folder = upsert_folder(
            conn,
            None,
            col.id.clone(),
            Some(root_folder.id.clone()),
            "Admin".into(),
            Some("/admin".into()),
            AuthConfig::Inherit,
            None,
        )?;

        // Attempt cycle: move root_folder under child_folder
        let cycle_err = upsert_folder(
            conn,
            Some(root_folder.id.clone()),
            col.id.clone(),
            Some(child_folder.id.clone()),
            "Users".into(),
            None,
            AuthConfig::Inherit,
            None,
        );
        assert!(cycle_err.is_err());

        upsert_saved_request(
            conn,
            None,
            col.id.clone(),
            Some(child_folder.id.clone()),
            sample_draft("List Admins", "https://api.example.com/admins"),
            None,
        )?;
        assert_eq!(list_saved_requests(conn)?.len(), 1);

        // Deleting collection cascades folders and requests
        delete_collection(conn, &col.id)?;
        assert!(list_collections(conn)?.is_empty());
        assert!(list_folders(conn)?.is_empty());
        assert!(list_saved_requests(conn)?.is_empty());
        Ok(())
    })
    .unwrap();
}

#[test]
fn history_caps_entries_and_large_or_binary_bodies() {
    let db = Database::open_in_memory().unwrap();
    db.with_conn(|conn| {
        let huge = "x".repeat(MAX_HISTORY_BODY_BYTES + 100);
        let huge_entry = record_history(
            conn,
            NewHistoryEntryInput {
                id: None,
                method: "GET".into(),
                protocol: RequestProtocol::Rest,
                url: "https://example.com/huge".into(),
                request_snapshot: sample_draft("Huge", "https://example.com/huge"),
                status: 200,
                status_text: "OK".into(),
                duration_ms: 12,
                size_bytes: huge.len() as i64,
                response_headers: vec![HeaderPair {
                    key: "content-type".into(),
                    value: "text/plain".into(),
                }],
                response_body: Some(huge),
                response_content_type: Some("text/plain".into()),
                is_binary: false,
            },
        )?;
        assert!(huge_entry.response_body.is_none());

        let bin_entry = record_history(
            conn,
            NewHistoryEntryInput {
                id: None,
                method: "GET".into(),
                protocol: RequestProtocol::Rest,
                url: "https://example.com/img.png".into(),
                request_snapshot: sample_draft("Img", "https://example.com/img.png"),
                status: 200,
                status_text: "OK".into(),
                duration_ms: 8,
                size_bytes: 1024,
                response_headers: vec![],
                response_body: Some("should-not-store".into()),
                response_content_type: Some("image/png".into()),
                is_binary: true,
            },
        )?;
        assert!(bin_entry.response_body.is_none());

        for idx in 0..(MAX_HISTORY_ENTRIES + 15) {
            record_history(
                conn,
                NewHistoryEntryInput {
                    id: None,
                    method: "GET".into(),
                    protocol: RequestProtocol::Rest,
                    url: format!("https://example.com/item/{idx}"),
                    request_snapshot: sample_draft("Item", &format!("https://example.com/item/{idx}")),
                    status: 200,
                    status_text: "OK".into(),
                    duration_ms: 5,
                    size_bytes: 20,
                    response_headers: vec![],
                    response_body: Some("{\"ok\":true}".into()),
                    response_content_type: Some("application/json".into()),
                    is_binary: false,
                },
            )?;
        }

        let listed = list_history(conn)?;
        assert_eq!(listed.len(), MAX_HISTORY_ENTRIES);
        assert!(listed[0].url.ends_with(&format!("/item/{}", MAX_HISTORY_ENTRIES + 14)));
        clear_history(conn)?;
        assert!(list_history(conn)?.is_empty());
        Ok(())
    })
    .unwrap();
}

#[test]
fn session_tabs_preserve_order_and_active_flag() {
    let db = Database::open_in_memory().unwrap();
    db.with_conn(|conn| {
        let tabs = vec![
            SessionTabRecord {
                id: "t1".into(),
                saved_request_id: None,
                title: "First".into(),
                is_dirty: false,
                draft: sample_draft("First", "https://one.test"),
                sort_order: 0,
                is_active: false,
                updated_at: Utc::now().to_rfc3339(),
            },
            SessionTabRecord {
                id: "t2".into(),
                saved_request_id: Some("req-9".into()),
                title: "Second".into(),
                is_dirty: true,
                draft: sample_draft("Second", "https://two.test"),
                sort_order: 1,
                is_active: true,
                updated_at: Utc::now().to_rfc3339(),
            },
        ];
        save_session_tabs(conn, tabs)?;
        let restored = list_session_tabs(conn)?;
        assert_eq!(restored.len(), 2);
        assert_eq!(restored[0].id, "t1");
        assert_eq!(restored[1].id, "t2");
        assert!(restored[1].is_active);
        assert!(restored[1].is_dirty);
        Ok(())
    })
    .unwrap();
}

#[test]
fn cookie_crud_upserts_and_expires_cleanly() {
    let db = Database::open_in_memory().unwrap();
    db.with_conn(|conn| {
        let c1 = upsert_cookie(
            conn,
            CookieRecord {
                id: String::new(),
                domain: "API.Example.COM".into(),
                path: "/".into(),
                name: "sid".into(),
                value: "abc123".into(),
                expires_at: None,
                secure: true,
                http_only: true,
                same_site: Some("Lax".into()),
                host_only: true,
                updated_at: String::new(),
            },
        )?;
        assert_eq!(c1.domain, "api.example.com");

        // Conflict updates value without duplicating
        upsert_cookie(
            conn,
            CookieRecord {
                id: String::new(),
                domain: "api.example.com".into(),
                path: "/".into(),
                name: "sid".into(),
                value: "xyz999".into(),
                expires_at: None,
                secure: true,
                http_only: true,
                same_site: Some("Lax".into()),
                host_only: true,
                updated_at: String::new(),
            },
        )?;
        let cookies = list_cookies(conn)?;
        assert_eq!(cookies.len(), 1);
        assert_eq!(cookies[0].value, "xyz999");

        // Batch with expired timestamp removes existing cookie
        upsert_cookies_batch(
            conn,
            vec![CookieRecord {
                id: String::new(),
                domain: "api.example.com".into(),
                path: "/".into(),
                name: "sid".into(),
                value: "".into(),
                expires_at: Some(1),
                secure: false,
                http_only: false,
                same_site: None,
                host_only: true,
                updated_at: String::new(),
            }],
        )?;
        assert!(list_cookies(conn)?.is_empty());

        let extra = upsert_cookie(
            conn,
            CookieRecord {
                id: String::new(),
                domain: "other.test".into(),
                path: "/".into(),
                name: "prefs".into(),
                value: "dark".into(),
                expires_at: None,
                secure: false,
                http_only: false,
                same_site: None,
                host_only: true,
                updated_at: String::new(),
            },
        )?;
        clear_cookies_by_domain(conn, "other.test")?;
        assert!(list_cookies(conn)?.is_empty());
        delete_cookie(conn, &extra.id)?;
        Ok(())
    })
    .unwrap();
}

#[test]
fn workspace_export_strips_secrets_and_roundtrips_cleanly() {
    let db = Database::open_in_memory().unwrap();
    db.with_conn(|conn| {
        let staging = upsert_environment(
            conn,
            None,
            "Staging".into(),
            false,
            vec![
                EnvironmentVariable {
                    id: "v1".into(),
                    key: "base_url".into(),
                    value: "https://staging.api.local".into(),
                    is_secret: false,
                    enabled: true,
                },
                EnvironmentVariable {
                    id: "v2".into(),
                    key: "api_secret".into(),
                    value: "super-sensitive-key".into(),
                    is_secret: true,
                    enabled: true,
                },
            ],
        )?;

        // Global environment cannot be deleted
        let envs = list_environments(conn)?;
        let global = envs.iter().find(|e| e.is_global).unwrap();
        assert!(delete_environment(conn, &global.id).is_err());

        let col = upsert_collection(
            conn,
            None,
            "Billing".into(),
            "".into(),
            Some("https://billing.api.local".into()),
            AuthConfig::None,
            vec![EnvironmentVariable {
                id: "cv1".into(),
                key: "col_secret".into(),
                value: "hidden".into(),
                is_secret: true,
                enabled: true,
            }],
            None,
        )?;
        upsert_saved_request(
            conn,
            None,
            col.id.clone(),
            None,
            sample_draft("Invoices", "{{base_url}}/invoices"),
            None,
        )?;

        let exported = export_workspace(conn)?;
        let exported_staging = exported
            .environments
            .iter()
            .find(|e| e.id == staging.id)
            .unwrap();
        assert_eq!(exported_staging.variables[0].value, "https://staging.api.local");
        assert_eq!(exported_staging.variables[1].value, "");
        assert_eq!(exported.collections[0].variables[0].value, "");

        // Import into a fresh in-memory DB
        let db2 = Database::open_in_memory()?;
        db2.with_conn(|conn2| {
            import_workspace(conn2, exported)?;
            assert_eq!(list_collections(conn2)?.len(), 1);
            assert_eq!(list_saved_requests(conn2)?.len(), 1);
            let envs2 = list_environments(conn2)?;
            assert_eq!(envs2.len(), 2);
            Ok(())
        })?;

        let mut settings = AppSettings::default();
        settings.send_cookies = false;
        settings.ui_font_size = 18;
        settings.code_font_size = 15;
        save_app_settings(conn, &settings)?;
        let loaded = get_app_settings(conn)?;
        assert!(!loaded.send_cookies);
        assert_eq!(loaded.ui_font_size, 18);
        assert_eq!(loaded.code_font_size, 15);
        Ok(())
    })
    .unwrap();
}

#[test]
fn app_settings_deserializes_legacy_json_with_default_font_sizes() {
    let legacy_json = r#"{
        "theme": "dark",
        "layout": "horizontal",
        "verifySsl": true,
        "followRedirects": true,
        "maxRedirects": 10,
        "timeoutMs": 30000,
        "sendCookies": true
    }"#;
    let parsed: AppSettings = serde_json::from_str(legacy_json).expect("legacy settings json");
    assert_eq!(parsed.ui_font_size, 16);
    assert_eq!(parsed.code_font_size, 13);
}

#[test]
fn configurable_data_directory_migrates_persists_and_resets_safely() {
    let root = TempDir::new().unwrap();
    let default_dir = root.path().join("default-data");
    let custom_dir = root.path().join("custom-data");
    let existing_target_dir = root.path().join("existing-target");

    // Seed existing target DB separately so we verify non-destructive switch
    {
        let seed_db = Database::open(&existing_target_dir.join("riftql.db")).unwrap();
        seed_db
            .with_conn(|conn| {
                upsert_collection(
                    conn,
                    None,
                    "Existing Target".into(),
                    "".into(),
                    None,
                    AuthConfig::None,
                    vec![],
                    None,
                )?;
                Ok(())
            })
            .unwrap();
    }

    // Open with default dir and create a collection
    let db = Database::open_with_default_dir(default_dir.clone()).unwrap();
    assert!(!db.storage_info().is_custom);
    db.with_conn(|conn| {
        upsert_collection(
            conn,
            None,
            "Migrated API".into(),
            "".into(),
            None,
            AuthConfig::None,
            vec![],
            None,
        )?;
        Ok(())
    })
    .unwrap();

    // Migrate to empty custom directory
    let info_custom = db
        .set_data_directory(Some(custom_dir.clone()), true)
        .expect("switch to custom dir");
    assert!(info_custom.is_custom);
    assert!(custom_dir.join("riftql.db").exists());
    assert!(default_dir.join("storage-config.json").exists());
    db.with_conn(|conn| {
        let cols = list_collections(conn)?;
        assert_eq!(cols.len(), 1);
        assert_eq!(cols[0].name, "Migrated API");
        Ok(())
    })
    .unwrap();
    drop(db);

    // Reopening with default_dir resumes custom_dir automatically
    let reopened = Database::open_with_default_dir(default_dir.clone()).unwrap();
    assert!(reopened.storage_info().is_custom);
    assert_eq!(
        reopened.storage_info().current_data_dir,
        custom_dir.to_string_lossy()
    );
    reopened
        .with_conn(|conn| {
            let cols = list_collections(conn)?;
            assert_eq!(cols[0].name, "Migrated API");
            Ok(())
        })
        .unwrap();

    // Switching to a folder that already contains riftql.db preserves destination data
    reopened
        .set_data_directory(Some(existing_target_dir.clone()), true)
        .expect("switch to existing db dir");
    reopened
        .with_conn(|conn| {
            let cols = list_collections(conn)?;
            assert_eq!(cols.len(), 1);
            assert_eq!(cols[0].name, "Existing Target");
            Ok(())
        })
        .unwrap();

    // Reset back to system default
    let reset_info = reopened
        .set_data_directory(None, false)
        .expect("reset to default");
    assert!(!reset_info.is_custom);
    assert!(!default_dir.join("storage-config.json").exists());
}

#[test]
fn linux_appimage_desktop_entry_includes_startup_wm_class_and_icon() {
    let temp = TempDir::new().unwrap();
    let sample_png = b"fake-png-bytes";
    crate::linux_desktop::write_appimage_desktop_entry(
        temp.path(),
        "/home/user/Apps/RiftQL_0.1.0_amd64.AppImage",
        sample_png,
    )
    .unwrap();

    let icon_path = temp
        .path()
        .join("icons")
        .join("hicolor")
        .join("256x256")
        .join("apps")
        .join("com.riftql.app.png");
    let desktop_path = temp
        .path()
        .join("applications")
        .join("com.riftql.app.desktop");
    assert_eq!(std::fs::read(&icon_path).unwrap(), sample_png);

    let desktop_text = std::fs::read_to_string(&desktop_path).unwrap();
    assert!(desktop_text.contains("StartupWMClass=com.riftql.app"));
    assert!(desktop_text.contains("TryExec=/home/user/Apps/RiftQL_0.1.0_amd64.AppImage"));
    assert!(desktop_text.contains(&format!("Icon={}", icon_path.to_string_lossy())));
}

#[test]
fn base_url_persists_on_collections_folders_and_roundtrips_export() {
    let db = Database::open_in_memory().unwrap();
    db.with_conn(|conn| {
        run_migrations(conn)?;

        let col = upsert_collection(
            conn,
            None,
            "Payments".into(),
            "".into(),
            Some("https://api.payments.test".into()),
            AuthConfig::None,
            vec![],
            None,
        )?;
        assert_eq!(col.base_url, "https://api.payments.test");

        let folder = upsert_folder(
            conn,
            None,
            col.id.clone(),
            None,
            "V2".into(),
            Some("/v2".into()),
            AuthConfig::Inherit,
            None,
        )?;
        assert_eq!(folder.base_url, "/v2");

        let exported = export_workspace(conn)?;
        let db2 = Database::open_in_memory()?;
        db2.with_conn(|conn2| {
            import_workspace(conn2, exported)?;
            let cols2 = list_collections(conn2)?;
            let folders2 = list_folders(conn2)?;
            assert_eq!(cols2[0].base_url, "https://api.payments.test");
            assert_eq!(folders2[0].base_url, "/v2");
            Ok(())
        })?;
        Ok(())
    })
    .unwrap();
}
