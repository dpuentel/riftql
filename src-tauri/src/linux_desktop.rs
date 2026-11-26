use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub const APP_ID: &str = "com.riftql.app";

fn escape_desktop_exec(path: &str) -> String {
    path.replace('\\', "\\\\").replace('"', "\\\"")
}

/// Writes an XDG desktop entry and hicolor PNG icon for AppImage launches so Ubuntu/GNOME docks
/// can map the running `com.riftql.app` GTK/Wayland/X11 window to its RiftQL icon.
pub fn write_appimage_desktop_entry(
    data_home: &Path,
    appimage_path: &str,
    icon_png: &[u8],
) -> io::Result<()> {
    let icon_dir = data_home.join("icons").join("hicolor").join("256x256").join("apps");
    let apps_dir = data_home.join("applications");
    fs::create_dir_all(&icon_dir)?;
    fs::create_dir_all(&apps_dir)?;

    let icon_path: PathBuf = icon_dir.join(format!("{APP_ID}.png"));
    let write_icon = match fs::read(&icon_path) {
        Ok(existing) => existing != icon_png,
        Err(_) => true,
    };
    if write_icon {
        fs::write(&icon_path, icon_png)?;
    }

    let desktop_path = apps_dir.join(format!("{APP_ID}.desktop"));
    let exec_line = format!("\"{}\" %U", escape_desktop_exec(appimage_path));
    let desktop_content = format!(
        "[Desktop Entry]\n\
         Name=RiftQL\n\
         Comment=Local-first API client for REST & GraphQL\n\
         Exec={exec_line}\n\
         TryExec={appimage_path}\n\
         Icon={}\n\
         Type=Application\n\
         Terminal=false\n\
         Categories=Development;WebDevelopment;\n\
         StartupWMClass={APP_ID}\n",
        icon_path.to_string_lossy()
    );

    let write_desktop = match fs::read_to_string(&desktop_path) {
        Ok(existing) => existing != desktop_content,
        Err(_) => true,
    };
    if write_desktop {
        fs::write(&desktop_path, desktop_content)?;
    }

    Ok(())
}

/// When running from an AppImage (`APPIMAGE` env var set on Linux), ensure a user `.desktop` entry
/// and icon exist under `$XDG_DATA_HOME` (`~/.local/share`) with matching `StartupWMClass`.
#[cfg(target_os = "linux")]
pub fn ensure_appimage_desktop_integration() {
    let Ok(appimage_path) = std::env::var("APPIMAGE") else {
        return;
    };
    let trimmed = appimage_path.trim();
    if trimmed.is_empty() {
        return;
    }

    let data_home = std::env::var_os("XDG_DATA_HOME")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .or_else(|| {
            std::env::var_os("HOME")
                .filter(|v| !v.is_empty())
                .map(|home| PathBuf::from(home).join(".local").join("share"))
        });

    if let Some(dir) = data_home {
        let icon_bytes = include_bytes!("../icons/128x128@2x.png");
        let _ = write_appimage_desktop_entry(&dir, trimmed, icon_bytes);
    }
}
