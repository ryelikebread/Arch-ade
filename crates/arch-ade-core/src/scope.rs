//! The guard every file operation passes through: a path must resolve inside
//! one of the folders the user selected (or chose as a destination).

use std::path::{Component, Path, PathBuf};
use std::sync::RwLock;

use crate::{Error, Result};

#[derive(Debug, Default)]
pub struct Scope {
    roots: RwLock<Vec<PathBuf>>,
}

impl Scope {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register a folder the user picked. Returns its canonical form.
    pub fn add_root(&self, root: &Path) -> Result<PathBuf> {
        let canon = std::fs::canonicalize(root)?;
        if !canon.is_dir() {
            return Err(Error::Other(format!("{} is not a folder", root.display())));
        }
        let mut roots = self.roots.write().unwrap_or_else(|e| e.into_inner());
        if !roots.contains(&canon) {
            roots.push(canon.clone());
        }
        Ok(canon)
    }

    pub fn roots(&self) -> Vec<PathBuf> {
        self.roots.read().unwrap_or_else(|e| e.into_inner()).clone()
    }

    /// Resolve `path` (which may not exist yet) and make sure it is strictly
    /// inside a root. Symlinks in parent folders are resolved, so a link
    /// pointing outside the root can't be used to escape it; the final
    /// component itself is not followed, so operations act on a link, not
    /// its target.
    pub fn check(&self, path: &Path) -> Result<PathBuf> {
        let resolved = resolve_lexically_safe(path)?;
        let roots = self.roots.read().unwrap_or_else(|e| e.into_inner());
        if roots.iter().any(|r| resolved.starts_with(r) && resolved != *r) {
            Ok(resolved)
        } else {
            Err(Error::OutOfScope(path.to_path_buf()))
        }
    }

    /// Like [`check`](Self::check) but also allows the root folder itself
    /// (for reading/listing, never as an operation target).
    pub fn check_readable(&self, path: &Path) -> Result<PathBuf> {
        let resolved = resolve_lexically_safe(path)?;
        let roots = self.roots.read().unwrap_or_else(|e| e.into_inner());
        if roots.iter().any(|r| resolved.starts_with(r)) {
            Ok(resolved)
        } else {
            Err(Error::OutOfScope(path.to_path_buf()))
        }
    }
}

/// Canonicalize the deepest existing ancestor, then re-append the remaining
/// components, refusing `..` anywhere in the not-yet-existing tail.
fn resolve_lexically_safe(path: &Path) -> Result<PathBuf> {
    if !path.is_absolute() {
        return Err(Error::OutOfScope(path.to_path_buf()));
    }
    let file_name = path.file_name().ok_or_else(|| Error::OutOfScope(path.to_path_buf()))?;
    let parent = path.parent().ok_or_else(|| Error::OutOfScope(path.to_path_buf()))?;

    let mut tail: Vec<&std::ffi::OsStr> = vec![file_name];
    let mut base = parent;
    let canon_base = loop {
        match std::fs::canonicalize(base) {
            Ok(c) => break c,
            Err(_) => {
                let name = base.file_name().ok_or_else(|| Error::OutOfScope(path.to_path_buf()))?;
                tail.push(name);
                base = base.parent().ok_or_else(|| Error::OutOfScope(path.to_path_buf()))?;
            }
        }
    };
    let mut out = canon_base;
    for c in tail.iter().rev() {
        match Path::new(c).components().next() {
            Some(Component::Normal(_)) => out.push(c),
            _ => return Err(Error::OutOfScope(path.to_path_buf())),
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inside_outside_and_root() {
        let base = tempfile::tempdir().unwrap();
        let root = base.path().join("root");
        let other = base.path().join("other");
        std::fs::create_dir_all(root.join("sub")).unwrap();
        std::fs::create_dir_all(&other).unwrap();
        std::fs::write(root.join("a.txt"), "a").unwrap();

        let scope = Scope::new();
        let canon_root = scope.add_root(&root).unwrap();

        assert!(scope.check(&root.join("a.txt")).is_ok());
        assert!(scope.check(&root.join("new/deeper/b.txt")).is_ok());
        assert!(scope.check(&root.join("sub/../a.txt")).is_ok()); // resolves inside
        assert!(scope.check(&root.join("../other/x")).is_err());
        assert!(scope.check(&other.join("x")).is_err());
        assert!(scope.check(&root).is_err(), "root itself is not a target");
        assert_eq!(scope.check_readable(&root).unwrap(), canon_root);
        assert!(scope.check(Path::new("relative.txt")).is_err());
        assert!(scope.check(&root.join("missing/../../other/x")).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn symlink_escape_blocked() {
        let base = tempfile::tempdir().unwrap();
        let root = base.path().join("root");
        let outside = base.path().join("outside");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::os::unix::fs::symlink(&outside, root.join("link")).unwrap();
        let scope = Scope::new();
        scope.add_root(&root).unwrap();
        assert!(scope.check(&root.join("link/file.txt")).is_err());
        // The link itself is inside and may be operated on.
        assert!(scope.check(&root.join("link")).is_ok());
    }
}
