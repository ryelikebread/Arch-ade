//! Tauri glue: app state and IPC commands. No business logic lives here;
//! every command validates input and calls into `arch_ade_core`.

mod commands;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use arch_ade_core::{config, db::Db, journal::Journal, platform, scope::Scope, tools::Tools, watch::Watch};
use tauri::Manager;

pub struct AppState {
    pub db: Db,
    pub scope: Scope,
    pub tools: Tools,
    pub root: Mutex<Option<PathBuf>>,
    pub watch: Mutex<Option<Watch>>,
    pub interrupted: Vec<i64>,
}

pub type Shared = Arc<AppState>;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let db_path = config::app_data_dir().join(format!("{}.sqlite", config::APP_SLUG));
            let db = Db::open(&db_path)?;
            let scope = Scope::new();
            let interrupted = Journal::new(&db, &scope, platform::current()).recover_interrupted()?;
            let state: Shared = Arc::new(AppState {
                db,
                scope,
                tools: Tools::detect(),
                root: Mutex::new(None),
                watch: Mutex::new(None),
                interrupted,
            });
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
            commands::get_settings,
            commands::set_setting,
            commands::user_themes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Arch-ade");
}
