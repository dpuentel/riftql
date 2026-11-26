use std::fs;
use std::path::Path;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use crate::error::{AppError, AppResult};
use crate::models::GitRepoStatus;
use crate::sync::fs_layout::ensure_gitignore;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn build_git_command(dir: Option<&Path>) -> Command {
    let mut cmd = Command::new("git");
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    if let Some(d) = dir {
        cmd.current_dir(d);
    }
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

fn run_git(dir: Option<&Path>, args: &[&str]) -> AppResult<String> {
    let output = build_git_command(dir).args(args).output().map_err(|err| {
        if err.kind() == std::io::ErrorKind::NotFound {
            AppError::Git("Git executable not found in PATH".to_string())
        } else {
            AppError::Git(format!("Failed to invoke git: {err}"))
        }
    })?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() { stderr } else { stdout };
        Err(AppError::Git(if detail.is_empty() {
            format!("git {} failed", args.join(" "))
        } else {
            detail
        }))
    }
}

pub fn git_version() -> Option<String> {
    run_git(None, &["--version"]).ok()
}

pub fn inspect_repo(dir: &Path) -> GitRepoStatus {
    let Some(version) = git_version() else {
        return GitRepoStatus::default();
    };

    if !dir.exists() || !dir.is_dir() {
        return GitRepoStatus {
            git_available: true,
            git_version: Some(version),
            ..GitRepoStatus::default()
        };
    }

    let is_git_repo = run_git(Some(dir), &["rev-parse", "--is-inside-work-tree"])
        .map(|out| out.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    if !is_git_repo {
        return GitRepoStatus {
            git_available: true,
            git_version: Some(version),
            ..GitRepoStatus::default()
        };
    }

    let branch = run_git(Some(dir), &["symbolic-ref", "--short", "HEAD"])
        .ok()
        .filter(|s| !s.is_empty())
        .or_else(|| {
            run_git(Some(dir), &["rev-parse", "--short", "HEAD"])
                .ok()
                .filter(|s| !s.is_empty())
        })
        .or_else(|| {
            // Fresh git repo with no commits yet
            fs::read_to_string(dir.join(".git").join("HEAD"))
                .ok()
                .and_then(|head| {
                    head.trim()
                        .strip_prefix("ref: refs/heads/")
                        .map(|b| b.to_string())
                })
        });

    let remote_url = run_git(Some(dir), &["remote", "get-url", "origin"])
        .ok()
        .filter(|s| !s.is_empty());

    let changed_files = run_git(Some(dir), &["status", "--porcelain"])
        .map(|out| out.lines().filter(|l| !l.trim().is_empty()).count())
        .unwrap_or(0);

    let (behind, ahead) = run_git(
        Some(dir),
        &["rev-list", "--left-right", "--count", "@{upstream}...HEAD"],
    )
    .ok()
    .and_then(|out| {
        let mut parts = out.split_whitespace();
        let behind = parts.next()?.parse::<usize>().ok()?;
        let ahead = parts.next()?.parse::<usize>().ok()?;
        Some((behind, ahead))
    })
    .unwrap_or((0, 0));

    GitRepoStatus {
        git_available: true,
        git_version: Some(version),
        is_git_repo: true,
        branch,
        remote_url,
        changed_files,
        ahead,
        behind,
    }
}

pub fn init_repo(
    dir: &Path,
    remote_url: Option<&str>,
    branch: Option<&str>,
) -> AppResult<()> {
    if git_version().is_none() {
        return Err(AppError::Git(
            "Git CLI is not installed or not available in PATH".to_string(),
        ));
    }

    fs::create_dir_all(dir)?;
    let status = inspect_repo(dir);
    let trimmed_branch = branch.map(str::trim).filter(|s| !s.is_empty());

    if !status.is_git_repo {
        if let Some(b) = trimmed_branch {
            if run_git(Some(dir), &["init", "-b", b]).is_err() {
                run_git(Some(dir), &["init"])?;
                let _ = run_git(Some(dir), &["checkout", "-B", b]);
            }
        } else {
            run_git(Some(dir), &["init"])?;
        }
    } else if let Some(b) = trimmed_branch {
        if status.branch.as_deref() != Some(b) {
            if run_git(Some(dir), &["checkout", b]).is_err() {
                run_git(Some(dir), &["checkout", "-B", b])?;
            }
        }
    }

    ensure_gitignore(dir)?;

    if let Some(url) = remote_url.map(str::trim).filter(|s| !s.is_empty()) {
        configure_origin_remote(dir, url)?;
    }

    Ok(())
}

pub fn configure_origin_remote(dir: &Path, remote_url: &str) -> AppResult<()> {
    let trimmed = remote_url.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    if run_git(Some(dir), &["remote", "get-url", "origin"]).is_ok() {
        run_git(Some(dir), &["remote", "set-url", "origin", trimmed])?;
    } else {
        run_git(Some(dir), &["remote", "add", "origin", trimmed])?;
    }
    Ok(())
}

pub fn clone_repo(
    remote_url: &str,
    target_dir: &Path,
    branch: Option<&str>,
) -> AppResult<()> {
    if git_version().is_none() {
        return Err(AppError::Git(
            "Git CLI is not installed or not available in PATH".to_string(),
        ));
    }
    let url = remote_url.trim();
    if url.is_empty() {
        return Err(AppError::Validation(
            "Git repository URL is required to clone".to_string(),
        ));
    }

    if target_dir.exists() {
        let non_empty = fs::read_dir(target_dir)?
            .next()
            .is_some();
        if non_empty {
            return Err(AppError::Validation(format!(
                "Target folder '{}' must be empty before cloning",
                target_dir.display()
            )));
        }
    } else if let Some(parent) = target_dir.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }

    let target_str = target_dir.to_string_lossy().to_string();
    let trimmed_branch = branch.map(str::trim).filter(|s| !s.is_empty());
    let mut args: Vec<&str> = vec!["clone"];
    if let Some(b) = trimmed_branch {
        args.push("--branch");
        args.push(b);
    }
    args.push(url);
    args.push(&target_str);

    run_git(None, &args)?;
    ensure_gitignore(target_dir)?;
    Ok(())
}

pub fn pull_repo(dir: &Path) -> AppResult<String> {
    let status = inspect_repo(dir);
    if !status.git_available {
        return Err(AppError::Git(
            "Git CLI is not installed or not available in PATH".to_string(),
        ));
    }
    if !status.is_git_repo {
        return Err(AppError::Validation(
            "Selected folder is not a Git repository".to_string(),
        ));
    }
    if status.remote_url.is_none() {
        return Err(AppError::Validation(
            "No 'origin' Git remote configured yet".to_string(),
        ));
    }
    let out = run_git(Some(dir), &["pull", "--ff-only"])?;
    Ok(if out.is_empty() {
        "Pulled latest changes from origin.".to_string()
    } else {
        out
    })
}

pub fn commit_and_push(dir: &Path, message: &str, push: bool) -> AppResult<String> {
    let status = inspect_repo(dir);
    if !status.git_available {
        return Err(AppError::Git(
            "Git CLI is not installed or not available in PATH".to_string(),
        ));
    }
    if !status.is_git_repo {
        return Err(AppError::Validation(
            "Selected folder is not a Git repository".to_string(),
        ));
    }

    ensure_gitignore(dir)?;
    run_git(Some(dir), &["add", "-A"])?;

    let porcelain = run_git(Some(dir), &["status", "--porcelain"])?;
    let mut notes: Vec<String> = Vec::new();

    if porcelain.trim().is_empty() {
        notes.push("Working tree clean — no new changes to commit.".to_string());
    } else {
        let commit_msg = if message.trim().is_empty() {
            "chore(riftql): sync workspace"
        } else {
            message.trim()
        };
        run_git(Some(dir), &["commit", "-m", commit_msg])?;
        notes.push(format!("Committed changes: \"{commit_msg}\"."));
    }

    if push {
        let refreshed = inspect_repo(dir);
        if refreshed.remote_url.is_none() {
            return Err(AppError::Validation(
                "Committed locally, but no 'origin' remote is configured for push.".to_string(),
            ));
        }

        if let Err(push_err) = run_git(Some(dir), &["push"]) {
            let err_text = push_err.to_string().to_lowercase();
            let needs_upstream = err_text.contains("no upstream branch")
                || err_text.contains("set-upstream")
                || err_text.contains("has no upstream");
            if needs_upstream {
                if let Some(branch) = refreshed.branch {
                    run_git(Some(dir), &["push", "-u", "origin", &branch])?;
                } else {
                    return Err(push_err);
                }
            } else {
                return Err(push_err);
            }
        }
        notes.push("Pushed to origin.".to_string());
    }

    Ok(notes.join(" "))
}
