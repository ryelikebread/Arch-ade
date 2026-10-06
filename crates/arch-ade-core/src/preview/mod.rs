//! Previews by file type. Every provider is read-only: nothing is executed,
//! mounted or extracted. Unknown or unreadable files fall back to metadata
//! (plus an OS thumbnail when one exists); a preview never fails hard.

mod archive;
mod image;
mod media;
mod office;
mod text;

use std::path::Path;

use base64::Engine;
use serde::Serialize;

use crate::db::Db;
use crate::kind::{self, Kind};
use crate::platform::Platform;
use crate::tools::Tools;

pub use archive::ArchiveEntry;

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Body {
    /// Shown by the webview directly from the file (asset protocol).
    #[serde(rename_all = "camelCase")]
    ImageFile { path: String, width: Option<u32>, height: Option<u32> },
    /// Decoded or OS-generated PNG.
    #[serde(rename_all = "camelCase")]
    ImagePng { png_base64: String, width: Option<u32>, height: Option<u32>, note: Option<String> },
    #[serde(rename_all = "camelCase")]
    Text { text: String, truncated: bool, syntax: &'static str },
    #[serde(rename_all = "camelCase")]
    Table { rows: Vec<Vec<String>>, truncated: bool, sheets: Vec<String> },
    #[serde(rename_all = "camelCase")]
    Document { paragraphs: Vec<String>, truncated: bool },
    /// Rendered by pdf.js from bytes the frontend requests separately.
    #[serde(rename_all = "camelCase")]
    Pdf { path: String },
    #[serde(rename_all = "camelCase")]
    Gdoc { title: String, url: Option<String>, account: Option<String> },
    #[serde(rename_all = "camelCase")]
    Archive { entries: Vec<ArchiveEntry>, total: usize, truncated: bool, via: String },
    #[serde(rename_all = "camelCase")]
    Media { path: String, video: bool, playable: bool, poster_base64: Option<String> },
    /// Nothing to render beyond the details panel.
    #[serde(rename_all = "camelCase")]
    MetadataOnly { reason: String },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub path: String,
    pub name: String,
    pub kind: Kind,
    pub kind_label: &'static str,
    pub mime: &'static str,
    pub size: u64,
    pub body: Body,
    /// Extra facts shown in the details panel (EXIF, media streams, ...).
    pub details: Vec<(String, String)>,
    /// OS thumbnail for types whose body is metadata-only.
    pub thumbnail_base64: Option<String>,
    pub warnings: Vec<String>,
}

pub struct Ctx<'a> {
    pub db: &'a Db,
    pub tools: &'a Tools,
    pub platform: &'a dyn Platform,
}

pub(crate) fn b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

pub(crate) fn mtime_secs(md: &std::fs::Metadata) -> i64 {
    md.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// OS thumbnail, cached in SQLite by (path, mtime, size).
pub(crate) fn cached_os_thumb(ctx: &Ctx, path: &Path, md: &std::fs::Metadata) -> Option<Vec<u8>> {
    let key = path.to_string_lossy();
    let px = crate::config::THUMB_PX;
    if let Ok(Some(hit)) = ctx.db.get_thumb(&key, px, mtime_secs(md), md.len()) {
        return hit;
    }
    let png = ctx.platform.os_thumbnail(path, px, ctx.tools);
    let _ = ctx.db.put_thumb(&key, px, mtime_secs(md), md.len(), png.as_deref());
    png
}

pub fn preview(path: &Path, ctx: &Ctx) -> crate::Result<Preview> {
    let md = std::fs::metadata(path)?;
    let k = kind::detect(path, md.is_dir());
    let mut p = Preview {
        path: path.to_string_lossy().into_owned(),
        name: crate::names::display_form(&path.file_name().unwrap_or_default().to_string_lossy()),
        kind: k,
        kind_label: k.label(),
        mime: if md.is_dir() { "inode/directory" } else { kind::mime_for(path) },
        size: md.len(),
        body: Body::MetadataOnly { reason: String::new() },
        details: vec![],
        thumbnail_base64: None,
        warnings: vec![],
    };
    let result = match k {
        Kind::Folder => Ok(Body::MetadataOnly { reason: "Folder".into() }),
        Kind::Image | Kind::RawImage | Kind::Heic | Kind::Vector => image::preview(path, &md, k, ctx, &mut p),
        Kind::Pdf => Ok(Body::Pdf { path: p.path.clone() }),
        Kind::Text => text::preview(path, "plain"),
        Kind::Markdown => text::preview(path, "markdown"),
        Kind::Json => text::preview(path, "json"),
        Kind::Html => text::preview(path, "html"),
        Kind::Csv => office::csv(path),
        Kind::Docx => office::docx(path),
        Kind::Xlsx => office::xlsx(path),
        Kind::Gdoc => office::gdoc(path),
        Kind::Audio | Kind::Video => media::preview(path, &md, k, ctx, &mut p),
        Kind::Archive => archive::list(path, ctx.tools),
        Kind::DiskImage => match kind::ext_of(path).as_str() {
            // Optical images are listed like archives; dmg and friends are not.
            "iso" | "nrg" => archive::list(path, ctx.tools),
            _ => Ok(Body::MetadataOnly { reason: "Disk images are never mounted or opened.".into() }),
        },
        Kind::Installer => Ok(Body::MetadataOnly { reason: "Installers are never run or unpacked.".into() }),
        Kind::Unknown => text::sniff_text(path),
    };
    p.body = match result {
        Ok(b) => b,
        Err(e) => {
            p.warnings.push(e.to_string());
            Body::MetadataOnly { reason: "This file could not be previewed.".into() }
        }
    };
    if matches!(p.body, Body::MetadataOnly { .. }) && !md.is_dir() && p.thumbnail_base64.is_none() {
        p.thumbnail_base64 = cached_os_thumb(ctx, path, &md).map(|b| b64(&b));
    }
    Ok(p)
}

/// Raw bytes for pdf.js (capped).
pub fn read_bytes(path: &Path) -> crate::Result<Vec<u8>> {
    let len = std::fs::metadata(path)?.len();
    if len > crate::config::MAX_INLINE_BYTES {
        return Err(crate::Error::Other(format!("file is too large to preview ({} MB)", len / 1_048_576)));
    }
    Ok(std::fs::read(path)?)
}

#[cfg(test)]
mod tests;
