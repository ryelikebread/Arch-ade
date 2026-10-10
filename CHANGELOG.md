# Changelog

## 2026-10-10

- Categorize keeps going when the local AI fails: if the vision model crashes on an image (usually Ollama running out of memory), that file and later images are judged by name and details instead, and after 3 failures in a row the model isn't asked again, with a plain message saying why. Why: Rye reported crashes during AI categorization.
- Categorize skips a file that trips an internal error instead of ending the whole run, prints one line per file to the terminal, and every app panic is also written to `crash.log` in the app data folder. HEIC files over 200 MP aren't decoded. Why: so a crash can be traced to the file that caused it.

## 2026-10-09

- One-paste setup: `scripts/setup.sh` (Mac and Linux) and `scripts/setup-windows.ps1` install the prerequisites, clone the repo to ~/Retro-Arch-ade, run npm install and start the app; safe to re-run. SETUP.md has the one line per OS, and a new CI workflow runs both scripts on all three OSes. Why: Rye asked for a copy-and-paste setup per OS.
- Categorize shows a progress bar (done / total and a percentage) while it suggests. Why: Rye asked for a progress bar for AI categorize.
- The Categorize list and every plan review show a preview beside the list: click a row or use ↑/↓, Space or Full screen to fill the window, Esc to come back, and a Preview tick box to hide it. Why: Rye asked for preview options in the full review.
- Settings > Arcade mode has a Leaderboard button. Why: Rye asked for leaderboard access from Settings.
- New Bank Heist skin with Heist Radio (two original songs) and its own sound effects; each decision picks one of several outcomes at random, the van fills up as files are moved and every fifth move ends in a random getaway. The film and comic characters in the request are original stand-ins (an explorer with a decoy bag; a caped hero against a robot-armed inventor). Why: Rye asked for this skin; the substitutions keep copyrighted characters out.
- Peasoup's rename now writes the new name into the recipe book under "NEW INGREDIENT". Why: Rye asked for it.
- Skin manifests gain `encore` (a bonus animation after every Nth decision) and a caption `shadow` option. Why: needed for the heist getaways and the recipe book's dark ink.
- `node_modules` is no longer tracked in git (a link to it had been committed by mistake). Why: it broke `npm install` on a fresh checkout.

## 2026-10-08

- Phase 5: Undelete can be steered with the mouse (click to capture, Esc to let go). Why: Rye asked for mouse piloting, not just keys.
- Phase 5: more pickups in every game: new guns in Undelete and Folder Fleet, multiball and new capsules in Brick Sort, power-ups in Tidy Hop. Why: Rye asked for more pickup options.
- Phase 5: levels are named after the round's folders and each picks a random theme with a slightly different layout. Why: Rye asked for folder-based level titles and varied themes.
- Phase 5: a local leaderboard (top 10 per game, with date and folder) replaces the single best score. Why: Rye asked for leaderboards of past scores.
- Phase 4: three new File by File skins, Pigeon Court, Peasoup and Royal Court, each with its own theme song and sound effects; Royal Court's trash randomly goes to the dungeon or the trap door, and Peasoup's soup and dog change as you go. Why: Rye asked for these skins.
- Phase 4: skin manifests gain `variants` (random alternative animations), per-animation `sounds`, `music` and scene props with `tally`; songs, effects and built-in skins are found by folder. Why: needed by the new skins and makes adding more a one-folder job.
- Phase 4: radio has 13 stations with several songs each (each plays twice, then the next). Why: Rye asked for more channels and songs.
- Phase 4: Undo in File by File plays the decision's animation backwards. Why: Rye asked for a rewind animation.
- Phase 4: File by File's dry-run button and "Do these N decisions for real" at the end of a dry-run batch, plus Reset for quick-move folders. Why: Rye asked to switch dry run off after a batch and to reset quick moves.
- History labels "expired" plans as "never applied", hides them by default, and adds Review again and Undo back to here. Full-screen preview (Space) on the main screen. Why: Rye found expired plans confusing and asked for a full-screen preview.

## 2026-10-07

- Phase 5: Arcade mode (off by default; Settings > Arcade mode: offer or auto-start, chosen or random game). After File by File or an applied plan, trashed/deleted files become foes (size sets toughness, type sets a trick) and kept/moved/renamed files become pickups and allies. Why: the spec's post-session mini-games, costing nothing when off.
- Phase 5: four original mini-games, each a lazily loaded module: Undelete (first-person maze shooter), Brick Sort (brick breaker), Tidy Hop (platformer), Folder Fleet (space shooter). All art and sound generated in code, "inspired by" only. Why: the spec's four game styles without copyrighted material.
- Phase 5: keys pressed in the arcade no longer reach File by File or the main window. Why: Esc in a game closed File by File (and the arcade) underneath instead of pausing.
- Phase 5 review fixes: backing out of a game while it loads cancels it; a key held from the game no longer picks on the result or pause screen; the window losing focus pauses; frames are paced on animation frames for a steady 30 fps. Why: found in an adversarial review of the arcade core.
- Phase 5 review fixes: plan rounds count each file once by what finally happened to it (and only the steps that ran); the Play offer goes away on undo, another folder or a mode change; nothing builds a round with Arcade mode off; File by File can't start two games; game sounds no longer freeze after a gap. Why: same review.

- Phase 4: Sound menu (Cmd/Ctrl+Shift+S) styled as an arcade options screen: music station, play/pause, music volume and mute, sound-effect volume and mute, sound test. Four built-in stations of original chiptune generated in code (CC0), plus My Music from `<app data>/music/` (mp3, m4a, ogg, wav, flac…). Why: Rye asked for background music and their own tracks.
- Phase 4: Volcano and Space play original sound effects with each decision; skins name them in a new optional `sounds` manifest field. Audio is suspended while nothing is audible or the window is hidden. Why: Rye asked for skin sound effects with their own mute.

- Phase 4: File by File (Cmd/Ctrl+Shift+F): one file at a time with its preview; Keep, Move (quick-pick with 1-9, new folders), Rename, Trash, Delete permanently, Skip/Back, progress and a summary. Each decision is its own journaled plan, so Undo walks back one file at a time; dry run only shows decisions. Why: fast hands-on sorting that stays undoable.
- Phase 4: permanent delete (files only, confirmed, fingerprint-checked) as the one op outside the trash; plans with it end "final" and Undo moves past them. Why: the spec's explicit exception, kept from blocking undo of everything before it.
- Phase 4: pluggable display skins (sprite sheet + JSON manifest): Minimal (default, no drawing), Volcano and Space, all original art drawn in code; user skins load from the app-data skins folder. Canvas capped at 30fps and paused while hidden. Why: optional fun without costing anything when off.

## 2026-10-06

- Phase 3: Categorize (Cmd/Ctrl+Shift+K) suggests a category, subcategory and name per file and builds a reviewed, journaled plan; works fully with the AI off (media tags, past decisions, whitelist keywords). Why: sort and name files by content, still nothing changes without review.
- Phase 3: optional local AI through Ollama on localhost only (text model plus vision model, default gemma3:4b, alternate llava:7b), screenshot handling, More Refined / More Consistent modes, rename-only. Why: smarter suggestions without anything leaving the machine.
- Phase 3: named category whitelists with per-category subcategories in Settings, and approved decisions stored in SQLite (recorded only once applied) and reused as hints. Why: consistent folders that follow the user's own past choices, no fine-tuning.
- Phase 1: core crate with a `Platform` trait (macOS/Windows/Linux), per-OS name rules, scope guard, folder scan with download source (macOS xattrs, Windows Zone.Identifier, Linux xdg xattrs). Why: the foundation every later phase needs.
- Phase 1: dry-run plans, SQLite operation journal with undo/redo and crash detection, OS trash with restore, mass rename with `{n:03}`/`{date}`/`{original}`/`{ext}` and live preview, duplicate finder (size, partial hash, BLAKE3). Why: safe, undoable file changes.
- Phase 1: previews for images (incl. TIFF, bundled-libheif HEIC, RAW via exiftool, OS thumbnails), PDF (pdf.js), text/Markdown/JSON/CSV/HTML (sandboxed), docx/xlsx, .gdoc, audio/video, archive listings; metadata-only for disk images and installers. Why: browse without opening other apps.
- Phase 1: pixel-style UI with five JSON color themes, in-app Help, Cmd/Ctrl hotkeys, sample test-folder generator, CI on all three OSes, release workflow with signing disabled. Why: usable app plus a repeatable way to check it.
- CI: replaced `chunks_exact` with `as_chunks` in UTF-16 decoding and Windows thumbnails. Why: Rust 1.99 clippy rejects the old form under `-D warnings`.
- CI/Windows: libheif comes from vcpkg (`libheif[core]`, decoder only) on MSVC. Why: libheif-sys only links vcpkg's build on Windows, it can't build its embedded copy there.
- Windows: OS thumbnails now ask for real thumbnails only (`SIIGBF_THUMBNAILONLY`). Why: Windows otherwise returned the generic file-type icon for unreadable files, which the preview showed as if it were the content.
- Windows: trash restore now matches Recycle Bin entries to our paths without the `\\?\` prefix and ignoring case. Why: undoing a trash on Windows failed with "no longer in the trash".
- Windows: trash restore also matches Recycle Bin names shown without their extension, and the real-trash test prints what the trash holds when it fails. Why: Explorer hides known extensions in display names, so undo still could not find trashed files.
- Windows: undoing a trash restores the file under its real name. Why: the Recycle Bin display name can drop the extension, and restoring by it brought `photo.jpg` back as `photo`.
- Phase 2: JSON rules (type, source domain/URL, app, size, age, name regex → move, copy, rename, tag, trash, zip) with five built-in templates, a Rules screen and an Activity log. Why: let Arch-ade sort files the way the user decides, still as reviewed, undoable plans.
- Phase 2: watched folders run Auto rules on files once they finish downloading; dry run still applies. Why: hands-off sorting of Downloads/Desktop.
- Phase 2: project folders (Git, Node, Rust, Unity, Unreal, Godot, Blender, …) are never scanned into or changed. Why: moving files inside a project breaks it.
- Phase 2: copy, zip and tag steps join the journal with undo (copies/zips go to the trash, tags are restored). Why: every rule action must be undoable.
- Phase 2: update-notice stub reading a local manifest, with an optional (status bar) and a required (blocking) flow. Why: hook for a future updater without any network code.
- Phase 2: apply, undo and redo mark the touched paths so watched folders don't re-sort a file you just put back; tag steps are skipped with a note on Windows. Why: found while testing; undo was being undone by the watcher, and a tag would have stopped the whole plan on Windows.
- Rules: destination paths like `{home}/Work` are now built segment by segment with the OS separator. Why: on Windows the mixed `/` produced paths that didn't match (and `\\?\` paths don't accept `/`), failing CI.
