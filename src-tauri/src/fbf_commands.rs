//! IPC for File-by-File mode and its pluggable display skins.

use std::path::{Path, PathBuf};

use arch_ade_core::onebyone::{self, Decision};
use arch_ade_core::plan::Planner;
use arch_ade_core::{config, platform, Error};
use serde::Serialize;
use tauri::State;

use crate::commands::{save, PlanOut, Res};
use crate::Shared;

/// Plan one decision about one file. The UI applies it straight away unless
/// dry run is on (then the plan is only shown).
#[tauri::command]
pub fn plan_one(state: State<'_, Shared>, path: String, decision: Decision) -> Res<PlanOut> {
    let s = state.inner();
    let path = s.scope.check(Path::new(&path))?;
    save(s, onebyone::plan(&Planner::new(&s.scope, platform::name_rules()), &path, &decision))
}

/// Subfolders of the open folder, for the Move quick-pick.
#[tauri::command]
pub fn fbf_folders(state: State<'_, Shared>) -> Res<Vec<String>> {
    let root = state.root.lock().unwrap().clone().ok_or_else(|| Error::Other("no folder open".into()))?;
    Ok(onebyone::subfolders(&root).iter().map(|p| p.to_string_lossy().into_owned()).collect())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserSkin {
    /// Folder name under `<app data>/skins/`.
    folder: String,
    manifest: serde_json::Value,
    /// The sprite sheet as a `data:image/png;base64,…` URL.
    sheet: String,
}

/// Largest sprite sheet accepted from the skins folder.
const MAX_SHEET: u64 = 4 * 1024 * 1024;

/// Skins the user dropped into `<app data>/skins/<name>/` (manifest.json +
/// the PNG sheet it names). Broken ones are skipped; the UI validates the rest.
#[tauri::command]
pub fn user_skins() -> Vec<UserSkin> {
    let dir = config::app_data_dir().join("skins");
    let _ = std::fs::create_dir_all(&dir);
    let Ok(rd) = std::fs::read_dir(&dir) else { return vec![] };
    let mut out: Vec<UserSkin> = rd.flatten().filter_map(|e| load_skin(&e.path())).collect();
    out.sort_by(|a, b| a.folder.cmp(&b.folder));
    out
}

fn load_skin(dir: &Path) -> Option<UserSkin> {
    let manifest: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(dir.join("manifest.json")).ok()?).ok()?;
    let sheet_name = manifest.get("sheet").and_then(|v| v.as_str()).unwrap_or("sheet.png");
    // The sheet must sit right in the skin's folder.
    let sheet: PathBuf = dir.join(Path::new(sheet_name).file_name()?);
    if sheet.extension().and_then(|x| x.to_str()).map(|x| x.eq_ignore_ascii_case("png")) != Some(true) {
        return None;
    }
    if std::fs::metadata(&sheet).ok()?.len() > MAX_SHEET {
        tracing::warn!("skin sheet {} is over 4 MB, skipped", sheet.display());
        return None;
    }
    let bytes = std::fs::read(&sheet).ok()?;
    if !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return None;
    }
    use base64::Engine;
    Some(UserSkin {
        folder: dir.file_name()?.to_string_lossy().into_owned(),
        manifest,
        sheet: format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)),
    })
}
