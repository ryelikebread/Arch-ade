//! Shared test helpers: a temp folder in scope, an in-memory database and a
//! fake platform whose trash and tags live in the temp folder / memory, so
//! tests never touch the user's real trash or files.
#![allow(dead_code)]

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use arch_ade_core::db::Db;
use arch_ade_core::names::NameRules;
use arch_ade_core::platform::{Os, Platform, RawSource, TrashReceipt};
use arch_ade_core::scope::Scope;
use arch_ade_core::tools::Tools;

pub struct FakeTrash {
    pub dir: PathBuf,
    pub n: Mutex<u32>,
    /// Raw `user.xdg.tags`-style values by path.
    pub tags: Mutex<HashMap<PathBuf, Vec<u8>>>,
    /// Act like Windows, which has no file tags.
    pub no_tags: AtomicBool,
    /// Use the Mac's case-insensitive name rules.
    pub mac_names: AtomicBool,
}

impl Platform for FakeTrash {
    fn os(&self) -> Os {
        Os::Linux
    }
    fn name_rules(&self) -> NameRules {
        if self.mac_names.load(Ordering::Relaxed) {
            NameRules::Macos
        } else {
            NameRules::Linux
        }
    }
    fn modifier_label(&self) -> &'static str {
        "Ctrl"
    }
    fn trash(&self, path: &Path) -> arch_ade_core::Result<TrashReceipt> {
        let mut n = self.n.lock().unwrap();
        *n += 1;
        let dst = self.dir.join(format!("{n}-{}", path.file_name().unwrap().to_string_lossy()));
        std::fs::rename(path, &dst)?;
        Ok(TrashReceipt { original: path.to_path_buf(), token: Some(dst.to_string_lossy().into()) })
    }
    fn restore(&self, r: &TrashReceipt) -> arch_ade_core::Result<()> {
        std::fs::rename(r.token.as_ref().unwrap(), &r.original)?;
        Ok(())
    }
    fn raw_source(&self, _: &Path) -> RawSource {
        RawSource::default()
    }
    fn added_time(&self, _: &Path) -> Option<i64> {
        None
    }
    fn os_thumbnail(&self, _: &Path, _: u32, _: &Tools) -> Option<Vec<u8>> {
        None
    }
    fn extra_tool_dirs(&self) -> Vec<PathBuf> {
        vec![]
    }
    fn tags_supported(&self) -> bool {
        !self.no_tags.load(Ordering::Relaxed)
    }
    fn read_tags(&self, path: &Path) -> Vec<String> {
        self.tags.lock().unwrap().get(path).map(|r| arch_ade_core::tags::xdg_names(r)).unwrap_or_default()
    }
    fn add_tags(&self, path: &Path, tags: &[String]) -> arch_ade_core::Result<Option<Vec<u8>>> {
        let mut map = self.tags.lock().unwrap();
        let prev = map.get(path).cloned();
        map.insert(path.to_path_buf(), arch_ade_core::tags::xdg_add(prev.as_deref(), tags));
        Ok(prev)
    }
    fn restore_tags(&self, path: &Path, previous: Option<&[u8]>) -> arch_ade_core::Result<()> {
        let mut map = self.tags.lock().unwrap();
        match previous {
            Some(p) => map.insert(path.to_path_buf(), p.to_vec()),
            None => map.remove(path),
        };
        Ok(())
    }
}

pub struct Env {
    pub _tmp: tempfile::TempDir,
    pub root: PathBuf,
    pub scope: Scope,
    pub db: Db,
    pub fake: FakeTrash,
}

pub fn env(files: &[(&str, &str)]) -> Env {
    let tmp = tempfile::tempdir().unwrap();
    let base = std::fs::canonicalize(tmp.path()).unwrap();
    let root = base.join("root");
    let trash = base.join("trash");
    std::fs::create_dir_all(&root).unwrap();
    std::fs::create_dir_all(&trash).unwrap();
    for (name, content) in files {
        let p = root.join(name);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(p, content).unwrap();
    }
    let scope = Scope::new();
    scope.add_root(&root).unwrap();
    Env {
        _tmp: tmp,
        root,
        scope,
        db: Db::open_in_memory().unwrap(),
        fake: FakeTrash {
            dir: trash,
            n: Mutex::new(0),
            tags: Mutex::new(HashMap::new()),
            no_tags: AtomicBool::new(false),
            mac_names: AtomicBool::new(false),
        },
    }
}

pub fn read(p: &Path) -> String {
    std::fs::read_to_string(p).unwrap()
}
