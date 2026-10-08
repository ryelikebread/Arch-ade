//! Folder watcher (FSEvents / ReadDirectoryChangesW / inotify via `notify`).
//! Phase 1 only uses it to refresh the table; no actions are taken.

use std::path::{Path, PathBuf};
use std::time::Duration;

use notify_debouncer_full::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};

use crate::{Error, Result};

/// Dropping this stops watching.
pub struct Watch {
    _debouncer: Debouncer<RecommendedWatcher, RecommendedCache>,
}

/// Calls `on_change` with the changed paths (partial downloads filtered out),
/// at most once per debounce window.
pub fn watch<F>(root: &Path, recursive: bool, on_change: F) -> Result<Watch>
where
    F: Fn(Vec<PathBuf>) + Send + 'static,
{
    let mut debouncer = new_debouncer(
        Duration::from_millis(crate::config::WATCH_DEBOUNCE_MS),
        None,
        move |res: DebounceEventResult| {
            if let Ok(events) = res {
                let mut paths: Vec<PathBuf> = events
                    .iter()
                    .flat_map(|e| e.paths.iter().cloned())
                    .filter(|p| !crate::scan::ignore_while_downloading(p))
                    .collect();
                paths.sort();
                paths.dedup();
                if !paths.is_empty() {
                    on_change(paths);
                }
            }
        },
    )
    .map_err(|e| Error::Other(e.to_string()))?;
    let mode = if recursive { RecursiveMode::Recursive } else { RecursiveMode::NonRecursive };
    debouncer.watch(root, mode).map_err(|e| Error::Other(e.to_string()))?;
    Ok(Watch { _debouncer: debouncer })
}
