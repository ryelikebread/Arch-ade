//! Tauri glue: app state and IPC commands. No business logic lives here;
//! every command validates input and calls into `arch_ade_core`.

mod ai_commands;
mod autorun;
mod commands;
mod fbf_commands;
mod music_commands;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use arch_ade_core::autopilot::Autopilot;
use arch_ade_core::rules::Places;
use arch_ade_core::update::{self, UpdateInfo};
use arch_ade_core::{config, db::Db, journal::Journal, platform, scope::Scope, tools::Tools, watch::Watch};
use tauri::Manager;

pub struct AppState {
    pub db: Db,
    pub scope: Scope,
    pub tools: Tools,
    pub places: Places,
    pub root: Mutex<Option<PathBuf>>,
    pub watch: Mutex<Option<Watch>>,
    /// Folders the rules watch, and their watchers.
    pub watched: Mutex<Vec<(PathBuf, Option<Watch>)>>,
    pub autopilot: Arc<Mutex<Autopilot>>,
    pub interrupted: Vec<i64>,
    pub update: Option<UpdateInfo>,
}

pub type Shared = Arc<AppState>;

/// Panics are also appended to `crash.log` in the app data folder, so a
/// problem can be reported even when the app wasn't started from a terminal.
fn log_panics() {
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        default(info);
        let line = format!(
            "{} {} on thread {:?}: {info}\n{}\n\n",
            chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
            env!("CARGO_PKG_VERSION"),
            std::thread::current().name().unwrap_or("unnamed"),
            std::backtrace::Backtrace::force_capture(),
        );
        let path = config::app_data_dir().join("crash.log");
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
            use std::io::Write;
            let _ = f.write_all(line.as_bytes());
        }
    }));
}

pub fn run() {
    log_panics();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let db_path = config::app_data_dir().join(format!("{}.sqlite", config::APP_SLUG));
            let db = Db::open(&db_path)?;
            let scope = Scope::new();
            let interrupted = Journal::new(&db, &scope, platform::current()).recover_interrupted()?;
            let update = update::check(&update::ManifestFile::default_location(), env!("CARGO_PKG_VERSION"));
            let state: Shared = Arc::new(AppState {
                db,
                scope,
                tools: Tools::detect(),
                places: Places::system(),
                root: Mutex::new(None),
                watch: Mutex::new(None),
                watched: Mutex::new(Vec::new()),
                autopilot: Arc::new(Mutex::new(Autopilot::default())),
                interrupted,
                update,
            });
            autorun::restore_folders(&state);
            autorun::start(app.handle().clone(), state.clone());
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::default_folders,
            commands::open_folder,
            commands::add_destination,
            commands::rescan,
            commands::preview,
            commands::read_bytes,
            commands::find_duplicates,
            commands::rename_preview,
            commands::plan_rename,
            commands::plan_trash,
            commands::plan_move,
            commands::apply_plan,
            commands::undo,
            commands::redo,
            commands::journal_state,
            commands::history,
            commands::revive_plan,
            commands::get_settings,
            commands::set_setting,
            commands::user_themes,
            commands::rules_get,
            commands::rules_save,
            commands::plan_rules,
            commands::rule_destinations,
            commands::allow_destination,
            commands::watched_folders,
            commands::set_watched_folders,
            commands::rule_activity,
            commands::update_info,
            ai_commands::ai_state,
            ai_commands::ai_save_settings,
            ai_commands::ai_save_whitelists,
            ai_commands::ai_forget,
            ai_commands::ai_models,
            ai_commands::ai_suggest,
            ai_commands::ai_cancel,
            ai_commands::ai_plan,
            fbf_commands::plan_one,
            fbf_commands::fbf_folders,
            fbf_commands::user_skins,
            music_commands::user_music,
            music_commands::user_music_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Arch-ade");
}
