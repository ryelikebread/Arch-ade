//! Category whitelists: named sets of categories, each with its own
//! subcategories. Suggestions must land in the active whitelist (Refined
//! mode may propose a new subcategory under a listed category, flagged).
//!
//! Each category also says which kinds/extensions/keywords belong to it, so a
//! sensible category exists for every file even with the AI off.

use serde::{Deserialize, Serialize};

use crate::db::Db;
use crate::kind::Kind;
use crate::names::{self, NameRules};
use crate::Result;

pub const SETTINGS_KEY: &str = "categoryWhitelists";
pub const DEFAULT_ID: &str = "general";

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Whitelist {
    pub id: String,
    pub name: String,
    pub categories: Vec<Category>,
    /// Category for files nothing else claims.
    pub fallback: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub subcategories: Vec<Subcategory>,
    #[serde(default)]
    pub kinds: Vec<Kind>,
    #[serde(default)]
    pub extensions: Vec<String>,
    #[serde(default)]
    pub keywords: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Subcategory {
    pub name: String,
    /// Words in a file name that point here (used without the AI, and shown
    /// to the model as a description).
    #[serde(default)]
    pub keywords: Vec<String>,
}

pub fn builtins() -> Vec<Whitelist> {
    serde_json::from_str(include_str!("whitelists.json")).expect("built-in whitelists parse")
}

/// Saved whitelists, or the built-in ones on first use.
pub fn load_all(db: &Db) -> Result<Vec<Whitelist>> {
    Ok(match db.get_setting(SETTINGS_KEY)? {
        Some(v) => serde_json::from_value(v).unwrap_or_else(|_| builtins()),
        None => builtins(),
    })
}

pub fn save_all(db: &Db, lists: &[Whitelist]) -> Result<()> {
    if lists.is_empty() {
        return Err(crate::Error::Plan("keep at least one whitelist".into()));
    }
    let mut ids = std::collections::HashSet::new();
    for w in lists {
        validate(w).map_err(|e| crate::Error::Plan(format!("{}: {e}", w.name)))?;
        if !ids.insert(w.id.as_str()) {
            return Err(crate::Error::Plan(format!("two whitelists share the id {:?}", w.id)));
        }
    }
    db.set_setting(SETTINGS_KEY, &serde_json::to_value(lists)?)
}

/// The whitelist with `id`, else the first one.
pub fn active(db: &Db, id: &str) -> Result<Whitelist> {
    let all = load_all(db)?;
    Ok(all.iter().find(|w| w.id == id).or(all.first()).cloned().unwrap_or_else(|| builtins().remove(0)))
}

/// Category and subcategory names become folder names, so they must be
/// valid on every OS (a whitelist made on Linux still works on Windows).
pub fn folder_name_ok(name: &str) -> std::result::Result<(), String> {
    for rules in [NameRules::Windows, NameRules::Macos, NameRules::Linux] {
        names::validate(rules, name).map_err(|e| format!("{name:?}: {e}"))?;
    }
    if name.trim() != name {
        return Err(format!("{name:?}: no spaces at the start or end"));
    }
    Ok(())
}

pub fn validate(w: &Whitelist) -> std::result::Result<(), String> {
    if w.id.trim().is_empty() || w.name.trim().is_empty() {
        return Err("needs an id and a name".into());
    }
    if w.categories.is_empty() {
        return Err("needs at least one category".into());
    }
    let mut seen = std::collections::HashSet::new();
    for c in &w.categories {
        folder_name_ok(&c.name)?;
        if !seen.insert(c.name.to_lowercase()) {
            return Err(format!("category {:?} is listed twice", c.name));
        }
        let mut subs = std::collections::HashSet::new();
        for s in &c.subcategories {
            folder_name_ok(&s.name)?;
            if !subs.insert(s.name.to_lowercase()) {
                return Err(format!("{} has subcategory {:?} twice", c.name, s.name));
            }
        }
    }
    if w.category(&w.fallback).is_none() {
        return Err(format!("the fallback {:?} is not one of the categories", w.fallback));
    }
    Ok(())
}

impl Whitelist {
    pub fn category(&self, name: &str) -> Option<&Category> {
        self.categories.iter().find(|c| c.name.eq_ignore_ascii_case(name.trim()))
    }

    /// The listed spelling of `cat`/`sub`, if both are in the whitelist
    /// (an empty `sub` means "no subcategory").
    pub fn canonical(&self, cat: &str, sub: &str) -> Option<(String, String)> {
        let c = self.category(cat)?;
        if sub.trim().is_empty() {
            return Some((c.name.clone(), String::new()));
        }
        let s = c.subcategories.iter().find(|s| s.name.eq_ignore_ascii_case(sub.trim()))?;
        Some((c.name.clone(), s.name.clone()))
    }

    /// Category and subcategory from kind, extension and name words alone.
    pub fn guess(&self, kind: Kind, ext: &str, words: &[String]) -> (String, String) {
        let has_word = |kw: &[String]| kw.iter().any(|k| contains_phrase(words, k));
        let by_keyword = self.categories.iter().find(|c| has_word(&c.keywords));
        let by_ext = self
            .categories
            .iter()
            .find(|c| c.extensions.iter().any(|e| e.trim_start_matches('.').eq_ignore_ascii_case(ext)));
        let by_kind = self.categories.iter().find(|c| c.kinds.contains(&kind));
        let c = by_keyword.or(by_ext).or(by_kind).or_else(|| self.category(&self.fallback));
        let Some(c) = c else { return (self.fallback.clone(), String::new()) };
        let sub = c.subcategories.iter().find(|s| has_word(&s.keywords)).map(|s| s.name.clone()).unwrap_or_default();
        (c.name.clone(), sub)
    }

    /// The whitelist as the model sees it.
    pub fn describe(&self) -> String {
        let mut out = String::new();
        for c in &self.categories {
            out.push_str(&format!("- {}", c.name));
            if !c.description.is_empty() {
                out.push_str(&format!(" ({})", c.description));
            }
            if !c.subcategories.is_empty() {
                let subs: Vec<&str> = c.subcategories.iter().map(|s| s.name.as_str()).collect();
                out.push_str(&format!(": subcategories {}", subs.join(", ")));
            }
            out.push('\n');
        }
        out
    }
}

/// Does `words` contain the (possibly multi-word) phrase `kw`?
fn contains_phrase(words: &[String], kw: &str) -> bool {
    let kw: Vec<String> = super::hints::words(kw);
    !kw.is_empty() && words.windows(kw.len()).any(|w| w == kw.as_slice())
}
