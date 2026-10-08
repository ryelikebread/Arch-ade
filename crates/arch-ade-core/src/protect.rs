//! Project-folder protection. A folder that looks like a code, game-engine or
//! 3D project is treated as one unit: recursive scans list the folder but not
//! its contents, and no plan may move, rename or trash anything inside it.

use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ProjectKind {
    Git,
    OtherVcs,
    Node,
    Rust,
    Python,
    Go,
    Java,
    Dotnet,
    Xcode,
    Cmake,
    Unity,
    Unreal,
    Godot,
    Blender,
    Other,
}

impl ProjectKind {
    pub fn label(self) -> &'static str {
        match self {
            ProjectKind::Git => "Git repository",
            ProjectKind::OtherVcs => "Version-controlled folder",
            ProjectKind::Node => "Node/JavaScript project",
            ProjectKind::Rust => "Rust project",
            ProjectKind::Python => "Python project",
            ProjectKind::Go => "Go project",
            ProjectKind::Java => "Java/Kotlin project",
            ProjectKind::Dotnet => ".NET project",
            ProjectKind::Xcode => "Xcode project",
            ProjectKind::Cmake => "CMake project",
            ProjectKind::Unity => "Unity project",
            ProjectKind::Unreal => "Unreal project",
            ProjectKind::Godot => "Godot project",
            ProjectKind::Blender => "Blender project",
            ProjectKind::Other => "Project folder",
        }
    }
}

/// Files or folders whose presence marks their parent as a project root.
const EXACT_MARKERS: &[(&str, ProjectKind)] = &[
    (".git", ProjectKind::Git),
    (".hg", ProjectKind::OtherVcs),
    (".svn", ProjectKind::OtherVcs),
    (".jj", ProjectKind::OtherVcs),
    ("package.json", ProjectKind::Node),
    ("deno.json", ProjectKind::Node),
    ("Cargo.toml", ProjectKind::Rust),
    ("pyproject.toml", ProjectKind::Python),
    ("setup.py", ProjectKind::Python),
    ("requirements.txt", ProjectKind::Python),
    ("go.mod", ProjectKind::Go),
    ("pom.xml", ProjectKind::Java),
    ("build.gradle", ProjectKind::Java),
    ("build.gradle.kts", ProjectKind::Java),
    ("CMakeLists.txt", ProjectKind::Cmake),
    ("composer.json", ProjectKind::Other),
    ("Gemfile", ProjectKind::Other),
    ("Package.swift", ProjectKind::Xcode),
    ("pubspec.yaml", ProjectKind::Other),
    ("project.godot", ProjectKind::Godot),
];

/// Extensions of files that mark their folder as a project root.
const EXT_MARKERS: &[(&str, ProjectKind)] = &[
    ("uproject", ProjectKind::Unreal),
    ("sln", ProjectKind::Dotnet),
    ("csproj", ProjectKind::Dotnet),
    ("xcodeproj", ProjectKind::Xcode),
    ("xcworkspace", ProjectKind::Xcode),
    ("blend", ProjectKind::Blender),
];

/// What kind of project `dir` is the root of, if any. Reads one directory
/// listing; never recurses.
pub fn project_kind(dir: &Path) -> Option<ProjectKind> {
    let entries = std::fs::read_dir(dir).ok()?;
    let mut has_assets = false;
    let mut has_project_settings = false;
    let mut found: Option<ProjectKind> = None;
    for e in entries.flatten() {
        let name = e.file_name();
        let name = name.to_string_lossy();
        if let Some((_, k)) = EXACT_MARKERS.iter().find(|(m, _)| *m == name) {
            // Prefer the most specific kind; VCS markers are the most telling.
            if found.is_none() || matches!(k, ProjectKind::Git) {
                found = Some(*k);
            }
            continue;
        }
        if name == "Assets" {
            has_assets = true;
        } else if name == "ProjectSettings" {
            has_project_settings = true;
        }
        if let Some(ext) = Path::new(&*name).extension().map(|x| x.to_string_lossy().to_ascii_lowercase()) {
            if let Some((_, k)) = EXT_MARKERS.iter().find(|(m, _)| *m == ext) {
                found = found.or(Some(*k));
            }
        }
    }
    if has_assets && has_project_settings {
        return Some(ProjectKind::Unity);
    }
    found
}

/// The project root that contains `path`, looking at the folders strictly
/// between `root` (the folder the user opened or watches) and `path`. The
/// opened folder itself is never treated as a project here, so a
/// `package.json` downloaded into Downloads doesn't freeze all of Downloads.
pub fn enclosing_project(root: &Path, path: &Path) -> Option<(PathBuf, ProjectKind)> {
    let rel = path.strip_prefix(root).ok()?;
    let mut cur = root.to_path_buf();
    let mut comps = rel.components().peekable();
    while let Some(c) = comps.next() {
        if comps.peek().is_none() {
            break; // `path` itself: callers decide whether a project root may be moved whole
        }
        cur.push(c);
        if let Some(k) = project_kind(&cur) {
            return Some((cur, k));
        }
    }
    None
}

/// Like [`enclosing_project`] but checks every root and returns a message
/// for a plan issue.
pub fn protection_issue(roots: &[PathBuf], path: &Path) -> Option<String> {
    let root = roots.iter().filter(|r| path.starts_with(r)).max_by_key(|r| r.components().count())?;
    enclosing_project(root, path).map(|(dir, kind)| {
        format!("inside the {} at {}; project folders are kept intact", kind.label().to_lowercase(), dir.display())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mk(root: &Path, files: &[&str]) {
        for f in files {
            let p = root.join(f);
            if f.ends_with('/') {
                std::fs::create_dir_all(&p).unwrap();
            } else {
                std::fs::create_dir_all(p.parent().unwrap()).unwrap();
                std::fs::write(&p, "x").unwrap();
            }
        }
    }

    #[test]
    fn detects_kinds() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        mk(
            r,
            &[
                "git/.git/",
                "node/package.json",
                "rust/Cargo.toml",
                "unity/Assets/",
                "unity/ProjectSettings/",
                "unreal/Game.uproject",
                "godot/project.godot",
                "blender/scene.blend",
                "plain/notes.txt",
                "assets-only/Assets/",
                "both/.git/",
                "both/package.json",
            ],
        );
        assert_eq!(project_kind(&r.join("git")), Some(ProjectKind::Git));
        assert_eq!(project_kind(&r.join("node")), Some(ProjectKind::Node));
        assert_eq!(project_kind(&r.join("rust")), Some(ProjectKind::Rust));
        assert_eq!(project_kind(&r.join("unity")), Some(ProjectKind::Unity));
        assert_eq!(project_kind(&r.join("unreal")), Some(ProjectKind::Unreal));
        assert_eq!(project_kind(&r.join("godot")), Some(ProjectKind::Godot));
        assert_eq!(project_kind(&r.join("blender")), Some(ProjectKind::Blender));
        assert_eq!(project_kind(&r.join("plain")), None);
        assert_eq!(project_kind(&r.join("assets-only")), None);
        assert_eq!(project_kind(&r.join("both")), Some(ProjectKind::Git));
    }

    #[test]
    fn enclosing_skips_the_root_and_the_path_itself() {
        let d = tempfile::tempdir().unwrap();
        let r = d.path();
        mk(r, &["package.json", "app/.git/", "app/src/main.rs", "loose.txt"]);
        // The opened folder having a package.json doesn't protect everything.
        assert!(enclosing_project(r, &r.join("loose.txt")).is_none());
        // The project folder itself is not "inside" a project.
        assert!(enclosing_project(r, &r.join("app")).is_none());
        let (dir, kind) = enclosing_project(r, &r.join("app/src/main.rs")).unwrap();
        assert_eq!(dir, r.join("app"));
        assert_eq!(kind, ProjectKind::Git);
        assert!(protection_issue(&[r.to_path_buf()], &r.join("app/src")).is_some());
        // A target that doesn't exist yet inside a project is still protected.
        assert!(protection_issue(&[r.to_path_buf()], &r.join("app/new/file.txt")).is_some());
    }
}
