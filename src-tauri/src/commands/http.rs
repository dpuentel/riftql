use std::path::PathBuf;
use tauri::State;

use crate::db::Database;
use crate::error::AppResult;
use crate::http::client::{
    execute_http_request, InFlightRegistry, ResponseBodyCache,
};
use crate::models::{HttpExecutionRequest, HttpExecutionResponse};

#[tauri::command]
pub async fn send_http_request_cmd(
    db: State<'_, Database>,
    registry: State<'_, InFlightRegistry>,
    cache: State<'_, ResponseBodyCache>,
    request: HttpExecutionRequest,
) -> AppResult<HttpExecutionResponse> {
    execute_http_request(&db, &registry, &cache, request).await
}

#[tauri::command]
pub fn cancel_http_request_cmd(
    registry: State<'_, InFlightRegistry>,
    request_id: String,
) -> bool {
    registry.cancel(&request_id)
}

#[tauri::command]
pub async fn save_response_body_to_file_cmd(
    cache: State<'_, ResponseBodyCache>,
    response_id: String,
    target_path: String,
) -> AppResult<usize> {
    cache
        .save_to_file(&response_id, &PathBuf::from(target_path))
        .await
}
