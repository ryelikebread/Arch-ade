//! Copy and zip helpers used by the journal. Both write to a temporary name
//! next to the target and rename it into place at the end, so a crash never
//! leaves a half-written file under the final name.

use std::io::Write;
use std::path::{Path, PathBuf};

use crate::{Error, Result};

fn temp_beside(target: &Path) -> PathBuf {
    let stamp = chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0);
    target.with_file_name(format!(".arch-ade-partial-{stamp}"))
}

fn refuse_existing(to: &Path) -> Result<()> {
    if std::fs::symlink_metadata(to).is_ok() {
        return Err(Error::Plan(format!("{} already exists", to.display())));
    }
    Ok(())
}

/// Copy a file or a folder tree. Links inside a folder are not followed or
/// copied; the copy stops with an error instead of silently leaving them out.
pub fn copy(from: &Path, to: &Path) -> Result<()> {
    refuse_existing(to)?;
    let md = std::fs::symlink_metadata(from)?;
    let tmp = temp_beside(to);
    let result = if md.is_dir() {
        copy_tree(from, &tmp)
    } else if md.file_type().is_symlink() {
        Err(Error::Other(format!("{} is a link; links are not copied", from.display())))
    } else {
        std::fs::copy(from, &tmp).map(|_| ()).map_err(Error::from)
    };
    match result.and_then(|_| std::fs::rename(&tmp, to).map_err(Error::from)) {
        Ok(()) => Ok(()),
        Err(e) => {
            let _ = remove_partial(&tmp);
            Err(e)
        }
    }
}

fn copy_tree(from: &Path, to: &Path) -> Result<()> {
    for entry in walkdir::WalkDir::new(from).follow_links(false) {
        let entry = entry.map_err(|e| Error::Other(e.to_string()))?;
        let rel = entry.path().strip_prefix(from).map_err(|e| Error::Other(e.to_string()))?;
        let dest = to.join(rel);
        let ft = entry.file_type();
        if ft.is_dir() {
            std::fs::create_dir_all(&dest)?;
        } else if ft.is_symlink() {
            return Err(Error::Other(format!("{} is a link; links are not copied", entry.path().display())));
        } else {
            std::fs::copy(entry.path(), &dest)?;
        }
    }
    Ok(())
}

/// Zip a file or a folder (stored under its own name inside the zip).
pub fn zip(from: &Path, to: &Path) -> Result<()> {
    refuse_existing(to)?;
    let tmp = temp_beside(to);
    let result = write_zip(from, &tmp).and_then(|_| std::fs::rename(&tmp, to).map_err(Error::from));
    if result.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    result
}

fn write_zip(from: &Path, out: &Path) -> Result<()> {
    let file = std::fs::OpenOptions::new().write(true).create_new(true).open(out)?;
    let mut zw = zip::ZipWriter::new(std::io::BufWriter::new(file));
    let opts =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated).large_file(true);
    let base = from.parent().unwrap_or(from);
    for entry in walkdir::WalkDir::new(from).follow_links(false).sort_by_file_name() {
        let entry = entry.map_err(|e| Error::Other(e.to_string()))?;
        let rel = entry.path().strip_prefix(base).map_err(|e| Error::Other(e.to_string()))?;
        // Zip paths always use '/'.
        let name = rel.components().map(|c| c.as_os_str().to_string_lossy()).collect::<Vec<_>>().join("/");
        let ft = entry.file_type();
        let zerr = |e: zip::result::ZipError| Error::Other(format!("zip: {e}"));
        if ft.is_dir() {
            zw.add_directory(format!("{name}/"), opts).map_err(zerr)?;
        } else if ft.is_symlink() {
            return Err(Error::Other(format!("{} is a link; links are not archived", entry.path().display())));
        } else {
            zw.start_file(name, opts).map_err(zerr)?;
            let mut f = std::fs::File::open(entry.path())?;
            std::io::copy(&mut f, &mut zw)?;
        }
    }
    let mut inner = zw.finish().map_err(|e| Error::Other(format!("zip: {e}")))?;
    inner.flush()?;
    inner.into_inner().map_err(|e| Error::Other(e.to_string()))?.sync_all()?;
    Ok(())
}

/// Only ever called on our own `.arch-ade-partial-*` temp output.
fn remove_partial(tmp: &Path) -> std::io::Result<()> {
    debug_assert!(tmp.file_name().is_some_and(|n| n.to_string_lossy().starts_with(".arch-ade-partial-")));
    if tmp.is_dir() {
        std::fs::remove_dir_all(tmp)
    } else {
        std::fs::remove_file(tmp)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    #[test]
    fn copies_files_and_trees() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        std::fs::write(r.join("a.txt"), "A").unwrap();
        std::fs::create_dir_all(r.join("dir/sub")).unwrap();
        std::fs::write(r.join("dir/sub/b.txt"), "B").unwrap();
        copy(&r.join("a.txt"), &r.join("a copy.txt")).unwrap();
        copy(&r.join("dir"), &r.join("dir2")).unwrap();
        assert_eq!(std::fs::read_to_string(r.join("a copy.txt")).unwrap(), "A");
        assert_eq!(std::fs::read_to_string(r.join("dir2/sub/b.txt")).unwrap(), "B");
        assert!(copy(&r.join("a.txt"), &r.join("dir2")).is_err(), "never overwrites");
        let leftovers =
            std::fs::read_dir(r).unwrap().flatten().any(|e| e.file_name().to_string_lossy().contains("partial"));
        assert!(!leftovers);
    }

    #[test]
    fn zips_a_folder() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        std::fs::create_dir_all(r.join("old/inner")).unwrap();
        std::fs::write(r.join("old/inner/x.txt"), "hello").unwrap();
        zip(&r.join("old"), &r.join("old.zip")).unwrap();
        let mut z = ::zip::ZipArchive::new(std::fs::File::open(r.join("old.zip")).unwrap()).unwrap();
        let mut s = String::new();
        z.by_name("old/inner/x.txt").unwrap().read_to_string(&mut s).unwrap();
        assert_eq!(s, "hello");
        assert!(zip(&r.join("old"), &r.join("old.zip")).is_err(), "never overwrites");
    }
}
