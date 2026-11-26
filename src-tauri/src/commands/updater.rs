use std::cmp::Ordering;
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering as AtomicOrdering};
use std::sync::Arc;
use std::time::Duration;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use chrono::Utc;
use serde::Deserialize;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::UpdaterExt;
use url::Url;

use crate::error::{AppError, AppResult};
use crate::models::{AppRuntimeInfo, AppUpdateInfo, AppUpdateProgress};

pub const GITHUB_LATEST_RELEASE_API: &str =
    "https://api.github.com/repos/dpuentel/riftql/releases/latest";
pub const GITHUB_RELEASES_PAGE: &str = "https://github.com/dpuentel/riftql/releases/latest";
pub const UPDATER_PROGRESS_EVENT: &str = "riftql://app-update-progress";

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub struct UpdaterRuntimeState {
    pub pubkey_configured: bool,
}

pub fn has_configured_updater_pubkey(app: &tauri::App) -> bool {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|v| v.get("pubkey"))
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ParsedSemver {
    major: u64,
    minor: u64,
    patch: u64,
    prerelease: Vec<String>,
}

fn parse_semver(raw: &str) -> Option<ParsedSemver> {
    let trimmed = raw.trim().trim_start_matches(['v', 'V']);
    if trimmed.is_empty() {
        return None;
    }
    let without_build = trimmed.split('+').next().unwrap_or(trimmed);
    let (core, pre) = match without_build.split_once('-') {
        Some((c, p)) => (
            c,
            p.split('.')
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>(),
        ),
        None => (without_build, Vec::new()),
    };
    let mut parts = core.split('.');
    let major = parts.next()?.parse::<u64>().ok()?;
    let minor = parts.next().unwrap_or("0").parse::<u64>().ok()?;
    let patch = parts.next().unwrap_or("0").parse::<u64>().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some(ParsedSemver {
        major,
        minor,
        patch,
        prerelease: pre,
    })
}

fn compare_prerelease_ident(a: &str, b: &str) -> Ordering {
    match (a.parse::<u64>(), b.parse::<u64>()) {
        (Ok(na), Ok(nb)) => na.cmp(&nb),
        (Ok(_), Err(_)) => Ordering::Less,
        (Err(_), Ok(_)) => Ordering::Greater,
        (Err(_), Err(_)) => a.cmp(b),
    }
}

fn compare_semver(a: &ParsedSemver, b: &ParsedSemver) -> Ordering {
    match a
        .major
        .cmp(&b.major)
        .then_with(|| a.minor.cmp(&b.minor))
        .then_with(|| a.patch.cmp(&b.patch))
    {
        Ordering::Equal => match (a.prerelease.is_empty(), b.prerelease.is_empty()) {
            (true, true) => Ordering::Equal,
            (true, false) => Ordering::Greater,
            (false, true) => Ordering::Less,
            (false, false) => {
                for (left, right) in a.prerelease.iter().zip(b.prerelease.iter()) {
                    let ord = compare_prerelease_ident(left, right);
                    if ord != Ordering::Equal {
                        return ord;
                    }
                }
                a.prerelease.len().cmp(&b.prerelease.len())
            }
        },
        non_eq => non_eq,
    }
}

pub fn is_newer_version(current: &str, candidate: &str) -> bool {
    match (parse_semver(current), parse_semver(candidate)) {
        (Some(cur), Some(cand)) => compare_semver(&cand, &cur) == Ordering::Greater,
        _ => {
            let cur = current.trim().trim_start_matches(['v', 'V']);
            let cand = candidate.trim().trim_start_matches(['v', 'V']);
            !cand.is_empty() && cand != cur
        }
    }
}

pub fn platform_auto_install_support(
    os: &str,
    is_appimage: bool,
    pubkey_configured: bool,
) -> (bool, Option<String>) {
    if !pubkey_configured {
        return (
            false,
            Some(
                "In-app auto-install requires a configured updater signing key in this build. Download the installer from GitHub Releases."
                    .to_string(),
            ),
        );
    }

    if os == "linux" && !is_appimage {
        return (
            false,
            Some(
                "In-app auto-update is supported for AppImage builds. For .deb/.rpm packages, download the latest installer from GitHub Releases."
                    .to_string(),
            ),
        );
    }

    (true, None)
}

#[derive(Debug, Deserialize)]
struct GitHubReleasePayload {
    #[serde(default)]
    tag_name: String,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    published_at: Option<String>,
    #[serde(default)]
    html_url: Option<String>,
}

pub fn parse_github_release_response(
    current_version: &str,
    raw_json: &str,
    unavailable_reason: Option<String>,
) -> AppResult<AppUpdateInfo> {
    let payload: GitHubReleasePayload = serde_json::from_str(raw_json)
        .map_err(|err| AppError::Updater(format!("Failed to parse GitHub release metadata: {err}")))?;

    let clean_tag = payload
        .tag_name
        .trim()
        .trim_start_matches(['v', 'V'])
        .to_string();
    let available = !clean_tag.is_empty() && is_newer_version(current_version, &clean_tag);
    let release_url = payload
        .html_url
        .filter(|u| !u.trim().is_empty())
        .unwrap_or_else(|| GITHUB_RELEASES_PAGE.to_string());

    Ok(AppUpdateInfo {
        current_version: current_version.to_string(),
        available,
        available_version: if available { Some(clean_tag) } else { None },
        release_notes: if available {
            payload.body.filter(|b| !b.trim().is_empty())
        } else {
            None
        },
        published_at: if available { payload.published_at } else { None },
        release_url,
        can_auto_install: false,
        auto_install_unavailable_reason: unavailable_reason,
        checked_at: Utc::now().to_rfc3339(),
    })
}

pub fn validate_external_https_url(raw: &str) -> AppResult<Url> {
    let parsed = Url::parse(raw.trim())?;
    if parsed.scheme() != "https" {
        return Err(AppError::Validation(
            "Only https:// URLs can be opened externally.".to_string(),
        ));
    }
    Ok(parsed)
}

fn detect_is_appimage() -> bool {
    std::env::var_os("APPIMAGE")
        .map(|val| !val.is_empty())
        .unwrap_or(false)
}

async fn fetch_latest_github_release(
    current_version: &str,
    unavailable_reason: Option<String>,
) -> AppResult<AppUpdateInfo> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent(format!("RiftQL/{current_version}"))
        .build()
        .map_err(|err| AppError::Updater(format!("Failed to build update HTTP client: {err}")))?;

    let response = client
        .get(GITHUB_LATEST_RELEASE_API)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|err| AppError::Updater(format!("Unable to check GitHub Releases: {err}")))?;

    if !response.status().is_success() {
        return Err(AppError::Updater(format!(
            "GitHub Releases returned HTTP {}",
            response.status()
        )));
    }

    let body = response
        .text()
        .await
        .map_err(|err| AppError::Updater(format!("Failed reading update response: {err}")))?;

    parse_github_release_response(current_version, &body, unavailable_reason)
}

#[tauri::command]
pub fn get_app_runtime_info_cmd(
    app: AppHandle,
    state: State<'_, UpdaterRuntimeState>,
) -> AppRuntimeInfo {
    AppRuntimeInfo {
        version: app.package_info().version.to_string(),
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        updater_configured: state.pubkey_configured,
        is_appimage: detect_is_appimage(),
    }
}

#[tauri::command]
pub async fn check_app_update_cmd(
    app: AppHandle,
    state: State<'_, UpdaterRuntimeState>,
) -> AppResult<AppUpdateInfo> {
    let current_version = app.package_info().version.to_string();
    let is_appimage = detect_is_appimage();
    let (can_auto_install, unavailable_reason) =
        platform_auto_install_support(std::env::consts::OS, is_appimage, state.pubkey_configured);

    if state.pubkey_configured {
        if let Ok(updater) = app.updater() {
            match updater.check().await {
                Ok(Some(update)) => {
                    let published_at = update.date.and_then(|dt| {
                        chrono::DateTime::from_timestamp(dt.unix_timestamp(), 0)
                            .map(|c| c.to_rfc3339())
                    });
                    let clean_version = update.version.trim_start_matches(['v', 'V']).to_string();
                    let release_url = format!(
                        "https://github.com/dpuentel/riftql/releases/tag/v{clean_version}"
                    );
                    return Ok(AppUpdateInfo {
                        current_version,
                        available: true,
                        available_version: Some(clean_version),
                        release_notes: update.body.filter(|b| !b.trim().is_empty()),
                        published_at,
                        release_url,
                        can_auto_install,
                        auto_install_unavailable_reason: unavailable_reason,
                        checked_at: Utc::now().to_rfc3339(),
                    });
                }
                Ok(None) => {
                    return Ok(AppUpdateInfo {
                        current_version,
                        available: false,
                        available_version: None,
                        release_notes: None,
                        published_at: None,
                        release_url: GITHUB_RELEASES_PAGE.to_string(),
                        can_auto_install,
                        auto_install_unavailable_reason: unavailable_reason,
                        checked_at: Utc::now().to_rfc3339(),
                    });
                }
                Err(_) => {
                    let fallback_reason = Some(
                        "Automatic updater manifest unavailable for the latest release; download the installer directly from GitHub Releases."
                            .to_string(),
                    );
                    return fetch_latest_github_release(&current_version, fallback_reason).await;
                }
            }
        }
    }

    fetch_latest_github_release(&current_version, unavailable_reason).await
}

#[tauri::command]
pub async fn install_app_update_cmd(
    app: AppHandle,
    state: State<'_, UpdaterRuntimeState>,
) -> AppResult<()> {
    let is_appimage = detect_is_appimage();
    let (can_auto_install, reason) =
        platform_auto_install_support(std::env::consts::OS, is_appimage, state.pubkey_configured);

    if !can_auto_install {
        return Err(AppError::Updater(reason.unwrap_or_else(|| {
            "In-app auto-install is not supported on this build or package format.".to_string()
        })));
    }

    let updater = app
        .updater()
        .map_err(|err| AppError::Updater(format!("Updater initialization failed: {err}")))?;

    let update = updater
        .check()
        .await
        .map_err(|err| AppError::Updater(format!("Failed checking for updates: {err}")))?
        .ok_or_else(|| AppError::Updater("RiftQL is already up to date.".to_string()))?;

    let downloaded = Arc::new(AtomicU64::new(0));
    let downloaded_chunk = Arc::clone(&downloaded);
    let downloaded_finish = Arc::clone(&downloaded);
    let total_known = Arc::new(AtomicU64::new(0));
    let total_chunk = Arc::clone(&total_known);
    let total_finish = Arc::clone(&total_known);

    let app_chunk = app.clone();
    let app_finish = app.clone();

    let _ = app.emit(
        UPDATER_PROGRESS_EVENT,
        AppUpdateProgress {
            stage: "downloading".to_string(),
            downloaded_bytes: 0,
            total_bytes: None,
            percent: None,
        },
    );

    update
        .download_and_install(
            move |chunk_len, content_len| {
                let next_total = downloaded_chunk.fetch_add(chunk_len as u64, AtomicOrdering::SeqCst)
                    + chunk_len as u64;
                if let Some(total) = content_len {
                    total_chunk.store(total, AtomicOrdering::SeqCst);
                }
                let percent = content_len
                    .filter(|&t| t > 0)
                    .map(|total| ((next_total.saturating_mul(100)) / total).min(100) as u8);

                let _ = app_chunk.emit(
                    UPDATER_PROGRESS_EVENT,
                    AppUpdateProgress {
                        stage: "downloading".to_string(),
                        downloaded_bytes: next_total,
                        total_bytes: content_len,
                        percent,
                    },
                );
            },
            move || {
                let bytes = downloaded_finish.load(AtomicOrdering::SeqCst);
                let total = total_finish.load(AtomicOrdering::SeqCst);
                let _ = app_finish.emit(
                    UPDATER_PROGRESS_EVENT,
                    AppUpdateProgress {
                        stage: "installing".to_string(),
                        downloaded_bytes: bytes,
                        total_bytes: (total > 0).then_some(total),
                        percent: Some(100),
                    },
                );
            },
        )
        .await
        .map_err(|err| AppError::Updater(format!("Failed installing update: {err}")))?;

    let final_bytes = downloaded.load(AtomicOrdering::SeqCst);
    let final_total = total_known.load(AtomicOrdering::SeqCst);
    let _ = app.emit(
        UPDATER_PROGRESS_EVENT,
        AppUpdateProgress {
            stage: "restarting".to_string(),
            downloaded_bytes: final_bytes,
            total_bytes: (final_total > 0).then_some(final_total),
            percent: Some(100),
        },
    );

    app.restart();
}

#[tauri::command]
pub fn open_external_url_cmd(url: String) -> AppResult<()> {
    let parsed = validate_external_https_url(&url)?;
    let target = parsed.as_str();

    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", "start", "", target]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.spawn()
            .map_err(|err| AppError::Io(err))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(target)
            .spawn()
            .map_err(|err| AppError::Io(err))?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|err| AppError::Io(err))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_semver_versions_including_prereleases() {
        assert!(is_newer_version("0.3.0", "0.4.0"));
        assert!(is_newer_version("v0.3.0", "v0.3.1"));
        assert!(is_newer_version("0.4.0-rc.1", "0.4.0"));
        assert!(is_newer_version("0.3.9", "0.4.0-rc.1"));
        assert!(!is_newer_version("0.4.0", "0.4.0"));
        assert!(!is_newer_version("0.4.0", "v0.4.0-rc.2"));
        assert!(!is_newer_version("0.4.1", "0.4.0"));
    }

    #[test]
    fn evaluates_platform_auto_install_support() {
        assert!(!platform_auto_install_support("windows", false, false).0);
        assert!(platform_auto_install_support("windows", false, true).0);
        assert!(platform_auto_install_support("macos", false, true).0);
        assert!(platform_auto_install_support("linux", true, true).0);

        let linux_deb = platform_auto_install_support("linux", false, true);
        assert!(!linux_deb.0);
        assert!(linux_deb
            .1
            .as_deref()
            .unwrap_or_default()
            .contains("AppImage"));
    }

    #[test]
    fn parses_github_latest_release_json() {
        let json = serde_json::json!({
            "tag_name": "v0.5.0",
            "body": "### What's New\n- Auto updater",
            "published_at": "2026-11-26T12:00:00Z",
            "html_url": "https://github.com/dpuentel/riftql/releases/tag/v0.5.0"
        })
        .to_string();

        let info = parse_github_release_response(
            "0.4.0",
            &json,
            Some("Key not configured".to_string()),
        )
        .expect("release parse succeeds");

        assert!(info.available);
        assert_eq!(info.available_version.as_deref(), Some("0.5.0"));
        assert_eq!(
            info.release_notes.as_deref(),
            Some("### What's New\n- Auto updater")
        );
        assert_eq!(
            info.release_url,
            "https://github.com/dpuentel/riftql/releases/tag/v0.5.0"
        );
        assert!(!info.can_auto_install);
        assert_eq!(
            info.auto_install_unavailable_reason.as_deref(),
            Some("Key not configured")
        );

        let same = parse_github_release_response("0.5.0", &json, None).expect("same version");
        assert!(!same.available);
        assert!(same.available_version.is_none());
    }

    #[test]
    fn validates_external_https_urls() {
        assert!(validate_external_https_url("https://github.com/dpuentel/riftql/releases").is_ok());
        assert!(validate_external_https_url("http://example.com").is_err());
        assert!(validate_external_https_url("file:///etc/passwd").is_err());
        assert!(validate_external_https_url("javascript:alert(1)").is_err());
    }
}
