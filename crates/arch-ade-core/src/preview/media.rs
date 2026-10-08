use std::path::Path;

use super::{b64, mtime_secs, Body, Ctx, Preview};
use crate::kind::{self, Kind};
use crate::tools::{self, META_TIMEOUT, THUMB_TIMEOUT};

/// Formats the webviews on all three OSes can usually play. The frontend
/// still falls back to the poster frame if playback fails.
fn likely_playable(ext: &str) -> bool {
    matches!(
        ext,
        "mp3" | "m4a" | "m4b" | "wav" | "aac" | "mp4" | "m4v" | "mov" | "ogg" | "oga" | "opus" | "webm" | "flac"
    )
}

pub fn preview(path: &Path, md: &std::fs::Metadata, k: Kind, ctx: &Ctx, p: &mut Preview) -> crate::Result<Body> {
    let video = k == Kind::Video;
    p.details.extend(probe(path, md, ctx));
    let poster = if video { poster(path, md, ctx) } else { None };
    Ok(Body::Media {
        path: p.path.clone(),
        video,
        playable: likely_playable(&kind::ext_of(path)),
        poster_base64: poster.map(|b| b64(&b)),
    })
}

/// Container/stream summary from ffprobe (cached).
fn probe(path: &Path, md: &std::fs::Metadata, ctx: &Ctx) -> Vec<(String, String)> {
    probe_json(path, md, ctx).map(|j| summarize(&j)).unwrap_or_default()
}

/// ffprobe's JSON for a file (cached by path, mtime and size); `None`
/// without ffprobe.
pub fn probe_json(path: &Path, md: &std::fs::Metadata, ctx: &Ctx) -> Option<serde_json::Value> {
    let ffprobe = ctx.tools.ffprobe.as_ref()?;
    let key = path.to_string_lossy();
    let json = match ctx.db.get_meta(&key, "ffprobe", mtime_secs(md), md.len()) {
        Ok(Some(v)) => v,
        _ => {
            let args = ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", &key];
            let v = tools::run(ffprobe, &args, META_TIMEOUT)
                .ok()
                .and_then(|o| serde_json::from_slice(&o).ok())
                .unwrap_or(serde_json::Value::Null);
            let _ = ctx.db.put_meta(&key, "ffprobe", mtime_secs(md), md.len(), &v);
            v
        }
    };
    Some(json)
}

pub fn summarize(json: &serde_json::Value) -> Vec<(String, String)> {
    let mut out = vec![];
    let s = |v: &serde_json::Value| v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string());
    if let Some(f) = json.get("format") {
        if let Some(d) = f.get("duration").and_then(|d| d.as_str()).and_then(|d| d.parse::<f64>().ok()) {
            let t = d.round() as u64;
            out.push(("Duration".into(), format!("{}:{:02}:{:02}", t / 3600, (t / 60) % 60, t % 60)));
        }
        if let Some(n) = f.get("format_long_name") {
            out.push(("Container".into(), s(n)));
        }
        if let Some(tags) = f.get("tags").and_then(|t| t.as_object()) {
            for (k, v) in tags {
                let k_low = k.to_ascii_lowercase();
                if ["title", "artist", "album", "album_artist", "date", "track", "genre"].contains(&k_low.as_str()) {
                    out.push((k_low, s(v)));
                }
            }
        }
    }
    if let Some(streams) = json.get("streams").and_then(|s| s.as_array()) {
        for st in streams {
            let ty = st.get("codec_type").map(s).unwrap_or_default();
            let codec = st.get("codec_name").map(s).unwrap_or_default();
            let extra = match ty.as_str() {
                "video" => format!(
                    " {}x{}",
                    st.get("width").map(s).unwrap_or_default(),
                    st.get("height").map(s).unwrap_or_default()
                ),
                "audio" => format!(" {} Hz", st.get("sample_rate").map(s).unwrap_or_default()),
                _ => String::new(),
            };
            out.push((format!("Stream ({ty})"), format!("{codec}{extra}")));
        }
    }
    out
}

/// One frame at ~1s (or the first frame for short clips), as PNG.
fn poster(path: &Path, md: &std::fs::Metadata, ctx: &Ctx) -> Option<Vec<u8>> {
    let key = path.to_string_lossy();
    let px = 640;
    if let Ok(Some(hit)) = ctx.db.get_thumb(&key, px, mtime_secs(md), md.len()) {
        return hit;
    }
    let png = ctx.tools.ffmpeg.as_ref().and_then(|ffmpeg| {
        let grab = |seek: &str| {
            let args = [
                "-v",
                "quiet",
                "-ss",
                seek,
                "-i",
                &key,
                "-frames:v",
                "1",
                "-vf",
                "scale=640:-2",
                "-f",
                "image2pipe",
                "-vcodec",
                "png",
                "-",
            ];
            tools::run(ffmpeg, &args, THUMB_TIMEOUT).ok().filter(|b| !b.is_empty())
        };
        grab("1").or_else(|| grab("0"))
    });
    let png = png.or_else(|| ctx.platform.os_thumbnail(path, px, ctx.tools));
    let _ = ctx.db.put_thumb(&key, px, mtime_secs(md), md.len(), png.as_deref());
    png
}
