//! Freedesktop `.thumbnailer` files (used on Linux). Parsing is pure and
//! compiled everywhere so it can be unit-tested on any OS.
#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Thumbnailer {
    pub exec: String,
    pub mime_types: Vec<String>,
}

/// Parse the `[Thumbnailer Entry]` group of a `.thumbnailer` file.
pub fn parse(text: &str) -> Option<Thumbnailer> {
    let mut in_group = false;
    let mut exec = None;
    let mut mime_types = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_group = line == "[Thumbnailer Entry]";
            continue;
        }
        if !in_group {
            continue;
        }
        if let Some(v) = line.strip_prefix("Exec=") {
            exec = Some(v.trim().to_string());
        } else if let Some(v) = line.strip_prefix("MimeType=") {
            mime_types = v.split(';').filter(|s| !s.is_empty()).map(str::to_string).collect();
        }
    }
    Some(Thumbnailer { exec: exec?, mime_types })
}

/// Expand `%i %o %s %u` and split into argv (no shell is involved).
pub fn argv(t: &Thumbnailer, input: &Path, output: &Path, size: u32) -> Vec<String> {
    let uri = format!("file://{}", input.display());
    t.exec
        .split_whitespace()
        .map(|tok| {
            tok.replace("%i", &input.to_string_lossy())
                .replace("%o", &output.to_string_lossy())
                .replace("%s", &size.to_string())
                .replace("%u", &uri)
                .replace("%%", "%")
        })
        .collect()
}

pub fn search_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![];
    if let Some(d) = dirs::data_dir() {
        dirs.push(d.join("thumbnailers"));
    }
    let sys = std::env::var("XDG_DATA_DIRS").unwrap_or_else(|_| "/usr/local/share:/usr/share".into());
    dirs.extend(sys.split(':').filter(|s| !s.is_empty()).map(|s| PathBuf::from(s).join("thumbnailers")));
    dirs
}

/// First installed thumbnailer that declares `mime`.
pub fn find_for(mime: &str) -> Option<Thumbnailer> {
    for dir in search_dirs() {
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for entry in rd.flatten() {
            if entry.path().extension().and_then(|e| e.to_str()) != Some("thumbnailer") {
                continue;
            }
            if let Some(t) = std::fs::read_to_string(entry.path()).ok().and_then(|s| parse(&s)) {
                if t.mime_types.iter().any(|m| m == mime) {
                    return Some(t);
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_expands() {
        let t = parse(
            "[Thumbnailer Entry]\nTryExec=evince-thumbnailer\nExec=evince-thumbnailer -s %s %u %o\nMimeType=application/pdf;application/x-bzpdf;\n",
        )
        .unwrap();
        assert_eq!(t.mime_types, vec!["application/pdf", "application/x-bzpdf"]);
        let a = argv(&t, Path::new("/tmp/a.pdf"), Path::new("/tmp/o.png"), 256);
        assert_eq!(a, vec!["evince-thumbnailer", "-s", "256", "file:///tmp/a.pdf", "/tmp/o.png"]);
    }

    #[test]
    fn ignores_other_groups() {
        assert!(parse("[Desktop Entry]\nExec=foo\n").is_none());
    }
}
