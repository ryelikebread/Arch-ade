use std::path::{Path, PathBuf};

use arch_ade_core::dupes::{self, Candidate, DupeGroup};
use arch_ade_core::journal::{Journal, PlanSummary, RunReport};
use arch_ade_core::plan::{Plan, Planner};
use arch_ade_core::preview::{self, Preview};
use arch_ade_core::rename::{self, RenameOptions, RenameRow};
use arch_ade_core::scan::{self, ScanOptions, ScanResult};
use arch_ade_core::{config, platform, watch, Error};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::Shared;

type Res<T> = Result<T, Error>;

/// Run blocking core work off the async runtime's worker threads.
async fn blocking<T, F>(f: F) -> Res<T>
where
    T: Send + 'static,
    F: FnOnce() -> Res<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| Error::Other(e.to_string()))?
}

fn dry_run_on(s: &Shared) -> bool {
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
    id: Option<i64>,
    plan: Plan,
    dry_run: bool,
}

fn save(state: &Shared, plan: Plan) -> Res<PlanOut> {
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
    blocking(move || Journal::new(&s.db, &s.scope, platform::current()).apply(id)).await
}

#[tauri::command]
pub async fn undo(state: State<'_, Shared>) -> Res<Option<RunReport>> {
    let s = state.inner().clone();
    blocking(move || Journal::new(&s.db, &s.scope, platform::current()).undo()).await
}

#[tauri::command]
pub async fn redo(state: State<'_, Shared>) -> Res<Option<RunReport>> {
    let s = state.inner().clone();
    if dry_run_on(&s) {
        return Err(Error::Plan("Dry run is on: turn it off to redo changes.".into()));
    }
    blocking(move || Journal::new(&s.db, &s.scope, platform::current()).redo()).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalState {
    can_undo: bool,
    can_redo: bool,
}

#[tauri::command]
pub fn journal_state(state: State<'_, Shared>) -> Res<JournalState> {
    let j = Journal::new(&state.db, &state.scope, platform::current());
    Ok(JournalState { can_undo: j.can_undo()?.is_some(), can_redo: j.can_redo()?.is_some() })
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
