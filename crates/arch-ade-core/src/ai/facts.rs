//! What Arch-ade knows about one file before suggesting anything: name,
//! kind, source, a text excerpt, a small image for the vision model,
//! whether it's a screenshot, and embedded media tags. Everything is read
//! locally and read-only.

use std::path::{Path, PathBuf};

use base64::Engine;
use serde::Serialize;

use super::media::{self, MediaTags};
use crate::kind::{self, Kind};
use crate::preview::{self, Ctx};
use crate::scan::FileEntry;

/// Characters of file content shown to the text model.
pub const TEXT_CHARS: usize = 3_000;
/// Longest side of the image sent to the vision model.
pub const IMAGE_PX: u32 = 896;
const TEXT_READ_BYTES: usize = 16 * 1024;

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileFacts {
    pub path: PathBuf,
    pub name: String,
    pub ext: String,
    pub kind: Kind,
    pub size: u64,
    pub modified: Option<i64>,
    pub domain: Option<String>,
    pub app: Option<String>,
    /// Lowercase words of the name, for hints and keyword matching.
    pub words: Vec<String>,
    #[serde(skip)]
    pub text: Option<String>,
    /// Base64 JPEG for the vision model.
    #[serde(skip)]
    pub image_b64: Option<String>,
    pub dims: Option<(u32, u32)>,
    pub screenshot: bool,
    pub media: MediaTags,
}

/// Gather facts. `want_image` decodes the image for the vision model.
pub fn gather(e: &FileEntry, ctx: &Ctx, want_image: bool) -> FileFacts {
    let path = PathBuf::from(&e.path);
    let mut f = FileFacts {
        path: path.clone(),
        name: e.name.clone(),
        ext: e.ext.clone(),
        kind: e.kind,
        size: e.size,
        modified: e.modified,
        domain: e.source.as_ref().and_then(|s| s.domain.clone()),
        app: e.source.as_ref().and_then(|s| s.app.clone()),
        words: super::hints::words(crate::rename::split_name(&e.name).0),
        ..Default::default()
    };
    f.text = excerpt(&path, e.kind, ctx);
    if matches!(e.kind, Kind::Image | Kind::Heic | Kind::RawImage | Kind::Vector) {
        let img = decode_image(&path, ctx);
        f.dims = img.as_ref().map(|i| (i.width(), i.height()));
        f.screenshot = ctx.platform.is_screen_capture(&path).unwrap_or_else(|| looks_like_screenshot(&f));
        if want_image {
            f.image_b64 = img.and_then(|i| jpeg_b64(&i));
        }
    }
    if matches!(e.kind, Kind::Audio | Kind::Video) {
        if let Ok(md) = std::fs::metadata(&path) {
            if let Some(json) = preview::media::probe_json(&path, &md, ctx) {
                f.media = media::from_ffprobe(&json);
            }
        }
    }
    f
}

/// The start of the file's text, where there is any.
fn excerpt(path: &Path, k: Kind, ctx: &Ctx) -> Option<String> {
    let text = match k {
        Kind::Text | Kind::Markdown | Kind::Json | Kind::Csv | Kind::Html | Kind::Unknown => {
            preview::text::text_prefix(path, TEXT_READ_BYTES)
        }
        Kind::Docx => preview::office::docx_text(path),
        Kind::Xlsx => preview::office::xlsx_text(path, 30),
        Kind::Pdf => ctx.tools.pdftotext.as_ref().and_then(|bin| {
            let p = path.to_string_lossy();
            let args = ["-q", "-l", "2", "-enc", "UTF-8", &p, "-"];
            crate::tools::run(bin, &args, crate::tools::META_TIMEOUT)
                .ok()
                .map(|b| String::from_utf8_lossy(&b).into_owned())
        }),
        Kind::Gdoc => match preview::office::gdoc(path).ok()? {
            preview::Body::Gdoc { title, .. } => Some(title),
            _ => None,
        },
        _ => None,
    }?;
    let squeezed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    (!squeezed.is_empty()).then(|| squeezed.chars().take(TEXT_CHARS).collect())
}

fn decode_image(path: &Path, ctx: &Ctx) -> Option<::image::DynamicImage> {
    let ext = kind::ext_of(path);
    if kind::browser_image(&ext) && ext != "svg" {
        let decoded = ::image::ImageReader::open(path)
            .ok()
            .and_then(|r| r.with_guessed_format().ok())
            .and_then(|r| r.decode().ok());
        if decoded.is_some() {
            return decoded;
        }
    }
    // HEIC, RAW, TIFF and friends: whatever the preview pipeline produced.
    let p = preview::preview(path, ctx).ok()?;
    let b64 = match p.body {
        preview::Body::ImagePng { png_base64, .. } => Some(png_base64),
        _ => p.thumbnail_base64,
    }?;
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64).ok()?;
    ::image::load_from_memory(&bytes).ok()
}

fn jpeg_b64(img: &::image::DynamicImage) -> Option<String> {
    let small =
        if img.width() > IMAGE_PX || img.height() > IMAGE_PX { img.thumbnail(IMAGE_PX, IMAGE_PX) } else { img.clone() };
    let mut out = std::io::Cursor::new(Vec::new());
    ::image::DynamicImage::ImageRgb8(small.to_rgb8()).write_to(&mut out, ::image::ImageFormat::Jpeg).ok()?;
    Some(base64::engine::general_purpose::STANDARD.encode(out.into_inner()))
}

/// Names screenshot tools use, in several languages.
const SCREENSHOT_NAMES: &[&str] = &[
    "screenshot",
    "screen shot",
    "screen capture",
    "screencapture",
    "screen recording",
    "bildschirmfoto",
    "capture d écran",
    "captura de pantalla",
    "schermafbeelding",
    "skärmavbild",
    "cleanshot",
    "snip",
    "snipping",
];

/// Exact pixel sizes of common displays (and their retina doubles).
const SCREEN_SIZES: &[(u32, u32)] = &[
    (1280, 720),
    (1280, 800),
    (1366, 768),
    (1440, 900),
    (1536, 864),
    (1600, 900),
    (1680, 1050),
    (1920, 1080),
    (1920, 1200),
    (2048, 1152),
    (2560, 1440),
    (2560, 1600),
    (2732, 2048),
    (2880, 1800),
    (2940, 1912),
    (3024, 1964),
    (3456, 2234),
    (3840, 2160),
    (5120, 2880),
    (750, 1334),
    (828, 1792),
    (1080, 2340),
    (1080, 2400),
    (1125, 2436),
    (1170, 2532),
    (1179, 2556),
    (1242, 2688),
    (1284, 2778),
    (1290, 2796),
    (1206, 2622),
    (1320, 2868),
    (1440, 3120),
];

/// Without an OS flag: a screenshot-ish name, or a PNG exactly the size of a
/// common screen.
pub fn looks_like_screenshot(f: &FileFacts) -> bool {
    let name = f.words.join(" ");
    if SCREENSHOT_NAMES.iter().any(|n| contains_words(&name, n)) {
        return true;
    }
    let png = f.ext.eq_ignore_ascii_case("png");
    png && f.dims.is_some_and(|(w, h)| SCREEN_SIZES.iter().any(|&(a, b)| (w, h) == (a, b) || (w, h) == (b, a)))
}

fn contains_words(haystack: &str, phrase: &str) -> bool {
    let phrase = super::hints::words(phrase).join(" ");
    format!(" {haystack} ").contains(&format!(" {phrase} "))
}
