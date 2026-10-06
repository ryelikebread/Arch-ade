# Changelog

## 2026-10-06

- Phase 1: core crate with a `Platform` trait (macOS/Windows/Linux), per-OS name rules, scope guard, folder scan with download source (macOS xattrs, Windows Zone.Identifier, Linux xdg xattrs). Why: the foundation every later phase needs.
- Phase 1: dry-run plans, SQLite operation journal with undo/redo and crash detection, OS trash with restore, mass rename with `{n:03}`/`{date}`/`{original}`/`{ext}` and live preview, duplicate finder (size, partial hash, BLAKE3). Why: safe, undoable file changes.
- Phase 1: previews for images (incl. TIFF, bundled-libheif HEIC, RAW via exiftool, OS thumbnails), PDF (pdf.js), text/Markdown/JSON/CSV/HTML (sandboxed), docx/xlsx, .gdoc, audio/video, archive listings; metadata-only for disk images and installers. Why: browse without opening other apps.
- Phase 1: pixel-style UI with five JSON color themes, in-app Help, Cmd/Ctrl hotkeys, sample test-folder generator, CI on all three OSes, release workflow with signing disabled. Why: usable app plus a repeatable way to check it.
- CI: replaced `chunks_exact` with `as_chunks` in UTF-16 decoding and Windows thumbnails. Why: Rust 1.99 clippy rejects the old form under `-D warnings`.
- CI/Windows: libheif comes from vcpkg (`libheif[core]`, decoder only) on MSVC. Why: libheif-sys only links vcpkg's build on Windows, it can't build its embedded copy there.
- Windows: OS thumbnails now ask for real thumbnails only (`SIIGBF_THUMBNAILONLY`). Why: Windows otherwise returned the generic file-type icon for unreadable files, which the preview showed as if it were the content.
