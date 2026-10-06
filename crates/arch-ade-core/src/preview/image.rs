use std::path::Path;

use super::{b64, cached_os_thumb, mtime_secs, Body, Ctx, Preview};
use crate::kind::{self, Kind};
use crate::tools::{self, META_TIMEOUT};

const DECODED_PX: u32 = 1600;

pub fn preview(path: &Path, md: &std::fs::Metadata, k: Kind, ctx: &Ctx, p: &mut Preview) -> crate::Result<Body> {
    p.details.extend(exif_details(path, md, ctx));
    let ext = kind::ext_of(path);

    if k == Kind::Image && (kind::browser_image(&ext) || ext == "svg") {
        let (w, h) = ::image::image_dimensions(path).map(|(w, h)| (Some(w), Some(h))).unwrap_or((None, None));
        return Ok(Body::ImageFile { path: p.path.clone(), width: w, height: h });
    }

    // Everything else becomes a PNG, cached by (path, mtime, size).
    let key = path.to_string_lossy();
    if let Ok(Some(Some(png))) = ctx.db.get_thumb(&key, DECODED_PX, mtime_secs(md), md.len()) {
        return Ok(png_body(png, None));
    }
    let decoded: Option<(Vec<u8>, Option<String>)> = match k {
        Kind::Image => decode_with_image_crate(path).map(|b| (b, None)),
        Kind::Heic => decode_heic(path).map(|b| (b, None)),
        Kind::RawImage => raw_embedded_preview(path, ctx).map(|b| (b, Some("Embedded camera preview".to_string()))),
        _ => None,
    };
    if let Some((png, note)) = decoded {
        let _ = ctx.db.put_thumb(&key, DECODED_PX, mtime_secs(md), md.len(), Some(&png));
        return Ok(png_body(png, note));
    }
    if let Some(png) = cached_os_thumb(ctx, path, md) {
        return Ok(png_body(png, Some("System thumbnail".into())));
    }
    Ok(Body::MetadataOnly { reason: "No decoder or system thumbnailer for this image type.".into() })
}

fn png_body(png: Vec<u8>, note: Option<String>) -> Body {
    let (w, h) = ::image::load_from_memory(&png).map(|i| (Some(i.width()), Some(i.height()))).unwrap_or((None, None));
    Body::ImagePng { png_base64: b64(&png), width: w, height: h, note }
}

fn to_png(img: ::image::DynamicImage) -> Option<Vec<u8>> {
    let img =
        if img.width() > DECODED_PX || img.height() > DECODED_PX { img.thumbnail(DECODED_PX, DECODED_PX) } else { img };
    let mut out = std::io::Cursor::new(Vec::new());
    img.write_to(&mut out, ::image::ImageFormat::Png).ok()?;
    Some(out.into_inner())
}

fn decode_with_image_crate(path: &Path) -> Option<Vec<u8>> {
    to_png(::image::ImageReader::open(path).ok()?.with_guessed_format().ok()?.decode().ok()?)
}

#[cfg(feature = "heic")]
fn decode_heic(path: &Path) -> Option<Vec<u8>> {
    use libheif_rs::{ColorSpace, HeifContext, LibHeif, RgbChroma};
    let lib = LibHeif::new();
    let ctx = HeifContext::read_from_file(path.to_str()?).ok()?;
    let handle = ctx.primary_image_handle().ok()?;
    let img = lib.decode(&handle, ColorSpace::Rgb(RgbChroma::Rgba), None).ok()?;
    let plane = img.planes().interleaved?;
    let (w, h) = (plane.width, plane.height);
    let mut rgba = Vec::with_capacity((w * h * 4) as usize);
    for row in 0..h as usize {
        let start = row * plane.stride;
        rgba.extend_from_slice(&plane.data[start..start + w as usize * 4]);
    }
    to_png(::image::DynamicImage::ImageRgba8(::image::RgbaImage::from_raw(w, h, rgba)?))
}

#[cfg(not(feature = "heic"))]
fn decode_heic(_path: &Path) -> Option<Vec<u8>> {
    None
}

/// RAW files carry a full-size JPEG preview; exiftool extracts it without
/// any demosaicing.
fn raw_embedded_preview(path: &Path, ctx: &Ctx) -> Option<Vec<u8>> {
    let exiftool = ctx.tools.exiftool.as_ref()?;
    for tag in ["-JpgFromRaw", "-PreviewImage", "-ThumbnailImage"] {
        let args = ["-b", tag, &path.to_string_lossy()];
        if let Ok(bytes) = tools::run(exiftool, &args, META_TIMEOUT) {
            if let Ok(img) = ::image::load_from_memory(&bytes) {
                return to_png(img);
            }
        }
    }
    None
}

/// A short, human-readable subset of EXIF/XMP via exiftool (cached).
fn exif_details(path: &Path, md: &std::fs::Metadata, ctx: &Ctx) -> Vec<(String, String)> {
    let Some(exiftool) = ctx.tools.exiftool.as_ref() else { return vec![] };
    let key = path.to_string_lossy();
    let json = match ctx.db.get_meta(&key, "exif", mtime_secs(md), md.len()) {
        Ok(Some(v)) => v,
        _ => {
            let args = [
                "-j",
                "-Make",
                "-Model",
                "-LensModel",
                "-DateTimeOriginal",
                "-ExposureTime",
                "-FNumber",
                "-ISO",
                "-FocalLength",
                "-ImageSize",
                "-GPSPosition",
                "-Software",
                "-Creator",
                "-Title",
                &path.to_string_lossy(),
            ];
            let v = tools::run(exiftool, &args, META_TIMEOUT)
                .ok()
                .and_then(|out| serde_json::from_slice::<serde_json::Value>(&out).ok())
                .and_then(|v| v.get(0).cloned())
                .unwrap_or(serde_json::Value::Null);
            let _ = ctx.db.put_meta(&key, "exif", mtime_secs(md), md.len(), &v);
            v
        }
    };
    let Some(obj) = json.as_object() else { return vec![] };
    obj.iter()
        .filter(|(k, _)| k.as_str() != "SourceFile")
        .map(|(k, v)| (k.clone(), v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string())))
        .collect()
}
