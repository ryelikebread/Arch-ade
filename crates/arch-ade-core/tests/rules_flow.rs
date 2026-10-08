//! Rules end to end: evaluate, plan, apply through the journal, undo.

mod common;
use common::*;

use arch_ade_core::journal::Journal;
use arch_ade_core::organize::{self, Organizer, Outcome};
use arch_ade_core::platform::Platform;
use arch_ade_core::rules::{self, Places, Rule};

fn places(e: &Env) -> Places {
    let home = e.root.parent().unwrap().to_path_buf();
    Places { home: Some(home), downloads: Some(e.root.clone()), desktop: None, documents: None, pictures: None }
}

fn on(ids: &[&str]) -> Vec<Rule> {
    let mut r = rules::templates();
    for x in &mut r {
        x.enabled = ids.contains(&x.id.as_str());
        x.auto = x.enabled;
    }
    r
}

fn rule(v: serde_json::Value) -> Rule {
    serde_json::from_value(v).unwrap()
}

#[test]
fn watcher_run_applies_records_and_undoes() {
    let e = env(&[("cat.jpg", "meow"), ("paper.pdf", "pdf"), ("notes.txt", "hi")]);
    let pl = places(&e);
    let org = Organizer { db: &e.db, scope: &e.scope, platform: &e.fake, places: &pl };
    let files = vec![e.root.join("cat.jpg"), e.root.join("paper.pdf"), e.root.join("notes.txt")];
    let run = org.auto_run(&on(&["downloads-images", "downloads-pdfs"]), &e.root, &files, false).unwrap();
    assert_eq!(run.outcome, Outcome::Applied, "{:?}", run.rules.plan.issues);
    assert_eq!(read(&e.root.join("Images/cat.jpg")), "meow");
    assert_eq!(read(&e.root.join("PDFs/paper.pdf")), "pdf");
    assert!(e.root.join("notes.txt").exists());
    assert!(run.produced.contains(&e.root.join("Images/cat.jpg")));

    let log = organize::recent_activity(&e.db, 10).unwrap();
    assert_eq!(log.len(), 2);
    assert!(log.iter().all(|a| a.outcome == "applied" && a.plan_id == run.plan_id));

    // One undo puts the whole rule run back, folders included.
    let r = Journal::new(&e.db, &e.scope, &e.fake).undo().unwrap().unwrap();
    assert_eq!(r.status, "undone");
    assert_eq!(read(&e.root.join("cat.jpg")), "meow");
    assert!(!e.root.join("Images").exists());
}

#[test]
fn dry_run_and_non_auto_rules_touch_nothing() {
    let e = env(&[("cat.jpg", "meow")]);
    let pl = places(&e);
    let org = Organizer { db: &e.db, scope: &e.scope, platform: &e.fake, places: &pl };
    let files = vec![e.root.join("cat.jpg")];

    let run = org.auto_run(&on(&["downloads-images"]), &e.root, &files, true).unwrap();
    assert_eq!(run.outcome, Outcome::DryRun);
    assert!(e.root.join("cat.jpg").exists());
    assert_eq!(organize::recent_activity(&e.db, 10).unwrap()[0].outcome, "dryRun");

    // Enabled but not set to run automatically: the watcher ignores it...
    let mut manual = on(&["downloads-images"]);
    for r in &mut manual {
        r.auto = false;
    }
    let run = org.auto_run(&manual, &e.root, &files, false).unwrap();
    assert_eq!(run.outcome, Outcome::Nothing);
    assert!(e.root.join("cat.jpg").exists());
    // ...but "Run rules" from the app still offers it.
    let rp = org.plan(&manual, &e.root, None, false).unwrap();
    assert_eq!(rp.matches.len(), 1);
    assert!(!rp.plan.ops.is_empty());
}

#[test]
fn one_blocked_file_does_not_block_the_rest() {
    let e = env(&[("repo.zip", "z"), ("cat.jpg", "meow")]);
    let pl = places(&e);
    let org = Organizer { db: &e.db, scope: &e.scope, platform: &e.fake, places: &pl };
    // Everything goes to ~/Elsewhere, which is not an allowed destination;
    // images have their own rule first and still get sorted.
    let rules = vec![
        rule(serde_json::json!({"id":"img","name":"img","enabled":true,"auto":true,
            "conditions":[{"type":"kind","kinds":["image"]}],"actions":[{"type":"move","to":"Images"}]})),
        rule(serde_json::json!({"id":"far","name":"far","enabled":true,"auto":true,
            "conditions":[{"type":"nameRegex","pattern":"."}],"actions":[{"type":"move","to":"{home}/Elsewhere"}]})),
    ];
    let files = vec![e.root.join("repo.zip"), e.root.join("cat.jpg")];
    let run = org.auto_run(&rules, &e.root, &files, false).unwrap();
    assert_eq!(run.outcome, Outcome::Applied);
    assert!(e.root.join("Images/cat.jpg").exists());
    assert!(e.root.join("repo.zip").exists());
    let log = organize::recent_activity(&e.db, 10).unwrap();
    let zip = log.iter().find(|a| a.path.ends_with("repo.zip")).unwrap();
    assert_eq!(zip.outcome, "skipped");
    assert!(zip.message.as_deref().unwrap().contains("outside"), "{zip:?}");
}

#[test]
fn copy_archive_and_tag_are_undoable() {
    let e = env(&[("report.pdf", "R")]);
    let pl = places(&e);
    let org = Organizer { db: &e.db, scope: &e.scope, platform: &e.fake, places: &pl };
    let rules = vec![rule(serde_json::json!({
    "id":"keep","name":"keep","enabled":true,
    "conditions":[{"type":"kind","kinds":["pdf"]}],
    "actions":[
        {"type":"tag","tags":["Work","Q3"]},
        {"type":"copy","to":"Backup"},
        {"type":"archive","to":"Zips","removeOriginal":true}
    ]}))];
    let rp = org.plan(&rules, &e.root, None, false).unwrap();
    assert!(!rp.plan.is_blocked(), "{:?}", rp.plan.issues);
    let j = Journal::new(&e.db, &e.scope, &e.fake);
    let id = j.save(&rp.plan).unwrap();
    let r = j.apply(id).unwrap();
    assert_eq!(r.status, "applied", "{r:?}");
    let src = e.root.join("report.pdf");
    assert!(!src.exists(), "original went to the trash after zipping");
    assert_eq!(read(&e.root.join("Backup/report.pdf")), "R");
    assert!(e.root.join("Zips/report.pdf.zip").exists());
    assert_eq!(e.fake.read_tags(&src), vec!["Work", "Q3"]);

    let r = j.undo().unwrap().unwrap();
    assert_eq!(r.status, "undone", "{r:?}");
    assert_eq!(read(&src), "R");
    assert!(!e.root.join("Backup/report.pdf").exists(), "copy went to the trash");
    assert!(!e.root.join("Zips/report.pdf.zip").exists(), "zip went to the trash");
    assert!(e.fake.read_tags(&src).is_empty(), "tags restored to none");
    // Nothing was deleted outright: the copy and zip are in the (fake) trash.
    let trashed: Vec<String> = std::fs::read_dir(&e.fake.dir)
        .unwrap()
        .flatten()
        .map(|d| d.file_name().to_string_lossy().into_owned())
        .collect();
    assert!(trashed.iter().any(|n| n.ends_with("report.pdf.zip")), "{trashed:?}");
    assert!(trashed.iter().any(|n| n.ends_with("report.pdf") && !n.ends_with(".zip")), "{trashed:?}");

    // Redo makes them again.
    let r = j.redo().unwrap().unwrap();
    assert_eq!(r.status, "applied", "{r:?}");
    assert!(e.root.join("Backup/report.pdf").exists());
}

#[test]
fn undo_leaves_an_edited_copy_alone() {
    let e = env(&[("a.txt", "A")]);
    let pl = places(&e);
    let org = Organizer { db: &e.db, scope: &e.scope, platform: &e.fake, places: &pl };
    let rules = vec![rule(serde_json::json!({"id":"c","name":"c","enabled":true,
        "conditions":[{"type":"extension","extensions":["txt"]}],"actions":[{"type":"copy","to":"Copies"}]}))];
    let j = Journal::new(&e.db, &e.scope, &e.fake);
    let id = j.save(&org.plan(&rules, &e.root, None, false).unwrap().plan).unwrap();
    j.apply(id).unwrap();
    std::fs::write(e.root.join("Copies/a.txt"), "edited by the user").unwrap();
    let r = j.undo().unwrap().unwrap();
    assert_eq!(r.skipped, 2, "edited copy kept, so its folder stays too: {r:?}");
    assert_eq!(read(&e.root.join("Copies/a.txt")), "edited by the user");
}

#[test]
fn rules_never_reach_into_project_folders() {
    let e = env(&[("app/.git/HEAD", "ref"), ("app/logo.png", "png"), ("loose.png", "png")]);
    let pl = places(&e);
    let org = Organizer { db: &e.db, scope: &e.scope, platform: &e.fake, places: &pl };
    let rules = on(&["downloads-images"]);
    // Even if the watcher hands over a path inside the project, nothing happens to it.
    let run = org.auto_run(&rules, &e.root, &[e.root.join("app/logo.png"), e.root.join("loose.png")], false).unwrap();
    assert!(e.root.join("app/logo.png").exists());
    assert!(e.root.join("Images/loose.png").exists());
    assert!(run.rules.matches.iter().all(|m| !m.path.ends_with("app/logo.png")));
}

#[test]
fn tag_steps_are_skipped_where_tags_dont_exist() {
    let e = env(&[("report.pdf", "R")]);
    e.fake.no_tags.store(true, std::sync::atomic::Ordering::Relaxed);
    let pl = places(&e);
    let org = Organizer { db: &e.db, scope: &e.scope, platform: &e.fake, places: &pl };
    let rules = vec![rule(serde_json::json!({
    "id":"t","name":"t","enabled":true,
    "conditions":[{"type":"kind","kinds":["pdf"]}],
    "actions":[{"type":"tag","tags":["Work"]},{"type":"move","to":"PDFs"}]}))];
    let rp = org.plan(&rules, &e.root, None, false).unwrap();
    assert!(!rp.plan.is_blocked(), "{:?}", rp.plan.issues);
    assert!(rp.plan.issues.iter().any(|i| i.message.contains("tag step skipped")));
    let j = Journal::new(&e.db, &e.scope, &e.fake);
    let r = j.apply(j.save(&rp.plan).unwrap()).unwrap();
    assert_eq!(r.status, "applied", "{r:?}");
    assert!(e.root.join("PDFs/report.pdf").exists(), "the move still happens");
}
