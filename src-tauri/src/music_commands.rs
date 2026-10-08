//! IPC for the user's own music folder (`<app data>/music/`).

use arch_ade_core::{config, music};

use crate::commands::{blocking, Res};

/// Tracks in the music folder, plus files that were skipped.
#[tauri::command]
pub fn user_music() -> music::Listing {
    music::list(&config::app_data_dir().join("music"))
}

/// One track's bytes, as a raw IPC response for the webview to play.
#[tauri::command]
pub async fn user_music_file(name: String) -> Res<tauri::ipc::Response> {
    let bytes = blocking(move || {
        let p = music::resolve(&config::app_data_dir().join("music"), &name)?;
        Ok(std::fs::read(p)?)
    })
    .await?;
    Ok(tauri::ipc::Response::new(bytes))
}
