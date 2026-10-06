# Arch-ade: Phase 1 Architecture Plan

Status: approved 2026-10-06 and implemented for Phase 1. See "Changes made while building" at the end.

## 1. Shape of the app

```
arch-ade/
  src-tauri/                 Rust backend (Tauri 2)
    src/
      main.rs, app.rs        startup, state, command registration
      config.rs              APP_NAME = "Arch-ade" (single rename point), paths
      commands/              thin Tauri IPC handlers (no logic, just call core)
      core/                  OS-agnostic business logic
        scan.rs              folder walk, file records, filters/sort keys
        kind.rs              type detection (extension + magic bytes)
        preview/             per-type preview providers (see 3)
        dupes.rs             size -> 4 KB head+tail hash -> full blake3
        rename.rs            token parser {n:03} {date} {original} {ext}, live preview
        plan.rs              dry-run Plan = ordered list of Ops, conflict checks
        journal.rs           apply Plan, record each Op, undo/redo
        scope.rs             "allowed roots" guard every path must pass
        tools.rs             detect ffprobe/exiftool/bsdtar/7z/qlmanage at startup
      platform/              the ONLY place with #[cfg]
        mod.rs               trait Platform { ... }
        macos.rs  windows.rs  linux.rs
      db/                    SQLite schema, migrations, cache, journal tables
    tests/                   rename, journal/undo, path validation, plan
  src/                       TypeScript frontend (Vite, no framework or Preact)
    ui/                      table, filters, preview pane, rename dialog, dupes view
    pixel/                   8-bit renderer: palette, bitmap font, canvas widgets
    themes/*.json            color schemes
    help/                    Quick Start + FAQ (markdown bundled)
  tools/gen-test-folder/     sample test-folder generator (Rust bin or Node script)
  .github/workflows/ci.yml   macos / windows / ubuntu matrix (tests now, bundles later)
  README.md  CHANGELOG.md  PLATFORM_SUPPORT.md
```

Rule: frontend never touches the filesystem directly. Every file operation is a
Rust command that builds a Plan; "apply" is a separate command that takes the
Plan id. Dry-run simply stops after the Plan is shown.

## 2. Platform trait (all OS differences behind it)

```rust
trait Platform {
    fn trash(&self, paths: &[PathBuf]) -> Result<Vec<TrashReceipt>>;   // + restore for undo
    fn restore_from_trash(&self, r: &TrashReceipt) -> Result<()>;
    fn download_source(&self, p: &Path) -> Source { url, referrer, app: Option<String>, confidence }
    fn os_thumbnail(&self, p: &Path, px: u32) -> Option<Image>;
    fn validate_name(&self, name: &str, parent: &Path) -> Result<(), NameError>;
    fn names_collide(&self, a: &str, b: &str) -> bool;   // case-fold + NFC/NFD rules
    fn normalize_for_fs(&self, p: &Path) -> PathBuf;      // \\?\ long paths on Windows
    fn created_time / added_time(&self, p) -> Option<SystemTime>;
    fn default_dirs(&self) -> DefaultDirs;                // via `dirs`
    fn modifier_key(&self) -> Modifier;                   // Cmd vs Ctrl
}
```

## 3. Crates and dependencies

Rust:
- `tauri` 2, `tauri-plugin-dialog` (folder picker), `tauri-plugin-fs` scoped off
  (we do our own IO), `serde`/`serde_json`, `thiserror`, `anyhow`, `tracing`
- `rusqlite` (bundled SQLite) + `rusqlite_migration`; `r2d2` pool or a single
  writer thread
- `walkdir` (scan), `rayon` (parallel hashing/metadata), `blake3`
- `trash` (OS trash; its `os_limited::restore_all` covers undo on Win/Linux;
  macOS restore = move back from receipt path, see risks)
- `dirs`, `unicode-normalization`, `chrono`
- `infer` (magic-byte type detection), `image` (jpg/png/gif/bmp/ico/tiff decode,
  thumbnail resize)
- `libheif-rs` with bundled libheif (HEIC), feature-gated so a build without it still works
- `rawloader` or `exiftool` embedded-preview extraction for RAW (prefer exiftool
  `-PreviewImage` when present; rawloader fallback for a few common formats)
- `zip` (zip/zipx listing, docx/xlsx text extraction), `quick-xml` (docx/xlsx XML),
  `calamine` (xlsx tables), `tar` + `flate2`/`xz2` for tar.*
- `xattr` (mac/linux source metadata), `plist` (decode kMDItemWhereFroms)
- `windows` crate (IShellItemImageFactory thumbnails, Zone.Identifier stream read)
- `notify` + `notify-debouncer-full`: wired in Phase 1 only for live table refresh;
  rules come in Phase 2

External tools (detected, optional, never required):
- `bsdtar` (rar/7z/iso listing), `7z` fallback, `ffprobe`/`ffmpeg` (media metadata,
  poster frame), `exiftool` (EXIF/XMP/RAW), `qlmanage` (mac), `ffmpegthumbnailer`
  and freedesktop thumbnailers (linux)
- Called with fixed argument arrays (no shell), a timeout, and a size cap on output.
- `.nrg`: listed as ISO-ish via bsdtar when possible, otherwise metadata only.

Frontend (npm):
- `@tauri-apps/api`, `vite`, `typescript`, `pdfjs-dist` (PDF), `marked` +
  `DOMPurify` (md/html rendered in a sandboxed iframe with no scripts, CSP locked),
  `vitest`. No React; Preact only if the table code gets unwieldy.
- Pixel UI: one bitmap font (original or CC0, e.g. a generated 5x7 font),
  canvas-rendered chrome, DOM table underneath for accessibility and speed,
  styled to match. 30 fps cap; static redraw-on-change in the Minimal skin.

## 4. Data model (SQLite, in the OS app-data dir)

- `files(id, root_id, rel_path, size, mtime, ctime, added, kind, mime,
  src_url, src_referrer, src_app, src_confidence, head_hash, full_hash)`
- `cache_thumbs(file_id, mtime, size, px, blob)`; `cache_meta(file_id, json)`
  (invalidated by mtime+size)
- `plans(id, created, label, status)`; `ops(id, plan_id, seq, kind, src, dst,
  trash_receipt, status, error)` with kind in move | rename | trash | mkdir
- `journal_cursor` for undo/redo position; `settings(key, json)`; `themes`

Journal semantics: apply runs ops in order inside a "plan" record; each op is
written as `pending` before it touches disk and `done` after, so a crash
leaves a recoverable state that is shown on next launch. Undo = inverse ops in
reverse order, itself journaled. Redo replays. Permanent delete (Phase 4)
will be the one op marked non-undoable.

## 5. Phase 1 build order

1. Skeleton: Tauri app, config constant, platform trait with stubs, SQLite
   migrations, CI matrix running `cargo test` + `vitest` on all three OSes.
2. Scope guard + per-OS name validation + tests (first, because everything depends on it).
3. Scan + table (sort, filter by kind/size/age/source) + watcher refresh.
4. Preview providers, simplest first: text, images, PDF, docx/xlsx, .gdoc,
   archives listing, media, dmg/pkg metadata, OS thumbnail fallback.
5. Plan/journal/undo/redo + dry-run toggle + tests.
6. Mass rename with live preview (on top of the journal) + tests.
7. Duplicate finder + grouped view.
8. Themes, Help, README, PLATFORM_SUPPORT.md, CHANGELOG.md, test-folder generator.

## 6. Risks per OS

macOS
- Downloads/Desktop/Documents need TCC consent; Full Disk Access for others.
  App must handle permission-denied per entry, not abort the scan.
- `trash` crate on macOS cannot report where Finder put the file; undo of trash
  needs us to locate it in ~/.Trash (name may be suffixed). Plan: use the
  NSFileManager `trashItemAtURL:resultingItemURL:` API through objc2 so we
  get the exact path. Falls back to "undo unavailable" if that fails.
- NFD filenames: compare and display after NFC normalization; write names as given.
- `qlmanage` is slow per call (~100-300 ms); needs a queue and SQLite cache.
- Notarization later requires hardened runtime; spawning external tools is fine
  but they must come from the user's PATH (Homebrew paths not in GUI PATH by
  default: probe /opt/homebrew/bin and /usr/local/bin explicitly).

Windows
- Reserved names (CON, NUL, COM1-9, LPT1-9, with any extension), trailing
  dots/spaces, `<>:"/\|?*`, 260-char limit (use `\\?\` internally, never show it).
- Case-insensitive collisions: renaming `a.txt` -> `A.txt` needs a two-step
  rename via a temp name; the plan must model that.
- Zone.Identifier is only written by browsers that set MOTW, and some (and
  extracted archives) drop HostUrl; "app" column will usually be "unknown".
- Shell thumbnail API requires COM init on a dedicated STA thread.
- Recycle Bin restore via the `trash` crate is supported but slower; large
  undo batches will show progress.
- WebView2 is present on Win11; NSIS installer should bootstrap it for Win10.

Linux
- WebKitGTK canvas is slow and some distros ship old versions; Minimal skin
  default, 30 fps cap, avoid large canvases (render chrome in small tiles).
- `user.xdg.origin.url` is rarely set (Chromium does, Firefox usually doesn't);
  many filesystems (tmpfs, some FUSE, exFAT) don't support xattrs at all.
- freedesktop trash on other mounts uses `$topdir/.Trash-$uid`; removable
  drives may not support trash, in which case we refuse rather than delete.
- inotify watch limits (`max_user_watches`) on large trees: watch only the
  selected folder non-recursively in Phase 1.
- No creation time on many filesystems (statx btime may be missing); show "n/a".
- AppImage + bundled libheif: glibc floor; build CI on the oldest supported
  Ubuntu LTS (22.04).

Cross-cutting
- Files changing under us between plan and apply: re-stat every source just before
  each op; abort that op (not the whole plan) if size/mtime changed.
- Destination collisions computed at plan time AND re-checked at apply time.
- Huge folders (100k+ files): scan streams rows to the UI in batches; hashing is
  on-demand only (dupes view), never on scan.
- Untrusted content: HTML/MD/SVG rendered in a sandboxed iframe with CSP
  `default-src 'none'`; archive entry names displayed only, never joined to paths.
- External tool output parsing differs by version; pin parsers to JSON
  output modes (`ffprobe -of json`, `exiftool -j`, `bsdtar -tv` parsed defensively).

## 7. Decisions I'm defaulting (say if you want otherwise)

- Frontend: plain TypeScript + Vite, no React.
- The DOM file table is styled pixel-art rather than drawn fully on canvas
  (keeps sorting/scrolling of 10k+ rows fast, esp. on WebKitGTK). Preview
  chrome, buttons and headers are canvas/bitmap-font.
- HEIC via bundled libheif behind a cargo feature, on by default.
- Phase 1 watcher only refreshes the table; no automatic actions.
- Linux CI baseline Ubuntu 22.04; Windows target Win10+ with WebView2 bootstrap.

## 8. Changes made while building

- The OS-agnostic logic lives in its own crate, `crates/arch-ade-core`, so it builds and
  tests without a webview; `src-tauri` is thin glue. The layout under `core/` described
  above maps to modules of that crate.
- RAW previews use the embedded JPEG via exiftool, then the OS thumbnailer. `rawloader`
  was dropped: it needs demosaicing to produce an image and covers fewer cameras.
- When a file changed between planning and applying, the journal stops the plan at that
  step instead of skipping just that op, because later steps (e.g. the second half of a
  rename swap) can depend on it. Everything done before the stop is journaled and undoable.
- Undo/redo order follows journal row ids rather than timestamps (several plans can apply
  within one millisecond).
- macOS trash uses NSFileManager `trashItemAtURL:resultingItemURL:` directly, as planned;
  Windows and Linux use the `trash` crate's list/restore.

## 9. Phase 2: rules, watched folders, protection, updates

- `protect.rs`: a folder is a project root if it holds `.git`/`.hg`/`.svn`/`.jj`,
  `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `pom.xml`, `CMakeLists.txt`,
  `project.godot`, a `.uproject`/`.sln`/`.csproj`/`.xcodeproj`/`.blend`, or Unity's
  `Assets` + `ProjectSettings`. Scans mark it (`FileEntry.project`) and don't descend into
  it; the planner refuses any op whose source or target is inside one. The opened folder
  itself never counts, so a stray `package.json` in Downloads doesn't freeze Downloads, and
  a whole project folder can still be moved by hand.
- `rules.rs`: rules are JSON (`Rule`, `Test`, `RuleAction`), validated on save, stored under
  the `rules` setting. `Engine::evaluate` checks top-level files only (no hidden files,
  partial downloads or folders), first match wins, and turns actions into planner
  `Intent`s. Templates live in `rule_templates.json`.
- `plan.rs`: `Planner::build(&[Intent])` takes moves, copies, zips, tags and trashes and
  orders them mkdir, tag, copy/zip, move, trash. New journal steps: Copy, Archive, Tag.
  Undo of a copy or zip trashes the created file, only if its fingerprint is unchanged
  (an edited copy is left alone); undo of a tag restores the previous raw tag value.
- `organize.rs`: plans each file on its own first so a blocked file becomes a non-blocking
  "skipped" note instead of blocking the run; records each match in `rule_activity`
  (migration v2). On systems without tags, tag steps are dropped with a note.
- `autopilot.rs`: settle logic for the watcher (3 s unchanged, no `.part`-style sibling,
  give up after 6 h). Paths Arch-ade produced, by a rule run or by apply/undo/redo, are
  ignored for 30 s so undoing a rule doesn't get re-sorted straight away.
- `src-tauri/src/autorun.rs`: one non-recursive watcher per watched folder plus a 1 s loop
  that hands settled files to `Organizer::auto_run` and emits `rules-activity`.
- `update.rs`: `UpdateSource` trait; `ManifestFile` reads a local JSON file. No network.
- Tags: macOS Finder tags (`com.apple.metadata:_kMDItemUserTags`, binary plist), Linux
  `user.xdg.tags`; Windows has none. All behind the `Platform` trait.

## 10. Phase 3: categorize and rename, local AI optional

- `ai/ollama.rs`: `Llm` trait plus an Ollama client (ureq, no TLS feature, no proxy, no
  redirects). URLs must be loopback. `/api/chat` with `stream: false` and a JSON-schema
  `format`, so replies are always parseable; `/api/tags` for Test connection.
- `ai/whitelist.rs`: named whitelists (built-ins in `whitelists.json`, user copies in the
  `categoryWhitelists` setting), validated against every OS's folder-name rules. `guess` picks a
  category from keywords, then extension, then kind, then the fallback.
- `ai/hints.rs`: `ai_decisions` (migration v3). Similarity = shared words (from both the old
  and the approved name), same source domain, same extension or kind; one hint per
  destination. Hints become few-shot examples; a strong one (score ≥ 6) is used directly
  in Consistent mode or with the AI off.
- `ai/media.rs`: library names from ffprobe format/stream tags.
- `ai/facts.rs`: what the model sees: name, kind, source domain, a text excerpt (≤ 3000
  chars), an image downscaled to ≤ 896 px JPEG, and the screenshot flag
  (`Platform::is_screen_capture`, macOS `kMDItemIsScreenCapture`; elsewhere heuristics).
- `ai/suggest.rs`: order is media tags, AI, hint, whitelist guess. Consistent: temperature
  0, fixed seed, category and subcategory are schema enums. Refined: temperature 0.4, new
  subcategories allowed under known categories. Rename-only drops categories from the schema.
- `ai/review.rs`: approved items become planner intents (mkdir + move/rename, `(2)` on
  clashes, unplannable items are "skipped" notes). Decisions wait in `ai_pending` and are
  recorded only once that plan is actually applied.
- `src-tauri/src/ai_commands.rs`: `ai_suggest` runs on a worker, streams `ai-progress`, can
  be cancelled, and checks Ollama once up front (falls back with a reason if it's down).
