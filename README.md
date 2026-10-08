# Arch-ade

A local-only desktop app for browsing, previewing and organizing the files in a folder,
with an 8-bit pixel look. macOS, Windows and Linux from one codebase (Tauri 2 + Rust +
TypeScript, SQLite for state). Nothing leaves the machine.

> Working name. The display name lives in `crates/arch-ade-core/src/config.rs`
> (`APP_NAME`) plus `productName`/`identifier` in `src-tauri/tauri.conf.json`.

**Status:** Phase 4 (Phase 1's browser, previews, journal, dry run, rename and
duplicates; Phase 2's rules, watched folders, project-folder protection and update notice;
Phase 3's categorize-and-rename with an optional local AI; plus File-by-File mode with
display skins). See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[PLATFORM_SUPPORT.md](PLATFORM_SUPPORT.md).

## Safety model

- Every change is a **plan** first. Plans are reviewed in a dialog and applied by id.
- **Dry run is on by default**: plans are shown, nothing is changed. The backend refuses
  to apply while it's on.
- Every applied step is written to an **operation journal** (SQLite) before and after it
  touches disk, so **Undo/Redo** work across restarts, and a crash mid-plan is detected
  and reported on next launch. **History** lists every plan. Plans that were reviewed but
  never applied are hidden unless you tick **Show plans that were reviewed but never
  applied**; **Review again** re-checks one
  against the files as they are now and opens it for review. **Undo back to here** undoes
  every later plan and then that one.
- **Trash** means the OS trash (Finder Trash, Recycle Bin, freedesktop Trash). The only
  permanent delete is the confirmed one in File by File.
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

## File by File

**File by File** (Cmd/Ctrl+Shift+F) goes through the selected files (or every visible file)
one at a time, with the preview, and you decide each with a key:

| Key | Does |
| --- | --- |
| K or Enter | Keep (leave it where it is) |
| M | Move: pick a folder (type to filter, or type a new folder name) |
| 1 to 9 | Move straight to a quick-pick folder (recent picks, then the open folder's subfolders) |
| R or F2 | Rename |
| T, Delete or Backspace | Move to the trash |
| Shift+Delete or Shift+Backspace | Delete permanently, after a confirmation |
| → or S / ← or B | Skip / Back |
| Cmd/Ctrl+Z | Undo the latest decision and go back to that file (the skin plays it backwards) |
| Esc | Done |

**Other folder…** in the Move picker lets you choose a folder outside the open one; like a
rule destination, it's then remembered as allowed. Each decision is its own small plan in
the journal, applied straight away, so Undo here (or
in the main window) walks back one file at a time. With dry run on, decisions are only shown;
when you reach the end of the batch, **Do these N decisions for real** applies them (except
permanent deletes, which you'd redo by hand), and the dry run button turns dry run off for
the next files. **Reset** next to the quick-pick folders clears the remembered picks.
**Delete permanently** is the one thing that can't be undone: it skips the trash, asks
first, only works on single files, and shows in History as "done (can't be undone)". Undo
moves past it to the decision before.

**Skins** change only how a decision looks; the keys are the same. *Minimal* (the default)
draws nothing and costs nothing. *Volcano* and *Space* animate each decision on a small
pixel canvas (capped at 30fps, and nothing runs while the window is hidden or minimized).
*Pigeon Court* puts each file on trial before Judge Reginald Coo and a pigeon jury (keep is
innocent, move is guilty, rename is a mistrial, trash is contempt and the bailiff hen takes
it away). *Peasoup* cooks: keep goes into the soup, which thickens as you go; move goes to
the pantry, rename gets a new label, and trash feeds the dog. *Royal Court* brings each file
before the king: keep wins his favor, move is exile through the castle gate, rename is a
decree from the town crier, and trash is either a walk to the dungeon or the trap door. These
three each have their own theme music and sound effects.
Skins are a sprite sheet plus a JSON manifest, so you can make your own: put them in
`<app data>/skins/<name>/` (see [docs/SKINS.md](docs/SKINS.md)). The built-in sheets are
original art drawn in code: `npm run build-skins` regenerates them from `scripts/skins/`.
Skins can also name sound effects for each decision (see [Sound](#sound)).

## Sound

**Sound** in the top bar (or Cmd/Ctrl+Shift+S, also inside File by File) opens an
arcade-style options screen. Use ↑ ↓ to pick a row, ← → to change it, Enter to toggle,
Esc to leave. Music starts paused; everything is remembered.

- **Station**: thirteen built-in stations of original chiptune made for Arch-ade (Arch-ade
  FM, Island Radio, Orbit FM, Boss Rush, Lobby Lounge, Night Drive, Quest FM, Study Hall,
  plus Pigeon Court Radio, Kitchen Radio and Castle Radio from the skins), plus **My Music**.
  Each song plays twice, then the station moves on; **Now playing** skips ahead. While
  Pigeon Court, Peasoup or Royal Court is on in File by File, its theme plays instead of a
  built-in station.
- **Music**: play or pause. **Music volume** and **Music mute** are separate from pause.
- **Sound FX** and **FX volume**: every skin but Minimal plays effects with its
  animations (a volcano rumble, a gavel, a bubbling pot, a fanfare). Minimal stays silent.
  **Sound test** plays any effect.
- **My Music**: put your own .mp3, .m4a, .aac, .ogg, .opus, .wav or .flac files (up to
  50 MB each) in `<app data>/music/` (**My music folder > Show** opens it). They play in
  name order and loop. Files that can't be played are skipped and listed in the menu.

The built-in music and effects are generated in code (`src/audio/`), nothing is
downloaded, and they're released under CC0 (see [MUSIC_CREDITS.md](MUSIC_CREDITS.md)).
Copyrighted game soundtracks aren't included; if you own tracks you'd like to hear, add
them through My Music. Sound stops while the window is hidden, and the audio engine is
suspended whenever nothing is audible.

## Arcade mode

Arcade mode is **off** by default: nothing of it is loaded and it costs nothing. Turn it on
in **Settings > Arcade mode**: *Offer a game after a round of edits* adds a **Play arcade**
button, *Start a game after a round of edits* opens the arcade straight away. A round is a
File by File session (dry-run decisions count too, it's only a game) or a plan you
applied. Pick a game there, or leave it on **Random game**.

The files you just processed come back as the cast:

- **Foes** are the files you trashed or deleted. Bigger files take more hits (1 to 10, on
  a log scale of size); permanently deleted ones are elites with 2 extra. The file type
  sets a trick: pictures flash, documents and sheets shield, code teleports, audio sends
  sound waves, videos are fast, archives split in two, disk images and installers are
  tanks.
- **Friends** are the files you kept, moved or renamed: pickups or allies by type
  (pictures heal, documents give armor, code is a helper bot, audio rapid fire, video
  spread shot, archives ammo, installers power, anything else points).
- Up to 48 foes and 32 friends take part, spread across sizes; a round with few trashed
  files gets some generic clutter foes so there's still a game.

| Game | Inspired by | Controls |
| --- | --- | --- |
| **Undelete** | 90s first-person maze shooters | ↑↓ walk, ←→ turn, X + ←→ strafe, Space fire; or click to steer with the mouse (click fires, Esc lets go; where the mouse can't be captured, pointing left or right of the middle turns) |
| **Brick Sort** | brick-breaker paddle games | ←→ or mouse move, Space or click launch (or let go of a caught ball), hold Space laser, X spare ball |
| **Tidy Hop** | side-scrolling platformers and kitchen stack-'em-ups | ←→ run, Space jump (hold: higher; again in the air with wings), X throw, ↑↓ ladders |
| **Folder Fleet** | side-scrolling and formation space shooters | arrows move, Space fire (hold), X power pulse |

Each game is split into levels named after the folders the round's files came from
("LEVEL 2 - DOWNLOADS"), and each level picks one of five themes at random, with its own
look and a slightly different layout (maze shape, brick pattern, platforms, enemy
formation). Pickups beyond the files' perks:

- **Undelete**: guns with limited shots (fan stapler, splash cannon, defrag beam that
  goes through a line of zombies, ricochet, short-range shredder), from kept files and
  occasional drops.
- **Brick Sort**: multiball (up to 8 balls), wide paddle, catch, slow ball, fireball,
  laser and more, as lettered capsules.
- **Tidy Hop**: wings (double jump), star (invincible), magnet and speed boost.
- **Folder Fleet**: spread, seeker (homing) and wave guns that level up to 3, plus side
  pods on top of any gun.

WASD works for arrows, Z/J for Space and K/Shift for X. **Esc** (or P) pauses, with
Resume, Restart, Other game and Close arcade. The **Leaderboard** (in the game picker
and on the score screen) keeps the top 10 scores per game on this machine, with the date
and folder.
All art and sound is original, drawn and generated in code; the games are "inspired by"
only. Each game is its own module, loaded the first time it's played; they run at 30
updates per second and stop while paused or the window is hidden.

## Update notice

Arch-ade never checks the network. To try the update flow, put
`<app data>/arch-ade/update-manifest.json` next to the database:

```json
{ "version": "9.0.0", "required": false, "notes": "What's new", "url": "https://example.com" }
```

`required: false` shows a button in the status bar; `required: true` shows a dialog that
can only be answered with "Get the update" or "Quit". Only `https` links are offered. A real
update source can replace `ManifestFile` behind the `UpdateSource` trait later.

## Full-screen preview

**Space** (or **Full screen** on the preview) shows the selected file's preview over the
whole window; ↑ ↓ still change files, and Space or Esc goes back.

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
