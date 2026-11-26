use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("Invalid URL: {0}")]
    InvalidUrl(#[from] url::ParseError),

    #[error("HTTP request failed: {0}")]
    Http(String),

    #[error("Request timed out after {0} ms")]
    Timeout(u64),

    #[error("Request was cancelled")]
    Cancelled,

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Sync error: {0}")]
    Sync(String),

    #[error("Git error: {0}")]
    Git(String),

    #[error("Updater error: {0}")]
    Updater(String),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SerializedError {
    code: &'static str,
    message: String,
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::Database(_) => "DATABASE_ERROR",
            AppError::Serde(_) => "SERIALIZATION_ERROR",
            AppError::InvalidUrl(_) => "INVALID_URL",
            AppError::Http(_) => "HTTP_ERROR",
            AppError::Timeout(_) => "TIMEOUT",
            AppError::Cancelled => "CANCELLED",
            AppError::Io(_) => "IO_ERROR",
            AppError::Validation(_) => "VALIDATION_ERROR",
            AppError::NotFound(_) => "NOT_FOUND",
            AppError::Sync(_) => "SYNC_ERROR",
            AppError::Git(_) => "GIT_ERROR",
            AppError::Updater(_) => "UPDATER_ERROR",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        SerializedError {
            code: self.code(),
            message: self.to_string(),
        }
        .serialize(serializer)
    }
}

pub type AppResult<T> = Result<T, AppError>;
