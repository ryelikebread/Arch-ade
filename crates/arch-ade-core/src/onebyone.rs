//! File-by-File mode: each decision about one file becomes one small plan,
//! applied (or, in dry run, only shown) right away and journaled like any
//! other, so Undo walks back through the session one file at a time.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::plan::{free_target, Plan, Planner};

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Decision {
    /// Into `dest` (created if missing), keeping the name; " (2)" is added if
    /// the name is taken there.
    Move {
        dest: PathBuf,
    },
    /// New name in the same folder. A taken name is an error, not renumbered:
    /// the user typed exactly this name.
    Rename {
        name: String,
    },
    Trash,
    /// Permanent; the UI asks for confirmation first.
    Delete,
}

pub fn plan(planner: &Planner, path: &Path, decision: &Decision) -> Plan {
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    match decision {
        Decision::Trash => planner.trash(&[path.to_path_buf()], format!("Trash {name}")),
        Decision::Delete => planner.delete(path, format!("Delete {name} permanently")),
        Decision::Rename { name: new } => {
            let new = new.trim();
            if new.contains(['/', '\\']) || new == "." || new == ".." {
                let mut p = Plan { label: format!("Rename {name}"), ..Default::default() };
                p.issues.push(crate::plan::Issue {
                    path: path.to_path_buf(),
                    message: "a name can't contain / or \\".into(),
                    blocking: true,
                });
                return p;
            }
            let to = path.with_file_name(new);
            planner.moves(&[(path.to_path_buf(), to)], format!("Rename {name} to {new}"))
        }
        Decision::Move { dest } => {
            let where_ = dest
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| dest.display().to_string());
            let label = format!("Move {name} to {where_}");
            if path.parent() == Some(dest.as_path()) {
                let mut p = Plan { label, ..Default::default() };
                p.issues.push(crate::plan::Issue {
                    path: path.to_path_buf(),
                    message: "already in that folder".into(),
                    blocking: false,
                });
                return p;
            }
            let Some(to) = free_target(planner.rules, dest, &name, path, &mut HashSet::new()) else {
                let mut p = Plan { label, ..Default::default() };
                p.issues.push(crate::plan::Issue {
                    path: dest.join(&name),
                    message: "no free name for this file in that folder".into(),
                    blocking: true,
                });
                return p;
            };
            let renamed = to.file_name().map(|n| n.to_string_lossy() != name).unwrap_or(false);
            let mut p = planner.moves(&[(path.to_path_buf(), to.clone())], label);
            if renamed {
                p.issues.push(crate::plan::Issue {
                    path: to,
                    message: format!("{name} already exists there, so it gets a number"),
                    blocking: false,
                });
            }
            p
        }
    }
}

/// Folders offered by the Move quick-pick: the open folder's own subfolders
/// (not hidden, not project folders), sorted by name.
pub fn subfolders(root: &Path) -> Vec<PathBuf> {
    let Ok(rd) = std::fs::read_dir(root) else { return vec![] };
    let mut out: Vec<PathBuf> = rd
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .map(|e| e.path())
        .filter(|p| !p.file_name().map(|n| n.to_string_lossy().starts_with('.')).unwrap_or(true))
        .filter(|p| crate::protect::project_kind(p).is_none())
        .collect();
    out.sort_by_key(|p| p.file_name().map(|n| n.to_string_lossy().to_lowercase()));
    out
}
