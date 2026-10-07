//! Turning approved suggestions into a normal dry-run plan, and remembering
//! the decisions once that plan has actually been applied.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

use super::hints::{self, Decision};
use super::whitelist::folder_name_ok;
use crate::db::Db;
use crate::kind;
use crate::names::{self, NameRules};
use crate::plan::{Action, Intent, Issue, Plan, Planner};
use crate::scope::Scope;
use crate::Result;

/// A suggestion as the user approved it (possibly edited).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Approved {
    pub path: String,
    /// Empty: rename in place.
    pub category: String,
    pub subcategory: String,
    /// Full new name, extension included.
    pub new_name: String,
    /// The suggestion's source; "edited" if the user changed it.
    pub source: String,
    pub domain: Option<String>,
}

pub struct ReviewPlan {
    pub plan: Plan,
    /// What to remember if the plan is applied.
    pub decisions: Vec<Decision>,
}

/// Plan the approved items: category folders under `dest_root` (created as
/// needed), new names made unique with " (2)" etc. A file that can't be
/// planned is skipped with a note instead of blocking the rest.
pub fn plan(scope: &Scope, rules: NameRules, dest_root: &Path, whitelist_id: &str, items: &[Approved]) -> ReviewPlan {
    let planner = Planner::new(scope, rules);
    let mut taken: HashSet<(PathBuf, String)> = HashSet::new();
    let mut keep: Vec<Intent> = Vec::new();
    let mut notes: Vec<Issue> = Vec::new();
    let mut decisions = Vec::new();
    for a in items {
        let src = PathBuf::from(&a.path);
        let skip = |notes: &mut Vec<Issue>, why: String| {
            notes.push(Issue { path: src.clone(), message: format!("skipped: {why}"), blocking: false })
        };
        if let Err(e) = names::validate(rules, &a.new_name) {
            skip(&mut notes, format!("{:?}: {e}", a.new_name));
            continue;
        }
        let dir = if a.category.is_empty() {
            match src.parent() {
                Some(p) => p.to_path_buf(),
                None => continue,
            }
        } else {
            if let Some(err) =
                [&a.category, &a.subcategory].iter().filter(|s| !s.is_empty()).find_map(|s| folder_name_ok(s).err())
            {
                skip(&mut notes, err);
                continue;
            }
            let mut d = dest_root.join(&a.category);
            if !a.subcategory.is_empty() {
                d.push(&a.subcategory);
            }
            d
        };
        let Some(target) = crate::plan::free_target(rules, &dir, &a.new_name, &src, &mut taken) else {
            skip(&mut notes, format!("no free name for {} in {}", a.new_name, dir.display()));
            continue;
        };
        let name = src.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let decision = Decision {
            ext: kind::ext_of(&src),
            kind: kind::detect(&src, false),
            domain: a.domain.clone(),
            category: a.category.clone(),
            subcategory: a.subcategory.clone(),
            new_name: target.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
            source: a.source.clone(),
            whitelist_id: whitelist_id.to_string(),
            name,
        };
        if target == src {
            continue; // already where and what it should be
        }
        let intent = Intent { path: src.clone(), action: Action::MoveTo(target) };
        let alone = planner.build(std::slice::from_ref(&intent), "");
        if alone.is_blocked() {
            let why: Vec<String> = alone.issues.iter().filter(|i| i.blocking).map(|i| i.message.clone()).collect();
            skip(&mut notes, why.join("; "));
            continue;
        }
        keep.push(intent);
        decisions.push(decision);
    }
    let mut plan = planner.build(&keep, format!("Categorize {} file(s)", keep.len()));
    plan.issues.extend(notes);
    ReviewPlan { plan, decisions }
}

pub fn save_pending(db: &Db, plan_id: i64, decisions: &[Decision]) -> Result<()> {
    db.conn().execute(
        "INSERT OR REPLACE INTO ai_pending (plan_id, decisions) VALUES (?1, ?2)",
        params![plan_id, serde_json::to_string(decisions)?],
    )?;
    Ok(())
}

/// After a plan was applied: remember its decisions. Returns how many.
pub fn commit_pending(db: &Db, plan_id: i64) -> Result<usize> {
    let json: Option<String> = db
        .conn()
        .query_row("SELECT decisions FROM ai_pending WHERE plan_id = ?1", [plan_id], |r| r.get(0))
        .optional()?;
    let Some(json) = json else { return Ok(0) };
    let decisions: Vec<Decision> = serde_json::from_str(&json)?;
    hints::record(db, &decisions)?;
    db.conn().execute("DELETE FROM ai_pending WHERE plan_id = ?1", [plan_id])?;
    Ok(decisions.len())
}
