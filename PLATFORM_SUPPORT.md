# Platform support

Full = works the same as on the best platform. Partial = works with a limitation noted.
Unavailable = not possible on that OS. Verified = run by hand on that OS (others are
covered by CI tests and compile checks only so far).

| Feature | macOS | Windows | Linux |
| --- | --- | --- | --- |
| Folder browse, sort, filters | Full | Full | Full (verified) |
| Journal, undo/redo, dry run, scope guard | Full | Full | Full (verified) |
| Trash with undo | Full (NSFileManager, exact Trash path) | Full (Recycle Bin via `trash`) | Full (freedesktop; refused on volumes without a trash) |
| Rename validation | Full (`:` and length rules, NFD-aware) | Full (reserved names, illegal chars, trailing dot/space, case-insensitive) | Full (case-sensitive) |
| Case-only rename (`a.txt` → `A.txt`) | Full (via temp name) | Full (via temp name) | Full (plain rename) |
| Created date | Full | Full | Partial (needs statx btime; shows n/a otherwise) |
| "Added" date | Full (Finder's Date Added) | Unavailable | Unavailable |
| Download URL / referrer | Full (kMDItemWhereFroms) | Partial (Zone.Identifier; some browsers and extracted files omit it) | Partial (`user.xdg.origin.url`; set by Chromium, often not by Firefox; not on all filesystems) |
| Downloading app | Full (quarantine agent) | Partial (inferred from URL domain, shown in italics, else unknown) | Partial (inferred from URL domain, else unknown) |
| Images jpg/png/gif/bmp/ico/webp/svg | Full | Full | Full (verified) |
| TIFF | Full | Full | Full (verified) |
| HEIC | Full (bundled libheif) | Full (bundled libheif) | Full (bundled libheif) |
| RAW | Full (exiftool or Quick Look) | Partial (exiftool, or Shell if a codec is installed) | Partial (exiftool, or a freedesktop thumbnailer) |
| WMF/EMF | Partial (Quick Look) | Full (Shell thumbnailer) | Partial (only if a thumbnailer is installed) |
| PDF | Full | Full | Full (verified) |
| Text/MD/JSON/CSV/HTML | Full | Full | Full (verified) |
| docx / xlsx / .gdoc | Full | Full | Full (verified) |
| Audio/video playback | Full (WebKit) | Full for mp4/mp3/m4a/wav/webm (WebView2); wma/asf metadata only | Partial (WebKitGTK needs GStreamer plugins; otherwise poster + metadata) |
| Media metadata, poster frames | Needs ffmpeg | Needs ffmpeg | Needs ffmpeg (verified) |
| Archive listing zip/zipx/tar/tgz | Full | Full | Full (verified) |
| rar / 7z / iso / nrg listing | Needs 7z or bsdtar (bsdtar ships with macOS) | Needs 7-Zip, or `tar.exe` (bsdtar) for some | Needs 7z or bsdtar |
| Thumbnails for other types | Full (Quick Look) | Full (Shell) | Partial (freedesktop thumbnailers, ffmpegthumbnailer) |
| Folder watcher | Full (FSEvents) | Full (ReadDirectoryChangesW) | Full (inotify; non-recursive by default) |
| Watched folders running rules | Full | Full | Full (verified) |
| Rules: kind, extension, size, age, name | Full | Full | Full (verified) |
| Rules: source domain / URL | Full | Partial (needs Zone.Identifier) | Partial (needs `user.xdg.origin.url`; verified) |
| Rules: downloading app | Full (quarantine agent) | Partial (guessed from domain) | Partial (guessed from domain) |
| Rules: "added" age | Full (Date Added) | Partial (falls back to created, then modified) | Partial (falls back to created, then modified) |
| Tag action | Full (Finder tags) | Unavailable (no tag system; rule step is skipped with a note) | Partial (`user.xdg.tags`; read by some file managers; not on filesystems without xattrs) |
| Copy / zip actions with undo | Full | Full | Full (verified) |
| Project-folder protection | Full | Full | Full (verified) |
| Update notice (local manifest) | Full | Full | Full (verified) |
| Categorize + review (AI off: tags, past decisions, whitelist) | Full | Full | Full (verified) |
| Local AI via Ollama (HTTP to localhost) | Full | Full | Full (verified against a mock server only; real models untested so far) |
| Screenshot detection | Full (macOS screenshot marker, then heuristics) | Partial (name and screen-size heuristics) | Partial (name and screen-size heuristics; verified) |
| PDF text for categorizing | Needs pdftotext (Poppler) | Needs pdftotext (Poppler) | Needs pdftotext (verified) |
| Music/video names from tags | Needs ffprobe | Needs ffprobe | Needs ffprobe (verified) |
| File by File (keep/move/rename/trash, undo, quick-pick) | Full | Full | Full (verified) |
| Delete permanently (confirmed, files only) | Full | Full | Full (verified) |
| Skins (canvas, 30fps cap, paused when hidden) | Full | Full | Full (verified; WebKitGTK, software rendering in CI) |
| Hotkeys | Cmd | Ctrl | Ctrl |
| Bundles | .dmg | .msi, NSIS .exe | AppImage, .deb |
| Signing | Scripted, off until credentials | Scripted, off until credentials | n/a |
