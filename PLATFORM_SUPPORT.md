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
| Hotkeys | Cmd | Ctrl | Ctrl |
| Bundles | .dmg | .msi, NSIS .exe | AppImage, .deb |
| Signing | Scripted, off until credentials | Scripted, off until credentials | n/a |
