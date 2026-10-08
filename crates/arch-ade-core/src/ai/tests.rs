use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use super::hints::{self, Decision, Probe};
use super::media::{self, MediaTags};
use super::ollama::{check_local_url, ChatRequest, Llm, Ollama};
use super::review::{self, Approved};
use super::suggest::{clean_part, Source, Suggester};
use super::whitelist::{self, Whitelist};
use super::{AiSettings, Mode};
use crate::db::Db;
use crate::kind::Kind;
use crate::names::NameRules;
use crate::preview::Ctx;
use crate::scan::{self, FileEntry};
use crate::scope::Scope;
use crate::tools::Tools;

// ---------- helpers ----------

struct Fake {
    reply: Result<String, String>,
    seen: Mutex<Vec<ChatRequest>>,
}

impl Fake {
    fn ok(v: serde_json::Value) -> Self {
        Fake { reply: Ok(v.to_string()), seen: Mutex::new(vec![]) }
    }
    fn err(e: &str) -> Self {
        Fake { reply: Err(e.into()), seen: Mutex::new(vec![]) }
    }
    fn last(&self) -> ChatRequest {
        self.seen.lock().unwrap().last().cloned().expect("model was asked")
    }
}

impl Llm for Fake {
    fn chat(&self, req: &ChatRequest) -> Result<String, String> {
        self.seen.lock().unwrap().push(req.clone());
        self.reply.clone()
    }
}

struct Env {
    _tmp: tempfile::TempDir,
    root: PathBuf,
    db: Db,
    tools: Tools,
    wl: Whitelist,
}

fn env(files: &[(&str, &[u8])]) -> Env {
    let tmp = tempfile::tempdir().unwrap();
    let root = std::fs::canonicalize(tmp.path()).unwrap();
    for (name, body) in files {
        std::fs::write(root.join(name), body).unwrap();
    }
    Env {
        _tmp: tmp,
        root,
        db: Db::open_in_memory().unwrap(),
        tools: Tools::default(),
        wl: whitelist::builtins().remove(0),
    }
}

impl Env {
    fn entry(&self, name: &str) -> FileEntry {
        scan::entry_for(&self.root, &self.root.join(name), false, crate::platform::current()).unwrap()
    }
    fn suggester<'a>(&'a self, settings: &'a AiSettings, llm: Option<&'a dyn Llm>) -> Suggester<'a> {
        Suggester {
            db: &self.db,
            ctx: Ctx { db: &self.db, tools: &self.tools, platform: crate::platform::current() },
            settings,
            whitelist: &self.wl,
            llm,
        }
    }
}

fn on(mode: Mode) -> AiSettings {
    AiSettings { enabled: true, mode, ..Default::default() }
}

fn decision(name: &str, cat: &str, sub: &str, new_name: &str, domain: Option<&str>) -> Decision {
    let ext = crate::rename::split_name(name).1.to_string();
    Decision {
        name: name.into(),
        kind: crate::kind::from_ext(&ext),
        ext,
        domain: domain.map(str::to_string),
        category: cat.into(),
        subcategory: sub.into(),
        new_name: new_name.into(),
        source: "ai".into(),
        whitelist_id: "general".into(),
    }
}

// ---------- Ollama client ----------

#[test]
fn only_local_urls() {
    for ok in ["http://127.0.0.1:11434", "http://localhost:11434/", "http://[::1]:11434", "http://127.0.0.2:8080"] {
        assert!(check_local_url(ok).is_ok(), "{ok}");
    }
    for bad in [
        "https://127.0.0.1:11434",
        "http://example.com:11434",
        "http://10.0.0.5:11434",
        "http://localhost.evil.com",
        "http://user@127.0.0.1:11434",
        "127.0.0.1:11434",
    ] {
        assert!(check_local_url(bad).is_err(), "{bad}");
    }
    assert!(super::save_settings(
        &Db::open_in_memory().unwrap(),
        &AiSettings { url: "http://8.8.8.8".into(), ..Default::default() }
    )
    .is_err());
}

/// A one-request HTTP server on a random local port; returns its URL and
/// the raw request it received.
fn serve_once(status: &str, body: &str) -> (String, std::thread::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let (status, body) = (status.to_string(), body.to_string());
    let handle = std::thread::spawn(move || {
        let (mut sock, _) = listener.accept().unwrap();
        sock.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        let mut req = Vec::new();
        let mut buf = [0u8; 65536];
        // Read headers, then as much body as Content-Length says.
        loop {
            let n = sock.read(&mut buf).unwrap();
            req.extend_from_slice(&buf[..n]);
            let text = String::from_utf8_lossy(&req).to_string();
            if let Some(head_end) = text.find("\r\n\r\n") {
                let len = text[..head_end]
                    .lines()
                    .find_map(|l| {
                        l.to_ascii_lowercase()
                            .strip_prefix("content-length:")
                            .map(|v| v.trim().parse::<usize>().unwrap())
                    })
                    .unwrap_or(0);
                if req.len() >= head_end + 4 + len {
                    break;
                }
            }
            if n == 0 {
                break;
            }
        }
        let resp = format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
        sock.write_all(resp.as_bytes()).unwrap();
        String::from_utf8_lossy(&req).into_owned()
    });
    (url, handle)
}

#[test]
fn ollama_lists_models_and_chats() {
    let (url, h) = serve_once("200 OK", r#"{"models":[{"name":"gemma3:4b","size":3300000000,"digest":"x"}]}"#);
    let o = Ollama::new(&url, Duration::from_secs(5)).unwrap();
    assert_eq!(o.models().unwrap()[0].name, "gemma3:4b");
    assert!(h.join().unwrap().starts_with("GET /api/tags"));

    let reply = r#"{"model":"gemma3:4b","message":{"role":"assistant","content":"{\"name\":\"x\"}"},"done":true}"#;
    let (url, h) = serve_once("200 OK", reply);
    let o = Ollama::new(&url, Duration::from_secs(5)).unwrap();
    let req = ChatRequest {
        model: "gemma3:4b".into(),
        system: "sys".into(),
        user: "hello".into(),
        images: vec!["AAAA".into()],
        schema: serde_json::json!({"type":"object"}),
        temperature: 0.0,
        seed: Some(42),
    };
    assert_eq!(o.chat(&req).unwrap(), r#"{"name":"x"}"#);
    let raw = h.join().unwrap();
    assert!(raw.starts_with("POST /api/chat"), "{raw}");
    let body: serde_json::Value = serde_json::from_str(&raw[raw.find("\r\n\r\n").unwrap() + 4..]).unwrap();
    assert_eq!(body["stream"], false);
    assert_eq!(body["format"]["type"], "object");
    assert_eq!(body["options"]["seed"], 42);
    assert_eq!(body["messages"][0]["role"], "system");
    assert_eq!(body["messages"][1]["images"][0], "AAAA");
}

#[test]
fn ollama_errors_are_plain() {
    let (url, h) = serve_once("404 Not Found", r#"{"error":"model 'llava:7b' not found"}"#);
    let o = Ollama::new(&url, Duration::from_secs(5)).unwrap();
    let req = ChatRequest { model: "llava:7b".into(), ..Default::default() };
    let err = o.chat(&req).unwrap_err();
    assert!(err.contains("ollama pull llava:7b"), "{err}");
    h.join().unwrap();

    // Nothing listening on this port.
    let port = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
    let o = Ollama::new(&format!("http://127.0.0.1:{port}"), Duration::from_secs(5)).unwrap();
    assert!(o.models().unwrap_err().contains("isn't running"));
}

// ---------- whitelists ----------

#[test]
fn builtin_whitelists_are_valid_and_guess_sensibly() {
    for w in whitelist::builtins() {
        whitelist::validate(&w).unwrap();
    }
    let w = whitelist::builtins().remove(0);
    let g = |kind, ext: &str, name: &str| w.guess(kind, ext, &hints::words(name));
    assert_eq!(g(Kind::Pdf, "pdf", "Invoice_2024-03"), ("Documents".into(), "Finance".into()));
    assert_eq!(g(Kind::Text, "rs", "main"), ("Code".into(), "".into()));
    assert_eq!(g(Kind::Image, "jpg", "IMG_2041"), ("Images".into(), "Photos".into()));
    assert_eq!(g(Kind::Image, "png", "Screen Shot 2024-01-02 at 10.00.00"), ("Images".into(), "Screenshots".into()));
    assert_eq!(g(Kind::Unknown, "xyz", "thing"), ("Other".into(), "".into()));
    assert_eq!(w.canonical("documents", "FINANCE"), Some(("Documents".into(), "Finance".into())));
    assert_eq!(w.canonical("Documents", "Nope"), None);
    assert!(w.describe().contains("- Documents (letters"));
}

#[test]
fn whitelist_validation() {
    let mut w = whitelist::builtins().remove(1);
    w.categories[0].name = "CON".into();
    assert!(whitelist::validate(&w).unwrap_err().contains("reserved"));
    let mut w = whitelist::builtins().remove(1);
    w.categories[0].name = "Docs: old".into();
    assert!(whitelist::validate(&w).is_err());
    let mut w = whitelist::builtins().remove(1);
    w.categories[1].name = "documents".into();
    assert!(whitelist::validate(&w).unwrap_err().contains("twice"));
    let mut w = whitelist::builtins().remove(1);
    w.fallback = "Misc".into();
    assert!(whitelist::validate(&w).unwrap_err().contains("fallback"));

    let db = Db::open_in_memory().unwrap();
    assert_eq!(whitelist::load_all(&db).unwrap(), whitelist::builtins());
    let mut lists = whitelist::builtins();
    lists[1].name = "Mine".into();
    whitelist::save_all(&db, &lists).unwrap();
    assert_eq!(whitelist::active(&db, "simple").unwrap().name, "Mine");
    assert_eq!(whitelist::active(&db, "gone").unwrap().id, "general");
    assert!(whitelist::save_all(&db, &[]).is_err());
}

// ---------- hints ----------

#[test]
fn words_split_names() {
    assert_eq!(hints::words("IMG_2041"), vec!["img"]);
    assert_eq!(hints::words("FinalReport-v2 (copy)"), vec!["final", "report", "v2", "copy"]);
    assert_eq!(hints::words("2024-03-01 invoice ACME"), vec!["invoice", "acme"]);
}

#[test]
fn similar_decisions_rank_and_dedupe() {
    let db = Db::open_in_memory().unwrap();
    hints::record(
        &db,
        &[
            decision("acme-invoice-0001.pdf", "Documents", "Finance", "Acme Invoice 0001.pdf", Some("acme.com")),
            decision("acme-invoice-0002.pdf", "Documents", "Finance", "Acme Invoice 0002.pdf", Some("acme.com")),
            decision("holiday.jpg", "Images", "Photos", "Holiday.jpg", None),
            decision("meeting notes.txt", "Documents", "Work", "Meeting Notes.txt", None),
        ],
    )
    .unwrap();
    assert_eq!(hints::count(&db).unwrap(), 4);
    let probe = Probe { name: "acme-invoice-0003.pdf", ext: "pdf", kind: Kind::Pdf, domain: Some("acme.com") };
    let found = hints::similar(&db, "general", &probe, 5).unwrap();
    assert_eq!(found.len(), 1, "one per destination: {found:?}");
    assert_eq!(found[0].decision.subcategory, "Finance");
    assert!(found[0].score >= hints::STRONG);
    // Same extension alone isn't similar.
    let probe = Probe { name: "random.pdf", ext: "pdf", kind: Kind::Pdf, domain: None };
    assert!(hints::similar(&db, "general", &probe, 5).unwrap().is_empty());
    // Other whitelists don't see these.
    let probe = Probe { name: "acme-invoice-0003.pdf", ext: "pdf", kind: Kind::Pdf, domain: Some("acme.com") };
    assert!(hints::similar(&db, "simple", &probe, 5).unwrap().is_empty());
    hints::clear(&db).unwrap();
    assert_eq!(hints::count(&db).unwrap(), 0);
}

// ---------- media ----------

#[test]
fn media_tags_make_library_names() {
    let json = serde_json::json!({
        "format": { "tags": { "TITLE": "So What", "ARTIST": "Miles Davis", "album": "Kind of Blue", "track": "1/5", "date": "1959-08-17" } }
    });
    let t = media::from_ffprobe(&json);
    assert_eq!(t.track, Some(1));
    assert_eq!(t.year.as_deref(), Some("1959"));
    assert_eq!(media::library_name(Kind::Audio, &t).unwrap().0, "Miles Davis - Kind of Blue - 01 - So What");

    let single = MediaTags { title: Some("Song: Live?".into()), artist: Some("AC/DC".into()), ..Default::default() };
    assert_eq!(media::library_name(Kind::Audio, &single).unwrap().0, "AC-DC - Song - Live");

    let ep = MediaTags {
        show: Some("Show".into()),
        season: Some(1),
        episode: Some(2),
        title: Some("Pilot".into()),
        ..Default::default()
    };
    assert_eq!(media::library_name(Kind::Video, &ep).unwrap(), ("Show - S01E02 - Pilot".into(), Some("TV")));
    let film = MediaTags { title: Some("Big Film".into()), year: Some("1999".into()), ..Default::default() };
    assert_eq!(media::library_name(Kind::Video, &film).unwrap(), ("Big Film (1999)".into(), Some("Movies")));
    assert!(media::library_name(Kind::Audio, &MediaTags::default()).is_none());
    assert!(media::library_name(Kind::Pdf, &film).is_none());
    // Stream-level tags count too (Ogg/Opus keep them there).
    let ogg = serde_json::json!({ "format": {}, "streams": [{ "tags": { "title": "T", "artist": "A" } }] });
    assert_eq!(media::library_name(Kind::Audio, &media::from_ffprobe(&ogg)).unwrap().0, "A - T");
}

// ---------- suggestions ----------

#[test]
fn ai_off_uses_hints_then_whitelist() {
    let e = env(&[("acme-invoice-0003.pdf", b"%PDF"), ("IMG_2041.jpg", b"x"), ("notes.txt", b"hello")]);
    hints::record(&e.db, &[decision("acme-invoice-0001.pdf", "Documents", "Work", "Acme 1.pdf", None)]).unwrap();
    let settings = AiSettings::default();
    let s = e.suggester(&settings, None);
    let a = s.suggest(&e.entry("acme-invoice-0003.pdf"));
    assert_eq!((a.category.as_str(), a.subcategory.as_str(), a.source), ("Documents", "Work", Source::Hint));
    assert_eq!(a.new_name, "acme-invoice-0003.pdf", "names stay without AI");
    let b = s.suggest(&e.entry("IMG_2041.jpg"));
    assert_eq!((b.category.as_str(), b.subcategory.as_str(), b.source), ("Images", "Photos", Source::Guess));
    let c = s.suggest(&e.entry("notes.txt"));
    assert_eq!(c.category, "Documents");
}

#[test]
fn model_answer_is_validated_and_named() {
    let e = env(&[("doc1.txt", b"Quarterly revenue report for ACME, Q3 2024")]);
    let fake = Fake::ok(
        serde_json::json!({"category":"documents","subcategory":"work","name":"ACME Q3: Revenue/Report","reason":"A business report."}),
    );
    let settings = on(Mode::Consistent);
    let s = e.suggester(&settings, Some(&fake)).suggest(&e.entry("doc1.txt"));
    assert_eq!((s.category.as_str(), s.subcategory.as_str(), s.source), ("Documents", "Work", Source::Ai));
    assert_eq!(s.new_name, "ACME Q3 - Revenue-Report.txt");
    let req = fake.last();
    assert_eq!(req.model, settings.text_model);
    assert_eq!(req.temperature, 0.0);
    assert_eq!(req.seed, Some(42));
    assert!(req.system.contains("- Documents"), "{}", req.system);
    assert!(req.system.contains("Never invent"));
    assert!(req.user.contains("Quarterly revenue report"));
    assert_eq!(req.schema["properties"]["category"]["enum"][0], "Documents");
}

#[test]
fn modes_handle_unknown_subcategories_differently() {
    let e = env(&[("a.txt", b"recipe for pancakes")]);
    let fake = Fake::ok(
        serde_json::json!({"category":"Documents","subcategory":"Recipes","name":"Pancake Recipe","reason":"r"}),
    );
    let consistent = on(Mode::Consistent);
    let s = e.suggester(&consistent, Some(&fake)).suggest(&e.entry("a.txt"));
    assert_eq!((s.subcategory.as_str(), s.new_subcategory), ("", false));
    let refined = on(Mode::Refined);
    let s = e.suggester(&refined, Some(&fake)).suggest(&e.entry("a.txt"));
    assert_eq!((s.subcategory.as_str(), s.new_subcategory), ("Recipes", true));
    assert_eq!(fake.last().temperature, 0.4);
    assert!(fake.last().system.contains("a new short one"));
}

#[test]
fn consistent_mode_trusts_a_strong_hint_over_the_model() {
    let e = env(&[("acme-invoice-0009.pdf", b"%PDF")]);
    hints::record(&e.db, &[decision("acme-invoice-0001.pdf", "Documents", "Finance", "Acme Invoice 0001.pdf", None)])
        .unwrap();
    let fake =
        Fake::ok(serde_json::json!({"category":"Other","subcategory":"","name":"Acme Invoice 0009","reason":"r"}));
    let consistent = on(Mode::Consistent);
    let s = e.suggester(&consistent, Some(&fake)).suggest(&e.entry("acme-invoice-0009.pdf"));
    assert_eq!((s.category.as_str(), s.subcategory.as_str()), ("Documents", "Finance"));
    assert_eq!(s.new_name, "Acme Invoice 0009.pdf", "the model still names it");
    assert!(s.reason.contains("earlier"));
    assert!(fake.last().system.contains("\"acme-invoice-0001.pdf\" -> Documents / Finance"));
    // Refined lets the model decide.
    let refined = on(Mode::Refined);
    let s = e.suggester(&refined, Some(&fake)).suggest(&e.entry("acme-invoice-0009.pdf"));
    assert_eq!(s.category, "Other");
}

#[test]
fn model_failure_falls_back_with_a_warning() {
    let e = env(&[("IMG_1.jpg", b"x")]);
    let fake = Fake::err("Ollama isn't running");
    let settings = on(Mode::Consistent);
    let s = e.suggester(&settings, Some(&fake)).suggest(&e.entry("IMG_1.jpg"));
    assert_eq!((s.category.as_str(), s.source), ("Images", Source::Guess));
    assert!(s.warning.unwrap().contains("isn't running"));
    let bad_json = Fake { reply: Ok("not json".into()), seen: Mutex::new(vec![]) };
    let s = e.suggester(&settings, Some(&bad_json)).suggest(&e.entry("IMG_1.jpg"));
    assert!(s.warning.unwrap().contains("valid JSON"));
    let off_list = Fake::ok(serde_json::json!({"category":"Food","subcategory":"","name":"x","reason":"r"}));
    let s = e.suggester(&settings, Some(&off_list)).suggest(&e.entry("IMG_1.jpg"));
    assert_eq!(s.category, "Images");
    assert!(s.warning.unwrap().contains("isn't in the whitelist"));
}

#[test]
fn rename_only_never_moves() {
    let e = env(&[("scan001.txt", b"lease agreement")]);
    let fake = Fake::ok(serde_json::json!({"name":"Lease Agreement","reason":"r"}));
    let settings = AiSettings { rename_only: true, ..on(Mode::Consistent) };
    let s = e.suggester(&settings, Some(&fake)).suggest(&e.entry("scan001.txt"));
    assert_eq!((s.category.as_str(), s.new_name.as_str()), ("", "Lease Agreement.txt"));
    let req = fake.last();
    assert!(req.schema["properties"].get("category").is_none());
    assert!(!req.system.contains("Categories"));
}

fn png(w: u32, h: u32) -> Vec<u8> {
    let mut out = std::io::Cursor::new(Vec::new());
    ::image::DynamicImage::new_rgb8(w, h).write_to(&mut out, ::image::ImageFormat::Png).unwrap();
    out.into_inner()
}

#[test]
fn images_go_to_the_vision_model_and_screenshots_are_special() {
    let shot = png(1440, 900);
    let photo = png(40, 30);
    let e = env(&[("Untitled.png", &shot), ("cat.png", &photo), ("Screenshot 2024-05-01.png", &photo)]);
    let fake = Fake::ok(
        serde_json::json!({"category":"Images","subcategory":"Screenshots","name":"Figma - Checkout Flow","reason":"r"}),
    );
    let settings = on(Mode::Consistent);
    let sg = e.suggester(&settings, Some(&fake));

    let s = sg.suggest(&e.entry("Untitled.png"));
    assert!(s.screenshot, "screen-sized PNG");
    let req = fake.last();
    assert_eq!(req.model, settings.vision_model);
    assert_eq!(req.images.len(), 1);
    assert!(req.user.contains("screenshot"));
    let jpeg = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &req.images[0]).unwrap();
    let img = ::image::load_from_memory(&jpeg).unwrap();
    assert!(img.width() <= super::facts::IMAGE_PX && img.height() <= super::facts::IMAGE_PX);

    let s = sg.suggest(&e.entry("cat.png"));
    assert!(!s.screenshot);
    assert!(!fake.last().user.contains("screenshot"));
    assert!(sg.suggest(&e.entry("Screenshot 2024-05-01.png")).screenshot, "by name");

    // AI off: screenshots still land in Screenshots.
    let off = AiSettings::default();
    let s = e.suggester(&off, None).suggest(&e.entry("Untitled.png"));
    assert_eq!((s.category.as_str(), s.subcategory.as_str()), ("Images", "Screenshots"));
    // Pixels are only sent when allowed.
    let no_pixels = AiSettings { analyze_images: false, ..on(Mode::Consistent) };
    e.suggester(&no_pixels, Some(&fake)).suggest(&e.entry("cat.png"));
    assert!(fake.last().images.is_empty());
    assert_eq!(fake.last().model, no_pixels.text_model);
}

#[test]
fn names_are_cleaned_for_every_os() {
    assert_eq!(clean_part("  A: b/c\\d  "), "A - b-c-d");
    assert_eq!(clean_part("what?*<>\"now"), "whatnow");
    assert_eq!(clean_part("...hidden. "), "hidden");
    assert_eq!(clean_part("CON"), "");
    assert_eq!(clean_part(&"x".repeat(300)).len(), 100);
    let e = env(&[("a.txt", b"x")]);
    let fake = Fake::ok(serde_json::json!({"category":"Documents","subcategory":"","name":"???","reason":""}));
    let settings = on(Mode::Consistent);
    assert_eq!(
        e.suggester(&settings, Some(&fake)).suggest(&e.entry("a.txt")).new_name,
        "a.txt",
        "nothing usable: keep"
    );
}

// ---------- review -> plan -> journal ----------

fn approved(path: &Path, cat: &str, sub: &str, name: &str) -> Approved {
    Approved {
        path: path.to_string_lossy().into_owned(),
        category: cat.into(),
        subcategory: sub.into(),
        new_name: name.into(),
        source: "ai".into(),
        domain: None,
    }
}

#[test]
fn approved_items_become_an_undoable_plan_and_hints() {
    let e = env(&[("a.pdf", b"a"), ("b.pdf", b"b"), ("c.txt", b"c"), ("d.txt", b"d")]);
    std::fs::create_dir_all(e.root.join("Documents/Finance")).unwrap();
    std::fs::write(e.root.join("Documents/Finance/Invoice.pdf"), b"old").unwrap();
    let scope = Scope::new();
    scope.add_root(&e.root).unwrap();
    let items = vec![
        approved(&e.root.join("a.pdf"), "Documents", "Finance", "Invoice.pdf"),
        approved(&e.root.join("b.pdf"), "Documents", "Finance", "Invoice.pdf"),
        approved(&e.root.join("c.txt"), "", "", "Renamed.txt"),
        approved(&e.root.join("d.txt"), "Bad:Name", "", "d.txt"),
    ];
    let rp = review::plan(&scope, NameRules::Linux, &e.root, "general", &items);
    assert!(!rp.plan.is_blocked(), "{:?}", rp.plan.issues);
    assert!(rp.plan.issues.iter().any(|i| i.path.ends_with("d.txt") && i.message.starts_with("skipped")));
    assert_eq!(rp.decisions.len(), 3);
    assert_eq!(rp.decisions[0].new_name, "Invoice (2).pdf");
    assert_eq!(rp.decisions[1].new_name, "Invoice (3).pdf");

    let j = crate::journal::Journal::new(&e.db, &scope, crate::platform::current());
    let id = j.save(&rp.plan).unwrap();
    review::save_pending(&e.db, id, &rp.decisions).unwrap();
    assert_eq!(hints::count(&e.db).unwrap(), 0, "nothing remembered before applying");
    let r = j.apply(id).unwrap();
    assert_eq!(r.status, "applied", "{r:?}");
    assert_eq!(review::commit_pending(&e.db, id).unwrap(), 3);
    assert_eq!(review::commit_pending(&e.db, id).unwrap(), 0, "only once");
    assert_eq!(std::fs::read(e.root.join("Documents/Finance/Invoice (2).pdf")).unwrap(), b"a");
    assert_eq!(std::fs::read(e.root.join("Documents/Finance/Invoice (3).pdf")).unwrap(), b"b");
    assert!(e.root.join("Renamed.txt").exists());
    assert_eq!(std::fs::read(e.root.join("Documents/Finance/Invoice.pdf")).unwrap(), b"old", "never overwritten");

    let r = j.undo().unwrap().unwrap();
    assert_eq!(r.status, "undone");
    assert!(e.root.join("a.pdf").exists() && e.root.join("c.txt").exists());

    // The approved decisions now steer the next suggestion without AI.
    std::fs::write(e.root.join("Invoice-77.pdf"), b"x").unwrap();
    let settings = AiSettings::default();
    let s = e.suggester(&settings, None).suggest(&e.entry("Invoice-77.pdf"));
    assert_eq!((s.category.as_str(), s.subcategory.as_str(), s.source), ("Documents", "Finance", Source::Hint));
}

#[test]
fn unchanged_items_are_left_out() {
    let e = env(&[("same.txt", b"x")]);
    let scope = Scope::new();
    scope.add_root(&e.root).unwrap();
    let rp = review::plan(
        &scope,
        NameRules::Linux,
        &e.root,
        "general",
        &[approved(&e.root.join("same.txt"), "", "", "same.txt")],
    );
    assert!(rp.plan.ops.is_empty());
    assert!(rp.decisions.is_empty());
}
