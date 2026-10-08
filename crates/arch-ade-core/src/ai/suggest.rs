//! One suggestion per file: category, subcategory and a new name, with
//! where it came from. Suggestions are only shown for review; nothing here
//! touches the file.

use serde::{Deserialize, Serialize};

use super::facts::{self, FileFacts};
use super::hints::{self, Hint, Probe};
use super::media;
use super::ollama::{ChatRequest, Llm};
use super::whitelist::{folder_name_ok, Whitelist};
use super::{AiSettings, Mode};
use crate::db::Db;
use crate::kind::Kind;
use crate::names::{self, NameRules};
use crate::preview::Ctx;
use crate::scan::FileEntry;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Source {
    /// The local model.
    Ai,
    /// A past approved decision for a similar file.
    Hint,
    /// Embedded audio/video tags.
    Media,
    /// The whitelist's kind/extension/keyword mapping.
    Guess,
}

impl Source {
    pub fn as_str(self) -> &'static str {
        match self {
            Source::Ai => "ai",
            Source::Hint => "hint",
            Source::Media => "media",
            Source::Guess => "guess",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Suggestion {
    pub path: String,
    pub name: String,
    pub kind: Kind,
    pub category: String,
    pub subcategory: String,
    /// Full new name including the extension (may equal `name`).
    pub new_name: String,
    pub source: Source,
    pub reason: String,
    /// Refined mode proposed a subcategory the whitelist doesn't have yet.
    pub new_subcategory: bool,
    pub screenshot: bool,
    /// Something went wrong with the preferred source (e.g. the model).
    pub warning: Option<String>,
    pub domain: Option<String>,
}

pub struct Suggester<'a> {
    pub db: &'a Db,
    pub ctx: Ctx<'a>,
    pub settings: &'a AiSettings,
    pub whitelist: &'a Whitelist,
    /// `None` when the AI is off or Ollama isn't reachable.
    pub llm: Option<&'a dyn Llm>,
}

/// What the model must answer.
#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Reply {
    category: String,
    subcategory: String,
    name: String,
    reason: String,
}

impl Suggester<'_> {
    pub fn suggest(&self, e: &FileEntry) -> Suggestion {
        let want_image = self.llm.is_some() && self.settings.analyze_images;
        let f = facts::gather(e, &self.ctx, want_image);
        let probe = Probe { name: &f.name, ext: &f.ext, kind: f.kind, domain: f.domain.as_deref() };
        let hints = hints::similar(self.db, &self.whitelist.id, &probe, 5).unwrap_or_default();
        let (gcat, gsub) = self.guess(&f);
        let mut s = Suggestion {
            path: e.path.clone(),
            name: e.name.clone(),
            kind: e.kind,
            category: gcat,
            subcategory: gsub,
            new_name: e.name.clone(),
            source: Source::Guess,
            reason: format!("{} file", e.kind_label),
            new_subcategory: false,
            screenshot: f.screenshot,
            warning: None,
            domain: f.domain.clone(),
        };
        if let Some(h) = hints.first() {
            self.apply_hint(&mut s, h);
        }

        // Tagged music and video get library names without any model.
        if let Some((stem, sub)) = media::library_name(f.kind, &f.media) {
            s.new_name = with_ext(&stem, &f.ext);
            s.source = Source::Media;
            s.reason = "from the file's embedded tags".into();
            if let Some((c, sub)) = sub.and_then(|sub| self.whitelist.canonical(&s.category, sub)) {
                s.category = c;
                s.subcategory = sub;
            }
            return self.finish(s);
        }

        if let Some(llm) = self.llm {
            match self.ask(llm, &f, &hints) {
                Ok(r) => self.apply_reply(&mut s, r, &f, &hints),
                Err(err) => s.warning = Some(format!("AI: {err}")),
            }
        }
        self.finish(s)
    }

    fn guess(&self, f: &FileFacts) -> (String, String) {
        let (cat, sub) = self.whitelist.guess(f.kind, &f.ext, &f.words);
        if f.screenshot && sub.is_empty() {
            if let Some((c, s)) = self.whitelist.canonical(&cat, "Screenshots") {
                return (c, s);
            }
        }
        (cat, sub)
    }

    fn apply_hint(&self, s: &mut Suggestion, h: &Hint) {
        if let Some((c, sub)) = self.whitelist.canonical(&h.decision.category, &h.decision.subcategory) {
            s.category = c;
            s.subcategory = sub;
            s.source = Source::Hint;
            s.reason = format!("like {} earlier", h.decision.name);
        }
    }

    fn ask(&self, llm: &dyn Llm, f: &FileFacts, hints: &[Hint]) -> Result<Reply, String> {
        let req = self.request(f, hints);
        let text = llm.chat(&req)?;
        serde_json::from_str::<Reply>(text.trim()).map_err(|e| format!("the model's answer wasn't valid JSON ({e})"))
    }

    /// The prompt for one file. Public for tests.
    pub fn request(&self, f: &FileFacts, hints: &[Hint]) -> ChatRequest {
        let s = self.settings;
        let w = self.whitelist;
        let refined = s.mode == Mode::Refined;
        let mut sys = String::from(
            "You help one person tidy their files. You see one file at a time and answer with JSON only.\n",
        );
        if !s.rename_only {
            sys.push_str("Categories (use these exact names):\n");
            sys.push_str(&w.describe());
            sys.push_str(&format!(
                "\n- \"category\": one of the categories above; \"{}\" if nothing fits.\n",
                w.fallback
            ));
            sys.push_str(if refined {
                "- \"subcategory\": the best of that category's subcategories; if none fits well, a new short one (1-3 words, Title Case); \"\" if the category has none and none is needed.\n"
            } else {
                "- \"subcategory\": exactly one of that category's subcategories, or \"\" if none fits. Never invent one.\n"
            });
        }
        sys.push_str(if refined {
            "- \"name\": a descriptive file name WITHOUT extension, 3-8 words, Title Case, naming the main subject; start with a date as YYYY-MM-DD if the content shows one.\n"
        } else {
            "- \"name\": a short file name WITHOUT extension, 2-6 words, Title Case, in the same style as the examples.\n"
        });
        sys.push_str(
            "  Keep dates, version numbers or IDs from the original name that identify the file. No slashes, colons or emoji.\n- \"reason\": one short sentence.\n",
        );
        if !hints.is_empty() {
            sys.push_str("\nThe person's earlier decisions for similar files (follow them):\n");
            for h in hints {
                let d = &h.decision;
                let dest = if d.subcategory.is_empty() {
                    d.category.clone()
                } else {
                    format!("{} / {}", d.category, d.subcategory)
                };
                sys.push_str(&format!("- \"{}\" -> {dest}, named \"{}\"\n", d.name, d.new_name));
            }
        }

        let mut user = format!("File name: {}\nKind: {}\nSize: {}\n", f.name, f.kind.label(), human_size(f.size));
        if let Some(ms) = f.modified {
            if let Some(d) = chrono::DateTime::from_timestamp_millis(ms) {
                user.push_str(&format!("Modified: {}\n", d.format("%Y-%m-%d")));
            }
        }
        if let Some(d) = &f.domain {
            user.push_str(&format!("Downloaded from: {d}\n"));
        }
        if let Some(a) = &f.app {
            user.push_str(&format!("Downloaded with: {a}\n"));
        }
        if let Some((w, h)) = f.dims {
            user.push_str(&format!("Image size: {w}x{h}\n"));
        }
        let image = f.image_b64.clone();
        if f.screenshot {
            user.push_str(
                "This is a screenshot / UI capture. Name it after the app or website shown and what it shows (for example \"Figma - Checkout Flow Review\"); put it under Screenshots if that subcategory exists.\n",
            );
        } else if image.is_some() {
            user.push_str("The image is attached. Describe its main subject in the name.\n");
        }
        if let Some(t) = &f.text {
            user.push_str(&format!("Content (start of file):\n\"\"\"\n{t}\n\"\"\"\n"));
        }

        let mut props = serde_json::json!({
            "name": { "type": "string" },
            "reason": { "type": "string" },
        });
        let mut required = vec!["name", "reason"];
        if !s.rename_only {
            let cats: Vec<&str> = w.categories.iter().map(|c| c.name.as_str()).collect();
            props["category"] = serde_json::json!({ "type": "string", "enum": cats });
            props["subcategory"] = serde_json::json!({ "type": "string" });
            required.extend(["category", "subcategory"]);
        }
        ChatRequest {
            model: if image.is_some() { s.vision_model.clone() } else { s.text_model.clone() },
            system: sys,
            user,
            images: image.into_iter().collect(),
            schema: serde_json::json!({ "type": "object", "properties": props, "required": required }),
            temperature: if refined { 0.4 } else { 0.0 },
            seed: (!refined).then_some(42),
        }
    }

    fn apply_reply(&self, s: &mut Suggestion, r: Reply, f: &FileFacts, hints: &[Hint]) {
        let w = self.whitelist;
        s.source = Source::Ai;
        s.reason = r.reason.trim().chars().take(200).collect();
        let stem = clean_part(&r.name);
        if !stem.is_empty() {
            s.new_name = with_ext(&stem, &f.ext);
        }
        if self.settings.rename_only {
            return;
        }
        let strong = hints.first().filter(|h| h.score >= hints::STRONG);
        if self.settings.mode == Mode::Consistent {
            if let Some(h) = strong {
                // A close earlier decision outranks the model's guess.
                if let Some((c, sub)) = w.canonical(&h.decision.category, &h.decision.subcategory) {
                    if !c.eq_ignore_ascii_case(r.category.trim()) || !sub.eq_ignore_ascii_case(r.subcategory.trim()) {
                        s.reason = format!("like {} earlier", h.decision.name);
                    }
                    s.category = c;
                    s.subcategory = sub;
                    return;
                }
            }
        }
        match w.canonical(&r.category, &r.subcategory) {
            Some((c, sub)) => {
                s.category = c;
                s.subcategory = sub;
            }
            None => match w.category(&r.category) {
                // Known category, unknown subcategory.
                Some(c) => {
                    let proposed = clean_part(&r.subcategory);
                    s.category = c.name.clone();
                    if self.settings.mode == Mode::Refined && folder_name_ok(&proposed).is_ok() {
                        s.subcategory = proposed;
                        s.new_subcategory = true;
                    } else {
                        s.subcategory = String::new();
                    }
                }
                None => s.warning = Some(format!("AI picked {:?}, which isn't in the whitelist", r.category)),
            },
        }
    }

    fn finish(&self, mut s: Suggestion) -> Suggestion {
        if self.settings.rename_only {
            s.category.clear();
            s.subcategory.clear();
            s.new_subcategory = false;
        }
        if names::validate(NameRules::Windows, &s.new_name).is_err()
            || names::validate(NameRules::Linux, &s.new_name).is_err()
        {
            s.new_name = s.name.clone();
        }
        s
    }
}

pub fn with_ext(stem: &str, ext: &str) -> String {
    if ext.is_empty() {
        stem.to_string()
    } else {
        format!("{stem}.{ext}")
    }
}

/// One safe name part from free text (a model's answer or a media tag):
/// no path separators or characters any OS rejects, single spaces, no
/// leading/trailing dots or spaces, at most 100 characters. Empty if
/// nothing usable is left.
pub fn clean_part(s: &str) -> String {
    let mut out = String::new();
    for ch in s.chars() {
        match ch {
            ':' => out.push_str(" -"),
            '/' | '\\' | '|' => out.push('-'),
            '<' | '>' | '"' | '?' | '*' => {}
            c if c.is_control() => out.push(' '),
            c => out.push(c),
        }
    }
    let squeezed = out.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed: String = squeezed.trim_matches(|c: char| c == '.' || c == ' ' || c == '-').chars().take(100).collect();
    let trimmed = trimmed.trim_end_matches(['.', ' ']).to_string();
    if names::validate(NameRules::Windows, &trimmed).is_err() {
        return String::new(); // e.g. "CON"
    }
    trimmed
}

fn human_size(n: u64) -> String {
    match n {
        0..1_024 => format!("{n} B"),
        1_024..1_048_576 => format!("{:.0} KB", n as f64 / 1_024.0),
        _ => format!("{:.1} MB", n as f64 / 1_048_576.0),
    }
}
