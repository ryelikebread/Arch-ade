//! Background side of the rules: watchers on the folders the user chose and
//! a loop that hands settled files to the rules. All decisions are in
//! `arch_ade_core::{autopilot, organize}`; this file only wires threads,
//! settings and events.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use arch_ade_core::organize::{Organizer, Outcome};
use arch_ade_core::{platform, rules, watch};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::Shared;

pub const WATCHED_KEY: &str = "watchedFolders";
pub const DESTINATIONS_KEY: &str = "destinationRoots";

pub fn setting_paths(s: &Shared, key: &str) -> Vec<PathBuf> {
    s.db.get_setting(key)
        .ok()
        .flatten()
        .and_then(|v| serde_json::from_value::<Vec<String>>(v).ok())
        .unwrap_or_default()
        .into_iter()
        .map(PathBuf::from)
        .collect()
}

/// At startup: put saved destination roots and watched folders back in
/// scope (skipping any that no longer exist) and start watching.
pub fn restore_folders(s: &Shared) {
    for p in setting_paths(s, DESTINATIONS_KEY) {
        if let Err(e) = s.scope.add_root(&p) {
            tracing::warn!("destination {} unavailable: {e}", p.display());
        }
    }
    let watched = setting_paths(s, WATCHED_KEY);
    if let Err(e) = set_watched(s, &watched) {
        tracing::warn!("watched folders: {e}");
    }
}

/// Replace the watched folders. Each must exist; it becomes part of the scope.
pub fn set_watched(s: &Shared, folders: &[PathBuf]) -> arch_ade_core::Result<Vec<PathBuf>> {
    let mut canon = Vec::new();
    for f in folders {
        match s.scope.add_root(f) {
            Ok(c) if !canon.contains(&c) => canon.push(c),
            Ok(_) => {}
            Err(e) => tracing::warn!("not watching {}: {e}", f.display()),
        }
    }
    let mut watched = crate::lock(&s.watched);
    watched.clear(); // drops the old watchers
    for f in &canon {
        let ap = s.autopilot.clone();
        let w = watch::watch(f, false, move |paths| {
            crate::lock(&ap).notice(paths, Instant::now());
        })
        .map_err(|e| tracing::warn!("cannot watch {}: {e}", f.display()))
        .ok();
        watched.push((f.clone(), w));
    }
    *crate::lock(&s.autopilot) = arch_ade_core::autopilot::Autopilot::new(canon.clone());
    let as_strings: Vec<String> = canon.iter().map(|p| p.to_string_lossy().into_owned()).collect();
    s.db.set_setting(WATCHED_KEY, &serde_json::json!(as_strings))?;
    Ok(canon)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ActivityEvent {
    folder: String,
    outcome: Outcome,
    files: usize,
    label: String,
    plan_id: Option<i64>,
    error: Option<String>,
}

/// Poll the autopilot once a second; run rules on whatever settled.
pub fn start(app: AppHandle, s: Shared) {
    std::thread::Builder::new()
        .name("rules".into())
        .spawn(move || loop {
            std::thread::sleep(Duration::from_secs(1));
            let ready = crate::lock(&s.autopilot).ready(Instant::now());
            for (folder, files) in ready {
                // A panic on one folder (it's written to crash.log) must not
                // end this thread, or the rules would quietly stop until restart.
                let run =
                    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| run_folder(&app, &s, &folder, &files)));
                match run {
                    Ok(Err(e)) => tracing::warn!("rules on {}: {e}", folder.display()),
                    Err(_) => tracing::error!("rules on {} stopped with a panic", folder.display()),
                    Ok(Ok(())) => {}
                }
            }
        })
        .expect("spawn rules thread");
}

fn run_folder(app: &AppHandle, s: &Shared, folder: &Path, files: &[PathBuf]) -> arch_ade_core::Result<()> {
    let all = rules::load(&s.db)?;
    if !all.iter().any(|r| r.enabled && r.auto) {
        return Ok(());
    }
    let org = Organizer { db: &s.db, scope: &s.scope, platform: platform::current(), places: &s.places };
    let run = org.auto_run(&all, folder, files, crate::commands::dry_run_on(s))?;
    crate::lock(&s.autopilot).produced(run.produced.iter().cloned(), Instant::now());
    if run.outcome != Outcome::Nothing {
        let _ = app.emit(
            "rules-activity",
            ActivityEvent {
                folder: folder.to_string_lossy().into_owned(),
                outcome: run.outcome,
                files: run.rules.matches.len(),
                label: run.rules.plan.label.clone(),
                plan_id: run.plan_id,
                error: run.report.and_then(|r| r.error),
            },
        );
    }
    Ok(())
}
