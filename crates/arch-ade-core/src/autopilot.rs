//! Decides when a file that appeared in a watched folder is finished
//! downloading and ready for the rules. Pure bookkeeping, no I/O except
//! reading file sizes, so it can be tested without a real watcher.
//!
//! A file is ready when:
//! - it sits directly in a watched folder, is a regular file, not hidden,
//!   and not a partial-download name (`.crdownload`, `.part`, ...);
//! - no partial-download sibling for it exists (Firefox creates the final
//!   name early and writes into `name.part`);
//! - its size and modification time have not changed for [`SETTLE`];
//! - Arch-ade didn't just put it there itself (avoids loops such as a rule
//!   renaming a file in place and then matching the new name).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

/// How long a file must stay unchanged before rules see it.
pub const SETTLE: Duration = Duration::from_secs(3);
/// How long paths that Arch-ade itself produced are ignored.
pub const QUIET: Duration = Duration::from_secs(30);
/// Give up on a file that keeps changing for this long (re-noticed on its next change).
pub const GIVE_UP: Duration = Duration::from_secs(6 * 60 * 60);

#[derive(Debug)]
struct Pending {
    folder: PathBuf,
    first_seen: Instant,
    stamp: Option<(u64, std::time::SystemTime)>,
    stable_since: Instant,
}

#[derive(Debug, Default)]
pub struct Autopilot {
    folders: Vec<PathBuf>,
    pending: HashMap<PathBuf, Pending>,
    quiet: HashMap<PathBuf, Instant>,
}

impl Autopilot {
    pub fn new(folders: Vec<PathBuf>) -> Self {
        Autopilot { folders, ..Default::default() }
    }

    pub fn folders(&self) -> &[PathBuf] {
        &self.folders
    }

    /// The watched folder `path` sits directly in, if any.
    fn folder_of(&self, path: &Path) -> Option<PathBuf> {
        let parent = path.parent()?;
        self.folders.iter().find(|f| f.as_path() == parent).cloned()
    }

    /// Paths reported by the watcher. Anything not directly in a watched
    /// folder is ignored, as are names that are still downloading.
    pub fn notice(&mut self, paths: impl IntoIterator<Item = PathBuf>, now: Instant) {
        for p in paths {
            // A finished `.part`/`.crdownload` rename shows up as the final name;
            // the partial name itself only tells us a download is in flight.
            if crate::scan::ignore_while_downloading(&p) {
                continue;
            }
            let Some(folder) = self.folder_of(&p) else { continue };
            if p.file_name().is_some_and(|n| n.to_string_lossy().starts_with('.')) {
                continue;
            }
            if self.is_quiet(&p, now) {
                continue;
            }
            let entry =
                self.pending.entry(p).or_insert(Pending { folder, first_seen: now, stamp: None, stable_since: now });
            entry.stable_since = now; // any event restarts the settle clock
        }
    }

    /// Mark paths Arch-ade itself just created or moved, so the watcher's
    /// events for them don't trigger the rules again.
    pub fn produced(&mut self, paths: impl IntoIterator<Item = PathBuf>, now: Instant) {
        for p in paths {
            self.pending.remove(&p);
            self.quiet.insert(p, now);
        }
    }

    fn is_quiet(&mut self, p: &Path, now: Instant) -> bool {
        self.quiet.retain(|_, t| now.duration_since(*t) < QUIET);
        self.quiet.contains_key(p)
    }

    /// Files that finished settling, grouped by watched folder. They leave
    /// the pending list; a later change notices them again.
    pub fn ready(&mut self, now: Instant) -> Vec<(PathBuf, Vec<PathBuf>)> {
        let mut done: HashMap<PathBuf, Vec<PathBuf>> = HashMap::new();
        let mut drop = Vec::new();
        for (path, p) in self.pending.iter_mut() {
            let md = match std::fs::symlink_metadata(path) {
                Ok(md) if md.is_file() => md,
                _ => {
                    drop.push(path.clone()); // gone, a folder or a link: not for rules
                    continue;
                }
            };
            if now.duration_since(p.first_seen) > GIVE_UP {
                drop.push(path.clone());
                continue;
            }
            let stamp = md.modified().ok().map(|m| (md.len(), m));
            if stamp != p.stamp {
                p.stamp = stamp;
                p.stable_since = now;
                continue;
            }
            if has_partial_sibling(path) || now.duration_since(p.stable_since) < SETTLE {
                continue;
            }
            done.entry(p.folder.clone()).or_default().push(path.clone());
            drop.push(path.clone());
        }
        for d in drop {
            self.pending.remove(&d);
        }
        let mut out: Vec<_> = done.into_iter().collect();
        for (_, files) in &mut out {
            files.sort();
        }
        out.sort();
        out
    }

    pub fn pending_count(&self) -> usize {
        self.pending.len()
    }
}

fn has_partial_sibling(path: &Path) -> bool {
    let Some(name) = path.file_name() else { return false };
    crate::config::PARTIAL_DOWNLOAD_EXTS.iter().any(|ext| {
        let mut n = name.to_os_string();
        n.push(format!(".{ext}"));
        std::fs::symlink_metadata(path.with_file_name(n)).is_ok()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> (tempfile::TempDir, PathBuf, Autopilot) {
        let d = tempfile::tempdir().unwrap();
        let root = std::fs::canonicalize(d.path()).unwrap();
        let ap = Autopilot::new(vec![root.clone()]);
        (d, root, ap)
    }

    #[test]
    fn waits_until_the_file_stops_changing() {
        let (_d, root, mut ap) = setup();
        let f = root.join("movie.mp4");
        std::fs::write(&f, "a").unwrap();
        let t0 = Instant::now();
        ap.notice([f.clone()], t0);
        assert!(ap.ready(t0).is_empty(), "first look only records the size");
        assert!(ap.ready(t0 + SETTLE / 2).is_empty());
        std::fs::write(&f, "ab").unwrap(); // still growing
        assert!(ap.ready(t0 + SETTLE).is_empty());
        let t1 = t0 + SETTLE;
        assert_eq!(ap.ready(t1 + SETTLE), vec![(root.clone(), vec![f.clone()])]);
        assert_eq!(ap.pending_count(), 0);
    }

    #[test]
    fn ignores_partials_hidden_subfolders_and_outside() {
        let (_d, root, mut ap) = setup();
        std::fs::create_dir(root.join("Images")).unwrap();
        let t0 = Instant::now();
        ap.notice(
            [
                root.join("x.zip.crdownload"),
                root.join(".DS_Store"),
                root.join("Images/cat.jpg"),
                PathBuf::from("/elsewhere/file.txt"),
            ],
            t0,
        );
        assert_eq!(ap.pending_count(), 0);
    }

    #[test]
    fn firefox_placeholder_waits_for_part_file() {
        let (_d, root, mut ap) = setup();
        let f = root.join("big.iso");
        std::fs::write(&f, "").unwrap();
        std::fs::write(root.join("big.iso.part"), "partial").unwrap();
        let t0 = Instant::now();
        ap.notice([f.clone()], t0);
        ap.ready(t0);
        assert!(ap.ready(t0 + SETTLE * 2).is_empty());
        std::fs::remove_file(root.join("big.iso.part")).unwrap();
        assert_eq!(ap.ready(t0 + SETTLE * 3).len(), 1);
    }

    #[test]
    fn own_output_is_not_reprocessed() {
        let (_d, root, mut ap) = setup();
        let f = root.join("2026 report.pdf");
        std::fs::write(&f, "x").unwrap();
        let t0 = Instant::now();
        ap.produced([f.clone()], t0);
        ap.notice([f.clone()], t0 + Duration::from_secs(1));
        assert_eq!(ap.pending_count(), 0);
        // After the quiet period, real changes count again.
        ap.notice([f.clone()], t0 + QUIET + Duration::from_secs(1));
        assert_eq!(ap.pending_count(), 1);
    }

    #[test]
    fn vanished_files_are_dropped() {
        let (_d, root, mut ap) = setup();
        let f = root.join("temp.txt");
        std::fs::write(&f, "x").unwrap();
        let t0 = Instant::now();
        ap.notice([f.clone()], t0);
        std::fs::remove_file(&f).unwrap();
        assert!(ap.ready(t0 + SETTLE * 2).is_empty());
        assert_eq!(ap.pending_count(), 0);
    }
}
