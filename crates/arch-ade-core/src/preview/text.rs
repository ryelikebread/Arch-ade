use std::io::Read;
use std::path::Path;

use super::Body;
use crate::config::TEXT_PREVIEW_BYTES;

fn read_prefix(path: &Path, limit: usize) -> std::io::Result<(Vec<u8>, bool)> {
    let f = std::fs::File::open(path)?;
    let mut buf = Vec::new();
    f.take(limit as u64 + 1).read_to_end(&mut buf)?;
    let truncated = buf.len() > limit;
    buf.truncate(limit);
    Ok((buf, truncated))
}

fn decode(buf: &[u8]) -> String {
    // UTF-16 with BOM (common for Windows-generated text files).
    if buf.len() >= 2 && (buf[..2] == [0xFF, 0xFE] || buf[..2] == [0xFE, 0xFF]) {
        let le = buf[0] == 0xFF;
        let units: Vec<u16> = buf[2..]
            .chunks_exact(2)
            .map(|c| if le { u16::from_le_bytes([c[0], c[1]]) } else { u16::from_be_bytes([c[0], c[1]]) })
            .collect();
        return String::from_utf16_lossy(&units);
    }
    let buf = buf.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(buf);
    String::from_utf8_lossy(buf).into_owned()
}

pub fn looks_binary(buf: &[u8]) -> bool {
    let head = &buf[..buf.len().min(8192)];
    let utf16 = head.len() >= 2 && (head[..2] == [0xFF, 0xFE] || head[..2] == [0xFE, 0xFF]);
    !utf16 && head.contains(&0)
}

pub fn preview(path: &Path, syntax: &'static str) -> crate::Result<Body> {
    let (buf, truncated) = read_prefix(path, TEXT_PREVIEW_BYTES)?;
    if looks_binary(&buf) {
        return Ok(Body::MetadataOnly { reason: "Binary content".into() });
    }
    Ok(Body::Text { text: decode(&buf), truncated, syntax })
}

/// Unknown extension: show it as text if it looks like text.
pub fn sniff_text(path: &Path) -> crate::Result<Body> {
    let (buf, _) = read_prefix(path, 8192)?;
    if buf.is_empty() {
        return Ok(Body::MetadataOnly { reason: "Empty file".into() });
    }
    // error_len() == None means the prefix merely ends mid-character.
    let invalid_utf8 = matches!(std::str::from_utf8(&buf), Err(e) if e.error_len().is_some());
    if looks_binary(&buf) || invalid_utf8 && !buf.starts_with(&[0xFF, 0xFE]) {
        return Ok(Body::MetadataOnly { reason: "Unknown file type".into() });
    }
    preview(path, "plain")
}
