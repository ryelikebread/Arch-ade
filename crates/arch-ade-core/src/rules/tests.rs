use super::*;
use crate::plan::{Op, Planner};
use crate::scope::Scope;
use crate::source::{AppConfidence, SourceInfo};

const DAY: i64 = 86_400_000;
const NOW: i64 = 1_790_000_000_000;

struct Env {
    _dir: tempfile::TempDir,
    root: PathBuf,
    scope: Scope,
    places: Places,
}

fn env(files: &[&str]) -> Env {
    let dir = tempfile::tempdir().unwrap();
    let base = std::fs::canonicalize(dir.path()).unwrap();
    let root = base.join("Downloads");
    std::fs::create_dir_all(&root).unwrap();
    for f in files {
        let p = root.join(f);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, f.as_bytes()).unwrap();
    }
    let scope = Scope::new();
    scope.add_root(&root).unwrap();
    let places = Places {
        home: Some(base.clone()),
        downloads: Some(root.clone()),
        desktop: Some(base.join("Desktop")),
        documents: None,
        pictures: None,
    };
    Env { _dir: dir, root, scope, places }
}

fn entry(env: &Env, name: &str) -> FileEntry {
    let p = env.root.join(name);
    crate::scan::entry_for(&env.root, &p, false, crate::platform::current()).unwrap()
}

fn with_source(mut e: FileEntry, url: &str, app: Option<&str>) -> FileEntry {
    e.source = Some(SourceInfo {
        url: Some(url.into()),
        referrer: None,
        domain: crate::source::domain_of(url),
        app: app.map(String::from),
        app_confidence: if app.is_some() { AppConfidence::Reported } else { AppConfidence::Unknown },
        downloaded_at: None,
        zone: None,
    });
    e
}

fn aged(mut e: FileEntry, days: i64) -> FileEntry {
    let t = NOW - days * DAY;
    e.added = Some(t);
    e.created = Some(t);
    e.modified = Some(t);
    e
}

fn enabled(mut rules: Vec<Rule>, ids: &[&str]) -> Vec<Rule> {
    for r in &mut rules {
        r.enabled = ids.contains(&r.id.as_str());
    }
    rules
}

fn engine(env: &Env) -> Engine<'_> {
    Engine { places: &env.places, name_rules: NameRules::Linux, now: NOW }
}

fn rule(json: serde_json::Value) -> Rule {
    serde_json::from_value(json).unwrap()
}

#[test]
fn templates_parse_validate_and_start_disabled() {
    let t = templates();
    assert!(t.len() >= 9);
    for r in &t {
        assert!(!r.enabled && !r.auto, "{} must start off", r.id);
        validate(r).unwrap();
    }
    let groups: HashSet<_> = t.iter().filter_map(|r| r.group.clone()).collect();
    for g in
        ["Organize Downloads", "Route GitHub downloads", "Route Slack downloads", "Clean Desktop", "Auto-trash by age"]
    {
        assert!(groups.contains(g), "missing template {g}");
    }
}

#[test]
fn organize_downloads_sorts_by_kind() {
    let env = env(&["cat.jpg", "paper.pdf", "clip.mp4", "stuff.zip", "main.rs", "notes.txt"]);
    let files: Vec<_> = ["cat.jpg", "paper.pdf", "clip.mp4", "stuff.zip", "main.rs", "notes.txt"]
        .iter()
        .map(|n| entry(&env, n))
        .collect();
    let rules = enabled(
        templates(),
        &["downloads-images", "downloads-pdfs", "downloads-videos", "downloads-archives", "downloads-source-code"],
    );
    let ev = engine(&env).evaluate(&rules, &env.root, &files);
    assert!(ev.rule_errors.is_empty(), "{:?}", ev.rule_errors);
    let dest = |n: &str| ev.matches.iter().find(|m| m.path.ends_with(n)).and_then(|m| m.destination.clone());
    assert_eq!(dest("cat.jpg"), Some(env.root.join("Images/cat.jpg")));
    assert_eq!(dest("paper.pdf"), Some(env.root.join("PDFs/paper.pdf")));
    assert_eq!(dest("clip.mp4"), Some(env.root.join("Videos/clip.mp4")));
    assert_eq!(dest("stuff.zip"), Some(env.root.join("Archives/stuff.zip")));
    assert_eq!(dest("main.rs"), Some(env.root.join("Source Code/main.rs")));
    assert!(ev.matches.iter().all(|m| !m.path.ends_with("notes.txt")), "no rule for text files");

    let plan = Planner::new(&env.scope, NameRules::Linux).build(&ev.intents, "Organize");
    assert!(!plan.is_blocked(), "{:?}", plan.issues);
    let mkdirs = plan.ops.iter().filter(|o| matches!(o.op, Op::Mkdir { .. })).count();
    assert_eq!(mkdirs, 5);
}

#[test]
fn first_match_wins_and_routing_needs_a_destination_root() {
    let env = env(&["repo-main.zip", "other.zip"]);
    let files = vec![
        with_source(entry(&env, "repo-main.zip"), "https://codeload.github.com/a/b/zip/main", None),
        with_source(entry(&env, "other.zip"), "https://example.com/other.zip", None),
    ];
    let rules = enabled(templates(), &["route-github", "downloads-archives"]);
    let ev = engine(&env).evaluate(&rules, &env.root, &files);
    let m = |n: &str| ev.matches.iter().find(|m| m.path.ends_with(n)).unwrap();
    assert_eq!(m("repo-main.zip").rule_id, "route-github");
    assert_eq!(m("repo-main.zip").destination, Some(env.places.home.clone().unwrap().join("Developer/repo-main.zip")));
    assert_eq!(m("other.zip").rule_id, "downloads-archives");

    // ~/Developer isn't a chosen destination yet, so the plan refuses it.
    let plan = Planner::new(&env.scope, NameRules::Linux).build(&ev.intents, "x");
    assert!(plan.is_blocked());
    assert!(plan.issues.iter().any(|i| i.blocking && i.message.contains("outside")), "{:?}", plan.issues);

    // Once the user allows it, it plans.
    let dev = env.places.home.clone().unwrap().join("Developer");
    std::fs::create_dir_all(&dev).unwrap();
    env.scope.add_root(&dev).unwrap();
    let plan = Planner::new(&env.scope, NameRules::Linux).build(&ev.intents, "x");
    assert!(!plan.is_blocked(), "{:?}", plan.issues);
}

#[test]
fn slack_matches_reported_app_or_domain() {
    let env = env(&["a.pdf", "b.pdf", "c.pdf"]);
    let files = vec![
        with_source(entry(&env, "a.pdf"), "https://example.com/a.pdf", Some("Slack")),
        with_source(entry(&env, "b.pdf"), "https://files.slack.com/files-pri/b.pdf", None),
        with_source(entry(&env, "c.pdf"), "https://notslack.com/c.pdf", None),
    ];
    let ev = engine(&env).evaluate(&enabled(templates(), &["route-slack"]), &env.root, &files);
    let ids: Vec<_> = ev.matches.iter().map(|m| m.path.file_name().unwrap().to_string_lossy().into_owned()).collect();
    assert_eq!(ids, vec!["a.pdf", "b.pdf"]);
}

#[test]
fn age_rules_and_folder_scoping() {
    let env = env(&["old.txt", "new.txt"]);
    let files = vec![aged(entry(&env, "old.txt"), 40), aged(entry(&env, "new.txt"), 2)];
    let rules = enabled(templates(), &["auto-trash-old-downloads", "clean-desktop"]);
    let ev = engine(&env).evaluate(&rules, &env.root, &files);
    assert_eq!(ev.matches.len(), 1, "Clean Desktop must not run on Downloads");
    assert!(ev.matches[0].path.ends_with("old.txt"));
    assert_eq!(ev.intents, vec![Intent { path: env.root.join("old.txt"), action: PlanAction::Trash }]);
}

#[test]
fn conditions_size_regex_not_and_any() {
    let env = env(&["Screenshot 2026-01-01.png", "photo.png"]);
    std::fs::write(env.root.join("photo.png"), vec![0u8; 2_000_000]).unwrap();
    let files = vec![entry(&env, "Screenshot 2026-01-01.png"), entry(&env, "photo.png")];
    let r = rule(serde_json::json!({
        "id": "s", "name": "screens", "enabled": true,
        "conditions": [
            {"type": "nameRegex", "pattern": "^screenshot"},
            {"type": "size", "atLeast": "1 MB", "not": true}
        ],
        "actions": [{"type": "move", "to": "Screenshots"}]
    }));
    let ev = engine(&env).evaluate(&[r], &env.root, &files);
    assert_eq!(ev.matches.len(), 1);
    assert!(ev.matches[0].path.ends_with("Screenshot 2026-01-01.png"));

    let r = rule(serde_json::json!({
        "id": "big", "name": "big", "enabled": true, "match": "any",
        "conditions": [{"type": "size", "atLeast": 1_500_000}, {"type": "extension", "extensions": [".PNG"]}],
        "actions": [{"type": "tag", "tags": ["Big"]}]
    }));
    let ev = engine(&env).evaluate(&[r], &env.root, &files);
    assert_eq!(ev.matches.len(), 2);
    assert!(ev.intents.iter().all(|i| i.action == PlanAction::Tag(vec!["Big".into()])));
}

#[test]
fn rename_move_copy_archive_and_conflicts() {
    let env = env(&["report.pdf", "Reports/report.pdf"]);
    let files = vec![entry(&env, "report.pdf")];
    let r = rule(serde_json::json!({
        "id": "r", "name": "r", "enabled": true,
        "conditions": [{"type": "kind", "kinds": ["pdf"]}],
        "actions": [
            {"type": "copy", "to": "Backup/{year}"},
            {"type": "archive", "to": "Zips"},
            {"type": "move", "to": "Reports"}
        ]
    }));
    let ev = engine(&env).evaluate(std::slice::from_ref(&r), &env.root, &files);
    let year = Local.timestamp_millis_opt(files[0].modified.unwrap()).unwrap().year();
    assert_eq!(
        ev.intents,
        vec![
            Intent {
                path: env.root.join("report.pdf"),
                action: PlanAction::CopyTo(env.root.join(format!("Backup/{year}/report.pdf")))
            },
            Intent {
                path: env.root.join("report.pdf"),
                action: PlanAction::ArchiveTo(env.root.join("Zips/report.pdf.zip"))
            },
            // Reports/report.pdf exists, so the default ifExists renames.
            Intent {
                path: env.root.join("report.pdf"),
                action: PlanAction::MoveTo(env.root.join("Reports/report (2).pdf"))
            },
        ]
    );
    let plan = Planner::new(&env.scope, NameRules::Linux).build(&ev.intents, "r");
    assert!(!plan.is_blocked(), "{:?}", plan.issues);
    let kinds: Vec<&str> = plan
        .ops
        .iter()
        .map(|o| match o.op {
            Op::Mkdir { .. } => "mkdir",
            Op::Copy { .. } => "copy",
            Op::Archive { .. } => "archive",
            Op::Move { .. } => "move",
            _ => "other",
        })
        .collect();
    assert_eq!(kinds, vec!["mkdir", "mkdir", "mkdir", "copy", "archive", "move"]);

    // ifExists: skip leaves the file alone.
    let mut skip = r.clone();
    skip.actions = vec![RuleAction::Move { to: "Reports".into(), if_exists: IfExists::Skip }];
    let ev = engine(&env).evaluate(&[skip], &env.root, &files);
    assert!(ev.intents.is_empty());
    assert!(ev.matches[0].skipped.as_deref().unwrap().contains("already exists"));

    // Rename in place with tokens.
    let ren = rule(serde_json::json!({
        "id": "n", "name": "n", "enabled": true,
        "conditions": [{"type": "kind", "kinds": ["pdf"]}],
        "actions": [{"type": "rename", "pattern": "{date:%Y} {original}"}]
    }));
    let ev = engine(&env).evaluate(&[ren], &env.root, &files);
    assert_eq!(ev.matches[0].destination, Some(env.root.join(format!("{year} report.pdf"))));
}

#[test]
fn two_files_never_claim_the_same_name() {
    let env = env(&["a/x.pdf", "x.pdf"]);
    // Two different files with the same name heading to one folder.
    let mut second = entry(&env, "a/x.pdf");
    second.name = "x.pdf".into();
    let files = vec![entry(&env, "x.pdf"), second];
    let ev = engine(&env).evaluate(&enabled(templates(), &["downloads-pdfs"]), &env.root, &files);
    let dests: Vec<_> = ev.matches.iter().map(|m| m.destination.clone().unwrap()).collect();
    assert_eq!(dests, vec![env.root.join("PDFs/x.pdf"), env.root.join("PDFs/x (2).pdf")]);
}

#[test]
fn skips_folders_hidden_partial_and_protected() {
    let env = env(&[".hidden.pdf", "big.pdf.crdownload", "proj/.git/HEAD"]);
    let files = vec![entry(&env, ".hidden.pdf"), entry(&env, "big.pdf.crdownload"), entry(&env, "proj")];
    let r = rule(serde_json::json!({
        "id": "all", "name": "all", "enabled": true,
        "conditions": [{"type": "nameRegex", "pattern": "."}],
        "actions": [{"type": "move", "to": "Sorted"}]
    }));
    let ev = engine(&env).evaluate(&[r], &env.root, &files);
    assert!(ev.matches.is_empty(), "{:?}", ev.matches);
}

#[test]
fn validation_errors() {
    let bad = |v: serde_json::Value| validate(&rule(v)).err().unwrap_or_default();
    let base = |conds: serde_json::Value, acts: serde_json::Value| serde_json::json!({"id": "x", "name": "x", "conditions": conds, "actions": acts});
    let kind = serde_json::json!([{"type": "kind", "kinds": ["pdf"]}]);
    assert!(bad(base(serde_json::json!([]), serde_json::json!([{"type": "trash"}]))).contains("condition"));
    assert!(bad(base(kind.clone(), serde_json::json!([]))).contains("action"));
    assert!(bad(base(kind.clone(), serde_json::json!([{"type": "trash"}, {"type": "move", "to": "A"}])))
        .contains("only one"));
    assert!(bad(base(kind.clone(), serde_json::json!([{"type": "rename", "pattern": "{n} x"}]))).contains("numbering"));
    assert!(bad(base(
        serde_json::json!([{"type": "nameRegex", "pattern": "("}]),
        serde_json::json!([{"type": "trash"}])
    ))
    .contains("bad pattern"));
    assert!(bad(base(
        serde_json::json!([{"type": "size", "atLeast": "3 parsecs"}]),
        serde_json::json!([{"type": "trash"}])
    ))
    .contains("unit"));
    assert!(bad(base(
        serde_json::json!([{"type": "kind", "kinds": ["folder"]}]),
        serde_json::json!([{"type": "trash"}])
    ))
    .contains("folders"));
    assert!(bad(base(kind.clone(), serde_json::json!([{"type": "tag", "tags": ["a,b"]}]))).contains("commas"));
    assert!(
        serde_json::from_value::<Rule>(base(serde_json::json!([{"type": "colour"}]), serde_json::json!([]))).is_err()
    );
}

#[test]
fn destinations_resolve_safely() {
    let env = env(&[]);
    let none = |_: &str| None;
    let p = &env.places;
    assert_eq!(p.resolve("Images", &env.root, &none).unwrap(), env.root.join("Images"));
    assert_eq!(p.resolve("{home}/Work", &env.root, &none).unwrap(), p.home.clone().unwrap().join("Work"));
    assert!(p.resolve("../escape", &env.root, &none).is_err());
    assert!(p.resolve("x/{home}", &env.root, &none).is_err(), "places only at the start");
    assert!(p.resolve("{documents}/x", &env.root, &none).unwrap_err().contains("no documents folder"));
    assert!(p.resolve("{nope}", &env.root, &none).is_err());
    let fill = |k: &str| (k == "domain").then(|| "evil/../x".to_string());
    assert_eq!(p.resolve("By site/{domain}", &env.root, &fill).unwrap(), env.root.join("By site/evil-..-x"));
}

#[test]
fn sizes_parse() {
    assert_eq!(parse_size("10 MB").unwrap(), 10_000_000);
    assert_eq!(parse_size("1.5gb").unwrap(), 1_500_000_000);
    assert_eq!(parse_size("2 KiB").unwrap(), 2048);
    assert_eq!(parse_size("512").unwrap(), 512);
    assert!(parse_size("lots").is_err());
}

#[test]
fn load_and_save_round_trip() {
    let db = crate::db::Db::open_in_memory().unwrap();
    assert!(load(&db).unwrap().is_empty());
    let mut rules = templates();
    save(&db, &rules).unwrap();
    assert_eq!(load(&db).unwrap(), rules);
    rules[1].id = rules[0].id.clone();
    assert!(save(&db, &rules).is_err(), "duplicate ids");
    let mut broken = templates();
    broken[0].enabled = true;
    broken[0].conditions.clear();
    assert!(save(&db, &broken).is_err(), "enabled rules must be valid");
    broken[0].enabled = false;
    save(&db, &broken).unwrap();
}

#[test]
fn fixed_destinations_for_approval() {
    let env = env(&[]);
    let home = env.places.home.clone().unwrap();
    let r = rule(serde_json::json!({
        "id": "d", "name": "d", "conditions": [{"type": "kind", "kinds": ["pdf"]}],
        "actions": [
            {"type": "copy", "to": "{home}/Backup/{year}"},
            {"type": "archive", "to": "Zips"},
            {"type": "move", "to": "{home}/Work"}
        ]
    }));
    assert_eq!(r.fixed_destinations(&env.places), vec![home.join("Backup"), home.join("Work")]);
    let gh = templates().into_iter().find(|t| t.id == "route-github").unwrap();
    assert_eq!(gh.fixed_destinations(&env.places), vec![home.join("Developer")]);
    let local = templates().into_iter().find(|t| t.id == "downloads-pdfs").unwrap();
    assert!(local.fixed_destinations(&env.places).is_empty());
}
