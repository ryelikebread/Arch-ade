//! Runs rules on a folder: evaluate, plan, and (for the watcher) apply
//! through the journal and record what happened. The UI's "Run rules" uses
//! the same planning, so what the watcher would do can always be previewed.

use std::path::{Path, PathBuf};

use rusqlite::params;
use serde::Serialize;

use crate::db::Db;
use crate::journal::{Journal, RunReport};
use crate::plan::{Intent, Issue, Op, Plan, Planner};
use crate::platform::Platform;
use crate::rules::{Engine, Places, Rule, RuleMatch};
use crate::scan::{self, FileEntry, ScanOptions};
use crate::scope::Scope;
use crate::Result;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RulesPlan {
    pub matches: Vec<RuleMatch>,
    pub rule_errors: Vec<String>,
    /// Files whose part of the plan was blocked are left out of `plan.ops`
    /// and listed in `plan.issues` as non-blocking, so the rest can run.
    pub plan: Plan,
}

pub struct Organizer<'a> {
    pub db: &'a Db,
    pub scope: &'a Scope,
    pub platform: &'a dyn Platform,
    pub places: &'a Places,
}

/// The table row for each file, as rules see it.
fn entries(folder: &Path, only: Option<&[PathBuf]>, platform: &dyn Platform) -> Result<Vec<FileEntry>> {
    Ok(match only {
        // Rules only look at files directly in the folder.
        Some(paths) => paths
            .iter()
            .filter(|p| p.parent() == Some(folder))
            .filter_map(|p| scan::entry_for(folder, p, false, platform))
            .collect(),
        None => scan::scan(folder, ScanOptions::default(), platform)?.entries,
    })
}

impl Organizer<'_> {
    /// What the enabled rules (only `auto` ones if `auto_only`) would do to
    /// the files directly in `folder` (or just `only`, which must be in it).
    pub fn plan(&self, rules: &[Rule], folder: &Path, only: Option<&[PathBuf]>, auto_only: bool) -> Result<RulesPlan> {
        let folder = self.scope.check_readable(folder)?;
        let files = entries(&folder, only, self.platform)?;
        let rules: Vec<Rule> = rules.iter().filter(|r| !auto_only || r.auto).cloned().collect();
        let engine = Engine {
            places: self.places,
            name_rules: self.platform.name_rules(),
            now: chrono::Utc::now().timestamp_millis(),
        };
        let ev = engine.evaluate(&rules, &folder, &files);
        let planner = Planner::new(self.scope, self.platform.name_rules());

        // Plan each file alone first so one bad file can't block the others.
        let mut keep: Vec<Intent> = Vec::new();
        let mut skipped: Vec<Issue> = Vec::new();
        let mut by_file: Vec<(PathBuf, Vec<Intent>)> = Vec::new();
        for i in ev.intents {
            // No tag system here (Windows): drop the tag step, keep the rest.
            if matches!(i.action, crate::plan::Action::Tag(_)) && !self.platform.tags_supported() {
                skipped.push(Issue {
                    path: i.path,
                    message: "tag step skipped: file tags are not available on this system".into(),
                    blocking: false,
                });
                continue;
            }
            match by_file.last_mut() {
                Some((p, v)) if *p == i.path => v.push(i),
                _ => by_file.push((i.path.clone(), vec![i])),
            }
        }
        for (path, intents) in by_file {
            let one = planner.build(&intents, "");
            if one.is_blocked() {
                let why: Vec<String> = one.issues.iter().filter(|x| x.blocking).map(|x| x.message.clone()).collect();
                skipped.push(Issue { path, message: format!("skipped: {}", why.join("; ")), blocking: false });
            } else {
                keep.extend(intents);
            }
        }
        let count = keep.iter().map(|i| &i.path).collect::<std::collections::HashSet<_>>().len();
        let name = folder.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let mut plan = planner.build(&keep, format!("Rules: {count} file(s) in {name}"));
        plan.issues.extend(skipped);
        Ok(RulesPlan { matches: ev.matches, rule_errors: ev.rule_errors, plan })
    }

    /// The watcher's path: plan with `auto` rules for files that just
    /// finished downloading, apply unless dry run is on, and record it.
    pub fn auto_run(&self, rules: &[Rule], folder: &Path, files: &[PathBuf], dry_run: bool) -> Result<AutoRun> {
        let rp = self.plan(rules, folder, Some(files), true)?;
        let produced = produced_paths(&rp.plan);
        let mut run = AutoRun { outcome: Outcome::Nothing, report: None, plan_id: None, produced, rules: rp };
        if run.rules.matches.is_empty() {
            return Ok(run);
        }
        if run.rules.plan.ops.is_empty() {
            run.outcome = Outcome::Skipped;
        } else if dry_run {
            run.outcome = Outcome::DryRun;
        } else {
            let j = Journal::new(self.db, self.scope, self.platform);
            let id = j.save(&run.rules.plan)?;
            run.plan_id = Some(id);
            let report = j.apply(id)?;
            run.outcome = if report.error.is_some() { Outcome::Failed } else { Outcome::Applied };
            run.report = Some(report);
        }
        record(self.db, folder, &run)?;
        Ok(run)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Outcome {
    /// No rule matched.
    Nothing,
    /// Matched, but nothing to do (target taken with skip, blocked, ...).
    Skipped,
    /// Dry run is on: shown, not applied.
    DryRun,
    Applied,
    Failed,
}

impl Outcome {
    fn as_str(self) -> &'static str {
        match self {
            Outcome::Nothing => "nothing",
            Outcome::Skipped => "skipped",
            Outcome::DryRun => "dryRun",
            Outcome::Applied => "applied",
            Outcome::Failed => "failed",
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoRun {
    pub outcome: Outcome,
    pub report: Option<RunReport>,
    pub plan_id: Option<i64>,
    /// Paths this run creates or moves things to; the watcher ignores their events.
    #[serde(skip)]
    pub produced: Vec<PathBuf>,
    pub rules: RulesPlan,
}

/// Every path a plan writes to (targets, new folders, temp names).
pub fn produced_paths(plan: &Plan) -> Vec<PathBuf> {
    plan.ops
        .iter()
        .flat_map(|o| match &o.op {
            Op::Mkdir { path } => vec![path.clone()],
            Op::Move { from, to } => vec![from.clone(), to.clone()],
            Op::Copy { to, .. } | Op::Archive { to, .. } => vec![to.clone()],
            Op::Tag { path, .. } | Op::Trash { path } | Op::Delete { path } => vec![path.clone()],
        })
        .collect()
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub id: i64,
    pub at: i64,
    pub folder: String,
    pub path: String,
    pub rule_id: String,
    pub rule_name: String,
    pub outcome: String,
    pub destination: Option<String>,
    pub plan_id: Option<i64>,
    pub message: Option<String>,
}

fn record(db: &Db, folder: &Path, run: &AutoRun) -> Result<()> {
    let now = chrono::Utc::now().timestamp_millis();
    let conn = db.conn();
    let issue_for = |p: &Path| run.rules.plan.issues.iter().find(|i| i.path == p).map(|i| i.message.clone());
    for m in &run.rules.matches {
        let skipped_msg = m.skipped.clone().or_else(|| issue_for(&m.path).filter(|s| s.starts_with("skipped")));
        let (outcome, message) = match (&skipped_msg, run.outcome) {
            (Some(why), _) => ("skipped", Some(why.clone())),
            (None, Outcome::Failed) => ("failed", run.report.as_ref().and_then(|r| r.error.clone())),
            (None, o) => (o.as_str(), None),
        };
        conn.execute(
            "INSERT INTO rule_activity(at, folder, path, rule_id, rule_name, outcome, destination, plan_id, message)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                now,
                folder.to_string_lossy(),
                m.path.to_string_lossy(),
                m.rule_id,
                m.rule_name,
                outcome,
                m.destination.as_ref().map(|d| d.to_string_lossy().into_owned()),
                run.plan_id,
                message
            ],
        )?;
    }
    // Keep the log bounded.
    conn.execute("DELETE FROM rule_activity WHERE id <= (SELECT MAX(id) FROM rule_activity) - 5000", [])?;
    Ok(())
}

pub fn recent_activity(db: &Db, limit: usize) -> Result<Vec<Activity>> {
    let conn = db.conn();
    let mut stmt = conn.prepare(
        "SELECT id, at, folder, path, rule_id, rule_name, outcome, destination, plan_id, message
         FROM rule_activity ORDER BY id DESC LIMIT ?1",
    )?;
    let rows = stmt.query_map([limit as i64], |r| {
        Ok(Activity {
            id: r.get(0)?,
            at: r.get(1)?,
            folder: r.get(2)?,
            path: r.get(3)?,
            rule_id: r.get(4)?,
            rule_name: r.get(5)?,
            outcome: r.get(6)?,
            destination: r.get(7)?,
            plan_id: r.get(8)?,
            message: r.get(9)?,
        })
    })?;
    Ok(rows.collect::<std::result::Result<_, _>>()?)
}
