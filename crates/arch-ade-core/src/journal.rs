//! The operation journal: applies saved plans, records every step in SQLite
//! before and after it touches disk, and undoes/redoes whole plans.
//!
//! History is linear: applying a new plan discards anything that was undone
//! (the redo stack), like an editor.
//!
//! A plan that permanently deleted a file ends as `final`: it stays in the
//! history but can't be undone or redone, and undo moves past it to the plan
//! before.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use rusqlite::{params, OptionalExtension};
use serde::Serialize;

use crate::db::Db;
use crate::names;
use crate::plan::{Fingerprint, Issue, Op, Plan, PlannedOp};
use crate::platform::{Platform, TrashReceipt};
use crate::scope::Scope;
use crate::{Error, Result};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanSummary {
    pub id: i64,
    pub label: String,
    pub status: String,
    pub created: i64,
    pub applied_at: Option<i64>,
    pub undone_at: Option<i64>,
    pub op_count: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunReport {
    pub plan_id: i64,
    pub label: String,
    pub direction: String,
    pub done: usize,
    pub skipped: usize,
    pub total: usize,
    /// First error; the run stops there and everything before it stays
    /// journaled (and undoable).
    pub error: Option<String>,
    pub status: String,
}

/// One concrete step, as executed (undo steps are the inverses of forward steps).
#[derive(Debug, Clone)]
enum Step {
    Mkdir(PathBuf),
    Rmdir(PathBuf),
    Move {
        from: PathBuf,
        to: PathBuf,
        expect: Option<Fingerprint>,
        size_only: bool,
    },
    Trash {
        path: PathBuf,
        expect: Option<Fingerprint>,
        size_only: bool,
    },
    Restore(TrashReceipt),
    Copy {
        from: PathBuf,
        to: PathBuf,
        expect: Option<Fingerprint>,
        size_only: bool,
    },
    Archive {
        from: PathBuf,
        to: PathBuf,
        expect: Option<Fingerprint>,
        size_only: bool,
    },
    /// Undo of Copy/Archive: the file we created goes to the trash, never
    /// deleted, and only if it is unchanged since we made it.
    TrashCreated {
        path: PathBuf,
        made: Option<Fingerprint>,
    },
    Tag {
        path: PathBuf,
        tags: Vec<String>,
    },
    RestoreTags {
        path: PathBuf,
        previous: Option<Vec<u8>>,
    },
    Delete {
        path: PathBuf,
        expect: Option<Fingerprint>,
    },
}

/// What a Tag step stores so undo can restore the attribute byte for byte.
#[derive(serde::Serialize, serde::Deserialize)]
struct TagReceipt {
    previous: Option<String>,
}

enum Outcome {
    Done(Option<String>),
    Skipped(String),
}

pub struct Journal<'a> {
    db: &'a Db,
    scope: &'a Scope,
    platform: &'a dyn Platform,
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// Only one apply, undo or redo touches disk at a time. Without this, a
/// double-clicked Apply could run the same plan twice, and the rules watcher
/// could apply a plan in the middle of the user's Undo; either way the
/// journal would no longer match the files and Undo could miss steps.
static RUN_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn run_lock() -> std::sync::MutexGuard<'static, ()> {
    // A panic in an earlier run leaves nothing half-held: the journal rows
    // are the state, so carry on.
    RUN_LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

impl<'a> Journal<'a> {
    pub fn new(db: &'a Db, scope: &'a Scope, platform: &'a dyn Platform) -> Self {
        Journal { db, scope, platform }
    }

    /// Store a plan so it can be applied by id. Blocked plans are refused.
    pub fn save(&self, plan: &Plan) -> Result<i64> {
        if plan.is_blocked() {
            return Err(Error::Plan("plan has blocking issues".into()));
        }
        let conn = self.db.conn();
        conn.execute(
            "INSERT INTO plans(created, label, status, plan_json) VALUES (?1, ?2, 'planned', ?3)",
            params![now_ms(), plan.label, serde_json::to_string(plan)?],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn load(&self, id: i64) -> Result<(Plan, String)> {
        let (json, status): (String, String) = self
            .db
            .conn()
            .query_row("SELECT plan_json, status FROM plans WHERE id = ?1", [id], |r| Ok((r.get(0)?, r.get(1)?)))
            .optional()?
            .ok_or_else(|| Error::NotFound(format!("plan {id}")))?;
        Ok((serde_json::from_str(&json)?, status))
    }

    /// Execute a saved plan.
    pub fn apply(&self, id: i64) -> Result<RunReport> {
        let _running = run_lock();
        let (plan, status) = self.load(id)?;
        if status != "planned" {
            return Err(Error::Plan(format!("plan {id} is {status}, not ready to apply")));
        }
        {
            let conn = self.db.conn();
            conn.execute("UPDATE plans SET status = 'discarded' WHERE status = 'undone'", [])?;
            conn.execute("UPDATE plans SET status = 'applying', applied_at = ?2 WHERE id = ?1", params![id, now_ms()])?;
        }
        let steps = plan.ops.iter().map(|o| forward_step(o, false)).collect();
        self.run(id, &plan.label, "apply", steps, None)
    }

    pub fn can_undo(&self) -> Result<Option<i64>> {
        Ok(self
            .db
            .conn()
            .query_row(
                // Ordered by journal row id, not timestamps: several plans can
                // run within the same millisecond.
                "SELECT id FROM plans p WHERE status IN ('applied','partial','interrupted')
                 ORDER BY (SELECT MAX(o.id) FROM ops o WHERE o.plan_id = p.id AND o.direction != 'undo') DESC,
                          p.id DESC LIMIT 1",
                [],
                |r| r.get(0),
            )
            .optional()?)
    }

    pub fn can_redo(&self) -> Result<Option<i64>> {
        Ok(self
            .db
            .conn()
            .query_row(
                "SELECT id FROM plans p WHERE status = 'undone'
                 ORDER BY (SELECT MAX(o.id) FROM ops o WHERE o.plan_id = p.id AND o.direction = 'undo') DESC,
                          p.id DESC LIMIT 1",
                [],
                |r| r.get(0),
            )
            .optional()?)
    }

    /// Reverse the most recent applied plan.
    pub fn undo(&self) -> Result<Option<RunReport>> {
        let _running = run_lock();
        let Some(id) = self.can_undo()? else { return Ok(None) };
        let (plan, _) = self.load(id)?;
        let live = self.live_ops(id)?;
        let mut steps = Vec::new();
        let mut reverses = Vec::new();
        for (op_id, kind, src, dst, receipt) in live.into_iter().rev() {
            let step = match kind.as_str() {
                "mkdir" => Step::Rmdir(PathBuf::from(dst.unwrap_or_default())),
                "move" => Step::Move {
                    from: PathBuf::from(dst.unwrap_or_default()),
                    to: PathBuf::from(src.unwrap_or_default()),
                    expect: None,
                    size_only: false,
                },
                "trash" => Step::Restore(serde_json::from_str(&receipt.unwrap_or_default())?),
                "copy" | "archive" => Step::TrashCreated {
                    path: PathBuf::from(dst.unwrap_or_default()),
                    made: receipt.as_deref().and_then(|r| serde_json::from_str(r).ok()).flatten(),
                },
                "tag" => {
                    let r: TagReceipt = serde_json::from_str(&receipt.unwrap_or_default())?;
                    let previous = r.previous.map(|b| base64_decode(&b)).transpose()?;
                    Step::RestoreTags { path: PathBuf::from(src.unwrap_or_default()), previous }
                }
                // Only reachable for a delete plan interrupted by a crash
                // before it was marked final: nothing to bring back.
                "delete" => continue,
                other => return Err(Error::Other(format!("cannot undo step kind {other}"))),
            };
            steps.push(step);
            reverses.push(op_id);
        }
        self.db.conn().execute("UPDATE plans SET status = 'undoing' WHERE id = ?1", [id])?;
        self.run(id, &plan.label, "undo", steps, Some(reverses)).map(Some)
    }

    /// Re-apply the most recently undone plan.
    pub fn redo(&self) -> Result<Option<RunReport>> {
        let _running = run_lock();
        let Some(id) = self.can_redo()? else { return Ok(None) };
        let (plan, _) = self.load(id)?;
        self.db
            .conn()
            .execute("UPDATE plans SET status = 'redoing', applied_at = ?2 WHERE id = ?1", params![id, now_ms()])?;
        let steps = plan.ops.iter().map(|o| forward_step(o, true)).collect();
        self.run(id, &plan.label, "redo", steps, None).map(Some)
    }

    /// A copy of a plan that was reviewed but never applied (it "expired" when
    /// the app restarted), checked again against the files as they are now.
    /// Anything that changed, moved away or would overwrite becomes a blocking
    /// issue, so the copy only goes through review if it's still safe.
    pub fn revive(&self, id: i64) -> Result<Plan> {
        let (old, status) = self.load(id)?;
        if status != "expired" && status != "planned" {
            return Err(Error::Plan(format!("plan {id} is {status}: only plans that never ran can be reviewed again")));
        }
        let mut plan = Plan { label: old.label.clone(), ops: old.ops.clone(), issues: vec![] };
        // Earlier ops in the same plan create or free paths for later ones
        // (a folder made first, a rename through a temporary name).
        let mut made: HashSet<PathBuf> = HashSet::new();
        let mut freed: HashSet<PathBuf> = HashSet::new();
        let mut problems: Vec<(PathBuf, String)> = vec![];
        for o in &old.ops {
            let (src, dst) = match &o.op {
                Op::Mkdir { path } => (None, Some(path)),
                Op::Move { from, to } | Op::Copy { from, to } | Op::Archive { from, to } => (Some(from), Some(to)),
                Op::Trash { path } | Op::Tag { path, .. } => (Some(path), None),
                Op::Delete { path } => {
                    problems.push((path.clone(), "permanent deletes aren't reviewed again; use File by File".into()));
                    continue;
                }
            };
            for p in src.iter().chain(dst.iter()) {
                if self.scope.check(p).is_err() {
                    problems.push(((*p).clone(), "is outside the folders Arch-ade may change now".into()));
                }
            }
            if let Some(src) = src {
                if !made.contains(src) {
                    if std::fs::symlink_metadata(src).is_err() {
                        problems.push((src.clone(), "is gone".into()));
                    } else if o.expect.is_some() && Fingerprint::of(src) != o.expect {
                        problems.push((src.clone(), "changed since this plan was made".into()));
                    }
                }
            }
            if let Some(dst) = dst {
                let mkdir = matches!(o.op, Op::Mkdir { .. });
                if !mkdir && !freed.contains(dst) && std::fs::symlink_metadata(dst).is_ok() {
                    problems.push((dst.clone(), "already exists".into()));
                }
                made.insert(dst.clone());
            }
            if let (Some(src), Op::Move { .. } | Op::Trash { .. }) = (src, &o.op) {
                freed.insert(src.clone());
            }
        }
        for (path, msg) in problems {
            plan.issues.push(Issue { path, message: msg, blocking: true });
        }
        Ok(plan)
    }

    pub fn history(&self, limit: usize) -> Result<Vec<PlanSummary>> {
        let conn = self.db.conn();
        let mut stmt = conn.prepare(
            "SELECT id, label, status, created, applied_at, undone_at, plan_json FROM plans
             WHERE status NOT IN ('planned') ORDER BY COALESCE(applied_at, created) DESC, id DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map([limit as i64], |r| {
            let json: String = r.get(6)?;
            let op_count = serde_json::from_str::<Plan>(&json).map(|p| p.ops.len()).unwrap_or(0);
            Ok(PlanSummary {
                id: r.get(0)?,
                label: r.get(1)?,
                status: r.get(2)?,
                created: r.get(3)?,
                applied_at: r.get(4)?,
                undone_at: r.get(5)?,
                op_count,
            })
        })?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    /// Call once at startup: anything left mid-run by a crash is marked
    /// `interrupted` so the user can see it and undo what completed.
    pub fn recover_interrupted(&self) -> Result<Vec<i64>> {
        let conn = self.db.conn();
        let ids: Vec<i64> = conn
            .prepare("SELECT id FROM plans WHERE status IN ('applying','undoing','redoing')")?
            .query_map([], |r| r.get(0))?
            .collect::<std::result::Result<_, _>>()?;
        for id in &ids {
            conn.execute("UPDATE ops SET status = 'unknown' WHERE plan_id = ?1 AND status = 'pending'", [id])?;
            conn.execute("UPDATE plans SET status = 'interrupted' WHERE id = ?1", [id])?;
        }
        // A delete that may have happened can't be undone either way.
        conn.execute(
            "UPDATE plans SET status = 'final' WHERE status = 'interrupted'
               AND EXISTS (SELECT 1 FROM ops o WHERE o.plan_id = plans.id AND o.kind = 'delete' AND o.status IN ('done','unknown'))",
            [],
        )?;
        // Planned-but-never-applied plans from earlier sessions are stale.
        conn.execute("UPDATE plans SET status = 'expired' WHERE status = 'planned'", [])?;
        Ok(ids)
    }

    /// Done forward steps of the latest apply/redo run that no undo has reversed.
    #[allow(clippy::type_complexity)]
    fn live_ops(&self, id: i64) -> Result<Vec<(i64, String, Option<String>, Option<String>, Option<String>)>> {
        let conn = self.db.conn();
        let run: Option<i64> = conn.query_row(
            "SELECT MAX(run) FROM ops WHERE plan_id = ?1 AND direction IN ('apply','redo')",
            [id],
            |r| r.get(0),
        )?;
        let Some(run) = run else { return Ok(vec![]) };
        let mut stmt = conn.prepare(
            "SELECT id, kind, src, dst, receipt FROM ops o
             WHERE plan_id = ?1 AND run = ?2 AND status = 'done'
               AND NOT EXISTS (SELECT 1 FROM ops u WHERE u.reverses = o.id AND u.status IN ('done','skipped'))
             ORDER BY seq",
        )?;
        let rows = stmt.query_map(params![id, run], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)))?;
        Ok(rows.collect::<std::result::Result<_, _>>()?)
    }

    fn run(
        &self,
        plan_id: i64,
        label: &str,
        direction: &str,
        steps: Vec<Step>,
        reverses: Option<Vec<i64>>,
    ) -> Result<RunReport> {
        let run: i64 = self.db.conn().query_row(
            "SELECT COALESCE(MAX(run), 0) + 1 FROM ops WHERE plan_id = ?1",
            [plan_id],
            |r| r.get(0),
        )?;
        let total = steps.len();
        let (mut done, mut skipped, mut error) = (0, 0, None);

        for (seq, step) in steps.into_iter().enumerate() {
            let (kind, src, dst) = describe(&step);
            let reverses_id = reverses.as_ref().map(|r| r[seq]);
            let row_id = {
                let conn = self.db.conn();
                conn.execute(
                    "INSERT INTO ops(plan_id, run, direction, seq, kind, src, dst, status, reverses, at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8, ?9)",
                    params![plan_id, run, direction, seq as i64, kind, src, dst, reverses_id, now_ms()],
                )?;
                conn.last_insert_rowid()
            };
            match self.exec(&step) {
                Ok(Outcome::Done(receipt)) => {
                    done += 1;
                    self.db.conn().execute(
                        "UPDATE ops SET status = 'done', receipt = ?2 WHERE id = ?1",
                        params![row_id, receipt],
                    )?;
                }
                Ok(Outcome::Skipped(why)) => {
                    skipped += 1;
                    self.db
                        .conn()
                        .execute("UPDATE ops SET status = 'skipped', error = ?2 WHERE id = ?1", params![row_id, why])?;
                }
                Err(e) => {
                    let msg = e.to_string();
                    self.db
                        .conn()
                        .execute("UPDATE ops SET status = 'failed', error = ?2 WHERE id = ?1", params![row_id, msg])?;
                    error = Some(msg);
                    break;
                }
            }
        }

        let deleted: bool = self.db.conn().query_row(
            "SELECT EXISTS(SELECT 1 FROM ops WHERE plan_id = ?1 AND kind = 'delete' AND status = 'done')",
            [plan_id],
            |r| r.get(0),
        )?;
        let status = match (direction, &error) {
            _ if deleted => "final",
            ("undo", None) => "undone",
            (_, None) => "applied",
            (_, Some(_)) => "partial",
        };
        {
            let conn = self.db.conn();
            if status == "undone" {
                conn.execute(
                    "UPDATE plans SET status = ?2, undone_at = ?3 WHERE id = ?1",
                    params![plan_id, status, now_ms()],
                )?;
            } else {
                conn.execute("UPDATE plans SET status = ?2 WHERE id = ?1", params![plan_id, status])?;
            }
        }
        Ok(RunReport {
            plan_id,
            label: label.to_string(),
            direction: direction.to_string(),
            done,
            skipped,
            total,
            error,
            status: status.to_string(),
        })
    }

    fn exec(&self, step: &Step) -> Result<Outcome> {
        match step {
            Step::Mkdir(p) => {
                let p = self.scope.check(p)?;
                if p.is_dir() {
                    return Ok(Outcome::Skipped("folder already exists".into()));
                }
                std::fs::create_dir(&p)?;
                Ok(Outcome::Done(None))
            }
            Step::Rmdir(p) => {
                let p = self.scope.check(p)?;
                match std::fs::read_dir(&p).map(|mut rd| rd.next().is_none()) {
                    Ok(true) => {
                        std::fs::remove_dir(&p)?;
                        Ok(Outcome::Done(None))
                    }
                    Ok(false) => Ok(Outcome::Skipped("folder is not empty, left in place".into())),
                    Err(_) => Ok(Outcome::Skipped("folder is already gone".into())),
                }
            }
            Step::Move { from, to, expect, size_only } => {
                let from = self.scope.check(from)?;
                let to = self.scope.check(to)?;
                if std::fs::symlink_metadata(&from).is_err() {
                    return Err(Error::NotFound(from.display().to_string()));
                }
                check_fingerprint(&from, expect, *size_only)?;
                let case_only = from.parent() == to.parent()
                    && names::collide(
                        self.platform.name_rules(),
                        &from.file_name().unwrap_or_default().to_string_lossy(),
                        &to.file_name().unwrap_or_default().to_string_lossy(),
                    );
                if case_only {
                    // a.txt -> A.txt on a case-insensitive volume: go through a temp name.
                    let tmp = from.with_file_name(format!(".arch-ade-case-{}", now_ms()));
                    std::fs::rename(&from, &tmp)?;
                    // With the file parked under the temp name, the new name
                    // must be free. If it still exists, it's a different file
                    // (a case-sensitive volume holding both a.txt and A.txt),
                    // and renaming onto it would overwrite it.
                    if std::fs::symlink_metadata(&to).is_ok() {
                        let _ = std::fs::rename(&tmp, &from);
                        return Err(Error::Plan(format!("{} already exists", to.display())));
                    }
                    if let Err(e) = std::fs::rename(&tmp, &to) {
                        let _ = std::fs::rename(&tmp, &from);
                        return Err(e.into());
                    }
                } else {
                    if std::fs::symlink_metadata(&to).is_ok() {
                        return Err(Error::Plan(format!("{} already exists", to.display())));
                    }
                    crate::platform::move_path(&from, &to)?;
                }
                Ok(Outcome::Done(None))
            }
            Step::Trash { path, expect, size_only } => {
                let path = self.scope.check(path)?;
                if std::fs::symlink_metadata(&path).is_err() {
                    return Err(Error::NotFound(path.display().to_string()));
                }
                check_fingerprint(&path, expect, *size_only)?;
                let receipt = self.platform.trash(&path)?;
                Ok(Outcome::Done(Some(serde_json::to_string(&receipt)?)))
            }
            Step::Restore(r) => {
                self.scope.check(&r.original)?;
                self.platform.restore(r)?;
                Ok(Outcome::Done(None))
            }
            Step::Copy { from, to, expect, size_only } | Step::Archive { from, to, expect, size_only } => {
                let from = self.scope.check(from)?;
                let to = self.scope.check(to)?;
                if std::fs::symlink_metadata(&from).is_err() {
                    return Err(Error::NotFound(from.display().to_string()));
                }
                check_fingerprint(&from, expect, *size_only)?;
                if matches!(step, Step::Copy { .. }) {
                    crate::fsops::copy(&from, &to)?;
                } else {
                    crate::fsops::zip(&from, &to)?;
                }
                Ok(Outcome::Done(Some(serde_json::to_string(&Fingerprint::of(&to))?)))
            }
            Step::TrashCreated { path, made } => {
                let path = self.scope.check(path)?;
                if std::fs::symlink_metadata(&path).is_err() {
                    return Ok(Outcome::Skipped("already gone".into()));
                }
                if made.is_some() && Fingerprint::of(&path) != *made {
                    return Ok(Outcome::Skipped("changed since it was created, left in place".into()));
                }
                let receipt = self.platform.trash(&path)?;
                Ok(Outcome::Done(Some(serde_json::to_string(&receipt)?)))
            }
            Step::Tag { path, tags } => {
                let path = self.scope.check(path)?;
                let previous = self.platform.add_tags(&path, tags)?;
                let r = TagReceipt { previous: previous.map(|b| base64_encode(&b)) };
                Ok(Outcome::Done(Some(serde_json::to_string(&r)?)))
            }
            Step::Delete { path, expect } => {
                let path = self.scope.check(path)?;
                let md = std::fs::symlink_metadata(&path).map_err(|_| Error::NotFound(path.display().to_string()))?;
                if md.is_dir() {
                    return Err(Error::Plan(format!(
                        "{} is a folder; only files are deleted permanently",
                        path.display()
                    )));
                }
                check_fingerprint(&path, expect, false)?;
                std::fs::remove_file(&path)?;
                Ok(Outcome::Done(None))
            }
            Step::RestoreTags { path, previous } => {
                let path = self.scope.check(path)?;
                if std::fs::symlink_metadata(&path).is_err() {
                    return Ok(Outcome::Skipped("file is gone; tags not restored".into()));
                }
                self.platform.restore_tags(&path, previous.as_deref())?;
                Ok(Outcome::Done(None))
            }
        }
    }
}

fn forward_step(o: &PlannedOp, size_only: bool) -> Step {
    match &o.op {
        Op::Mkdir { path } => Step::Mkdir(path.clone()),
        Op::Move { from, to } => Step::Move { from: from.clone(), to: to.clone(), expect: o.expect, size_only },
        Op::Trash { path } => Step::Trash { path: path.clone(), expect: o.expect, size_only },
        Op::Copy { from, to } => Step::Copy { from: from.clone(), to: to.clone(), expect: o.expect, size_only },
        Op::Archive { from, to } => Step::Archive { from: from.clone(), to: to.clone(), expect: o.expect, size_only },
        Op::Tag { path, tags } => Step::Tag { path: path.clone(), tags: tags.clone() },
        Op::Delete { path } => Step::Delete { path: path.clone(), expect: o.expect },
    }
}

fn describe(step: &Step) -> (&'static str, Option<String>, Option<String>) {
    let s = |p: &Path| Some(p.to_string_lossy().into_owned());
    match step {
        Step::Mkdir(p) => ("mkdir", None, s(p)),
        Step::Rmdir(p) => ("rmdir", s(p), None),
        Step::Move { from, to, .. } => ("move", s(from), s(to)),
        Step::Trash { path, .. } => ("trash", s(path), None),
        Step::Restore(r) => ("restore", r.token.clone(), s(&r.original)),
        Step::Copy { from, to, .. } => ("copy", s(from), s(to)),
        Step::Archive { from, to, .. } => ("archive", s(from), s(to)),
        Step::TrashCreated { path, .. } => ("trash-created", s(path), None),
        Step::Tag { path, .. } => ("tag", s(path), None),
        Step::RestoreTags { path, .. } => ("restore-tags", s(path), None),
        Step::Delete { path, .. } => ("delete", s(path), None),
    }
}

fn base64_encode(b: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(b)
}

fn base64_decode(s: &str) -> Result<Vec<u8>> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.decode(s).map_err(|e| Error::Other(format!("bad tag receipt: {e}")))
}

fn check_fingerprint(path: &Path, expect: &Option<Fingerprint>, size_only: bool) -> Result<()> {
    let Some(want) = expect else { return Ok(()) };
    let Some(now) = Fingerprint::of(path) else { return Ok(()) };
    let same = if size_only { now.size == want.size } else { now == *want };
    if same {
        Ok(())
    } else {
        Err(Error::Plan(format!("{} changed since the plan was made", path.display())))
    }
}
