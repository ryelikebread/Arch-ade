//! Single place for the app's name and other build-wide constants.
//! Renaming the app means changing [`APP_NAME`] (and the bundle identifier in
//! `src-tauri/tauri.conf.json`).

pub const APP_NAME: &str = "Arch-ade";
/// Used for the app-data directory and the SQLite file name.
pub const APP_SLUG: &str = "arch-ade";

/// Largest text file we read fully for preview; larger files are truncated.
pub const TEXT_PREVIEW_BYTES: usize = 256 * 1024;
/// Largest file we hand to pdf.js / the media player through IPC.
pub const MAX_INLINE_BYTES: u64 = 64 * 1024 * 1024;
/// Edge length of cached thumbnails, in pixels.
pub const THUMB_PX: u32 = 512;
/// Archive listings stop after this many entries.
pub const ARCHIVE_LIST_LIMIT: usize = 5_000;
/// Rows/columns shown for spreadsheet and CSV previews.
pub const TABLE_PREVIEW_ROWS: usize = 200;
pub const TABLE_PREVIEW_COLS: usize = 40;
/// Bytes hashed from each end of a file for the partial duplicate hash.
pub const PARTIAL_HASH_BYTES: u64 = 64 * 1024;
/// Watcher debounce window.
pub const WATCH_DEBOUNCE_MS: u64 = 750;
/// Extensions of files that are still being written by a browser.
pub const PARTIAL_DOWNLOAD_EXTS: &[&str] = &["crdownload", "part", "download", "tmp", "partial"];

/// OS-standard app-data dir, e.g. `~/Library/Application Support/arch-ade`.
pub fn app_data_dir() -> std::path::PathBuf {
    dirs::data_dir().unwrap_or_else(std::env::temp_dir).join(APP_SLUG)
}
