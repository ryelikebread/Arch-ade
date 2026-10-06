//! The rules engine. A rule is JSON: when a file matches its conditions, its
//! actions turn into [`Intent`]s that the [`Planner`](crate::plan::Planner)
//! checks and orders into a normal dry-run plan. Rules never touch disk
//! themselves; everything goes through the plan and the journal, so every
//! rule run can be previewed and undone.
//!
//! Rules run top to bottom and the first matching rule wins for each file.
//! Only files directly inside the folder being organized are considered
//! (not folders, not hidden files, not downloads still in progress).

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Datelike, Local, TimeZone};
use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};

use crate::kind::Kind;
use crate::names::{self, NameRules};
use crate::plan::{Action as PlanAction, Intent};
use crate::scan::FileEntry;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub enabled: bool,
    /// Also run by the folder watcher on new files, not only on demand.
    #[serde(default)]
    pub auto: bool,
    /// Templates that make several rules (e.g. Organize Downloads) share a group.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
    /// Folders this rule applies to (absolute, or `{downloads}`-style). Empty
    /// means any folder.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub folders: Vec<String>,
    #[serde(default, rename = "match")]
    pub match_mode: MatchMode,
    pub conditions: Vec<Condition>,
    pub actions: Vec<RuleAction>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MatchMode {
    #[default]
    All,
    Any,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Condition {
    #[serde(flatten)]
    pub test: Test,
    /// Invert this condition.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub not: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Test {
    /// File kind as shown in the Kind column.
    Kind { kinds: Vec<Kind> },
    /// Extension without the dot, case-insensitive.
    Extension { extensions: Vec<String> },
    /// Download URL's domain (or the referrer's) is one of these or a subdomain.
    SourceDomain { domains: Vec<String> },
    /// Regex on the download URL or referrer.
    SourceUrl { pattern: String },
    /// Downloading app. Reported by macOS; elsewhere inferred from the URL domain.
    App { apps: Vec<String> },
    /// Size bounds: numbers are bytes, strings may use KB/MB/GB ("10 MB").
    Size {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        at_least: Option<SizeValue>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        at_most: Option<SizeValue>,
    },
    /// Age in days. `date` picks which date; `added` falls back to created,
    /// then modified, on systems that don't record when a file was added.
    Age {
        #[serde(default)]
        date: AgeDate,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        older_than_days: Option<f64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        newer_than_days: Option<f64>,
    },
    /// Regex on the file name (with extension).
    NameRegex {
        pattern: String,
        #[serde(default, skip_serializing_if = "std::ops::Not::not")]
        case_sensitive: bool,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SizeValue {
    Bytes(u64),
    Text(String),
}

impl SizeValue {
    pub fn bytes(&self) -> Result<u64, String> {
        match self {
            SizeValue::Bytes(b) => Ok(*b),
            SizeValue::Text(t) => parse_size(t),
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AgeDate {
    #[default]
    Added,
    Created,
    Modified,
    Downloaded,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum RuleAction {
    /// Move into a folder (relative paths are inside the folder being organized).
    Move {
        to: String,
        #[serde(default)]
        if_exists: IfExists,
    },
    Copy {
        to: String,
        #[serde(default)]
        if_exists: IfExists,
    },
    /// New name from a pattern: `{original}`, `{ext}`, `{date}`, `{date:%Y}`.
    Rename { pattern: String },
    /// Add file tags (Finder tags on macOS, `user.xdg.tags` on Linux).
    Tag { tags: Vec<String> },
    /// Move to the OS trash.
    Trash,
    /// Zip into a folder as `<name>.zip`; the original stays unless
    /// `removeOriginal` is set, in which case it goes to the trash.
    Archive {
        to: String,
        #[serde(default)]
        remove_original: bool,
        #[serde(default)]
        if_exists: IfExists,
    },
}

/// What to do when the target name is taken.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum IfExists {
    /// Add " (2)", " (3)"... to the name.
    #[default]
    Rename,
    /// Leave the file where it is.
    Skip,
}

/// Rules with regexes and sizes parsed once.
pub struct Compiled<'r> {
    rule: &'r Rule,
    tests: Vec<(CompiledTest<'r>, bool)>,
}

enum CompiledTest<'r> {
    Plain(&'r Test),
    Regex { re: Regex, on_name: bool },
    Size { min: Option<u64>, max: Option<u64> },
}

pub fn validate(rule: &Rule) -> Result<Compiled<'_>, String> {
    let ctx = |m: String| format!("{}: {m}", rule.name);
    if rule.id.trim().is_empty() {
        return Err(ctx("needs an id".into()));
    }
    if rule.conditions.is_empty() {
        return Err(ctx("needs at least one condition".into()));
    }
    if rule.actions.is_empty() {
        return Err(ctx("needs at least one action".into()));
    }
    let mut tests = Vec::new();
    for c in &rule.conditions {
        let t = match &c.test {
            Test::SourceUrl { pattern } => {
                CompiledTest::Regex { re: regex(pattern, false).map_err(ctx)?, on_name: false }
            }
            Test::NameRegex { pattern, case_sensitive } => {
                CompiledTest::Regex { re: regex(pattern, *case_sensitive).map_err(ctx)?, on_name: true }
            }
            Test::Size { at_least, at_most } => {
                let min = at_least.as_ref().map(SizeValue::bytes).transpose().map_err(ctx)?;
                let max = at_most.as_ref().map(SizeValue::bytes).transpose().map_err(ctx)?;
                if min.is_none() && max.is_none() {
                    return Err(ctx("size condition needs atLeast or atMost".into()));
                }
                CompiledTest::Size { min, max }
            }
            Test::Age { older_than_days, newer_than_days, .. } => {
                if older_than_days.is_none() && newer_than_days.is_none() {
                    return Err(ctx("age condition needs olderThanDays or newerThanDays".into()));
                }
                if older_than_days.iter().chain(newer_than_days).any(|d| !d.is_finite() || *d < 0.0) {
                    return Err(ctx("age must be a positive number of days".into()));
                }
                CompiledTest::Plain(&c.test)
            }
            Test::Kind { kinds } if kinds.is_empty() => return Err(ctx("kind condition lists no kinds".into())),
            Test::Kind { kinds } if kinds.contains(&Kind::Folder) => {
                return Err(ctx("rules only act on files, not folders".into()))
            }
            Test::Extension { extensions: v } | Test::SourceDomain { domains: v } | Test::App { apps: v }
                if v.is_empty() =>
            {
                return Err(ctx("condition has an empty list".into()))
            }
            _ => CompiledTest::Plain(&c.test),
        };
        tests.push((t, c.not));
    }
    let mut terminal = 0;
    let mut renames = 0;
    for a in &rule.actions {
        match a {
            RuleAction::Move { to, .. } | RuleAction::Copy { to, .. } | RuleAction::Archive { to, .. } => {
                if to.trim().is_empty() {
                    return Err(ctx("destination folder is empty".into()));
                }
                if matches!(a, RuleAction::Move { .. }) {
                    terminal += 1;
                }
            }
            RuleAction::Trash => terminal += 1,
            RuleAction::Rename { pattern } => {
                renames += 1;
                let tokens = crate::rename::parse(pattern).map_err(ctx)?;
                if tokens.iter().any(|t| matches!(t, crate::rename::Token::Number { .. })) {
                    return Err(ctx("{n} numbering is for mass rename; rules rename one file at a time".into()));
                }
            }
            RuleAction::Tag { tags } => {
                crate::tags::clean(tags).map_err(ctx)?;
            }
        }
    }
    let removes = rule.actions.iter().any(|a| matches!(a, RuleAction::Archive { remove_original: true, .. }));
    if terminal + usize::from(removes) > 1 {
        return Err(ctx("only one of move, trash or archive-and-remove per rule".into()));
    }
    if renames > 1 {
        return Err(ctx("only one rename per rule".into()));
    }
    if rule.actions.iter().any(|a| matches!(a, RuleAction::Trash)) && renames > 0 {
        return Err(ctx("renaming a file that goes to the trash has no effect".into()));
    }
    Ok(Compiled { rule, tests })
}

fn regex(pattern: &str, case_sensitive: bool) -> Result<Regex, String> {
    RegexBuilder::new(pattern)
        .case_insensitive(!case_sensitive)
        .size_limit(1 << 20)
        .build()
        .map_err(|e| format!("bad pattern {pattern:?}: {e}"))
}

pub fn parse_size(text: &str) -> Result<u64, String> {
    let t = text.trim().to_ascii_lowercase().replace(' ', "");
    let split = t.find(|c: char| !(c.is_ascii_digit() || c == '.')).unwrap_or(t.len());
    let (num, unit) = t.split_at(split);
    let n: f64 = num.parse().map_err(|_| format!("can't read size {text:?}"))?;
    let mult: f64 = match unit {
        "" | "b" => 1.0,
        "k" | "kb" => 1e3,
        "m" | "mb" => 1e6,
        "g" | "gb" => 1e9,
        "kib" => 1024.0,
        "mib" => 1024.0 * 1024.0,
        "gib" => 1024.0 * 1024.0 * 1024.0,
        _ => return Err(format!("unknown size unit in {text:?}")),
    };
    Ok((n * mult).round() as u64)
}

/// Standard folders a rule can name instead of hardcoding paths.
#[derive(Clone, Debug, Default)]
pub struct Places {
    pub home: Option<PathBuf>,
    pub downloads: Option<PathBuf>,
    pub desktop: Option<PathBuf>,
    pub documents: Option<PathBuf>,
    pub pictures: Option<PathBuf>,
}

impl Places {
    /// From the `dirs` crate: the OS's own idea of these folders.
    pub fn system() -> Self {
        Places {
            home: dirs::home_dir(),
            downloads: dirs::download_dir(),
            desktop: dirs::desktop_dir(),
            documents: dirs::document_dir(),
            pictures: dirs::picture_dir(),
        }
    }

    fn get(&self, key: &str) -> Option<&Path> {
        match key {
            "home" => self.home.as_deref(),
            "downloads" => self.downloads.as_deref(),
            "desktop" => self.desktop.as_deref(),
            "documents" => self.documents.as_deref(),
            "pictures" => self.pictures.as_deref(),
            _ => None,
        }
    }

    /// Resolve a rule path: a leading `{home}`-style token, an absolute path,
    /// or a path relative to `base`. Other tokens are filled by `fill`.
    pub fn resolve(&self, text: &str, base: &Path, fill: &dyn Fn(&str) -> Option<String>) -> Result<PathBuf, String> {
        let mut out = String::new();
        let mut rest = text;
        while let Some(open) = rest.find('{') {
            out.push_str(&rest[..open]);
            let close = rest[open..].find('}').ok_or_else(|| format!("unclosed {{ in {text:?}"))? + open;
            let key = &rest[open + 1..close];
            let value = if let Some(p) = self.get(key) {
                if open != 0 || !out.is_empty() {
                    return Err(format!("{{{key}}} must come first in {text:?}"));
                }
                p.to_string_lossy().into_owned()
            } else if let Some(v) = fill(key) {
                // Values from file metadata become one safe path segment.
                v.replace(['/', '\\', ':'], "-")
            } else if self.is_place(key) {
                return Err(format!("this system has no {key} folder"));
            } else {
                return Err(format!("unknown token {{{key}}} in {text:?}"));
            };
            out.push_str(&value);
            rest = &rest[close + 1..];
        }
        out.push_str(rest);
        let p = PathBuf::from(&out);
        if p.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
            return Err(format!("{text:?} may not go up a folder with .."));
        }
        Ok(if p.is_absolute() { p } else { base.join(p) })
    }

    fn is_place(&self, key: &str) -> bool {
        matches!(key, "home" | "downloads" | "desktop" | "documents" | "pictures")
    }
}

impl Rule {
    /// Absolute folders this rule writes into (`{home}/Work`, `/data/x`), up
    /// to the first per-file token. Relative destinations stay inside the
    /// folder being organized and aren't listed. The UI asks the user to
    /// allow these before the rule can run.
    pub fn fixed_destinations(&self, places: &Places) -> Vec<PathBuf> {
        let mut out = Vec::new();
        for a in &self.actions {
            let to = match a {
                RuleAction::Move { to, .. } | RuleAction::Copy { to, .. } | RuleAction::Archive { to, .. } => to,
                _ => continue,
            };
            // Skip a leading {place}, then cut at the next token.
            let skip = if to.starts_with('{') { to.find('}').map_or(0, |i| i + 1) } else { 0 };
            let cut = to[skip..].find('{').map_or(to.len(), |i| skip + i);
            let fixed = to[..cut].trim_end_matches(['/', '\\']);
            if fixed.is_empty() {
                continue;
            }
            // Resolving against a relative base keeps relative paths relative.
            if let Ok(p) = places.resolve(fixed, Path::new(""), &|_| None) {
                if p.is_absolute() && !out.contains(&p) {
                    out.push(p);
                }
            }
        }
        out
    }
}

/// Facts about one file the conditions look at.
pub struct Facts<'a> {
    pub entry: &'a FileEntry,
    /// Unix milliseconds.
    pub now: i64,
}

impl Compiled<'_> {
    pub fn rule(&self) -> &Rule {
        self.rule
    }

    pub fn applies_to_folder(&self, base: &Path, places: &Places) -> bool {
        self.rule.folders.is_empty()
            || self
                .rule
                .folders
                .iter()
                .any(|f| places.resolve(f, base, &|_| None).map(|p| same_folder(&p, base)).unwrap_or(false))
    }

    pub fn matches(&self, f: &Facts) -> bool {
        let mut results = self.tests.iter().map(|(t, not)| test(t, f) != *not);
        match self.rule.match_mode {
            MatchMode::All => results.all(|r| r),
            MatchMode::Any => results.any(|r| r),
        }
    }
}

fn same_folder(a: &Path, b: &Path) -> bool {
    let canon = |p: &Path| std::fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf());
    canon(a) == canon(b)
}

fn test(t: &CompiledTest, f: &Facts) -> bool {
    let e = f.entry;
    match t {
        CompiledTest::Regex { re, on_name: true } => re.is_match(&e.name),
        CompiledTest::Regex { re, on_name: false } => {
            e.source.as_ref().map(|s| s.url.iter().chain(&s.referrer).any(|u| re.is_match(u))).unwrap_or(false)
        }
        CompiledTest::Size { min, max } => min.is_none_or(|m| e.size >= m) && max.is_none_or(|m| e.size <= m),
        CompiledTest::Plain(test) => match test {
            Test::Kind { kinds } => kinds.contains(&e.kind),
            Test::Extension { extensions } => {
                extensions.iter().any(|x| x.trim_start_matches('.').eq_ignore_ascii_case(&e.ext))
            }
            Test::SourceDomain { domains } => {
                let Some(src) = &e.source else { return false };
                let candidates: Vec<String> = src
                    .domain
                    .iter()
                    .cloned()
                    .chain(src.referrer.as_deref().and_then(crate::source::domain_of))
                    .collect();
                candidates.iter().any(|d| domains.iter().any(|want| domain_matches(d, want)))
            }
            Test::App { apps } => e
                .source
                .as_ref()
                .and_then(|s| s.app.as_deref())
                .map(|a| apps.iter().any(|want| a.eq_ignore_ascii_case(want.trim())))
                .unwrap_or(false),
            Test::Age { date, older_than_days, newer_than_days } => {
                let Some(t) = date_of(e, *date) else { return false };
                let age_days = (f.now - t) as f64 / 86_400_000.0;
                older_than_days.is_none_or(|d| age_days > d) && newer_than_days.is_none_or(|d| age_days < d)
            }
            Test::SourceUrl { .. } | Test::NameRegex { .. } | Test::Size { .. } => false, // compiled variants
        },
    }
}

fn domain_matches(have: &str, want: &str) -> bool {
    let want = want.trim().trim_start_matches("*.").trim_end_matches('.').to_ascii_lowercase();
    let have = have.to_ascii_lowercase();
    !want.is_empty() && (have == want || have.ends_with(&format!(".{want}")))
}

/// Unix ms of the date a rule asked for, with the documented fallbacks.
fn date_of(e: &FileEntry, which: AgeDate) -> Option<i64> {
    match which {
        AgeDate::Added => e.added.or(e.created).or(e.modified),
        AgeDate::Created => e.created.or(e.modified),
        AgeDate::Modified => e.modified,
        AgeDate::Downloaded => e.source.as_ref().and_then(|s| s.downloaded_at).map(|s| s * 1000).or(e.added),
    }
}

/// One file a rule matched, and what the rule wants done.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleMatch {
    pub path: PathBuf,
    pub rule_id: String,
    pub rule_name: String,
    /// Final location if the file is moved or renamed.
    pub destination: Option<PathBuf>,
    /// Set when the rule matched but nothing will happen (e.g. target taken
    /// and ifExists is skip).
    pub skipped: Option<String>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Evaluation {
    pub matches: Vec<RuleMatch>,
    #[serde(skip)]
    pub intents: Vec<Intent>,
    /// Rules that could not be used, with why.
    pub rule_errors: Vec<String>,
}

pub struct Engine<'a> {
    pub places: &'a Places,
    pub name_rules: NameRules,
    /// Unix milliseconds; injectable for tests.
    pub now: i64,
}

impl Engine<'_> {
    /// Decide what the rules do to `files` (entries directly inside `base`).
    pub fn evaluate(&self, rules: &[Rule], base: &Path, files: &[FileEntry]) -> Evaluation {
        let mut ev = Evaluation::default();
        let mut compiled = Vec::new();
        for r in rules.iter().filter(|r| r.enabled) {
            match validate(r) {
                Ok(c) if c.applies_to_folder(base, self.places) => compiled.push(c),
                Ok(_) => {}
                Err(e) => ev.rule_errors.push(e),
            }
        }
        // Names already claimed in this run, per folder, folded per OS rules.
        let mut taken: HashSet<(PathBuf, String)> = HashSet::new();
        for e in files {
            if e.is_dir
                || e.is_symlink
                || e.name.starts_with('.')
                || crate::scan::ignore_while_downloading(Path::new(&e.path))
            {
                continue;
            }
            let facts = Facts { entry: e, now: self.now };
            let Some(c) = compiled.iter().find(|c| c.matches(&facts)) else { continue };
            match self.actions_for(c.rule(), base, e, &mut taken) {
                Ok((intents, destination, skipped)) => {
                    ev.intents.extend(intents);
                    ev.matches.push(RuleMatch {
                        path: PathBuf::from(&e.path),
                        rule_id: c.rule().id.clone(),
                        rule_name: c.rule().name.clone(),
                        destination,
                        skipped,
                    });
                }
                Err(err) => ev.rule_errors.push(format!("{}: {}: {err}", c.rule().name, e.name)),
            }
        }
        ev
    }

    #[allow(clippy::type_complexity)]
    fn actions_for(
        &self,
        rule: &Rule,
        base: &Path,
        e: &FileEntry,
        taken: &mut HashSet<(PathBuf, String)>,
    ) -> Result<(Vec<Intent>, Option<PathBuf>, Option<String>), String> {
        let src = PathBuf::from(&e.path);
        let date = e.modified.and_then(|ms| Local.timestamp_millis_opt(ms).single()).unwrap_or_else(Local::now);
        let fill = |key: &str| token_value(key, e, &date);
        let src_dir = src.parent().unwrap_or(base).to_path_buf();

        let mut new_name = e.name.clone();
        let mut out = Vec::new();
        for a in &rule.actions {
            if let RuleAction::Rename { pattern } = a {
                new_name = render_name(pattern, e, &date)?;
                names::validate(self.name_rules, &new_name).map_err(|err| err.to_string())?;
            }
        }
        for a in &rule.actions {
            if let RuleAction::Tag { tags } = a {
                out.push(Intent { path: src.clone(), action: PlanAction::Tag(crate::tags::clean(tags)?) });
            }
        }
        for a in &rule.actions {
            match a {
                RuleAction::Copy { to, if_exists } => {
                    let dir = self.places.resolve(to, base, &fill)?;
                    match self.claim(&dir, &new_name, *if_exists, taken) {
                        Some(t) => out.push(Intent { path: src.clone(), action: PlanAction::CopyTo(t) }),
                        None => {
                            return Ok((vec![], None, Some(format!("{new_name} already exists in {}", dir.display()))))
                        }
                    }
                }
                RuleAction::Archive { to, if_exists, .. } => {
                    let dir = self.places.resolve(to, base, &fill)?;
                    let zip_name = format!("{new_name}.zip");
                    match self.claim(&dir, &zip_name, *if_exists, taken) {
                        Some(t) => out.push(Intent { path: src.clone(), action: PlanAction::ArchiveTo(t) }),
                        None => {
                            return Ok((vec![], None, Some(format!("{zip_name} already exists in {}", dir.display()))))
                        }
                    }
                }
                _ => {}
            }
        }

        let moving = rule.actions.iter().find_map(|a| match a {
            RuleAction::Move { to, if_exists } => Some((to, *if_exists)),
            _ => None,
        });
        let renaming = new_name != e.name;
        let trash = rule
            .actions
            .iter()
            .any(|a| matches!(a, RuleAction::Trash | RuleAction::Archive { remove_original: true, .. }));
        let mut destination = None;
        if trash {
            out.push(Intent { path: src.clone(), action: PlanAction::Trash });
        } else if moving.is_some() || renaming {
            let (dir, policy) = match moving {
                Some((to, p)) => (self.places.resolve(to, base, &fill)?, p),
                None => (src_dir.clone(), IfExists::Rename),
            };
            if dir == src_dir && !renaming {
                return Ok((out, None, Some("already in place".into())));
            }
            match self.claim(&dir, &new_name, policy, taken) {
                Some(t) => {
                    destination = Some(t.clone());
                    out.push(Intent { path: src.clone(), action: PlanAction::MoveTo(t) });
                }
                None => return Ok((vec![], None, Some(format!("{new_name} already exists in {}", dir.display())))),
            }
        }
        Ok((out, destination, None))
    }

    /// A free name for `name` in `dir`: as is, or "name (2).ext" etc. Also
    /// reserves it so two files in one run don't pick the same name.
    fn claim(
        &self,
        dir: &Path,
        name: &str,
        policy: IfExists,
        taken: &mut HashSet<(PathBuf, String)>,
    ) -> Option<PathBuf> {
        let (stem, ext) = crate::rename::split_name(name);
        for i in 1..1000 {
            let candidate = match (i, ext.is_empty()) {
                (1, _) => name.to_string(),
                (_, true) => format!("{stem} ({i})"),
                (_, false) => format!("{stem} ({i}).{ext}"),
            };
            let key = (dir.to_path_buf(), names::fold_key(self.name_rules, &candidate));
            let path = dir.join(&candidate);
            let free = !taken.contains(&key) && std::fs::symlink_metadata(&path).is_err();
            if free {
                taken.insert(key);
                return Some(path);
            }
            if policy == IfExists::Skip {
                return None;
            }
        }
        None
    }
}

fn token_value(key: &str, e: &FileEntry, date: &DateTime<Local>) -> Option<String> {
    let unknown = || Some("Unknown".to_string());
    match key {
        "kind" => Some(e.kind_label.to_string()),
        "ext" => Some(if e.ext.is_empty() { "No extension".into() } else { e.ext.clone() }),
        "domain" => e.source.as_ref().and_then(|s| s.domain.clone()).or_else(unknown),
        "app" => e.source.as_ref().and_then(|s| s.app.clone()).or_else(unknown),
        "year" => Some(format!("{:04}", date.year())),
        "month" => Some(format!("{:02}", date.month())),
        "day" => Some(format!("{:02}", date.day())),
        _ => None,
    }
}

fn render_name(pattern: &str, e: &FileEntry, date: &DateTime<Local>) -> Result<String, String> {
    let tokens = crate::rename::parse(pattern)?;
    let (stem, ext) = crate::rename::split_name(&e.name);
    let ctx = crate::rename::Context { number: 1, stem, ext, date: *date };
    let name = crate::rename::render(&tokens, &ctx);
    if name.trim().is_empty() {
        return Err("rename pattern produced an empty name".into());
    }
    Ok(name)
}

/// Built-in templates, all off by default. Order matters: routing rules come
/// before the catch-all sorting rules so they get first pick.
pub fn templates() -> Vec<Rule> {
    let json = include_str!("rule_templates.json");
    serde_json::from_str(json).expect("built-in rule templates are valid JSON")
}

pub const SETTINGS_KEY: &str = "rules";

pub fn load(db: &crate::db::Db) -> crate::Result<Vec<Rule>> {
    match db.get_setting(SETTINGS_KEY)? {
        Some(v) => Ok(serde_json::from_value(v)?),
        None => Ok(Vec::new()),
    }
}

/// Save rules after checking every enabled one; disabled rules may be
/// half-finished drafts.
pub fn save(db: &crate::db::Db, rules: &[Rule]) -> crate::Result<()> {
    let mut ids = HashSet::new();
    for r in rules {
        if !ids.insert(r.id.as_str()) {
            return Err(crate::Error::Plan(format!("two rules share the id {:?}", r.id)));
        }
        if r.enabled {
            validate(r).map_err(crate::Error::Plan)?;
        }
    }
    db.set_setting(SETTINGS_KEY, &serde_json::to_value(rules)?)
}

#[cfg(test)]
mod tests;
