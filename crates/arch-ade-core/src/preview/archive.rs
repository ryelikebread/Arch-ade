//! Archive listing only. Nothing is ever extracted.

use std::io::Read;
use std::path::Path;

use serde::Serialize;

use super::Body;
use crate::config::ARCHIVE_LIST_LIMIT;
use crate::kind;
use crate::tools::{self, Tools, META_TIMEOUT};
use crate::{Error, Result};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveEntry {
    pub name: String,
    pub size: Option<u64>,
    pub is_dir: bool,
}

pub fn list(path: &Path, tools: &Tools) -> Result<Body> {
    let ext = kind::ext_of(path);
    let native = match ext.as_str() {
        "zip" | "zipx" => Some(list_zip(path).map(|e| (e, "zip"))),
        "tar" => Some(list_tar(std::fs::File::open(path)?).map(|e| (e, "tar"))),
        "tgz" | "tar.gz" => {
            Some(list_tar(flate2::read::GzDecoder::new(std::fs::File::open(path)?)).map(|e| (e, "tar")))
        }
        _ => None,
    };
    let (entries, via) = match native {
        Some(Ok(r)) => (r.0, r.1.to_string()),
        // Fall through to the external tools (e.g. zipx with exotic methods).
        _ => list_external(path, tools)?,
    };
    let total = entries.len();
    let truncated = total >= ARCHIVE_LIST_LIMIT;
    Ok(Body::Archive { entries, total, truncated, via })
}

fn list_zip(path: &Path) -> Result<Vec<ArchiveEntry>> {
    let mut z = zip::ZipArchive::new(std::fs::File::open(path)?).map_err(|e| Error::Other(e.to_string()))?;
    let mut out = vec![];
    for i in 0..z.len().min(ARCHIVE_LIST_LIMIT) {
        // by_index_raw reads the central directory only: no decompression,
        // and encrypted archives still list.
        let f = z.by_index_raw(i).map_err(|e| Error::Other(e.to_string()))?;
        out.push(ArchiveEntry { name: f.name().to_string(), size: Some(f.size()), is_dir: f.is_dir() });
    }
    Ok(out)
}

fn list_tar<R: Read>(r: R) -> Result<Vec<ArchiveEntry>> {
    let mut a = tar::Archive::new(r);
    let mut out = vec![];
    for e in a.entries()? {
        let e = e?;
        let h = e.header();
        out.push(ArchiveEntry {
            name: e.path()?.to_string_lossy().into_owned(),
            size: h.size().ok(),
            is_dir: h.entry_type().is_dir(),
        });
        if out.len() >= ARCHIVE_LIST_LIMIT {
            break;
        }
    }
    Ok(out)
}

fn list_external(path: &Path, tools: &Tools) -> Result<(Vec<ArchiveEntry>, String)> {
    let p = path.to_string_lossy();
    if let Some(sz) = &tools.sevenzip {
        // -slt prints one "Key = Value" block per entry.
        if let Ok(out) = tools::run(sz, &["l", "-slt", "-ba", "-p", &p], META_TIMEOUT) {
            let entries = parse_7z_slt(&String::from_utf8_lossy(&out));
            if !entries.is_empty() {
                return Ok((entries, "7-Zip".into()));
            }
        }
    }
    if let Some(bsdtar) = &tools.bsdtar {
        if let Ok(out) = tools::run(bsdtar, &["-tf", &p], META_TIMEOUT) {
            let entries: Vec<ArchiveEntry> = String::from_utf8_lossy(&out)
                .lines()
                .take(ARCHIVE_LIST_LIMIT)
                .map(|l| ArchiveEntry { name: l.to_string(), size: None, is_dir: l.ends_with('/') })
                .collect();
            if !entries.is_empty() {
                return Ok((entries, "bsdtar".into()));
            }
        }
    }
    Err(Error::Other("Listing this archive type needs 7-Zip or bsdtar (libarchive), and neither could read it.".into()))
}

pub fn parse_7z_slt(out: &str) -> Vec<ArchiveEntry> {
    let mut entries = vec![];
    let mut name: Option<String> = None;
    let mut size = None;
    let mut is_dir = false;
    let mut flush = |name: &mut Option<String>, size: &mut Option<u64>, is_dir: &mut bool| {
        if let Some(n) = name.take() {
            entries.push(ArchiveEntry { name: n, size: size.take(), is_dir: *is_dir });
        }
        *is_dir = false;
    };
    for line in out.lines() {
        if line.trim().is_empty() {
            flush(&mut name, &mut size, &mut is_dir);
            continue;
        }
        let Some((k, v)) = line.split_once(" = ") else { continue };
        match k {
            "Path" => {
                flush(&mut name, &mut size, &mut is_dir);
                name = Some(v.to_string());
            }
            "Size" => size = v.parse().ok(),
            "Folder" => is_dir = v == "+",
            "Attributes" if v.starts_with('D') => is_dir = true,
            _ => {}
        }
    }
    flush(&mut name, &mut size, &mut is_dir);
    entries.truncate(ARCHIVE_LIST_LIMIT);
    entries
}
