//! File tags as OS file managers store them. The encodings are plain data
//! and live here so they can be tested on every OS; reading and writing the
//! attributes happens in [`crate::platform`].
//!
//! - macOS Finder: xattr `com.apple.metadata:_kMDItemUserTags`, a binary plist
//!   array of strings, each `Name` or `Name\n<color number>`.
//! - Linux (KDE Dolphin and others): xattr `user.xdg.tags`, comma-separated.
//! - Windows has no general file tags.

pub const FINDER_TAGS_XATTR: &str = "com.apple.metadata:_kMDItemUserTags";
pub const XDG_TAGS_XATTR: &str = "user.xdg.tags";

/// Display names of Finder tags (color suffixes stripped).
pub fn finder_names(raw: &[u8]) -> Vec<String> {
    finder_entries(raw).iter().map(|e| e.split('\n').next().unwrap_or_default().to_string()).collect()
}

fn finder_entries(raw: &[u8]) -> Vec<String> {
    match plist::Value::from_reader(std::io::Cursor::new(raw)) {
        Ok(plist::Value::Array(items)) => items.into_iter().filter_map(|v| v.into_string()).collect(),
        _ => Vec::new(),
    }
}

/// Existing Finder tags plus `add` (new tags get no color). Existing entries
/// keep their colors.
pub fn finder_add(raw: Option<&[u8]>, add: &[String]) -> Vec<u8> {
    let mut entries = raw.map(finder_entries).unwrap_or_default();
    let names: Vec<String> = entries.iter().map(|e| e.split('\n').next().unwrap_or_default().to_lowercase()).collect();
    for t in add {
        if !names.contains(&t.to_lowercase()) && !entries.iter().any(|e| e.eq_ignore_ascii_case(t)) {
            entries.push(t.clone());
        }
    }
    let value = plist::Value::Array(entries.into_iter().map(plist::Value::String).collect());
    let mut out = Vec::new();
    value.to_writer_binary(&mut out).expect("writing a plist to memory cannot fail");
    out
}

pub fn xdg_names(raw: &[u8]) -> Vec<String> {
    String::from_utf8_lossy(raw).split(',').map(str::trim).filter(|s| !s.is_empty()).map(String::from).collect()
}

pub fn xdg_add(raw: Option<&[u8]>, add: &[String]) -> Vec<u8> {
    let mut names = raw.map(xdg_names).unwrap_or_default();
    for t in add {
        if !names.iter().any(|n| n.eq_ignore_ascii_case(t)) {
            names.push(t.clone());
        }
    }
    names.join(",").into_bytes()
}

/// Tag names typed by a user or a rule: trimmed, no empties, no commas or
/// newlines (both are separators in the stored formats).
pub fn clean(tags: &[String]) -> Result<Vec<String>, String> {
    let mut out: Vec<String> = Vec::new();
    for t in tags {
        let t = t.trim();
        if t.is_empty() {
            continue;
        }
        if t.contains([',', '\n', '\r']) {
            return Err(format!("tag \"{t}\" can't contain commas or line breaks"));
        }
        if !out.iter().any(|o| o.eq_ignore_ascii_case(t)) {
            out.push(t.to_string());
        }
    }
    if out.is_empty() {
        return Err("no tags given".into());
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }

    #[test]
    fn finder_round_trip_keeps_colors() {
        let first = finder_add(None, &s(&["Work"]));
        assert_eq!(finder_names(&first), s(&["Work"]));
        // A tag the user colored red in Finder stays red.
        let mut colored = Vec::new();
        plist::Value::Array(vec![plist::Value::String("Red\n6".into())]).to_writer_binary(&mut colored).unwrap();
        let both = finder_add(Some(&colored), &s(&["Work", "red"]));
        assert_eq!(finder_entries(&both), s(&["Red\n6", "Work"]));
        assert_eq!(finder_names(&both), s(&["Red", "Work"]));
        assert!(finder_names(b"garbage").is_empty());
    }

    #[test]
    fn xdg_round_trip() {
        let raw = xdg_add(Some(b"a, b"), &s(&["B", "c"]));
        assert_eq!(raw, b"a,b,c");
        assert_eq!(xdg_names(b""), Vec::<String>::new());
    }

    #[test]
    fn cleaning() {
        assert_eq!(clean(&s(&[" Work ", "work", ""])).unwrap(), s(&["Work"]));
        assert!(clean(&s(&["a,b"])).is_err());
        assert!(clean(&s(&["  "])).is_err());
    }
}
