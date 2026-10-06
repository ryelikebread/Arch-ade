//! Everything that differs between macOS, Windows and Linux.
//!
//! This module is the only place in the crate that uses `#[cfg(target_os)]`.
//! Business logic talks to [`current()`] through the [`Platform`] trait.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::names::NameRules;
use crate::tools::Tools;
use crate::Result;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(windows)]
mod windows;
// Freedesktop-style helpers are pure Rust and also used by tests elsewhere.
pub mod freedesktop;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Os {
    Macos,
    Windows,
    Linux,
}

/// What we need to put a trashed file back. Stored as JSON in the journal.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TrashReceipt {
    pub original: PathBuf,
    /// macOS: path of the item inside the Trash.
    /// Windows/Linux: the `trash` crate's item id (.trashinfo path or shell parsing name).
    pub token: Option<String>,
}

/// Raw download-origin attributes as the OS stores them. Interpreted by
/// [`crate::source::resolve`], which is shared by all OSes.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RawSource {
    /// macOS `com.apple.metadata:kMDItemWhereFroms` (binary plist).
    pub where_froms: Option<Vec<u8>>,
    /// macOS `com.apple.quarantine`.
    pub quarantine: Option<String>,
    /// Windows `:Zone.Identifier` stream contents.
    pub zone_identifier: Option<String>,
    /// Linux `user.xdg.origin.url` / `user.xdg.referrer.url`.
    pub xdg_origin: Option<String>,
    pub xdg_referrer: Option<String>,
}

pub trait Platform: Send + Sync {
    fn os(&self) -> Os;
    fn name_rules(&self) -> NameRules;
    /// "Cmd" or "Ctrl"; the frontend uses this for hotkey labels.
    fn modifier_label(&self) -> &'static str;

    /// Move one file or folder to the OS trash and return how to restore it.
    fn trash(&self, path: &Path) -> Result<TrashReceipt>;
    /// Put a trashed item back where it was.
    fn restore(&self, receipt: &TrashReceipt) -> Result<()>;

    fn raw_source(&self, path: &Path) -> RawSource;
    /// When the file was added to its folder, where the OS tracks it.
    fn added_time(&self, path: &Path) -> Option<i64>;
    /// PNG thumbnail from the OS thumbnailer, for types we can't decode ourselves.
    fn os_thumbnail(&self, path: &Path, px: u32, tools: &Tools) -> Option<Vec<u8>>;
    /// Directories to search for helper tools besides `PATH` (GUI apps on macOS
    /// don't inherit the shell's PATH, so Homebrew must be probed explicitly).
    fn extra_tool_dirs(&self) -> Vec<PathBuf>;
}

/// The platform implementation for the running OS.
pub fn current() -> &'static dyn Platform {
    #[cfg(target_os = "macos")]
    {
        &macos::Mac
    }
    #[cfg(windows)]
    {
        &windows::Win
    }
    #[cfg(target_os = "linux")]
    {
        &linux::Linux
    }
}

pub fn name_rules() -> NameRules {
    current().name_rules()
}

/// Rename that also works across volumes (copy, verify size, then remove).
/// Shared by all OSes; lives here because "is this a cross-device error" is
/// the one OS-dependent bit.
pub fn move_path(src: &Path, dst: &Path) -> Result<()> {
    match std::fs::rename(src, dst) {
        Ok(()) => Ok(()),
        Err(e) if is_cross_device(&e) => {
            let md = std::fs::symlink_metadata(src)?;
            if md.is_dir() {
                return Err(crate::Error::Other(format!(
                    "moving folders across drives is not supported yet: {}",
                    src.display()
                )));
            }
            std::fs::copy(src, dst)?;
            let copied = std::fs::metadata(dst)?.len();
            if copied != md.len() {
                let _ = std::fs::remove_file(dst);
                return Err(crate::Error::Other("copy size mismatch".into()));
            }
            std::fs::remove_file(src)?;
            Ok(())
        }
        Err(e) => Err(e.into()),
    }
}

pub(crate) fn exe_suffixes() -> &'static [&'static str] {
    if cfg!(windows) {
        &[".exe", ".cmd", ".bat"]
    } else {
        &[""]
    }
}

pub(crate) fn is_executable(p: &Path) -> bool {
    let Ok(md) = std::fs::metadata(p) else { return false };
    if !md.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        md.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

/// Don't flash a console window when spawning helper tools on Windows.
pub(crate) fn hide_console(cmd: &mut std::process::Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    let _ = cmd;
}

fn is_cross_device(e: &std::io::Error) -> bool {
    #[cfg(unix)]
    {
        e.raw_os_error() == Some(18) // EXDEV
    }
    #[cfg(windows)]
    {
        e.raw_os_error() == Some(17) // ERROR_NOT_SAME_DEVICE
    }
}

/// Shared helper for Windows and Linux, where the `trash` crate can list and
/// restore trash items.
#[cfg(any(windows, target_os = "linux"))]
fn trash_via_crate(path: &Path) -> Result<TrashReceipt> {
    let before =
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
    trash::delete(path).map_err(|e| crate::Error::Trash(e.to_string()))?;
    let token = trash::os_limited::list()
        .ok()
        .and_then(|items| {
            items
                .into_iter()
                .filter(|i| i.original_path() == path && i.time_deleted >= before - 5)
                .max_by_key(|i| i.time_deleted)
        })
        .map(|i| i.id.to_string_lossy().into_owned());
    Ok(TrashReceipt { original: path.to_path_buf(), token })
}

#[cfg(any(windows, target_os = "linux"))]
fn restore_via_crate(r: &TrashReceipt) -> Result<()> {
    let items = trash::os_limited::list().map_err(|e| crate::Error::Trash(e.to_string()))?;
    let item = items
        .into_iter()
        .filter(|i| match &r.token {
            Some(t) => i.id.to_string_lossy() == t.as_str(),
            None => i.original_path() == r.original,
        })
        .max_by_key(|i| i.time_deleted)
        .ok_or_else(|| crate::Error::NotFound(format!("{} is no longer in the trash", r.original.display())))?;
    trash::os_limited::restore_all([item]).map_err(|e| crate::Error::Trash(e.to_string()))
}
