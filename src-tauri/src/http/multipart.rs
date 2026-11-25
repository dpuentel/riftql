use std::path::Path;

use reqwest::multipart::{Form, Part};
use tokio::fs::File;
use tokio_util::io::ReaderStream;

use crate::error::{AppError, AppResult};
use crate::models::{FormDataItem, FormDataItemType};

pub async fn build_multipart_form(items: &[FormDataItem]) -> AppResult<Form> {
    let mut form = Form::new();

    for item in items {
        if !item.enabled || item.key.trim().is_empty() {
            continue;
        }
        let field_name = item.key.trim().to_string();

        match item.item_type {
            FormDataItemType::Text => {
                form = form.text(field_name, item.value.clone());
            }
            FormDataItemType::File => {
                let raw_path = item
                    .file_path
                    .as_deref()
                    .map(str::trim)
                    .filter(|p| !p.is_empty())
                    .ok_or_else(|| {
                        AppError::Validation(format!(
                            "Form-data file field \"{field_name}\" is missing a file path"
                        ))
                    })?;

                let path = Path::new(raw_path);
                let file = File::open(path).await.map_err(|err| {
                    AppError::Io(std::io::Error::new(
                        err.kind(),
                        format!("Failed to open form-data file \"{raw_path}\": {err}"),
                    ))
                })?;
                let meta = file.metadata().await?;
                let stream = ReaderStream::new(file);
                let body = reqwest::Body::wrap_stream(stream);

                let file_name = item
                    .file_name
                    .as_deref()
                    .filter(|s| !s.trim().is_empty())
                    .map(str::to_string)
                    .or_else(|| {
                        path.file_name()
                            .map(|n| n.to_string_lossy().to_string())
                    })
                    .unwrap_or_else(|| "upload.bin".to_string());

                let mime_type = mime_guess::from_path(path)
                    .first_or_octet_stream()
                    .essence_str()
                    .to_string();

                let part = Part::stream_with_length(body, meta.len())
                    .file_name(file_name)
                    .mime_str(&mime_type)
                    .map_err(|e| AppError::Http(format!("Invalid MIME type: {e}")))?;

                form = form.part(field_name, part);
            }
        }
    }

    Ok(form)
}
