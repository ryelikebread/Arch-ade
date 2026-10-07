use std::path::{Path, PathBuf};

use arch_ade_core::dupes::{self, Candidate, DupeGroup};
use arch_ade_core::journal::{Journal, PlanSummary, RunReport};
use arch_ade_core::organize::{self, Activity, Organizer};
use arch_ade_core::plan::{Plan, Planner};
use arch_ade_core::preview::{self, Preview};
use arch_ade_core::rename::{self, RenameOptions, RenameRow};
use arch_ade_core::rules::{self, Rule, RuleMatch};
use arch_ade_core::scan::{self, ScanOptions, ScanResult};
use arch_ade_core::update::UpdateInfo;
use arch_ade_core::{config, platform, watch, Error};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::Shared;

pub(crate) type Res<T> = Result<T, Error>;

/// Run blocking core work off the async runtime's worker threads.
pub(crate) async fn blocking<T, F>(f: F) -> Res<T>
where
    T: Send + 'static,
    F: FnOnce() -> Res<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| Error::Other(e.to_string()))?
}

pub(crate) fn dry_run_on(s: &Shared) -> bool {
    // Safety first: dry run is on unless the user turned it off.
    s.db.get_setting("dryRun").ok().flatten().and_then(|v| v.as_bool()).unwrap_or(true)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    name: &'static str,
    version: &'static str,
    os: platform::Os,
    modifier: &'static str,
    tools: arch_ade_core::tools::Tools,
    data_dir: String,
    interrupted_plans: Vec<i64>,
}

#[tauri::command]
pub fn app_info(state: State<'_, Shared>) -> AppInfo {
    let p = platform::current();
    AppInfo {
        name: config::APP_NAME,
        version: env!("CARGO_PKG_VERSION"),
        os: p.os(),
        modifier: p.modifier_label(),
        tools: state.tools.clone(),
        data_dir: config::app_data_dir().to_string_lossy().into_owned(),
        interrupted_plans: state.interrupted.clone(),
    }
}

#[derive(Serialize)]
pub struct Folder {
    label: &'static str,
    path: String,
}

/// Standard folders from the `dirs` crate (never hardcoded).
#[tauri::command]
pub fn default_folders() -> Vec<Folder> {
    [
        ("Downloads", dirs::download_dir()),
        ("Desktop", dirs::desktop_dir()),
        ("Documents", dirs::document_dir()),
        ("Pictures", dirs::picture_dir()),
    ]
    .into_iter()
    .filter_map(|(label, p)| p.filter(|p| p.is_dir()).map(|p| Folder { label, path: p.to_string_lossy().into_owned() }))
    .collect()
}

fn allow_assets(app: &AppHandle, dir: &Path) {
    // Lets <img>/<video> load files from the chosen folder (and only there).
    let _ = app.asset_protocol_scope().allow_directory(dir, true);
}

#[tauri::command]
pub async fn open_folder(
    app: AppHandle,
    state: State<'_, Shared>,
    path: String,
    options: ScanOptions,
) -> Res<ScanResult> {
    let s = state.inner().clone();
    let root = s.scope.add_root(Path::new(&path))?;
    allow_assets(&app, &root);
    *s.root.lock().unwrap() = Some(root.clone());

    let emitter = app.clone();
    let w = watch::watch(&root, options.recursive, move |paths| {
        let paths: Vec<String> = paths.iter().map(|p| p.to_string_lossy().into_owned()).collect();
        let _ = emitter.emit("fs-changed", paths);
    })
    .map_err(|e| tracing::warn!("watcher unavailable: {e}"))
    .ok();
    *s.watch.lock().unwrap() = w;
    let _ = s.db.set_setting("lastFolder", &serde_json::json!(root.to_string_lossy()));

    blocking(move || scan::scan(&root, options, platform::current())).await
}

/// A destination folder for moves. It becomes part of the allowed scope.
#[tauri::command]
pub fn add_destination(app: AppHandle, state: State<'_, Shared>, path: String) -> Res<String> {
    let root = state.scope.add_root(Path::new(&path))?;
    allow_assets(&app, &root);
    Ok(root.to_string_lossy().into_owned())
}

/// A destination the user approved for rules: remembered across restarts.
/// With `create`, a missing folder is made first (the user picked it).
#[tauri::command]
pub fn allow_destination(app: AppHandle, state: State<'_, Shared>, path: String, create: bool) -> Res<String> {
    let p = PathBuf::from(&path);
    if !p.is_absolute() {
        return Err(Error::Other(format!("{path} is not a full path")));
    }
    if create && !p.exists() {
        std::fs::create_dir_all(&p)?;
    }
    let root = add_destination(app, state.clone(), path)?;
    let s = state.inner();
    let mut saved: Vec<String> = crate::autorun::setting_paths(s, crate::autorun::DESTINATIONS_KEY)
        .into_iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    if !saved.contains(&root) {
        saved.push(root.clone());
    }
    s.db.set_setting(crate::autorun::DESTINATIONS_KEY, &serde_json::json!(saved))?;
    Ok(root)
}

#[tauri::command]
pub async fn rescan(state: State<'_, Shared>, options: ScanOptions) -> Res<ScanResult> {
    let root = state.root.lock().unwrap().clone().ok_or_else(|| Error::Other("no folder open".into()))?;
    blocking(move || scan::scan(&root, options, platform::current())).await
}

#[tauri::command]
pub async fn preview(state: State<'_, Shared>, path: String) -> Res<Preview> {
    let s = state.inner().clone();
    let p = s.scope.check_readable(Path::new(&path))?;
    blocking(move || {
        let ctx = preview::Ctx { db: &s.db, tools: &s.tools, platform: platform::current() };
        preview::preview(&p, &ctx)
    })
    .await
}

/// File bytes for pdf.js, as a raw IPC response (no JSON encoding).
#[tauri::command]
pub async fn read_bytes(state: State<'_, Shared>, path: String) -> Res<tauri::ipc::Response> {
    let p = state.scope.check_readable(Path::new(&path))?;
    let bytes = blocking(move || preview::read_bytes(&p)).await?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub async fn find_duplicates(app: AppHandle, state: State<'_, Shared>, paths: Vec<String>) -> Res<Vec<DupeGroup>> {
    let s = state.inner().clone();
    let mut cands = Vec::new();
    for p in paths {
        let p = s.scope.check_readable(Path::new(&p))?;
        if scan::ignore_while_downloading(&p) {
            continue; // still being written; not a real duplicate
        }
        if let Ok(md) = std::fs::symlink_metadata(&p) {
            if md.is_file() {
                let mtime = md
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0);
                cands.push(Candidate { path: p, size: md.len(), mtime });
            }
        }
    }
    blocking(move || {
        let progress = |done: usize, total: usize| {
            let _ = app.emit("dupes-progress", (done, total));
        };
        Ok(dupes::find(cands, Some(&s.db), &progress))
    })
    .await
}

fn checked_paths(s: &Shared, paths: &[String]) -> Res<Vec<PathBuf>> {
    paths.iter().map(|p| s.scope.check(Path::new(p))).collect()
}

#[tauri::command]
pub fn rename_preview(state: State<'_, Shared>, paths: Vec<String>, options: RenameOptions) -> Res<Vec<RenameRow>> {
    let paths = checked_paths(state.inner(), &paths)?;
    rename::preview(&paths, &options, platform::name_rules()).map_err(Error::Plan)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanOut {
    /// None when the plan has blocking issues (it can't be applied).
    pub(crate) id: Option<i64>,
    pub(crate) plan: Plan,
    pub(crate) dry_run: bool,
}

pub(crate) fn save(state: &Shared, plan: Plan) -> Res<PlanOut> {
    let id = if plan.is_blocked() || plan.ops.is_empty() {
        None
    } else {
        Some(Journal::new(&state.db, &state.scope, platform::current()).save(&plan)?)
    };
    Ok(PlanOut { id, plan, dry_run: dry_run_on(state) })
}

#[tauri::command]
pub fn plan_rename(state: State<'_, Shared>, paths: Vec<String>, options: RenameOptions) -> Res<PlanOut> {
    let s = state.inner();
    let paths = checked_paths(s, &paths)?;
    let rules = platform::name_rules();
    let rows = rename::preview(&paths, &options, rules).map_err(Error::Plan)?;
    let label = format!("Rename {} file(s) to \"{}\"", rows.len(), options.pattern);
    save(s, Planner::new(&s.scope, rules).moves(&rename::pairs(&rows), label))
}

#[tauri::command]
pub fn plan_trash(state: State<'_, Shared>, paths: Vec<String>) -> Res<PlanOut> {
    let s = state.inner();
    let paths: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
    let label = format!("Move {} item(s) to the trash", paths.len());
    save(s, Planner::new(&s.scope, platform::name_rules()).trash(&paths, label))
}

#[tauri::command]
pub fn plan_move(state: State<'_, Shared>, paths: Vec<String>, dest: String) -> Res<PlanOut> {
    let s = state.inner();
    let dest = PathBuf::from(dest);
    let pairs: Vec<(PathBuf, PathBuf)> =
        paths.iter().map(PathBuf::from).filter_map(|p| p.file_name().map(|n| (p.clone(), dest.join(n)))).collect();
    let label = format!("Move {} item(s) to {}", pairs.len(), dest.display());
    save(s, Planner::new(&s.scope, platform::name_rules()).moves(&pairs, label))
}

#[tauri::command]
pub async fn apply_plan(state: State<'_, Shared>, id: i64) -> Res<RunReport> {
    let s = state.inner().clone();
    if dry_run_on(&s) {
        return Err(Error::Plan("Dry run is on: turn it off to apply changes.".into()));
    }
    blocking(move || {
        let r = Journal::new(&s.db, &s.scope, platform::current()).apply(id)?;
        quiet_after(&s, Some(&r));
        if r.status == "applied" {
            // Categorize plans: the approved decisions become hints now.
            if let Err(e) = arch_ade_core::ai::review::commit_pending(&s.db, id) {
                tracing::warn!("remembering decisions for plan {id}: {e}");
            }
        }
        Ok(r)
    })
    .await
}

#[tauri::command]
pub async fn undo(state: State<'_, Shared>) -> Res<Option<RunReport>> {
    let s = state.inner().clone();
    blocking(move || {
        let r = Journal::new(&s.db, &s.scope, platform::current()).undo()?;
        quiet_after(&s, r.as_ref());
        Ok(r)
    })
    .await
}

#[tauri::command]
pub async fn redo(state: State<'_, Shared>) -> Res<Option<RunReport>> {
    let s = state.inner().clone();
    if dry_run_on(&s) {
        return Err(Error::Plan("Dry run is on: turn it off to redo changes.".into()));
    }
    blocking(move || {
        let r = Journal::new(&s.db, &s.scope, platform::current()).redo()?;
        quiet_after(&s, r.as_ref());
        Ok(r)
    })
    .await
}

/// Tell the watcher that the paths a run touched came from Arch-ade, so an
/// undo that puts a file back in Downloads isn't immediately re-sorted.
fn quiet_after(s: &Shared, report: Option<&RunReport>) {
    let Some(r) = report else { return };
    if let Ok((plan, _)) = Journal::new(&s.db, &s.scope, platform::current()).load(r.plan_id) {
        let paths = organize::produced_paths(&plan);
        s.autopilot.lock().unwrap().produced(paths, std::time::Instant::now());
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalState {
    can_undo: bool,
    can_redo: bool,
    /// The plan Undo would reverse next (File-by-File checks it's its own).
    undo_plan_id: Option<i64>,
}

#[tauri::command]
pub fn journal_state(state: State<'_, Shared>) -> Res<JournalState> {
    let j = Journal::new(&state.db, &state.scope, platform::current());
    let undo_plan_id = j.can_undo()?;
    Ok(JournalState { can_undo: undo_plan_id.is_some(), can_redo: j.can_redo()?.is_some(), undo_plan_id })
}

#[tauri::command]
pub fn history(state: State<'_, Shared>) -> Res<Vec<PlanSummary>> {
    Journal::new(&state.db, &state.scope, platform::current()).history(200)
}

#[tauri::command]
pub fn get_settings(state: State<'_, Shared>) -> Res<serde_json::Map<String, serde_json::Value>> {
    state.db.all_settings()
}

#[tauri::command]
pub fn set_setting(state: State<'_, Shared>, key: String, value: serde_json::Value) -> Res<()> {
    state.db.set_setting(&key, &value)
}

/// Extra themes the user dropped into `<app data>/themes/*.json`.
#[tauri::command]
pub fn user_themes() -> Vec<serde_json::Value> {
    let dir = config::app_data_dir().join("themes");
    let _ = std::fs::create_dir_all(&dir);
    std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("json"))
        .filter_map(|e| std::fs::read_to_string(e.path()).ok())
        .filter_map(|t| serde_json::from_str(&t).ok())
        .collect()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RulesState {
    rules: Vec<Rule>,
    templates: Vec<Rule>,
    tags_supported: bool,
}

#[tauri::command]
pub fn rules_get(state: State<'_, Shared>) -> Res<RulesState> {
    Ok(RulesState {
        rules: rules::load(&state.db)?,
        templates: rules::templates(),
        tags_supported: platform::current().tags_supported(),
    })
}

#[tauri::command]
pub fn rules_save(state: State<'_, Shared>, rules: Vec<Rule>) -> Res<()> {
    rules::save(&state.db, &rules)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RulesPlanOut {
    #[serde(flatten)]
    out: PlanOut,
    matches: Vec<RuleMatch>,
    rule_errors: Vec<String>,
}

/// What rules would do to the files directly in `folder` (the open folder
/// when omitted). `rules` tests unsaved rules; otherwise the saved enabled
/// ones run. Either way the result is a normal plan.
#[tauri::command]
pub async fn plan_rules(
    state: State<'_, Shared>,
    folder: Option<String>,
    rules: Option<Vec<Rule>>,
) -> Res<RulesPlanOut> {
    let s = state.inner().clone();
    let folder = match folder {
        Some(f) => PathBuf::from(f),
        None => s.root.lock().unwrap().clone().ok_or_else(|| Error::Other("no folder open".into()))?,
    };
    blocking(move || {
        let rules = match rules {
            Some(mut r) => {
                r.iter_mut().for_each(|x| x.enabled = true);
                r
            }
            None => rules::load(&s.db)?,
        };
        let org = Organizer { db: &s.db, scope: &s.scope, platform: platform::current(), places: &s.places };
        let rp = org.plan(&rules, &folder, None, false)?;
        Ok(RulesPlanOut { out: save(&s, rp.plan)?, matches: rp.matches, rule_errors: rp.rule_errors })
    })
    .await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Destination {
    rule_id: String,
    path: String,
    exists: bool,
    allowed: bool,
}

/// Folders outside the opened/watched folders that rules move or copy into,
/// so the UI can ask the user to allow (and create) them up front.
#[tauri::command]
pub fn rule_destinations(state: State<'_, Shared>, rules: Vec<Rule>) -> Vec<Destination> {
    let mut out: Vec<Destination> = Vec::new();
    for r in rules.iter().filter(|r| r.enabled) {
        for p in r.fixed_destinations(&state.places) {
            let path = p.to_string_lossy().into_owned();
            if !out.iter().any(|d| d.path == path) {
                let allowed = state.scope.check(&p.join("x")).is_ok();
                out.push(Destination { rule_id: r.id.clone(), exists: p.is_dir(), allowed, path });
            }
        }
    }
    out
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Watched {
    folders: Vec<String>,
    pending: usize,
}

#[tauri::command]
pub fn watched_folders(state: State<'_, Shared>) -> Watched {
    let folders = state.watched.lock().unwrap().iter().map(|(p, _)| p.to_string_lossy().into_owned()).collect();
    Watched { folders, pending: state.autopilot.lock().unwrap().pending_count() }
}

#[tauri::command]
pub fn set_watched_folders(app: AppHandle, state: State<'_, Shared>, folders: Vec<String>) -> Res<Watched> {
    let paths: Vec<PathBuf> = folders.iter().map(PathBuf::from).collect();
    let canon = crate::autorun::set_watched(state.inner(), &paths)?;
    for f in &canon {
        allow_assets(&app, f);
    }
    Ok(watched_folders(state))
}

#[tauri::command]
pub fn rule_activity(state: State<'_, Shared>) -> Res<Vec<Activity>> {
    organize::recent_activity(&state.db, 200)
}

#[tauri::command]
pub fn update_info(state: State<'_, Shared>) -> Option<UpdateInfo> {
    state.update.clone()
}
