# Arch-ade

A local-only desktop app for browsing, previewing and organizing the files in a folder,
with an 8-bit pixel look. macOS, Windows and Linux from one codebase (Tauri 2 + Rust +
TypeScript, SQLite for state). Nothing leaves the machine.

> Working name. The display name lives in `crates/arch-ade-core/src/config.rs`
> (`APP_NAME`) plus `productName`/`identifier` in `src-tauri/tauri.conf.json`.

**Status:** Phase 3 (Phase 1's browser, previews, journal, dry run, rename and
duplicates; Phase 2's rules, watched folders, project-folder protection and update notice;
plus categorize-and-rename with an optional local AI). See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[PLATFORM_SUPPORT.md](PLATFORM_SUPPORT.md).

## Safety model

- Every change is a **plan** first. Plans are reviewed in a dialog and applied by id.
- **Dry run is on by default**: plans are shown, nothing is changed. The backend refuses
  to apply while it's on.
- Every applied step is written to an **operation journal** (SQLite) before and after it
  touches disk, so **Undo/Redo** work across restarts, and a crash mid-plan is detected
  and reported on next launch.
- **Trash** means the OS trash (Finder Trash, Recycle Bin, freedesktop Trash). There is no
  permanent delete yet.
- **Project folders** (Git, Node, Rust, Python, Go, Java, .NET, Xcode, CMake, Unity, Unreal,
  Godot, Blender, ...) are kept whole: recursive scans list the folder but not its contents,
  and no plan moves, renames or trashes anything inside one.
- A **scope guard** refuses any path outside the folder you opened or a destination you
  picked, including via symlinks or `..`.
- Archives are listed, never extracted. Disk images and installers are never mounted or run.
  HTML/Markdown previews run in a sandboxed frame with scripts and network blocked.

## Setup

Prerequisites:

- Rust (stable) and Node 22+
- macOS: Xcode Command Line Tools
- Windows: Microsoft C++ Build Tools, WebView2 (preinstalled on Windows 11), and libheif from
  [vcpkg](https://vcpkg.io): `vcpkg install "libheif[core]:x64-windows-static-md"` with `VCPKG_ROOT` set
  (on Windows the HEIC decoder links vcpkg's libheif instead of building it)
- Linux (Debian/Ubuntu):
  `sudo apt install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev libssl-dev`
- macOS/Linux: `cmake` and a C++ compiler for the bundled HEIC decoder
- Any OS: build with `--no-default-features` to skip HEIC entirely

Optional helpers, detected at startup (the status bar lists what was found):
`ffmpeg`/`ffprobe` (media details, video poster frames, music/video tags for naming),
`exiftool` (photo metadata, RAW previews), `7z` or `bsdtar` (rar/7z/iso listings),
`ffmpegthumbnailer` (Linux video thumbnails), `pdftotext` from Poppler (PDF text for
categorizing). Ollama for the optional local AI, see below. macOS uses Quick Look and Windows the Shell thumbnailer automatically.

## Run

```sh
npm install
npm run tauri dev          # development, with hot reload
npm run tauri build        # release bundles for the current OS
```

Try it on a sample folder that covers every preview type and edge case:

```sh
npm run gen-test-folder -- ~/arch-ade-sample
```

## Test

```sh
cargo test --workspace     # names, scope, journal/undo, rename, dupes, previews, rules, watcher
npm test                   # frontend: sorting/filters, hotkeys, themes, sprites
ARCHADE_TEST_TRASH=1 cargo test -p arch-ade-core --test journal   # also uses the real OS trash
```

CI runs all of this on macOS, Windows and Ubuntu (`.github/workflows/ci.yml`). Release
bundles (.dmg, .msi/NSIS, AppImage/.deb) come from `.github/workflows/release.yml`;
signing is scripted but off until credentials are added ([docs/SIGNING.md](docs/SIGNING.md)).

## Rules and watched folders

Rules are JSON, stored in the app's SQLite settings and edited in **Rules** (Cmd/Ctrl+Shift+L).
Each rule has conditions (`kind`, `extension`, `sourceDomain`, `sourceUrl`, `app`, `size`,
`age`, `nameRegex`; `match` is `all` or `any`, any condition can be negated with `"not": true`)
and actions (`move`, `copy`, `rename`, `tag`, `trash`, `archive`). Rules run top to bottom and
the first match wins. They only look at files directly in the folder, never inside subfolders.

```json
{
  "id": "github-to-developer", "name": "GitHub downloads to Developer",
  "enabled": true, "auto": true, "folders": ["{downloads}"], "match": "all",
  "conditions": [{ "type": "sourceDomain", "domains": ["github.com", "githubusercontent.com"] }],
  "actions": [{ "type": "move", "to": "{home}/Developer", "ifExists": "rename" }]
}
```

Paths can use `{home}`, `{downloads}`, `{desktop}`, `{documents}`, `{pictures}` and, per file,
`{kind}`, `{ext}`, `{domain}`, `{app}`, `{year}`, `{month}`, `{day}`. A relative path is inside
the folder being organized. Destinations outside it must be allowed once (the app asks).

Built-in templates: Organize Downloads (Images/PDFs/Videos/Archives/Source Code), Route
GitHub downloads to Developer, Route Slack downloads to Work, Clean Desktop (older than 7
days to Archive), Auto-trash by age. Templates are added switched off.

**Watched folders**: rules marked *Auto* run on new files in watched folders once a file has
stopped changing for 3 seconds and no `.part`/`.crdownload` sibling is left. Every run is a
journaled plan (undoable), dry run still applies (runs are only logged), and everything lands
in **Rules > Activity**. Files Arch-ade itself just moved, or put back with Undo, are ignored
so nothing loops.

## Categorize (local AI optional)

**Categorize** (Cmd/Ctrl+Shift+K) suggests a category, subcategory and clean name for the
selected files (or all visible files). Nothing changes until you review the suggestions,
edit or untick any of them, and click **Review plan**: that builds a normal plan (folders to
create, files to move or rename) that goes through dry run and the journal like everything
else, so it is undoable.

Where a suggestion comes from, in order:

1. **Tags** for music and video (needs `ffprobe`): `Artist - Album - 01 - Title`,
   `Artist - Title`, `Show - S01E02 - Title` (into Videos/TV), `Title (1999)` (into Videos/Movies).
2. **The local AI**, when it's on: a text model reads the name and a short excerpt
   (text, Markdown, docx, xlsx, PDF via `pdftotext`); a vision model looks at images.
   Screenshots are flagged (macOS's own screenshot marker, otherwise the name or an exact
   screen size) and named after what's on screen.
3. **Past decisions**: a similar file you approved before.
4. **The whitelist**: kind, extension and keywords in the name.

So it works fully with the AI off; the AI just reads contents instead of only names.

**Local AI setup.** Install [Ollama](https://ollama.com), then pull the default model
(it handles text and images):

```sh
ollama pull gemma3:4b
# optional alternate vision model
ollama pull llava:7b
```

In **Settings > Local AI and categories**, tick *Use local AI*, click **Test connection**, and pick models.
Arch-ade only talks to Ollama on this machine (`localhost`/`127.0.0.1`/`::1`; other
addresses are refused, no proxy, no redirects). No model is trained: approved decisions are
stored in SQLite and shown to the model as examples next time. **Forget … learned decisions**
clears them.

**Modes.** *More Consistent* (default) only uses the whitelist's categories and
subcategories, answers deterministically, and lets a strong past decision win.
*More Refined* may propose a new subcategory under a known category (marked *new*, with a
**+ whitelist** button to keep it). **Rename only** keeps files where they are and only
suggests names.

**Category whitelists** (Settings > Local AI and categories > Manage category whitelists) are named lists
of categories, each with its own subcategories and optional kinds, extensions and keywords
used when guessing without AI. Two built-ins: *General* and *Simple*; **Duplicate** one to edit it.

## Update notice

Arch-ade never checks the network. To try the update flow, put
`<app data>/arch-ade/update-manifest.json` next to the database:

```json
{ "version": "9.0.0", "required": false, "notes": "What's new", "url": "https://example.com" }
```

`required: false` shows a button in the status bar; `required: true` shows a dialog that
can only be answered with "Get the update" or "Quit". Only `https` links are offered. A real
update source can replace `ManifestFile` behind the `UpdateSource` trait later.

## Themes

Color schemes are JSON (`src/themes/*.json`): an `id`, a `name` and eleven `#rrggbb`
colors. Drop extra ones into `<app data>/arch-ade/themes/` and pick them in Settings.

## Layout

```
crates/arch-ade-core/   all logic: platform layer, names, scope, scan, previews,
                        plans, journal, rename, duplicates, rules, autopilot,
                        project protection, tags, update check, SQLite
src-tauri/              Tauri shell: state + IPC commands only
src/                    TypeScript UI (no framework): table, preview, dialogs, pixel art
tools/gen-test-folder/  sample folder generator
```

All OS-specific code is in `crates/arch-ade-core/src/platform/` behind the `Platform` trait.
