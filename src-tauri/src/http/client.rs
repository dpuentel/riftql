use std::collections::{HashMap, VecDeque};
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use chrono::Utc;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE, COOKIE, LOCATION};
use reqwest::Method;
use tokio::sync::watch;
use url::Url;
use uuid::Uuid;

use crate::db::cookies::{list_cookies, upsert_cookies_batch};
use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::http::cookies::{
    build_cookie_header, match_cookies_for_url, parse_set_cookie_header,
};
use crate::http::multipart::build_multipart_form;
use crate::models::{
    CookieRecord, GraphQLConfig, HeaderPair, HttpExecutionRequest, HttpExecutionResponse,
    ParsedResponseCookie, RawBodyLanguage, RequestBody, ResponseBodyKind,
};

pub const LARGE_TEXT_THRESHOLD_BYTES: usize = 5 * 1024 * 1024;
pub const LARGE_TEXT_PREVIEW_BYTES: usize = 250_000;
pub const IMAGE_INLINE_LIMIT_BYTES: usize = 15 * 1024 * 1024;
const MAX_CACHED_RESPONSES: usize = 10;

pub struct InFlightRegistry {
    active: Mutex<HashMap<String, watch::Sender<bool>>>,
}

impl Default for InFlightRegistry {
    fn default() -> Self {
        Self {
            active: Mutex::new(HashMap::new()),
        }
    }
}

impl InFlightRegistry {
    pub fn register(&self, request_id: &str) -> watch::Receiver<bool> {
        let (tx, rx) = watch::channel(false);
        let mut guard = self.active.lock().expect("in-flight mutex poisoned");
        guard.insert(request_id.to_string(), tx);
        rx
    }

    pub fn cancel(&self, request_id: &str) -> bool {
        let guard = self.active.lock().expect("in-flight mutex poisoned");
        if let Some(tx) = guard.get(request_id) {
            let _ = tx.send(true);
            true
        } else {
            false
        }
    }

    pub fn remove(&self, request_id: &str) {
        let mut guard = self.active.lock().expect("in-flight mutex poisoned");
        guard.remove(request_id);
    }
}

struct InFlightGuard<'a> {
    registry: &'a InFlightRegistry,
    request_id: String,
}

impl<'a> Drop for InFlightGuard<'a> {
    fn drop(&mut self) {
        self.registry.remove(&self.request_id);
    }
}

pub struct ResponseBodyCache {
    entries: Mutex<VecDeque<(String, Vec<u8>)>>,
}

impl Default for ResponseBodyCache {
    fn default() -> Self {
        Self {
            entries: Mutex::new(VecDeque::with_capacity(MAX_CACHED_RESPONSES)),
        }
    }
}

impl ResponseBodyCache {
    pub fn insert(&self, response_id: String, bytes: Vec<u8>) {
        let mut guard = self.entries.lock().expect("cache mutex poisoned");
        guard.retain(|(id, _)| id != &response_id);
        if guard.len() >= MAX_CACHED_RESPONSES {
            guard.pop_front();
        }
        guard.push_back((response_id, bytes));
    }

    pub fn get(&self, response_id: &str) -> Option<Vec<u8>> {
        let guard = self.entries.lock().expect("cache mutex poisoned");
        guard
            .iter()
            .find(|(id, _)| id == response_id)
            .map(|(_, bytes)| bytes.clone())
    }

    pub async fn save_to_file(&self, response_id: &str, target_path: &Path) -> AppResult<usize> {
        let bytes = self.get(response_id).ok_or_else(|| {
            AppError::NotFound(format!(
                "Response body \"{response_id}\" is no longer cached in memory"
            ))
        })?;
        let len = bytes.len();
        tokio::fs::write(target_path, bytes).await?;
        Ok(len)
    }
}

fn slice_utf8_prefix(text: &str, max_bytes: usize) -> String {
    if text.len() <= max_bytes {
        return text.to_string();
    }
    let mut end = max_bytes;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    text[..end].to_string()
}

fn is_raster_image_content_type(ct: &str) -> bool {
    let lower = ct.to_ascii_lowercase();
    let mime = lower.split(';').next().unwrap_or("").trim();
    mime.starts_with("image/") && mime != "image/svg+xml"
}

fn is_explicit_binary_content_type(ct: &str) -> bool {
    let lower = ct.to_ascii_lowercase();
    let mime = lower.split(';').next().unwrap_or("").trim();
    mime == "application/pdf"
        || mime == "application/octet-stream"
        || mime == "application/zip"
        || mime == "application/gzip"
        || mime.starts_with("audio/")
        || mime.starts_with("video/")
        || mime.starts_with("font/")
}

fn build_graphql_payload(graphql: &Option<GraphQLConfig>) -> AppResult<String> {
    let gql = graphql.as_ref().ok_or_else(|| {
        AppError::Validation("GraphQL body selected without GraphQL query payload".to_string())
    })?;
    let mut map = serde_json::Map::new();
    map.insert(
        "query".to_string(),
        serde_json::Value::String(gql.query.clone()),
    );
    let vars_trimmed = gql.variables.trim();
    if !vars_trimmed.is_empty() {
        let parsed: serde_json::Value = serde_json::from_str(vars_trimmed).map_err(|err| {
            AppError::Validation(format!("Invalid GraphQL variables JSON: {err}"))
        })?;
        map.insert("variables".to_string(), parsed);
    }
    if let Some(op) = gql
        .operation_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        map.insert(
            "operationName".to_string(),
            serde_json::Value::String(op.to_string()),
        );
    }
    Ok(serde_json::Value::Object(map).to_string())
}

fn default_content_type_for_body(body: &RequestBody) -> Option<&'static str> {
    match body {
        RequestBody::Json { .. } | RequestBody::Graphql => Some("application/json"),
        RequestBody::UrlEncoded { .. } => Some("application/x-www-form-urlencoded"),
        RequestBody::Raw { language, .. } => match language {
            RawBodyLanguage::Text => Some("text/plain"),
            RawBodyLanguage::Xml => Some("application/xml"),
            RawBodyLanguage::Html => Some("text/html"),
            RawBodyLanguage::Javascript => Some("application/javascript"),
        },
        RequestBody::None | RequestBody::FormData { .. } => None,
    }
}

async fn apply_request_body(
    mut builder: reqwest::RequestBuilder,
    body: &RequestBody,
    graphql: &Option<GraphQLConfig>,
) -> AppResult<reqwest::RequestBuilder> {
    match body {
        RequestBody::None => Ok(builder),
        RequestBody::Json { content } => {
            builder = builder.body(content.clone());
            Ok(builder)
        }
        RequestBody::Raw { content, .. } => {
            builder = builder.body(content.clone());
            Ok(builder)
        }
        RequestBody::UrlEncoded { items } => {
            let pairs: Vec<(String, String)> = items
                .iter()
                .filter(|item| item.enabled && !item.key.trim().is_empty())
                .map(|item| (item.key.trim().to_string(), item.value.clone()))
                .collect();
            builder = builder.form(&pairs);
            Ok(builder)
        }
        RequestBody::FormData { items } => {
            let form = build_multipart_form(items).await?;
            builder = builder.multipart(form);
            Ok(builder)
        }
        RequestBody::Graphql => {
            let json_payload = build_graphql_payload(graphql)?;
            builder = builder.body(json_payload);
            Ok(builder)
        }
    }
}

pub async fn execute_http_request(
    db: &Database,
    registry: &InFlightRegistry,
    cache: &ResponseBodyCache,
    req: HttpExecutionRequest,
) -> AppResult<HttpExecutionResponse> {
    let initial_url = Url::parse(req.url.trim())?;
    if initial_url.scheme() != "http" && initial_url.scheme() != "https" {
        return Err(AppError::Validation(format!(
            "Unsupported URL scheme \"{}\". Only http and https are supported.",
            initial_url.scheme()
        )));
    }

    let initial_method = Method::from_bytes(req.method.trim().to_ascii_uppercase().as_bytes())
        .map_err(|_| AppError::Validation(format!("Invalid HTTP method: {}", req.method)))?;

    let timeout_ms = req.timeout_ms.max(100);
    let timeout = Duration::from_millis(timeout_ms);

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(!req.verify_ssl)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|err| AppError::Http(err.to_string()))?;

    let mut cancel_rx = registry.register(&req.request_id);
    let _guard = InFlightGuard {
        registry,
        request_id: req.request_id.clone(),
    };

    let started = Instant::now();

    let exec_future = async {
        let mut current_url = initial_url;
        let mut current_method = initial_method;
        let mut drop_body = false;
        let mut redirect_count: u32 = 0;
        let mut cross_origin_redirected = false;
        let mut all_parsed_cookies: Vec<ParsedResponseCookie> = Vec::new();

        loop {
            let mut header_map = HeaderMap::new();
            let mut manual_cookie_parts: Vec<String> = Vec::new();
            let is_multipart = !drop_body && matches!(req.body, RequestBody::FormData { .. });

            for pair in &req.headers {
                let name_str = pair.key.trim();
                if name_str.is_empty() {
                    continue;
                }
                if name_str.eq_ignore_ascii_case("cookie") {
                    if !cross_origin_redirected {
                        manual_cookie_parts.push(pair.value.clone());
                    }
                    continue;
                }
                if cross_origin_redirected && name_str.eq_ignore_ascii_case("authorization") {
                    continue;
                }
                if is_multipart && name_str.eq_ignore_ascii_case("content-type") {
                    continue;
                }
                let header_name = HeaderName::from_bytes(name_str.as_bytes()).map_err(|e| {
                    AppError::Validation(format!("Invalid header name \"{name_str}\": {e}"))
                })?;
                let header_val = HeaderValue::from_str(&pair.value).map_err(|e| {
                    AppError::Validation(format!("Invalid header value for \"{name_str}\": {e}"))
                })?;
                header_map.append(header_name, header_val);
            }

            if !drop_body && !is_multipart && !header_map.contains_key(CONTENT_TYPE) {
                if let Some(default_ct) = default_content_type_for_body(&req.body) {
                    header_map.insert(CONTENT_TYPE, HeaderValue::from_static(default_ct));
                }
            }

            let manual_cookie_joined = if manual_cookie_parts.is_empty() {
                None
            } else {
                Some(manual_cookie_parts.join("; "))
            };

            if req.send_cookies {
                let stored_cookies = db.with_conn(|conn| list_cookies(conn))?;
                let now_epoch = Utc::now().timestamp();
                let matched = match_cookies_for_url(&stored_cookies, &current_url, now_epoch);
                if let Some(cookie_header_val) =
                    build_cookie_header(&matched, manual_cookie_joined.as_deref())
                {
                    if let Ok(hv) = HeaderValue::from_str(&cookie_header_val) {
                        header_map.insert(COOKIE, hv);
                    }
                }
            } else if let Some(manual) = manual_cookie_joined {
                if let Ok(hv) = HeaderValue::from_str(&manual) {
                    header_map.insert(COOKIE, hv);
                }
            }

            let mut builder = client
                .request(current_method.clone(), current_url.clone())
                .headers(header_map);

            if !drop_body {
                builder = apply_request_body(builder, &req.body, &req.graphql).await?;
            }

            let resp = builder.send().await.map_err(|err| {
                if err.is_timeout() {
                    AppError::Timeout(timeout_ms)
                } else {
                    AppError::Http(err.to_string())
                }
            })?;

            let status = resp.status();
            let resp_headers_raw = resp.headers().clone();

            let mut jar_updates: Vec<CookieRecord> = Vec::new();
            let now_epoch = Utc::now().timestamp();
            for val in resp_headers_raw.get_all(reqwest::header::SET_COOKIE) {
                if let Ok(raw_str) = val.to_str() {
                    if let Some((record, ui_cookie)) =
                        parse_set_cookie_header(raw_str, &current_url, now_epoch)
                    {
                        all_parsed_cookies.push(ui_cookie);
                        if req.send_cookies {
                            jar_updates.push(record);
                        }
                    }
                }
            }
            if req.send_cookies && !jar_updates.is_empty() {
                db.with_conn(|conn| upsert_cookies_batch(conn, jar_updates))?;
            }

            let status_code = status.as_u16();
            let is_redirect = matches!(status_code, 301 | 302 | 303 | 307 | 308);
            if is_redirect && req.follow_redirects {
                if let Some(location_val) = resp_headers_raw.get(LOCATION) {
                    if let Ok(loc_str) = location_val.to_str() {
                        if redirect_count >= req.max_redirects {
                            return Err(AppError::Http(format!(
                                "Exceeded maximum redirects ({})",
                                req.max_redirects
                            )));
                        }
                        let next_url = current_url.join(loc_str.trim())?;
                        redirect_count += 1;
                        if next_url.origin() != current_url.origin() {
                            cross_origin_redirected = true;
                        }
                        if status_code == 303
                            || ((status_code == 301 || status_code == 302)
                                && current_method == Method::POST)
                        {
                            current_method = Method::GET;
                            drop_body = true;
                        }
                        current_url = next_url;
                        continue;
                    }
                }
            }

            let headers: Vec<HeaderPair> = resp_headers_raw
                .iter()
                .map(|(k, v)| HeaderPair {
                    key: k.as_str().to_string(),
                    value: v.to_str().unwrap_or("<binary>").to_string(),
                })
                .collect();

            let content_type = resp_headers_raw
                .get(CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());

            let body_bytes = resp
                .bytes()
                .await
                .map_err(|err| AppError::Http(err.to_string()))?
                .to_vec();

            return Ok((
                status_code,
                status.canonical_reason().unwrap_or("").to_string(),
                headers,
                content_type,
                body_bytes,
                current_url.to_string(),
                redirect_count,
                all_parsed_cookies,
            ));
        }
    };

    let (
        status,
        status_text,
        headers,
        content_type,
        body_bytes,
        final_url,
        redirect_count,
        cookies,
    ) = tokio::select! {
        biased;
        changed = cancel_rx.changed() => {
            if changed.is_ok() && *cancel_rx.borrow() {
                return Err(AppError::Cancelled);
            }
            return Err(AppError::Cancelled);
        }
        timed = tokio::time::timeout(timeout, exec_future) => {
            match timed {
                Ok(res) => res?,
                Err(_) => return Err(AppError::Timeout(timeout_ms)),
            }
        }
    };

    let duration_ms = started.elapsed().as_millis() as u64;
    let size_bytes = body_bytes.len();
    let response_id = Uuid::new_v4().to_string();

    let ct_str = content_type.as_deref().unwrap_or("");
    let (body_kind, body_text, body_base64, truncated) =
        if is_raster_image_content_type(ct_str) && size_bytes <= IMAGE_INLINE_LIMIT_BYTES {
            (
                ResponseBodyKind::Image,
                None,
                Some(BASE64_STANDARD.encode(&body_bytes)),
                false,
            )
        } else if is_explicit_binary_content_type(ct_str) {
            (ResponseBodyKind::Binary, None, None, false)
        } else {
            match std::str::from_utf8(&body_bytes) {
                Ok(text) => {
                    if size_bytes > LARGE_TEXT_THRESHOLD_BYTES {
                        (
                            ResponseBodyKind::LargeText,
                            Some(slice_utf8_prefix(text, LARGE_TEXT_PREVIEW_BYTES)),
                            None,
                            true,
                        )
                    } else {
                        (
                            ResponseBodyKind::Text,
                            Some(text.to_string()),
                            None,
                            false,
                        )
                    }
                }
                Err(_) => (ResponseBodyKind::Binary, None, None, false),
            }
        };

    cache.insert(response_id.clone(), body_bytes);

    Ok(HttpExecutionResponse {
        response_id,
        status,
        status_text,
        duration_ms,
        size_bytes,
        final_url,
        redirect_count,
        headers,
        cookies,
        content_type,
        body_kind,
        body_text,
        body_base64,
        truncated,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::extract::Multipart;
    use axum::http::{HeaderMap as AxumHeaderMap, StatusCode};
    use axum::response::Redirect;
    use axum::routing::{any, get, post};
    use axum::Router;
    use std::sync::Arc;
    use tempfile::NamedTempFile;

    use crate::models::{FormDataItem, FormDataItemType, KeyValueItem};

    async fn spawn_test_server() -> (String, tokio::task::JoinHandle<()>) {
        let app = Router::new()
            .route(
                "/echo",
                any(|method: axum::http::Method, headers: AxumHeaderMap, body: axum::body::Bytes| async move {
                    let body_str = String::from_utf8_lossy(&body).to_string();
                    let ct = headers
                        .get("content-type")
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or("")
                        .to_string();
                    let custom = headers
                        .get("x-rift-test")
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or("")
                        .to_string();
                    axum::Json(serde_json::json!({
                        "method": method.as_str(),
                        "contentType": ct,
                        "customHeader": custom,
                        "body": body_str,
                    }))
                }),
            )
            .route(
                "/upload",
                post(|mut multipart: Multipart| async move {
                    let mut fields = serde_json::Map::new();
                    while let Some(field) = multipart.next_field().await.unwrap() {
                        let name = field.name().unwrap().to_string();
                        let filename = field.file_name().map(|s| s.to_string());
                        let data = field.bytes().await.unwrap();
                        fields.insert(
                            name,
                            serde_json::json!({
                                "fileName": filename,
                                "bytes": data.to_vec(),
                            }),
                        );
                    }
                    axum::Json(serde_json::Value::Object(fields))
                }),
            )
            .route(
                "/login",
                post(|| async {
                    let mut headers = AxumHeaderMap::new();
                    headers.insert(
                        "set-cookie",
                        "session=tok42; Path=/; HttpOnly".parse().unwrap(),
                    );
                    (headers, "logged-in")
                }),
            )
            .route(
                "/me",
                get(|headers: AxumHeaderMap| async move {
                    let cookie_val = headers
                        .get("cookie")
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or("none")
                        .to_string();
                    cookie_val
                }),
            )
            .route(
                "/redir",
                get(|| async {
                    let mut headers = AxumHeaderMap::new();
                    headers.insert("set-cookie", "hop=1; Path=/".parse().unwrap());
                    headers.insert("location", "/me".parse().unwrap());
                    (StatusCode::FOUND, headers, "")
                }),
            )
            .route(
                "/loop",
                get(|| async { Redirect::temporary("/loop") }),
            )
            .route(
                "/slow",
                get(|| async {
                    tokio::time::sleep(Duration::from_millis(600)).await;
                    "finished"
                }),
            )
            .route(
                "/binary",
                get(|| async {
                    let mut headers = AxumHeaderMap::new();
                    headers.insert("content-type", "application/octet-stream".parse().unwrap());
                    (headers, vec![0u8, 159, 146, 150, 1, 2, 3, 4])
                }),
            )
            .route(
                "/huge-text",
                get(|| async {
                    let big = "a".repeat(LARGE_TEXT_THRESHOLD_BYTES + 1024);
                    big
                }),
            );

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let handle = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        (format!("http://{addr}"), handle)
    }

    fn base_req(url: String, method: &str) -> HttpExecutionRequest {
        HttpExecutionRequest {
            request_id: Uuid::new_v4().to_string(),
            method: method.to_string(),
            url,
            headers: vec![],
            body: RequestBody::None,
            graphql: None,
            verify_ssl: true,
            follow_redirects: true,
            max_redirects: 10,
            timeout_ms: 5_000,
            send_cookies: true,
        }
    }

    #[tokio::test]
    async fn executes_all_http_methods_json_urlencoded_and_graphql() {
        let (base, server) = spawn_test_server().await;
        let db = Database::open_in_memory().unwrap();
        let reg = InFlightRegistry::default();
        let cache = ResponseBodyCache::default();

        for method in ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"] {
            let mut req = base_req(format!("{base}/echo"), method);
            req.headers = vec![HeaderPair {
                key: "X-Rift-Test".into(),
                value: "alpha".into(),
            }];
            let resp = execute_http_request(&db, &reg, &cache, req).await.unwrap();
            assert_eq!(resp.status, 200);
            if method != "HEAD" {
                let parsed: serde_json::Value =
                    serde_json::from_str(resp.body_text.as_deref().unwrap()).unwrap();
                assert_eq!(parsed["method"], method);
                assert_eq!(parsed["customHeader"], "alpha");
            }
        }

        // URL-encoded
        let mut form_req = base_req(format!("{base}/echo"), "POST");
        form_req.body = RequestBody::UrlEncoded {
            items: vec![KeyValueItem {
                id: "1".into(),
                key: "foo".into(),
                value: "bar baz".into(),
                description: None,
                enabled: true,
            }],
        };
        let form_resp = execute_http_request(&db, &reg, &cache, form_req).await.unwrap();
        let parsed: serde_json::Value =
            serde_json::from_str(form_resp.body_text.as_deref().unwrap()).unwrap();
        assert_eq!(parsed["body"], "foo=bar+baz");

        // GraphQL
        let mut gql_req = base_req(format!("{base}/echo"), "POST");
        gql_req.body = RequestBody::Graphql;
        gql_req.graphql = Some(GraphQLConfig {
            query: "query GetUser($id: ID!) { user(id: $id) { name } }".into(),
            variables: "{\"id\":\"42\"}".into(),
            operation_name: Some("GetUser".into()),
        });
        let gql_resp = execute_http_request(&db, &reg, &cache, gql_req).await.unwrap();
        let gql_parsed: serde_json::Value =
            serde_json::from_str(gql_resp.body_text.as_deref().unwrap()).unwrap();
        let body_json: serde_json::Value =
            serde_json::from_str(gql_parsed["body"].as_str().unwrap()).unwrap();
        assert_eq!(body_json["operationName"], "GetUser");
        assert_eq!(body_json["variables"]["id"], "42");

        server.abort();
    }

    #[tokio::test]
    async fn streams_multipart_file_upload_byte_for_byte() {
        let (base, server) = spawn_test_server().await;
        let db = Database::open_in_memory().unwrap();
        let reg = InFlightRegistry::default();
        let cache = ResponseBodyCache::default();

        let tmp = NamedTempFile::new().unwrap();
        let payload = b"RiftQL streaming multipart payload 12345";
        std::fs::write(tmp.path(), payload).unwrap();

        let mut req = base_req(format!("{base}/upload"), "POST");
        req.body = RequestBody::FormData {
            items: vec![
                FormDataItem {
                    id: "1".into(),
                    key: "title".into(),
                    value: "hello".into(),
                    file_path: None,
                    file_name: None,
                    item_type: FormDataItemType::Text,
                    enabled: true,
                },
                FormDataItem {
                    id: "2".into(),
                    key: "attachment".into(),
                    value: "".into(),
                    file_path: Some(tmp.path().to_string_lossy().to_string()),
                    file_name: Some("sample.bin".into()),
                    item_type: FormDataItemType::File,
                    enabled: true,
                },
            ],
        };

        let resp = execute_http_request(&db, &reg, &cache, req).await.unwrap();
        assert_eq!(resp.status, 200);
        let parsed: serde_json::Value =
            serde_json::from_str(resp.body_text.as_deref().unwrap()).unwrap();
        assert_eq!(parsed["title"]["bytes"], serde_json::json!(b"hello".to_vec()));
        assert_eq!(parsed["attachment"]["fileName"], "sample.bin");
        assert_eq!(
            parsed["attachment"]["bytes"],
            serde_json::json!(payload.to_vec())
        );

        server.abort();
    }

    #[tokio::test]
    async fn cookie_jar_stores_resends_and_respects_disable_toggle() {
        let (base, server) = spawn_test_server().await;
        let db = Database::open_in_memory().unwrap();
        let reg = InFlightRegistry::default();
        let cache = ResponseBodyCache::default();

        // Login sets cookie
        let login_resp = execute_http_request(&db, &reg, &cache, base_req(format!("{base}/login"), "POST"))
            .await
            .unwrap();
        assert_eq!(login_resp.cookies.len(), 1);
        assert_eq!(login_resp.cookies[0].name, "session");

        // Follow-up GET automatically sends cookie
        let me_resp = execute_http_request(&db, &reg, &cache, base_req(format!("{base}/me"), "GET"))
            .await
            .unwrap();
        assert_eq!(me_resp.body_text.as_deref(), Some("session=tok42"));

        // Disabling send_cookies stops sending stored jar cookies
        let mut disabled_req = base_req(format!("{base}/me"), "GET");
        disabled_req.send_cookies = false;
        let disabled_resp = execute_http_request(&db, &reg, &cache, disabled_req)
            .await
            .unwrap();
        assert_eq!(disabled_resp.body_text.as_deref(), Some("none"));

        server.abort();
    }

    #[tokio::test]
    async fn handles_redirects_cookies_across_hops_and_max_redirect_guard() {
        let (base, server) = spawn_test_server().await;
        let db = Database::open_in_memory().unwrap();
        let reg = InFlightRegistry::default();
        let cache = ResponseBodyCache::default();

        // Follow redirects: /redir sets hop=1 and redirects to /me
        let resp = execute_http_request(&db, &reg, &cache, base_req(format!("{base}/redir"), "GET"))
            .await
            .unwrap();
        assert_eq!(resp.status, 200);
        assert_eq!(resp.redirect_count, 1);
        assert_eq!(resp.body_text.as_deref(), Some("hop=1"));

        // Disable follow_redirects returns raw 302
        let mut no_follow = base_req(format!("{base}/redir"), "GET");
        no_follow.follow_redirects = false;
        let raw_302 = execute_http_request(&db, &reg, &cache, no_follow).await.unwrap();
        assert_eq!(raw_302.status, 302);
        assert_eq!(raw_302.redirect_count, 0);

        // Max redirect limit
        let mut loop_req = base_req(format!("{base}/loop"), "GET");
        loop_req.max_redirects = 3;
        let loop_err = execute_http_request(&db, &reg, &cache, loop_req).await.unwrap_err();
        assert!(loop_err.to_string().contains("Exceeded maximum redirects"));

        server.abort();
    }

    #[tokio::test]
    async fn enforces_timeout_cancellation_and_binary_large_response_cache() {
        let (base, server) = spawn_test_server().await;
        let db = Arc::new(Database::open_in_memory().unwrap());
        let reg = Arc::new(InFlightRegistry::default());
        let cache = Arc::new(ResponseBodyCache::default());

        // Timeout
        let mut slow_req = base_req(format!("{base}/slow"), "GET");
        slow_req.timeout_ms = 120;
        let timeout_err = execute_http_request(&db, &reg, &cache, slow_req).await.unwrap_err();
        assert_eq!(timeout_err.code(), "TIMEOUT");

        // Cancellation mid-flight
        let cancel_req = base_req(format!("{base}/slow"), "GET");
        let cancel_id = cancel_req.request_id.clone();
        let db_c = Arc::clone(&db);
        let reg_c = Arc::clone(&reg);
        let cache_c = Arc::clone(&cache);
        let handle = tokio::spawn(async move {
            execute_http_request(&db_c, &reg_c, &cache_c, cancel_req).await
        });
        tokio::time::sleep(Duration::from_millis(60)).await;
        assert!(reg.cancel(&cancel_id));
        let cancel_err = handle.await.unwrap().unwrap_err();
        assert_eq!(cancel_err.code(), "CANCELLED");

        // Binary + save to file
        let bin_resp = execute_http_request(&db, &reg, &cache, base_req(format!("{base}/binary"), "GET"))
            .await
            .unwrap();
        assert_eq!(bin_resp.body_kind, ResponseBodyKind::Binary);
        let out_file = NamedTempFile::new().unwrap();
        let written = cache
            .save_to_file(&bin_resp.response_id, out_file.path())
            .await
            .unwrap();
        assert_eq!(written, 8);
        assert_eq!(
            std::fs::read(out_file.path()).unwrap(),
            vec![0u8, 159, 146, 150, 1, 2, 3, 4]
        );

        // Large text (> 5 MB) truncation
        let big_resp = execute_http_request(&db, &reg, &cache, base_req(format!("{base}/huge-text"), "GET"))
            .await
            .unwrap();
        assert_eq!(big_resp.body_kind, ResponseBodyKind::LargeText);
        assert!(big_resp.truncated);
        assert_eq!(
            big_resp.body_text.as_deref().unwrap().len(),
            LARGE_TEXT_PREVIEW_BYTES
        );

        server.abort();
    }
}
