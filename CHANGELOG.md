# Changelog

## 2026-10-06

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
- Rules: destination paths like `{home}/Work` are now built segment by segment with the OS separator. Why: on Windows the mixed `/` produced paths that didn't match (and `\\\\?\\` paths don't accept `/`), failing CI.
