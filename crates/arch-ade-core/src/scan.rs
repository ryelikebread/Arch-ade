//! Listing a folder into table rows.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use rayon::prelude::*;
use serde::{Deserialize, Serialize};

use crate::kind::{self, Kind};
use crate::names;
use crate::platform::Platform;
use crate::protect::{self, ProjectKind};
use crate::source::{self, SourceInfo};
use crate::Result;

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ScanOptions {
    pub recursive: bool,
    pub include_hidden: bool,
    /// Depth limit when recursive (0 = unlimited).
    pub max_depth: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String,
    /// Path relative to the scanned root, `/`-separated, NFC.
    pub rel: String,
    /// Display name (NFC).
    pub name: String,
    pub ext: String,
    pub kind: Kind,
    pub kind_label: &'static str,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    /// Unix milliseconds.
    pub created: Option<i64>,
    pub modified: Option<i64>,
    pub added: Option<i64>,
    pub source: Option<SourceInfo>,
    /// Set on folders that are project roots (their contents are protected).
    pub project: Option<ProjectKind>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub root: String,
    pub entries: Vec<FileEntry>,
    /// Entries we could not read (permissions etc.); the scan continues past them.
    pub errors: Vec<String>,
}

fn ms(t: std::io::Result<SystemTime>) -> Option<i64> {
    t.ok()?.duration_since(UNIX_EPOCH).ok().map(|d| d.as_millis() as i64)
}

fn is_hidden(name: &str) -> bool {
    name.starts_with('.')
}

fn is_partial_download(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    crate::config::PARTIAL_DOWNLOAD_EXTS.iter().any(|e| lower.ends_with(&format!(".{e}")))
}

pub fn scan(root: &Path, opts: ScanOptions, platform: &dyn Platform) -> Result<ScanResult> {
    let mut walker = walkdir::WalkDir::new(root).min_depth(1).follow_links(false);
    walker = match (opts.recursive, opts.max_depth) {
        (false, _) => walker.max_depth(1),
        (true, 0) => walker,
        (true, d) => walker.max_depth(d),
    };
    let mut paths: Vec<(PathBuf, bool)> = Vec::new();
    let mut errors = Vec::new();
    let mut it = walker.into_iter();
    while let Some(next) = it.next() {
        match next {
            Ok(e) => {
                let name = e.file_name().to_string_lossy();
                if !opts.include_hidden && is_hidden(&name) {
                    if e.file_type().is_dir() {
                        it.skip_current_dir();
                    }
                    continue;
                }
                paths.push((e.path().to_path_buf(), e.path_is_symlink()));
                // List a project folder, never its contents.
                if e.file_type().is_dir() && protect::project_kind(e.path()).is_some() {
                    it.skip_current_dir();
                }
            }
            Err(e) => errors.push(e.to_string()),
        }
    }

    let entries: Vec<FileEntry> =
        paths.par_iter().filter_map(|(p, is_symlink)| entry_for(root, p, *is_symlink, platform)).collect();

    Ok(ScanResult { root: root.to_string_lossy().into_owned(), entries, errors })
}

pub fn entry_for(root: &Path, p: &Path, is_symlink: bool, platform: &dyn Platform) -> Option<FileEntry> {
    let md = std::fs::symlink_metadata(p).ok()?;
    let is_dir = md.is_dir();
    let raw_name = p.file_name()?.to_string_lossy().into_owned();
    let name = names::display_form(&raw_name);
    let rel = p
        .strip_prefix(root)
        .map(|r| {
            r.components().map(|c| names::display_form(&c.as_os_str().to_string_lossy())).collect::<Vec<_>>().join("/")
        })
        .unwrap_or_else(|_| name.clone());
    let kind = kind::detect(p, is_dir);
    let source = if is_dir { None } else { Some(source::resolve(&platform.raw_source(p))).filter(|s| !s.is_empty()) };
    Some(FileEntry {
        path: p.to_string_lossy().into_owned(),
        rel,
        ext: if is_dir { String::new() } else { kind::ext_of(p) },
        kind,
        kind_label: kind.label(),
        is_dir,
        is_symlink,
        size: if is_dir { 0 } else { md.len() },
        created: ms(md.created()),
        modified: ms(md.modified()),
        added: platform.added_time(p).map(|s| s * 1000),
        source,
        project: if is_dir && !is_symlink { protect::project_kind(p) } else { None },
        name,
    })
}

/// True for paths the watcher and scanner should ignore while a browser is
/// still writing them.
pub fn ignore_while_downloading(path: &Path) -> bool {
    path.file_name().map(|n| is_partial_download(&n.to_string_lossy())).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scans_flat_and_recursive() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path();
        std::fs::write(root.join("a.txt"), "hello").unwrap();
        std::fs::write(root.join(".hidden"), "x").unwrap();
        std::fs::create_dir(root.join("sub")).unwrap();
        std::fs::write(root.join("sub/b.png"), "x").unwrap();
        let p = crate::platform::current();

        let r = scan(root, ScanOptions::default(), p).unwrap();
        let mut names: Vec<_> = r.entries.iter().map(|e| e.name.clone()).collect();
        names.sort();
        assert_eq!(names, vec!["a.txt", "sub"]);
        let a = r.entries.iter().find(|e| e.name == "a.txt").unwrap();
        assert_eq!(a.size, 5);
        assert_eq!(a.kind, Kind::Text);
        assert!(a.modified.is_some());

        let r = scan(root, ScanOptions { recursive: true, include_hidden: true, max_depth: 0 }, p).unwrap();
        assert_eq!(r.entries.len(), 4);
        assert!(r.entries.iter().any(|e| e.rel == "sub/b.png"));
    }

    #[test]
    fn recursive_scan_skips_project_contents() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path();
        std::fs::create_dir_all(root.join("app/.git")).unwrap();
        std::fs::create_dir_all(root.join("app/src")).unwrap();
        std::fs::write(root.join("app/src/main.rs"), "fn main() {}").unwrap();
        std::fs::create_dir_all(root.join("photos")).unwrap();
        std::fs::write(root.join("photos/a.jpg"), "x").unwrap();
        let opts = ScanOptions { recursive: true, include_hidden: true, max_depth: 0 };
        let r = scan(root, opts, crate::platform::current()).unwrap();
        let rels: Vec<_> = r.entries.iter().map(|e| e.rel.as_str()).collect();
        assert!(rels.contains(&"app"));
        assert!(rels.contains(&"photos/a.jpg"));
        assert!(!rels.iter().any(|r| r.starts_with("app/")), "{rels:?}");
        assert_eq!(r.entries.iter().find(|e| e.rel == "app").unwrap().project, Some(ProjectKind::Git));
    }

    #[test]
    fn partial_downloads() {
        assert!(ignore_while_downloading(Path::new("/x/file.zip.crdownload")));
        assert!(ignore_while_downloading(Path::new("/x/file.PART")));
        assert!(!ignore_while_downloading(Path::new("/x/file.zip")));
    }
}
