//! The user's own music: audio files dropped into `<app data>/music/`, played
//! as the "My Music" station. Only plain files directly in that folder are
//! listed or read, so a track name can never point anywhere else.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::{Error, Result};

/// Formats every supported webview can usually play.
pub const EXTENSIONS: &[&str] = &["mp3", "m4a", "aac", "ogg", "oga", "opus", "wav", "flac"];
/// Largest track read into memory.
pub const MAX_BYTES: u64 = 50 * 1024 * 1024;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    /// File name in the music folder.
    pub name: String,
    pub bytes: u64,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Listing {
    pub dir: String,
    pub tracks: Vec<Track>,
    /// Files that were skipped, and why.
    pub problems: Vec<String>,
}

fn audio_ext(p: &Path) -> bool {
    p.extension().and_then(|x| x.to_str()).is_some_and(|x| EXTENSIONS.iter().any(|e| e.eq_ignore_ascii_case(x)))
}

/// Audio files in `dir` (created if missing), sorted by name. Hidden files
/// are ignored; files that are too big are reported.
pub fn list(dir: &Path) -> Listing {
    let _ = std::fs::create_dir_all(dir);
    let mut out = Listing { dir: dir.to_string_lossy().into_owned(), ..Default::default() };
    let Ok(rd) = std::fs::read_dir(dir) else { return out };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        let p = e.path();
        if name.starts_with('.') || !audio_ext(&p) {
            continue;
        }
        // symlink_metadata: a link out of the folder is not a track.
        let Ok(meta) = std::fs::symlink_metadata(&p) else { continue };
        if !meta.is_file() {
            continue;
        }
        if meta.len() > MAX_BYTES {
            out.problems.push(format!("{name} is over 50 MB"));
        } else if meta.len() > 0 {
            out.tracks.push(Track { name, bytes: meta.len() });
        }
    }
    out.tracks.sort_by_key(|t| t.name.to_lowercase());
    out
}

/// The path of track `name` in `dir`, refusing anything that isn't a plain
/// audio file sitting directly in the folder.
pub fn resolve(dir: &Path, name: &str) -> Result<PathBuf> {
    let bad = || Error::Other(format!("{name} is not a track in the music folder"));
    if name.is_empty()
        || name.starts_with('.')
        || Path::new(name).file_name().map(|f| f.to_string_lossy()) != Some(name.into())
    {
        return Err(bad());
    }
    let p = dir.join(name);
    if !audio_ext(&p) {
        return Err(bad());
    }
    let meta = std::fs::symlink_metadata(&p).map_err(|_| bad())?;
    if !meta.is_file() {
        return Err(bad());
    }
    if meta.len() > MAX_BYTES {
        return Err(Error::Other(format!("{name} is over 50 MB")));
    }
    Ok(p)
}
