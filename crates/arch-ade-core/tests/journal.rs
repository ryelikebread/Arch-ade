//! Journal, undo/redo and dry-run behaviour against a real temp folder.
//! Trash goes to a fake trash folder so tests never touch the user's trash;
//! `real_os_trash_roundtrip` exercises the real one when ARCHADE_TEST_TRASH=1.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use arch_ade_core::db::Db;
use arch_ade_core::journal::Journal;
use arch_ade_core::names::NameRules;
use arch_ade_core::plan::Planner;
use arch_ade_core::platform::{self, Os, Platform, RawSource, TrashReceipt};
use arch_ade_core::rename::{self, RenameOptions};
use arch_ade_core::scope::Scope;
use arch_ade_core::tools::Tools;

struct FakeTrash {
    dir: PathBuf,
    n: Mutex<u32>,
}

impl Platform for FakeTrash {
    fn os(&self) -> Os {
        Os::Linux
    }
    fn name_rules(&self) -> NameRules {
        NameRules::Linux
    }
    fn modifier_label(&self) -> &'static str {
        "Ctrl"
    }
    fn trash(&self, path: &Path) -> arch_ade_core::Result<TrashReceipt> {
        let mut n = self.n.lock().unwrap();
        *n += 1;
        let dst = self.dir.join(format!("{n}-{}", path.file_name().unwrap().to_string_lossy()));
        std::fs::rename(path, &dst)?;
        Ok(TrashReceipt { original: path.to_path_buf(), token: Some(dst.to_string_lossy().into()) })
    }
    fn restore(&self, r: &TrashReceipt) -> arch_ade_core::Result<()> {
        std::fs::rename(r.token.as_ref().unwrap(), &r.original)?;
        Ok(())
    }
    fn raw_source(&self, _: &Path) -> RawSource {
        RawSource::default()
    }
    fn added_time(&self, _: &Path) -> Option<i64> {
        None
    }
    fn os_thumbnail(&self, _: &Path, _: u32, _: &Tools) -> Option<Vec<u8>> {
        None
    }
    fn extra_tool_dirs(&self) -> Vec<PathBuf> {
        vec![]
    }
}

struct Env {
    _tmp: tempfile::TempDir,
    root: PathBuf,
    scope: Scope,
    db: Db,
    fake: FakeTrash,
}

fn env(files: &[(&str, &str)]) -> Env {
    let tmp = tempfile::tempdir().unwrap();
    let base = std::fs::canonicalize(tmp.path()).unwrap();
    let root = base.join("root");
    let trash = base.join("trash");
    std::fs::create_dir_all(&root).unwrap();
    std::fs::create_dir_all(&trash).unwrap();
    for (name, content) in files {
        let p = root.join(name);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, content).unwrap();
    }
    let scope = Scope::new();
    scope.add_root(&root).unwrap();
    Env { _tmp: tmp, root, scope, db: Db::open_in_memory().unwrap(), fake: FakeTrash { dir: trash, n: Mutex::new(0) } }
}

fn read(p: &Path) -> String {
    std::fs::read_to_string(p).unwrap()
}

#[test]
fn dry_run_plan_touches_nothing() {
    let e = env(&[("a.txt", "A")]);
    let plan = Planner::new(&e.scope, NameRules::Linux).moves(&[(e.root.join("a.txt"), e.root.join("x/b.txt"))], "mv");
    let j = Journal::new(&e.db, &e.scope, &e.fake);
    let id = j.save(&plan).unwrap();
    // Saving (the dry run) must not change the disk.
    assert!(e.root.join("a.txt").exists());
    assert!(!e.root.join("x").exists());
    assert_eq!(j.load(id).unwrap().1, "planned");
}

#[test]
fn apply_undo_redo_move_with_mkdir() {
    let e = env(&[("a.txt", "A")]);
    let j = Journal::new(&e.db, &e.scope, &e.fake);
    let plan =
        Planner::new(&e.scope, NameRules::Linux).moves(&[(e.root.join("a.txt"), e.root.join("x/y/b.txt"))], "mv");
    let id = j.save(&plan).unwrap();

    let r = j.apply(id).unwrap();
    assert_eq!(r.status, "applied", "{r:?}");
    assert_eq!(read(&e.root.join("x/y/b.txt")), "A");
    assert!(!e.root.join("a.txt").exists());

    let r = j.undo().unwrap().unwrap();
    assert_eq!(r.status, "undone", "{r:?}");
    assert_eq!(read(&e.root.join("a.txt")), "A");
    assert!(!e.root.join("x").exists(), "created folders are removed on undo");

    let r = j.redo().unwrap().unwrap();
    assert_eq!(r.status, "applied", "{r:?}");
    assert_eq!(read(&e.root.join("x/y/b.txt")), "A");

    assert!(j.undo().unwrap().is_some());
    assert!(j.undo().unwrap().is_none(), "nothing left to undo");
}

#[test]
fn trash_and_restore() {
    let e = env(&[("a.txt", "A"), ("dir/b.txt", "B")]);
    let j = Journal::new(&e.db, &e.scope, &e.fake);
    let plan = Planner::new(&e.scope, NameRules::Linux).trash(&[e.root.join("a.txt"), e.root.join("dir")], "trash");
    let id = j.save(&plan).unwrap();
    assert_eq!(j.apply(id).unwrap().status, "applied");
    assert!(!e.root.join("a.txt").exists());
    assert!(!e.root.join("dir").exists());
    assert_eq!(j.undo().unwrap().unwrap().status, "undone");
    assert_eq!(read(&e.root.join("a.txt")), "A");
    assert_eq!(read(&e.root.join("dir/b.txt")), "B");
}

#[test]
fn new_apply_clears_redo() {
    let e = env(&[("a", "1"), ("b", "2")]);
    let j = Journal::new(&e.db, &e.scope, &e.fake);
    let pl = Planner::new(&e.scope, NameRules::Linux);
    let id = j.save(&pl.moves(&[(e.root.join("a"), e.root.join("a2"))], "1")).unwrap();
    j.apply(id).unwrap();
    j.undo().unwrap();
    assert!(j.can_redo().unwrap().is_some());
    let id = j.save(&pl.moves(&[(e.root.join("b"), e.root.join("b2"))], "2")).unwrap();
    j.apply(id).unwrap();
    assert!(j.can_redo().unwrap().is_none());
}

#[test]
fn undo_is_lifo_across_plans() {
    let e = env(&[("a", "1")]);
    let j = Journal::new(&e.db, &e.scope, &e.fake);
    let pl = Planner::new(&e.scope, NameRules::Linux);
    let id = j.save(&pl.moves(&[(e.root.join("a"), e.root.join("b"))], "1")).unwrap();
    j.apply(id).unwrap();
    let id = j.save(&pl.moves(&[(e.root.join("b"), e.root.join("c"))], "2")).unwrap();
    j.apply(id).unwrap();
    j.undo().unwrap();
    assert!(e.root.join("b").exists());
    j.undo().unwrap();
    assert!(e.root.join("a").exists());
    j.redo().unwrap();
    assert!(e.root.join("b").exists());
    j.redo().unwrap();
    assert!(e.root.join("c").exists());
}

#[test]
fn changed_file_stops_the_plan_and_partial_is_undoable() {
    let e = env(&[("a", "1"), ("b", "2")]);
    let j = Journal::new(&e.db, &e.scope, &e.fake);
    let pl = Planner::new(&e.scope, NameRules::Linux);
    let plan = pl.moves(&[(e.root.join("a"), e.root.join("a2")), (e.root.join("b"), e.root.join("b2"))], "two");
    let id = j.save(&plan).unwrap();
    std::fs::write(e.root.join("b"), "changed after planning").unwrap();
    let r = j.apply(id).unwrap();
    assert_eq!(r.status, "partial");
    assert_eq!(r.done, 1);
    assert!(r.error.unwrap().contains("changed since the plan"));
    assert!(e.root.join("a2").exists());
    assert!(e.root.join("b").exists(), "the changed file is left alone");
    assert_eq!(j.undo().unwrap().unwrap().status, "undone");
    assert!(e.root.join("a").exists());
}

#[test]
fn blocked_and_reapplied_plans_are_refused() {
    let e = env(&[("a", "1"), ("b", "2")]);
    let j = Journal::new(&e.db, &e.scope, &e.fake);
    let pl = Planner::new(&e.scope, NameRules::Linux);
    assert!(j.save(&pl.moves(&[(e.root.join("a"), e.root.join("b"))], "x")).is_err());
    let id = j.save(&pl.moves(&[(e.root.join("a"), e.root.join("c"))], "x")).unwrap();
    j.apply(id).unwrap();
    assert!(j.apply(id).is_err(), "a plan runs once");
}

#[test]
fn out_of_scope_is_refused_at_apply_time_too() {
    let e = env(&[("a", "1")]);
    let j = Journal::new(&e.db, &e.scope, &e.fake);
    let outside = e.root.parent().unwrap().join("outside.txt");
    let plan = arch_ade_core::plan::Plan {
        label: "evil".into(),
        ops: vec![arch_ade_core::plan::PlannedOp {
            op: arch_ade_core::plan::Op::Move { from: e.root.join("a"), to: outside.clone() },
            expect: None,
        }],
        issues: vec![],
    };
    let id = j.save(&plan).unwrap();
    let r = j.apply(id).unwrap();
    assert_eq!(r.status, "partial");
    assert!(!outside.exists());
    assert!(e.root.join("a").exists());
}

#[test]
fn mass_rename_renumber_in_place() {
    // 1..3 renamed to 2..4: every target but the last is another file's source.
    let e = env(&[("1.txt", "one"), ("2.txt", "two"), ("3.txt", "three")]);
    let j = Journal::new(&e.db, &e.scope, &e.fake);
    let paths: Vec<PathBuf> = ["1.txt", "2.txt", "3.txt"].iter().map(|n| e.root.join(n)).collect();
    let opts = RenameOptions { pattern: "{n}".into(), start: 2, ..Default::default() };
    let rows = rename::preview(&paths, &opts, NameRules::Linux).unwrap();
    assert!(rows.iter().all(|r| r.status == rename::RowStatus::Ok), "{rows:?}");
    let plan = Planner::new(&e.scope, NameRules::Linux).moves(&rename::pairs(&rows), "renumber");
    assert!(!plan.is_blocked(), "{:?}", plan.issues);
    let id = j.save(&plan).unwrap();
    assert_eq!(j.apply(id).unwrap().status, "applied");
    assert_eq!(read(&e.root.join("2.txt")), "one");
    assert_eq!(read(&e.root.join("3.txt")), "two");
    assert_eq!(read(&e.root.join("4.txt")), "three");
    assert!(!e.root.join("1.txt").exists());
    j.undo().unwrap();
    assert_eq!(read(&e.root.join("1.txt")), "one");
    assert_eq!(read(&e.root.join("3.txt")), "three");
    let leftovers: Vec<_> = std::fs::read_dir(&e.root).unwrap().flatten().map(|d| d.file_name()).collect();
    assert_eq!(leftovers.len(), 3, "no temp files left: {leftovers:?}");
}

#[test]
fn interrupted_runs_are_recovered() {
    let e = env(&[("a", "1")]);
    let j = Journal::new(&e.db, &e.scope, &e.fake);
    let id =
        j.save(&Planner::new(&e.scope, NameRules::Linux).moves(&[(e.root.join("a"), e.root.join("b"))], "x")).unwrap();
    e.db.conn().execute("UPDATE plans SET status = 'applying', applied_at = 1 WHERE id = ?1", [id]).unwrap();
    assert_eq!(j.recover_interrupted().unwrap(), vec![id]);
    assert_eq!(j.load(id).unwrap().1, "interrupted");
    assert_eq!(j.can_undo().unwrap(), Some(id));
}

#[test]
fn real_os_trash_roundtrip() {
    if std::env::var("ARCHADE_TEST_TRASH").ok().as_deref() != Some("1") {
        eprintln!("skipped: set ARCHADE_TEST_TRASH=1 to use the real OS trash");
        return;
    }
    // Must live under the home folder: freedesktop trash can't cross to /tmp mounts.
    let base = dirs::home_dir().unwrap().join(format!(".arch-ade-trash-test-{}", std::process::id()));
    std::fs::create_dir_all(&base).unwrap();
    let file = base.join("trash-me.txt");
    std::fs::write(&file, "bye").unwrap();
    let scope = Scope::new();
    scope.add_root(&base).unwrap();
    let file = std::fs::canonicalize(&file).unwrap();
    let db = Db::open_in_memory().unwrap();
    let p = platform::current();
    let j = Journal::new(&db, &scope, p);
    let id = j.save(&Planner::new(&scope, p.name_rules()).trash(std::slice::from_ref(&file), "t")).unwrap();
    assert_eq!(j.apply(id).unwrap().status, "applied");
    assert!(!file.exists());
    let r = j.undo().unwrap().unwrap();
    assert_eq!(
        r.status,
        "undone",
        "{r:?}\nreceipt: {:?}\ntrash entries named trash-me.txt: {}",
        receipt(&db),
        trash_listing()
    );
    assert_eq!(read(&file), "bye");
    std::fs::remove_dir_all(&base).unwrap();
}

fn receipt(db: &Db) -> Option<String> {
    db.conn().query_row("SELECT receipt FROM ops WHERE kind = 'trash'", [], |r| r.get(0)).ok().flatten()
}

/// What the OS trash holds for the test file, to explain a failed restore.
#[cfg(any(windows, target_os = "linux"))]
fn trash_listing() -> String {
    match trash::os_limited::list() {
        Ok(items) => {
            let total = items.len();
            let hits: Vec<_> = items
                .iter()
                .filter(|i| i.name.to_string_lossy().contains("trash-me"))
                .map(|i| format!("{:?} from {:?} at {}", i.id, i.original_parent, i.time_deleted))
                .collect();
            format!("{hits:?} (of {total} items)")
        }
        Err(e) => format!("list failed: {e}"),
    }
}

#[cfg(target_os = "macos")]
fn trash_listing() -> String {
    String::new()
}
