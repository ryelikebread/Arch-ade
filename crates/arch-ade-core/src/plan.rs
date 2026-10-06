//! Dry-run plans. Every change to the filesystem is first described as a
//! [`Plan`]; nothing touches disk until the journal applies a saved plan.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};

use crate::names::{self, NameRules};
use crate::scope::Scope;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Op {
    Mkdir { path: PathBuf },
    Move { from: PathBuf, to: PathBuf },
    Trash { path: PathBuf },
}

/// Size + modification time captured at plan time. If either changed by the
/// time the plan is applied, that op refuses to run.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Fingerprint {
    pub size: u64,
    pub mtime_ns: i64,
}

impl Fingerprint {
    pub fn of(path: &Path) -> Option<Self> {
        let md = std::fs::symlink_metadata(path).ok()?;
        if md.is_dir() {
            return None; // folder mtimes change whenever their contents do
        }
        let mtime_ns = md.modified().ok()?.duration_since(UNIX_EPOCH).map(|d| d.as_nanos() as i64).unwrap_or(0);
        Some(Fingerprint { size: md.len(), mtime_ns })
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedOp {
    #[serde(flatten)]
    pub op: Op,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expect: Option<Fingerprint>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub path: PathBuf,
    pub message: String,
    /// Blocking issues prevent the plan from being applied at all.
    pub blocking: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub label: String,
    pub ops: Vec<PlannedOp>,
    pub issues: Vec<Issue>,
}

impl Plan {
    pub fn is_blocked(&self) -> bool {
        self.issues.iter().any(|i| i.blocking)
    }
    fn issue(&mut self, path: &Path, message: impl Into<String>, blocking: bool) {
        self.issues.push(Issue { path: path.to_path_buf(), message: message.into(), blocking });
    }
}

pub struct Planner<'a> {
    pub scope: &'a Scope,
    pub rules: NameRules,
}

type DirKey = (PathBuf, String);

impl<'a> Planner<'a> {
    pub fn new(scope: &'a Scope, rules: NameRules) -> Self {
        Planner { scope, rules }
    }

    fn key(&self, p: &Path) -> DirKey {
        let parent = p.parent().map(Path::to_path_buf).unwrap_or_default();
        let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        (parent, names::fold_key(self.rules, &name))
    }

    /// Move each path to the OS trash.
    pub fn trash(&self, paths: &[PathBuf], label: impl Into<String>) -> Plan {
        let mut plan = Plan { label: label.into(), ..Default::default() };
        let mut checked: Vec<PathBuf> = Vec::new();
        for p in paths {
            match self.scope.check(p) {
                Ok(c) if std::fs::symlink_metadata(&c).is_ok() => checked.push(c),
                Ok(_) => plan.issue(p, "file no longer exists", false),
                Err(e) => plan.issue(p, e.to_string(), true),
            }
        }
        // If a folder is trashed, its selected children go with it.
        checked.sort();
        checked.dedup();
        let mut kept: Vec<PathBuf> = Vec::new();
        for p in checked {
            if !kept.iter().any(|k| p.starts_with(k)) {
                kept.push(p);
            }
        }
        for p in kept {
            plan.ops.push(PlannedOp { expect: Fingerprint::of(&p), op: Op::Trash { path: p } });
        }
        plan
    }

    /// Move/rename `from -> to` for each pair. Creates missing parent folders,
    /// rejects invalid names and collisions, and routes through temporary
    /// names when targets overlap with other sources (e.g. swapping a<->b or
    /// renumbering 1..n).
    pub fn moves(&self, pairs: &[(PathBuf, PathBuf)], label: impl Into<String>) -> Plan {
        let mut plan = Plan { label: label.into(), ..Default::default() };
        let mut moves: Vec<(PathBuf, PathBuf)> = Vec::new();

        for (from, to) in pairs {
            let from_c = match self.scope.check(from) {
                Ok(c) => c,
                Err(e) => {
                    plan.issue(from, e.to_string(), true);
                    continue;
                }
            };
            if std::fs::symlink_metadata(&from_c).is_err() {
                plan.issue(from, "file no longer exists", true);
                continue;
            }
            let to_c = match self.scope.check(to) {
                Ok(c) => c,
                Err(e) => {
                    plan.issue(to, e.to_string(), true);
                    continue;
                }
            };
            let name = to_c.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            if let Err(e) = names::validate(self.rules, &name) {
                plan.issue(to, e.to_string(), true);
                continue;
            }
            if from_c == to_c {
                plan.issue(from, "name unchanged, skipped", false);
                continue;
            }
            if to_c.starts_with(&from_c) {
                plan.issue(to, "cannot move a folder into itself", true);
                continue;
            }
            moves.push((from_c, to_c));
        }

        // Two targets that would be the same directory entry.
        let mut seen: HashMap<DirKey, PathBuf> = HashMap::new();
        for (_, to) in &moves {
            if let Some(prev) = seen.insert(self.key(to), to.clone()) {
                plan.issue(to, format!("two files would both be named {}", prev.display()), true);
            }
        }

        let source_keys: HashSet<DirKey> = moves.iter().map(|(f, _)| self.key(f)).collect();
        let mut needs_temp = false;
        for (from, to) in &moves {
            let case_only = self.key(from) == self.key(to);
            if case_only || std::fs::symlink_metadata(to).is_err() {
                continue;
            }
            if source_keys.contains(&self.key(to)) {
                needs_temp = true; // target is freed by another move in this plan
            } else {
                plan.issue(to, "a file with this name already exists", true);
            }
        }

        // Folders to create, shallowest first.
        let mut dirs: Vec<PathBuf> = Vec::new();
        for (_, to) in &moves {
            let mut cur = to.parent();
            let mut chain = vec![];
            while let Some(d) = cur {
                if d.exists() || dirs.contains(&d.to_path_buf()) {
                    break;
                }
                chain.push(d.to_path_buf());
                cur = d.parent();
            }
            for d in chain.into_iter().rev() {
                if let Err(e) = self.scope.check(&d) {
                    plan.issue(&d, e.to_string(), true);
                } else if let Some(n) = d.file_name() {
                    if let Err(e) = names::validate(self.rules, &n.to_string_lossy()) {
                        plan.issue(&d, e.to_string(), true);
                    }
                }
                dirs.push(d);
            }
        }
        for d in dirs {
            plan.ops.push(PlannedOp { op: Op::Mkdir { path: d }, expect: None });
        }

        if needs_temp {
            let stamp = std::time::SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
            let mut second = Vec::new();
            for (i, (from, to)) in moves.iter().enumerate() {
                let tmp = from.with_file_name(format!(".arch-ade-tmp-{stamp}-{i}"));
                plan.ops.push(PlannedOp {
                    expect: Fingerprint::of(from),
                    op: Op::Move { from: from.clone(), to: tmp.clone() },
                });
                second.push(PlannedOp { expect: None, op: Op::Move { from: tmp, to: to.clone() } });
            }
            plan.ops.extend(second);
        } else {
            for (from, to) in moves {
                plan.ops.push(PlannedOp { expect: Fingerprint::of(&from), op: Op::Move { from, to } });
            }
        }
        plan
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup(files: &[&str]) -> (tempfile::TempDir, PathBuf, Scope) {
        let dir = tempfile::tempdir().unwrap();
        let root = std::fs::canonicalize(dir.path()).unwrap().join("root");
        std::fs::create_dir_all(&root).unwrap();
        for f in files {
            let p = root.join(f);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(&p, f.as_bytes()).unwrap();
        }
        let scope = Scope::new();
        scope.add_root(&root).unwrap();
        (dir, root, scope)
    }

    #[test]
    fn simple_rename_and_mkdir() {
        let (_d, root, scope) = setup(&["a.txt"]);
        let pl = Planner::new(&scope, NameRules::Linux);
        let plan = pl.moves(&[(root.join("a.txt"), root.join("new/sub/b.txt"))], "t");
        assert!(!plan.is_blocked(), "{:?}", plan.issues);
        let kinds: Vec<_> = plan.ops.iter().map(|o| &o.op).collect();
        assert!(matches!(kinds[0], Op::Mkdir { path } if path.ends_with("new")));
        assert!(matches!(kinds[1], Op::Mkdir { path } if path.ends_with("new/sub")));
        assert!(matches!(kinds[2], Op::Move { .. }));
        assert!(plan.ops[2].expect.is_some());
    }

    #[test]
    fn blocks_existing_invalid_duplicate_and_outside() {
        let (_d, root, scope) = setup(&["a.txt", "b.txt", "c.txt"]);
        let pl = Planner::new(&scope, NameRules::Windows);
        let plan = pl.moves(&[(root.join("a.txt"), root.join("c.txt"))], "t");
        assert!(plan.is_blocked());
        let plan = pl.moves(&[(root.join("a.txt"), root.join("CON.txt"))], "t");
        assert!(plan.is_blocked());
        let plan = pl.moves(&[(root.join("a.txt"), root.join("x.txt")), (root.join("b.txt"), root.join("X.TXT"))], "t");
        assert!(plan.is_blocked(), "case-insensitive duplicate target");
        let plan = pl.moves(&[(root.join("a.txt"), root.join("../escape.txt"))], "t");
        assert!(plan.is_blocked());
    }

    #[test]
    fn swap_uses_temp_names() {
        let (_d, root, scope) = setup(&["a", "b"]);
        let pl = Planner::new(&scope, NameRules::Linux);
        let plan = pl.moves(&[(root.join("a"), root.join("b")), (root.join("b"), root.join("a"))], "swap");
        assert!(!plan.is_blocked(), "{:?}", plan.issues);
        assert_eq!(plan.ops.len(), 4);
    }

    #[test]
    fn unchanged_is_skipped_not_blocking() {
        let (_d, root, scope) = setup(&["a"]);
        let plan = Planner::new(&scope, NameRules::Linux).moves(&[(root.join("a"), root.join("a"))], "t");
        assert!(!plan.is_blocked());
        assert!(plan.ops.is_empty());
        assert_eq!(plan.issues.len(), 1);
    }

    #[test]
    fn trash_dedupes_children() {
        let (_d, root, scope) = setup(&["dir/x", "dir/y", "z"]);
        let plan = Planner::new(&scope, NameRules::Linux)
            .trash(&[root.join("dir/x"), root.join("dir"), root.join("z"), root.join("gone")], "t");
        assert_eq!(plan.ops.len(), 2);
        assert!(!plan.is_blocked());
        assert_eq!(plan.issues.len(), 1);
    }
}
