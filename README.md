# Arch-ade

A local-only desktop app for browsing, previewing and organizing the files in a folder,
with an 8-bit pixel look. macOS, Windows and Linux from one codebase (Tauri 2 + Rust +
TypeScript, SQLite for state). Nothing leaves the machine.

> Working name. The display name lives in `crates/arch-ade-core/src/config.rs`
> (`APP_NAME`) plus `productName`/`identifier` in `src-tauri/tauri.conf.json`.

**Status:** Phase 1 (browser, previews, journal with undo/redo, dry run, rename,
duplicates). See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[PLATFORM_SUPPORT.md](PLATFORM_SUPPORT.md).

## Safety model

- Every change is a **plan** first. Plans are reviewed in a dialog and applied by id.
- **Dry run is on by default**: plans are shown, nothing is changed. The backend refuses
  to apply while it's on.
- Every applied step is written to an **operation journal** (SQLite) before and after it
  touches disk, so **Undo/Redo** work across restarts, and a crash mid-plan is detected
  and reported on next launch.
- **Trash** means the OS trash (Finder Trash, Recycle Bin, freedesktop Trash). There is no
  permanent delete in Phase 1.
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
`ffmpeg`/`ffprobe` (media details, video poster frames), `exiftool` (photo metadata, RAW
previews), `7z` or `bsdtar` (rar/7z/iso listings), `ffmpegthumbnailer` (Linux video
thumbnails). macOS uses Quick Look and Windows the Shell thumbnailer automatically.

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
cargo test --workspace     # rules: names, scope, journal/undo, rename, dupes, previews
npm test                   # frontend: sorting/filters, hotkeys, themes, sprites
ARCHADE_TEST_TRASH=1 cargo test -p arch-ade-core --test journal   # also uses the real OS trash
```

CI runs all of this on macOS, Windows and Ubuntu (`.github/workflows/ci.yml`). Release
bundles (.dmg, .msi/NSIS, AppImage/.deb) come from `.github/workflows/release.yml`;
signing is scripted but off until credentials are added ([docs/SIGNING.md](docs/SIGNING.md)).

## Themes

Color schemes are JSON (`src/themes/*.json`): an `id`, a `name` and eleven `#rrggbb`
colors. Drop extra ones into `<app data>/arch-ade/themes/` and pick them in Settings.

## Layout

```
crates/arch-ade-core/   all logic: platform layer, names, scope, scan, previews,
                        plans, journal, rename, duplicates, SQLite
src-tauri/              Tauri shell: state + IPC commands only
src/                    TypeScript UI (no framework): table, preview, dialogs, pixel art
tools/gen-test-folder/  sample folder generator
```

All OS-specific code is in `crates/arch-ade-core/src/platform/` behind the `Platform` trait.
