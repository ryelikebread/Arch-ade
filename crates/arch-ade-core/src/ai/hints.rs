//! Approved decisions, kept in SQLite and reused as hints. Nothing is
//! trained: similar past decisions are shown to the model as examples and,
//! with the AI off (or in Consistent mode, when one is a strong match), used
//! directly.

use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::db::Db;
use crate::kind::Kind;
use crate::Result;

/// A hint this close is trusted on its own in Consistent mode and without AI.
pub const STRONG: u32 = 6;
/// Below this a past decision isn't considered similar at all.
const MIN_SCORE: u32 = 3;
/// How many recent decisions are compared.
const WINDOW: usize = 5_000;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Decision {
    /// Original file name.
    pub name: String,
    pub ext: String,
    pub kind: Kind,
    pub domain: Option<String>,
    pub category: String,
    pub subcategory: String,
    pub new_name: String,
    /// Where the approved suggestion came from (ai, hint, media, guess, edited).
    pub source: String,
    pub whitelist_id: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hint {
    pub decision: Decision,
    pub score: u32,
}

/// Lowercase words of a file name: letters/digits runs, camelCase split,
/// pure numbers (dates, counters) dropped.
pub fn words(name: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut prev_lower = false;
    let flush = |cur: &mut String, out: &mut Vec<String>| {
        if !cur.is_empty() && !cur.chars().all(|c| c.is_ascii_digit()) {
            out.push(cur.to_lowercase());
        }
        cur.clear();
    };
    for ch in name.chars() {
        if ch.is_alphanumeric() {
            if ch.is_uppercase() && prev_lower {
                flush(&mut cur, &mut out);
            }
            prev_lower = ch.is_lowercase();
            cur.push(ch);
        } else {
            flush(&mut cur, &mut out);
            prev_lower = false;
        }
    }
    flush(&mut cur, &mut out);
    out
}

pub fn record(db: &Db, decisions: &[Decision]) -> Result<()> {
    let now = chrono::Utc::now().timestamp_millis();
    let mut conn = db.conn();
    let tx = conn.transaction()?;
    for d in decisions {
        tx.execute(
            "INSERT INTO ai_decisions (at, name, ext, kind, domain, category, subcategory, new_name, source, whitelist_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                now,
                d.name,
                d.ext.to_lowercase(),
                serde_json::to_value(d.kind)?.as_str().unwrap_or("unknown"),
                d.domain,
                d.category,
                d.subcategory,
                d.new_name,
                d.source,
                d.whitelist_id
            ],
        )?;
    }
    tx.commit()?;
    Ok(())
}

pub fn count(db: &Db) -> Result<i64> {
    Ok(db.conn().query_row("SELECT COUNT(*) FROM ai_decisions", [], |r| r.get(0))?)
}

/// Forget every stored decision.
pub fn clear(db: &Db) -> Result<()> {
    db.conn().execute("DELETE FROM ai_decisions", [])?;
    Ok(())
}

/// What makes two files alike for a hint.
pub struct Probe<'a> {
    pub name: &'a str,
    pub ext: &'a str,
    pub kind: Kind,
    pub domain: Option<&'a str>,
}

pub fn score(p: &Probe, d: &Decision) -> u32 {
    let mut s = 0;
    let mine = words(stem(p.name));
    // The approved new name says what the file was about as much as the old one.
    let mut theirs = words(stem(&d.name));
    theirs.extend(words(stem(&d.new_name)));
    let shared = mine.iter().filter(|w| w.len() > 1 && theirs.contains(w)).count() as u32;
    let same_domain = matches!((p.domain, d.domain.as_deref()), (Some(a), Some(b)) if a.eq_ignore_ascii_case(b));
    if shared == 0 && !same_domain {
        return 0; // same extension alone says nothing about the topic
    }
    s += 2 * shared.min(3);
    if same_domain {
        s += 3;
    }
    if p.ext.eq_ignore_ascii_case(&d.ext) {
        s += 2;
    } else if p.kind == d.kind {
        s += 1;
    }
    s
}

/// The most similar past decisions for this whitelist, best first.
pub fn similar(db: &Db, whitelist_id: &str, p: &Probe, limit: usize) -> Result<Vec<Hint>> {
    let conn = db.conn();
    let mut stmt = conn.prepare(
        "SELECT name, ext, kind, domain, category, subcategory, new_name, source, whitelist_id
         FROM ai_decisions WHERE whitelist_id = ?1 ORDER BY id DESC LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![whitelist_id, WINDOW as i64], |r| {
        let kind: String = r.get(2)?;
        Ok(Decision {
            name: r.get(0)?,
            ext: r.get(1)?,
            kind: serde_json::from_value(serde_json::Value::String(kind)).unwrap_or(Kind::Unknown),
            domain: r.get(3)?,
            category: r.get(4)?,
            subcategory: r.get(5)?,
            new_name: r.get(6)?,
            source: r.get(7)?,
            whitelist_id: r.get(8)?,
        })
    })?;
    let mut hints: Vec<Hint> = Vec::new();
    for d in rows {
        let d = d?;
        let s = score(p, &d);
        if s < MIN_SCORE {
            continue;
        }
        // One example per destination is enough; rows come newest first, so
        // the newest one wins ties.
        match hints.iter_mut().find(|h| h.decision.category == d.category && h.decision.subcategory == d.subcategory) {
            Some(h) if s > h.score => *h = Hint { decision: d, score: s },
            Some(_) => {}
            None => hints.push(Hint { decision: d, score: s }),
        }
    }
    hints.sort_by_key(|h| std::cmp::Reverse(h.score));
    hints.truncate(limit);
    Ok(hints)
}

fn stem(name: &str) -> &str {
    crate::rename::split_name(name).0
}
