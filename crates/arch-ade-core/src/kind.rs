//! File kind detection: extension first, magic bytes when there is no
//! (known) extension.

use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    Folder,
    Image,
    RawImage,
    Heic,
    Vector,
    Pdf,
    Text,
    Markdown,
    Json,
    Csv,
    Html,
    Docx,
    Xlsx,
    Gdoc,
    Audio,
    Video,
    Archive,
    DiskImage,
    Installer,
    #[default]
    Unknown,
}

impl Kind {
    pub fn label(self) -> &'static str {
        match self {
            Kind::Folder => "Folder",
            Kind::Image => "Image",
            Kind::RawImage => "RAW photo",
            Kind::Heic => "HEIC photo",
            Kind::Vector => "Vector image",
            Kind::Pdf => "PDF",
            Kind::Text => "Text",
            Kind::Markdown => "Markdown",
            Kind::Json => "JSON",
            Kind::Csv => "Table",
            Kind::Html => "HTML",
            Kind::Docx => "Word document",
            Kind::Xlsx => "Spreadsheet",
            Kind::Gdoc => "Google Docs link",
            Kind::Audio => "Audio",
            Kind::Video => "Video",
            Kind::Archive => "Archive",
            Kind::DiskImage => "Disk image",
            Kind::Installer => "Installer",
            Kind::Unknown => "Other",
        }
    }
}

pub fn ext_of(path: &Path) -> String {
    let name = path.file_name().map(|n| n.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
    // Double extensions we care about.
    for de in ["tar.gz", "tar.bz2", "tar.xz", "tar.zst"] {
        if name.ends_with(&format!(".{de}")) {
            return de.to_string();
        }
    }
    path.extension().map(|e| e.to_string_lossy().to_ascii_lowercase()).unwrap_or_default()
}

pub fn from_ext(ext: &str) -> Kind {
    match ext {
        "jpg" | "jpeg" | "jpe" | "png" | "gif" | "bmp" | "ico" | "tif" | "tiff" | "webp" | "svg" => Kind::Image,
        "heic" | "heif" | "hif" | "avif" => Kind::Heic,
        "cr2" | "cr3" | "nef" | "nrw" | "arw" | "srf" | "sr2" | "dng" | "orf" | "rw2" | "raf" | "pef" | "srw"
        | "raw" | "rwl" | "3fr" | "erf" | "kdc" | "mrw" | "x3f" | "iiq" => Kind::RawImage,
        "wmf" | "emf" => Kind::Vector,
        "pdf" => Kind::Pdf,
        "txt" | "text" | "log" | "ini" | "cfg" | "conf" | "toml" | "yaml" | "yml" | "xml" | "rtf" | "srt" | "vtt"
        | "rs" | "py" | "js" | "ts" | "c" | "h" | "cpp" | "java" | "go" | "rb" | "sh" | "css" => Kind::Text,
        "md" | "markdown" => Kind::Markdown,
        "json" | "jsonl" | "geojson" => Kind::Json,
        "csv" | "tsv" => Kind::Csv,
        "html" | "htm" | "xhtml" => Kind::Html,
        "docx" => Kind::Docx,
        "xlsx" | "xlsm" => Kind::Xlsx,
        "gdoc" | "gsheet" | "gslides" | "gdraw" | "gform" | "gmap" | "gsite" => Kind::Gdoc,
        "wav" | "mp3" | "m4a" | "wma" | "ogg" | "oga" | "opus" | "flac" | "aac" | "aif" | "aiff" | "m4b" | "m4p" => {
            Kind::Audio
        }
        "mp4" | "m4v" | "mkv" | "mov" | "avi" | "webm" | "wmv" | "asf" | "mpg" | "mpeg" | "3gp" => Kind::Video,
        "zip" | "zipx" | "rar" | "7z" | "tar" | "tgz" | "tar.gz" | "tar.bz2" | "tar.xz" | "tar.zst" | "gz" | "bz2"
        | "xz" | "cab" => Kind::Archive,
        "iso" | "nrg" | "dmg" | "img" | "sparseimage" | "sparsebundle" | "vhd" | "vhdx" => Kind::DiskImage,
        "pkg" | "mpkg" | "msi" | "exe" | "deb" | "rpm" | "appimage" | "apk" => Kind::Installer,
        _ => Kind::Unknown,
    }
}

/// Kind of a path, sniffing the first bytes when the extension says nothing.
pub fn detect(path: &Path, is_dir: bool) -> Kind {
    if is_dir {
        return Kind::Folder;
    }
    let k = from_ext(&ext_of(path));
    if k != Kind::Unknown {
        return k;
    }
    match infer::get_from_path(path).ok().flatten() {
        Some(t) => match t.matcher_type() {
            infer::MatcherType::Image => Kind::Image,
            infer::MatcherType::Audio => Kind::Audio,
            infer::MatcherType::Video => Kind::Video,
            infer::MatcherType::Archive => match t.extension() {
                "pdf" => Kind::Pdf,
                _ => Kind::Archive,
            },
            infer::MatcherType::Doc => match t.extension() {
                "docx" => Kind::Docx,
                "xlsx" => Kind::Xlsx,
                _ => Kind::Unknown,
            },
            _ => Kind::Unknown,
        },
        None => Kind::Unknown,
    }
}

/// Best-effort MIME type (used for freedesktop thumbnailers and the UI).
pub fn mime_for(path: &Path) -> &'static str {
    let ext = ext_of(path);
    match ext.as_str() {
        "jpg" | "jpeg" | "jpe" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "ico" => "image/vnd.microsoft.icon",
        "tif" | "tiff" => "image/tiff",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "heic" | "heif" | "hif" => "image/heif",
        "avif" => "image/avif",
        "wmf" => "image/wmf",
        "emf" => "image/emf",
        "pdf" => "application/pdf",
        "mp3" => "audio/mpeg",
        "m4a" | "m4b" | "m4p" => "audio/mp4",
        "wav" => "audio/wav",
        "ogg" | "oga" | "opus" => "audio/ogg",
        "flac" => "audio/flac",
        "wma" => "audio/x-ms-wma",
        "mp4" | "m4v" => "video/mp4",
        "mov" => "video/quicktime",
        "mkv" => "video/x-matroska",
        "webm" => "video/webm",
        "avi" => "video/x-msvideo",
        "wmv" | "asf" => "video/x-ms-asf",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "zip" | "zipx" => "application/zip",
        _ => match from_ext(&ext) {
            Kind::RawImage => "image/x-dcraw",
            Kind::Text | Kind::Markdown => "text/plain",
            _ => infer::get_from_path(path).ok().flatten().map(|t| t.mime_type()).unwrap_or("application/octet-stream"),
        },
    }
}

/// Whether the webview can show this image type natively in an <img>.
pub fn browser_image(ext: &str) -> bool {
    matches!(ext, "jpg" | "jpeg" | "jpe" | "png" | "gif" | "bmp" | "ico" | "webp")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn extensions() {
        assert_eq!(from_ext("jpg"), Kind::Image);
        assert_eq!(from_ext("nef"), Kind::RawImage);
        assert_eq!(ext_of(&PathBuf::from("a/b.TAR.GZ")), "tar.gz");
        assert_eq!(detect(&PathBuf::from("x.gdoc"), false), Kind::Gdoc);
        assert_eq!(detect(&PathBuf::from("anything"), true), Kind::Folder);
    }

    #[test]
    fn sniffs_without_extension() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("noext");
        std::fs::write(&p, b"%PDF-1.7\n...").unwrap();
        assert_eq!(detect(&p, false), Kind::Pdf);
        let p = dir.path().join("png-without-ext");
        std::fs::write(&p, [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]).unwrap();
        assert_eq!(detect(&p, false), Kind::Image);
    }
}
