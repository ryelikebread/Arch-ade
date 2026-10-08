//! File-by-File decisions through the planner and journal, including the one
//! op that can't be undone.

use arch_ade_core::journal::Journal;
use arch_ade_core::names::NameRules;
use arch_ade_core::onebyone::{self, Decision};
use arch_ade_core::plan::Planner;

mod common;
use common::*;

#[test]
fn move_rename_trash_are_one_undo_each() {
    let e = env(&[("a.txt", "A"), ("b.txt", "B"), ("c.txt", "C"), ("Docs/a.txt", "old")]);
    let pl = Planner::new(&e.scope, NameRules::Linux);
    let j = Journal::new(&e.db, &e.scope, &e.fake);

    // Taken name in the destination gets a number, with a note.
    let p = onebyone::plan(&pl, &e.root.join("a.txt"), &Decision::Move { dest: e.root.join("Docs") });
    assert!(!p.is_blocked(), "{:?}", p.issues);
    assert!(p.issues.iter().any(|i| i.message.contains("gets a number")));
    j.apply(j.save(&p).unwrap()).unwrap();
    assert_eq!(read(&e.root.join("Docs/a (2).txt")), "A");

    let p = onebyone::plan(&pl, &e.root.join("b.txt"), &Decision::Rename { name: " Bee.txt ".into() });
    j.apply(j.save(&p).unwrap()).unwrap();
    assert_eq!(read(&e.root.join("Bee.txt")), "B");

    let p = onebyone::plan(&pl, &e.root.join("c.txt"), &Decision::Trash);
    j.apply(j.save(&p).unwrap()).unwrap();
    assert!(!e.root.join("c.txt").exists());

    // Undo walks back one decision at a time, newest first.
    j.undo().unwrap();
    assert_eq!(read(&e.root.join("c.txt")), "C");
    j.undo().unwrap();
    assert_eq!(read(&e.root.join("b.txt")), "B");
    j.undo().unwrap();
    assert_eq!(read(&e.root.join("a.txt")), "A");
    assert_eq!(read(&e.root.join("Docs/a.txt")), "old");
}

#[test]
fn move_to_new_folder_and_same_folder() {
    let e = env(&[("a.txt", "A")]);
    let pl = Planner::new(&e.scope, NameRules::Linux);
    let p = onebyone::plan(&pl, &e.root.join("a.txt"), &Decision::Move { dest: e.root.clone() });
    assert!(p.ops.is_empty() && !p.is_blocked(), "already there is a note, not a change");

    let p = onebyone::plan(&pl, &e.root.join("a.txt"), &Decision::Move { dest: e.root.join("New/Sub") });
    let j = Journal::new(&e.db, &e.scope, &e.fake);
    j.apply(j.save(&p).unwrap()).unwrap();
    assert_eq!(read(&e.root.join("New/Sub/a.txt")), "A");
    j.undo().unwrap();
    assert!(!e.root.join("New").exists());
}

#[test]
fn rename_to_taken_or_invalid_name_is_blocked() {
    let e = env(&[("a.txt", "A"), ("b.txt", "B")]);
    let pl = Planner::new(&e.scope, NameRules::Windows);
    assert!(onebyone::plan(&pl, &e.root.join("a.txt"), &Decision::Rename { name: "b.txt".into() }).is_blocked());
    assert!(onebyone::plan(&pl, &e.root.join("a.txt"), &Decision::Rename { name: "CON.txt".into() }).is_blocked());
    assert!(onebyone::plan(&pl, &e.root.join("a.txt"), &Decision::Rename { name: "../x.txt".into() }).is_blocked());
    let p = onebyone::plan(&pl, &e.root.join("a.txt"), &Decision::Rename { name: "sub/x.txt".into() });
    assert!(p.is_blocked() && p.ops.is_empty(), "a rename never creates folders");
}

#[test]
fn delete_is_final_and_undo_skips_past_it() {
    let e = env(&[("keep.txt", "K"), ("gone.txt", "G")]);
    let pl = Planner::new(&e.scope, NameRules::Linux);
    let j = Journal::new(&e.db, &e.scope, &e.fake);

    let p = onebyone::plan(&pl, &e.root.join("keep.txt"), &Decision::Rename { name: "kept.txt".into() });
    let rename_id = j.save(&p).unwrap();
    j.apply(rename_id).unwrap();

    let p = onebyone::plan(&pl, &e.root.join("gone.txt"), &Decision::Delete);
    let r = j.apply(j.save(&p).unwrap()).unwrap();
    assert_eq!(r.status, "final");
    assert!(!e.root.join("gone.txt").exists());
    assert!(!e.fake.dir.join("gone.txt").exists(), "not in the trash either");

    // Undo goes to the rename before it; the delete stays done.
    assert_eq!(j.can_undo().unwrap(), Some(rename_id));
    j.undo().unwrap();
    assert_eq!(read(&e.root.join("keep.txt")), "K");
    assert!(!e.root.join("gone.txt").exists());
    assert!(j.history(10).unwrap().iter().any(|h| h.status == "final"));
}

#[test]
fn delete_refuses_folders_missing_and_changed_files() {
    let e = env(&[("dir/x.txt", "X"), ("f.txt", "F")]);
    let pl = Planner::new(&e.scope, NameRules::Linux);
    assert!(onebyone::plan(&pl, &e.root.join("dir"), &Decision::Delete).is_blocked());
    assert!(onebyone::plan(&pl, &e.root.join("nope.txt"), &Decision::Delete).is_blocked());

    let j = Journal::new(&e.db, &e.scope, &e.fake);
    let id = j.save(&onebyone::plan(&pl, &e.root.join("f.txt"), &Decision::Delete)).unwrap();
    std::fs::write(e.root.join("f.txt"), "changed after the plan").unwrap();
    let r = j.apply(id).unwrap();
    assert!(r.error.is_some(), "changed file must not be deleted");
    assert!(e.root.join("f.txt").exists());
}

#[test]
fn subfolders_skip_hidden_and_projects() {
    let e = env(&[("Photos/a.jpg", ""), ("app/package.json", "{}"), (".cache/x", ""), ("b.txt", "")]);
    let names: Vec<String> =
        onebyone::subfolders(&e.root).iter().map(|p| p.file_name().unwrap().to_string_lossy().into_owned()).collect();
    assert_eq!(names, vec!["Photos"]);
}
