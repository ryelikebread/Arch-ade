//! File-name rules for each OS, as pure functions.
//!
//! These are deliberately not `#[cfg]`-gated: every rule set compiles and is
//! tested on every OS. [`crate::platform::name_rules`] picks the one that
//! applies to the running machine.

use serde::{Deserialize, Serialize};
use unicode_normalization::UnicodeNormalization;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NameRules {
    Windows,
    Macos,
    Linux,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, thiserror::Error)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum NameError {
    #[error("name is empty")]
    Empty,
    #[error("\".\" and \"..\" are not file names")]
    DotName,
    #[error("name is too long ({len} > {max})")]
    TooLong { len: usize, max: usize },
    #[error("character {ch:?} is not allowed")]
    IllegalChar { ch: char },
    #[error("\"{name}\" is a reserved name on Windows")]
    Reserved { name: String },
    #[error("name cannot end with a dot or a space on Windows")]
    TrailingDotOrSpace,
}

const WIN_ILLEGAL: &[char] = &['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
const WIN_RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "COM¹", "COM²", "COM³", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9", "LPT¹",
    "LPT²", "LPT³",
];

/// Checks a single path component (not a full path).
pub fn validate(rules: NameRules, name: &str) -> Result<(), NameError> {
    if name.is_empty() {
        return Err(NameError::Empty);
    }
    if name == "." || name == ".." {
        return Err(NameError::DotName);
    }
    if let Some(ch) = name.chars().find(|c| *c == '/' || *c == '\0') {
        return Err(NameError::IllegalChar { ch });
    }
    match rules {
        NameRules::Windows => {
            if let Some(ch) = name.chars().find(|c| WIN_ILLEGAL.contains(c) || (*c as u32) < 32) {
                return Err(NameError::IllegalChar { ch });
            }
            if name.ends_with('.') || name.ends_with(' ') {
                return Err(NameError::TrailingDotOrSpace);
            }
            // "CON", "con.txt", "Con .tar.gz" are all reserved: Windows looks at
            // the part before the first dot, ignoring trailing spaces.
            let stem = name.split('.').next().unwrap_or("").trim_end_matches(' ');
            if WIN_RESERVED.iter().any(|r| r.eq_ignore_ascii_case(stem)) {
                return Err(NameError::Reserved { name: stem.to_string() });
            }
            let len = name.encode_utf16().count();
            if len > 255 {
                return Err(NameError::TooLong { len, max: 255 });
            }
        }
        NameRules::Macos => {
            // Finder and the Carbon layer treat ':' as the path separator.
            if name.contains(':') {
                return Err(NameError::IllegalChar { ch: ':' });
            }
            // APFS stores names as UTF-8, limit 255 bytes; measure the NFD form
            // since that is the larger one HFS+ volumes would store.
            let len = name.nfd().collect::<String>().len();
            if len > 255 {
                return Err(NameError::TooLong { len, max: 255 });
            }
        }
        NameRules::Linux => {
            let len = name.len();
            if len > 255 {
                return Err(NameError::TooLong { len, max: 255 });
            }
        }
    }
    Ok(())
}

/// Key under which two names refer to the same file on a default-configured
/// volume of that OS (NTFS and APFS are case-insensitive; APFS also treats
/// NFC and NFD spellings as the same name; ext4 compares raw bytes).
pub fn fold_key(rules: NameRules, name: &str) -> String {
    match rules {
        NameRules::Windows | NameRules::Macos => name.nfc().collect::<String>().to_lowercase(),
        NameRules::Linux => name.to_string(),
    }
}

/// True when `a` and `b` would land on the same directory entry.
pub fn collide(rules: NameRules, a: &str, b: &str) -> bool {
    fold_key(rules, a) == fold_key(rules, b)
}

/// NFC form for display and comparison in the UI (macOS hands us NFD names).
pub fn display_form(name: &str) -> String {
    name.nfc().collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use NameRules::*;

    #[test]
    fn empty_and_dots_rejected_everywhere() {
        for r in [Windows, Macos, Linux] {
            assert_eq!(validate(r, ""), Err(NameError::Empty));
            assert_eq!(validate(r, "."), Err(NameError::DotName));
            assert_eq!(validate(r, ".."), Err(NameError::DotName));
            assert!(matches!(validate(r, "a/b"), Err(NameError::IllegalChar { ch: '/' })));
            assert!(matches!(validate(r, "a\0b"), Err(NameError::IllegalChar { .. })));
            assert_eq!(validate(r, "...hidden"), Ok(()));
        }
    }

    #[test]
    fn windows_reserved_names() {
        for bad in ["CON", "con", "Con.txt", "NUL.tar.gz", "com1", "LPT9.log", "AUX ", "aux .md", "COM¹"] {
            let res = validate(Windows, bad);
            assert!(
                matches!(res, Err(NameError::Reserved { .. }) | Err(NameError::TrailingDotOrSpace)),
                "{bad:?} -> {res:?}"
            );
        }
        for ok in ["CONSOLE", "con-notes.txt", "COM10", "LPT0", "nul_", "x.con"] {
            assert_eq!(validate(Windows, ok), Ok(()), "{ok:?}");
        }
        // Reserved only matters on Windows.
        assert_eq!(validate(Linux, "CON"), Ok(()));
        assert_eq!(validate(Macos, "nul.txt"), Ok(()));
    }

    #[test]
    fn windows_illegal_chars_and_trailing() {
        for c in ['<', '>', ':', '"', '\\', '|', '?', '*', '\u{1}', '\t'] {
            let name = format!("a{c}b");
            assert!(matches!(validate(Windows, &name), Err(NameError::IllegalChar { .. })), "{name:?}");
        }
        assert_eq!(validate(Windows, "report."), Err(NameError::TrailingDotOrSpace));
        assert_eq!(validate(Windows, "report "), Err(NameError::TrailingDotOrSpace));
        assert_eq!(validate(Linux, "a<b>?.txt"), Ok(()));
        assert_eq!(validate(Linux, "report."), Ok(()));
    }

    #[test]
    fn mac_colon() {
        assert!(matches!(validate(Macos, "12:30.png"), Err(NameError::IllegalChar { ch: ':' })));
        assert_eq!(validate(Linux, "12:30.png"), Ok(()));
    }

    #[test]
    fn length_limits() {
        let a255 = "a".repeat(255);
        let a256 = "a".repeat(256);
        for r in [Windows, Macos, Linux] {
            assert_eq!(validate(r, &a255), Ok(()));
            assert!(matches!(validate(r, &a256), Err(NameError::TooLong { .. })));
        }
        // 100 "é" = 200 UTF-8 bytes (NFC), 300 bytes in NFD, 100 UTF-16 units.
        let e100 = "é".repeat(100);
        assert_eq!(validate(Windows, &e100), Ok(()));
        assert_eq!(validate(Linux, &e100), Ok(()));
        assert!(matches!(validate(Macos, &e100), Err(NameError::TooLong { .. })));
        // Emoji: 4 UTF-8 bytes, 2 UTF-16 units each.
        let emoji = "😀".repeat(64);
        assert_eq!(validate(Windows, &emoji), Ok(()));
        assert!(matches!(validate(Linux, &emoji), Err(NameError::TooLong { .. })));
    }

    #[test]
    fn collisions_case_and_normalization() {
        let nfc = "caf\u{e9}.txt";
        let nfd = "cafe\u{301}.txt";
        assert!(collide(Macos, nfc, nfd));
        assert!(collide(Windows, nfc, nfd));
        assert!(!collide(Linux, nfc, nfd));

        assert!(collide(Macos, "Photo.JPG", "photo.jpg"));
        assert!(collide(Windows, "Photo.JPG", "photo.jpg"));
        assert!(!collide(Linux, "Photo.JPG", "photo.jpg"));
        assert!(collide(Linux, "same", "same"));
    }

    #[test]
    fn display_form_is_nfc() {
        assert_eq!(display_form("cafe\u{301}"), "caf\u{e9}");
    }
}
