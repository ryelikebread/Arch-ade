//! Mass serial rename with token patterns.
//!
//! Tokens:
//! - `{n}` sequence number; `{n:03}` zero-padded to 3 digits
//! - `{date}` file's modified date as YYYY-MM-DD; `{date:%Y%m%d}` custom strftime
//! - `{original}` original name without extension
//! - `{ext}` original extension without the dot
//! - `{{` and `}}` for literal braces
//!
//! If the pattern has no `{ext}`, the original extension is kept
//! automatically, so `Holiday {n:03}` turns `IMG_1.JPG` into `Holiday 001.JPG`.

use std::path::{Path, PathBuf};

use chrono::format::{Item, StrftimeItems};
use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};

use crate::names::{self, NameRules};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Token {
    Literal(String),
    Number { width: usize },
    Date { format: String },
    Original,
    Ext,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DateSource {
    #[default]
    Modified,
    Created,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RenameOptions {
    pub pattern: String,
    pub start: i64,
    pub step: i64,
    pub date_source: DateSource,
}

impl Default for RenameOptions {
    fn default() -> Self {
        RenameOptions { pattern: "{original}".into(), start: 1, step: 1, date_source: DateSource::Modified }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RowStatus {
    Ok,
    Unchanged,
    Invalid,
    Duplicate,
    Exists,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameRow {
    pub from: String,
    pub from_name: String,
    pub to: String,
    pub to_name: String,
    pub status: RowStatus,
    pub message: Option<String>,
}

pub fn parse(pattern: &str) -> Result<Vec<Token>, String> {
    let mut out = Vec::new();
    let mut lit = String::new();
    let mut chars = pattern.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '{' if chars.peek() == Some(&'{') => {
                chars.next();
                lit.push('{');
            }
            '}' if chars.peek() == Some(&'}') => {
                chars.next();
                lit.push('}');
            }
            '}' => return Err("unmatched \"}\" (use \"}}\" for a literal brace)".into()),
            '{' => {
                let mut body = String::new();
                loop {
                    match chars.next() {
                        Some('}') => break,
                        Some(ch) => body.push(ch),
                        None => return Err("unclosed \"{\"".into()),
                    }
                }
                if !lit.is_empty() {
                    out.push(Token::Literal(std::mem::take(&mut lit)));
                }
                out.push(parse_token(&body)?);
            }
            _ => lit.push(c),
        }
    }
    if !lit.is_empty() {
        out.push(Token::Literal(lit));
    }
    Ok(out)
}

fn parse_token(body: &str) -> Result<Token, String> {
    let (name, arg) = match body.split_once(':') {
        Some((n, a)) => (n.trim(), Some(a)),
        None => (body.trim(), None),
    };
    match (name, arg) {
        ("n", None) => Ok(Token::Number { width: 0 }),
        ("n", Some(a)) => {
            let w: usize = a.trim().parse().map_err(|_| format!("{{n:{a}}}: width must be a number, like {{n:03}}"))?;
            if w > 12 {
                return Err("number width is limited to 12".into());
            }
            Ok(Token::Number { width: w })
        }
        ("date", None) => Ok(Token::Date { format: "%Y-%m-%d".into() }),
        ("date", Some(f)) => {
            if StrftimeItems::new(f).any(|i| matches!(i, Item::Error)) {
                return Err(format!("{{date:{f}}}: invalid date format"));
            }
            Ok(Token::Date { format: f.to_string() })
        }
        ("original", None) => Ok(Token::Original),
        ("ext", None) => Ok(Token::Ext),
        _ => Err(format!("unknown token {{{body}}}; use {{n}}, {{n:03}}, {{date}}, {{original}} or {{ext}}")),
    }
}

pub struct Context<'a> {
    pub number: i64,
    pub stem: &'a str,
    pub ext: &'a str,
    pub date: DateTime<Local>,
}

pub fn render(tokens: &[Token], ctx: &Context) -> String {
    let mut s = String::new();
    let mut has_ext = false;
    for t in tokens {
        match t {
            Token::Literal(l) => s.push_str(l),
            Token::Number { width } => {
                let n = ctx.number;
                if n < 0 {
                    s.push_str(&format!("-{:0w$}", -n, w = width.saturating_sub(1)));
                } else {
                    s.push_str(&format!("{:0w$}", n, w = *width));
                }
            }
            Token::Date { format } => s.push_str(&ctx.date.format(format).to_string()),
            Token::Original => s.push_str(ctx.stem),
            Token::Ext => {
                has_ext = true;
                if ctx.ext.is_empty() {
                    // "{original}.{ext}" on a file without extension: drop the dot.
                    if s.ends_with('.') {
                        s.pop();
                    }
                } else {
                    s.push_str(ctx.ext);
                }
            }
        }
    }
    if !has_ext && !ctx.ext.is_empty() {
        s.push('.');
        s.push_str(ctx.ext);
    }
    s
}

/// Split into (stem, ext) the way users think of it: "archive.tar.gz" ->
/// ("archive", "tar.gz"), ".bashrc" -> (".bashrc", "").
pub fn split_name(name: &str) -> (&str, &str) {
    let lower = name.to_ascii_lowercase();
    for de in ["tar.gz", "tar.bz2", "tar.xz", "tar.zst"] {
        if lower.ends_with(&format!(".{de}")) && name.len() > de.len() + 1 {
            let cut = name.len() - de.len() - 1;
            return (&name[..cut], &name[cut + 1..]);
        }
    }
    match name.rfind('.') {
        Some(0) | None => (name, ""),
        Some(i) => (&name[..i], &name[i + 1..]),
    }
}

fn file_date(path: &Path, src: DateSource) -> DateTime<Local> {
    let md = std::fs::metadata(path).ok();
    let t = md.and_then(|m| match src {
        DateSource::Modified => m.modified().ok(),
        DateSource::Created => m.created().ok().or_else(|| m.modified().ok()),
    });
    t.map(DateTime::<Local>::from).unwrap_or_else(Local::now)
}

/// Compute the new names, in the given order, with a status per row. This is
/// the live preview; [`crate::plan::Planner::moves`] re-checks everything
/// before anything is applied.
pub fn preview(paths: &[PathBuf], opts: &RenameOptions, rules: NameRules) -> Result<Vec<RenameRow>, String> {
    let tokens = parse(&opts.pattern)?;
    if tokens.is_empty() {
        return Err("pattern is empty".into());
    }
    let mut rows: Vec<RenameRow> = Vec::with_capacity(paths.len());
    for (i, p) in paths.iter().enumerate() {
        let from_name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let (stem, ext) = split_name(&from_name);
        let ctx =
            Context { number: opts.start + opts.step * i as i64, stem, ext, date: file_date(p, opts.date_source) };
        let to_name = render(&tokens, &ctx);
        let to = p.with_file_name(&to_name);
        let (status, message) = if to_name == from_name {
            (RowStatus::Unchanged, None)
        } else if let Err(e) = names::validate(rules, &to_name) {
            (RowStatus::Invalid, Some(e.to_string()))
        } else {
            (RowStatus::Ok, None)
        };
        rows.push(RenameRow {
            from: p.to_string_lossy().into_owned(),
            from_name,
            to: to.to_string_lossy().into_owned(),
            to_name,
            status,
            message,
        });
    }

    // Collisions inside the batch.
    let key = |r: &RenameRow| {
        let parent = Path::new(&r.to).parent().map(Path::to_path_buf);
        (parent, names::fold_key(rules, &r.to_name))
    };
    let keys: Vec<_> = rows.iter().map(key).collect();
    for i in 0..rows.len() {
        if rows[i].status != RowStatus::Ok && rows[i].status != RowStatus::Unchanged {
            continue;
        }
        if keys.iter().enumerate().any(|(j, k)| j != i && *k == keys[i]) {
            rows[i].status = RowStatus::Duplicate;
            rows[i].message = Some("another file in this batch gets the same name".into());
        }
    }
    // Collisions with files that stay where they are.
    let from_keys: std::collections::HashSet<_> = paths
        .iter()
        .map(|p| {
            let n = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            (p.parent().map(Path::to_path_buf), names::fold_key(rules, &n))
        })
        .collect();
    for (i, r) in rows.iter_mut().enumerate() {
        if r.status == RowStatus::Ok && Path::new(&r.to).exists() && !from_keys.contains(&keys[i]) {
            r.status = RowStatus::Exists;
            r.message = Some("a file with this name already exists".into());
        }
    }
    Ok(rows)
}

/// Pairs for [`crate::plan::Planner::moves`], excluding unchanged rows.
pub fn pairs(rows: &[RenameRow]) -> Vec<(PathBuf, PathBuf)> {
    rows.iter()
        .filter(|r| r.status != RowStatus::Unchanged)
        .map(|r| (PathBuf::from(&r.from), PathBuf::from(&r.to)))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn ctx(n: i64, stem: &'static str, ext: &'static str) -> Context<'static> {
        Context { number: n, stem, ext, date: Local.with_ymd_and_hms(2026, 3, 9, 12, 0, 0).unwrap() }
    }

    fn r(p: &str, c: &Context) -> String {
        render(&parse(p).unwrap(), c)
    }

    #[test]
    fn tokens() {
        let c = ctx(7, "IMG_1234", "JPG");
        assert_eq!(r("Trip {n:03}", &c), "Trip 007.JPG");
        assert_eq!(r("{n}", &c), "7.JPG");
        assert_eq!(r("{date}_{original}", &c), "2026-03-09_IMG_1234.JPG");
        assert_eq!(r("{date:%Y%m%d}-{n:2}.{ext}", &c), "20260309-07.JPG");
        assert_eq!(r("{original}.jpeg", &c), "IMG_1234.jpeg.JPG");
        assert_eq!(r("{original}.{ext}", &c), "IMG_1234.JPG");
        assert_eq!(r("{{x}} {n}", &c), "{x} 7.JPG");
        assert_eq!(r("{original}.{ext}", &ctx(1, "Makefile", "")), "Makefile");
        assert_eq!(r("{n:04}", &ctx(-3, "a", "")), "-003");
    }

    #[test]
    fn parse_errors() {
        assert!(parse("{nope}").is_err());
        assert!(parse("{n:abc}").is_err());
        assert!(parse("{n").is_err());
        assert!(parse("a}b").is_err());
        assert!(parse("{date:%Q}").is_err());
        assert!(parse("{n:99}").is_err());
    }

    #[test]
    fn split() {
        assert_eq!(split_name("a.b.txt"), ("a.b", "txt"));
        assert_eq!(split_name("x.tar.gz"), ("x", "tar.gz"));
        assert_eq!(split_name(".bashrc"), (".bashrc", ""));
        assert_eq!(split_name("README"), ("README", ""));
        assert_eq!(split_name(".tar.gz"), (".tar", "gz"));
    }

    #[test]
    fn preview_statuses() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path();
        for f in ["b.txt", "a.txt", "keep.txt", "001.txt"] {
            std::fs::write(root.join(f), f).unwrap();
        }
        let paths = vec![root.join("b.txt"), root.join("a.txt")];
        let opts = RenameOptions { pattern: "{n:03}".into(), ..Default::default() };
        let rows = preview(&paths, &opts, NameRules::Linux).unwrap();
        assert_eq!(rows[0].to_name, "001.txt");
        assert_eq!(rows[0].status, RowStatus::Exists); // 001.txt already there
        assert_eq!(rows[1].to_name, "002.txt");
        assert_eq!(rows[1].status, RowStatus::Ok);

        let opts = RenameOptions { pattern: "same".into(), ..Default::default() };
        let rows = preview(&paths, &opts, NameRules::Linux).unwrap();
        assert!(rows.iter().all(|r| r.status == RowStatus::Duplicate));

        let opts = RenameOptions { pattern: "bad:name".into(), ..Default::default() };
        let rows = preview(&paths[..1], &opts, NameRules::Windows).unwrap();
        assert_eq!(rows[0].status, RowStatus::Invalid);

        // Renaming into a name another file in the batch is leaving is fine.
        let paths = vec![root.join("a.txt"), root.join("b.txt")];
        let opts = RenameOptions { pattern: "{original}".into(), start: 1, ..Default::default() };
        let rows = preview(&paths, &opts, NameRules::Linux).unwrap();
        assert!(rows.iter().all(|r| r.status == RowStatus::Unchanged));
    }
}
