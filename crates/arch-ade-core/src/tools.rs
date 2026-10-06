//! Optional helper programs (ffprobe, exiftool, bsdtar, ...). Detected once at
//! startup; every feature that uses one degrades gracefully when it's missing.
//!
//! Tools are always run with a fixed argument list (never through a shell),
//! with a timeout and a cap on captured output.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::{Error, Result};

pub const META_TIMEOUT: Duration = Duration::from_secs(10);
pub const THUMB_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_OUTPUT: usize = 16 * 1024 * 1024;

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tools {
    pub ffprobe: Option<PathBuf>,
    pub ffmpeg: Option<PathBuf>,
    pub exiftool: Option<PathBuf>,
    pub bsdtar: Option<PathBuf>,
    pub sevenzip: Option<PathBuf>,
    pub qlmanage: Option<PathBuf>,
    pub ffmpegthumbnailer: Option<PathBuf>,
}

impl Tools {
    pub fn detect() -> Self {
        let extra = crate::platform::current().extra_tool_dirs();
        let f = |names: &[&str]| names.iter().find_map(|n| find_in(n, &extra));
        Tools {
            ffprobe: f(&["ffprobe"]),
            ffmpeg: f(&["ffmpeg"]),
            exiftool: f(&["exiftool"]),
            bsdtar: f(&["bsdtar"]).or_else(|| windows_tar(&extra)),
            sevenzip: f(&["7zz", "7z", "7za"]),
            qlmanage: f(&["qlmanage"]),
            ffmpegthumbnailer: f(&["ffmpegthumbnailer"]),
        }
    }
}

/// Windows 10+ ships libarchive's bsdtar as `tar.exe`.
fn windows_tar(extra: &[PathBuf]) -> Option<PathBuf> {
    match crate::platform::current().os() {
        crate::platform::Os::Windows => find_in("tar", extra),
        _ => None,
    }
}

/// Look for an executable on PATH and then in `extra`.
pub fn find_in(name: &str, extra: &[PathBuf]) -> Option<PathBuf> {
    let exts = crate::platform::exe_suffixes();
    let path_dirs = std::env::var_os("PATH").map(|p| std::env::split_paths(&p).collect::<Vec<_>>()).unwrap_or_default();
    for dir in path_dirs.iter().chain(extra.iter()) {
        for ext in exts {
            let cand = dir.join(format!("{name}{ext}"));
            if crate::platform::is_executable(&cand) {
                return Some(cand);
            }
        }
    }
    None
}

/// Run `bin args...`, return stdout. Kills the child after `timeout`.
pub fn run<S: AsRef<std::ffi::OsStr>>(bin: &Path, args: &[S], timeout: Duration) -> Result<Vec<u8>> {
    let mut cmd = Command::new(bin);
    cmd.args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null());
    crate::platform::hide_console(&mut cmd);
    let mut child = cmd.spawn()?;
    let mut stdout = child.stdout.take().expect("piped");
    let reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = (&mut stdout).take(MAX_OUTPUT as u64).read_to_end(&mut buf);
        buf
    });
    let start = Instant::now();
    loop {
        if let Some(status) = child.try_wait()? {
            let out = reader.join().unwrap_or_default();
            return if status.success() {
                Ok(out)
            } else {
                Err(Error::Other(format!("{} exited with {status}", bin.display())))
            };
        }
        if start.elapsed() > timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Err(Error::Other(format!("{} timed out", bin.display())));
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}
