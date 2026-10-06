# FAQ

## Does anything leave my computer?
No. There is no network code. Previews of HTML and Markdown run with scripts disabled and remote images blocked.

## Where do trashed files go?
To the system trash (Trash on macOS, Recycle Bin on Windows, the freedesktop Trash on Linux). Undo puts them back.

## Why is "App" empty or in italics?
macOS records which app downloaded a file. Windows and Linux only record the URL (when the browser saves it), so Arch-ade guesses the app from the website and shows it in *italics*. If there's nothing to go on it stays empty.

## Why are some previews missing?
Some formats need helper tools: **ffmpeg/ffprobe** for media details and video frames, **exiftool** for photo metadata and RAW previews, **7-Zip** or **bsdtar** for rar/7z/iso listings. The status bar shows which are installed. Without them you still get the file's details.

## Are archives or disk images opened?
Archives are listed, never extracted. Disk images and installers (dmg, pkg, msi, …) are never mounted or run.

## A plan said a file "changed since the plan was made"
The file was modified between reviewing and applying. Arch-ade stops at that step so nothing unexpected happens; everything before it can be undone.

## Where are settings and history stored?
In a SQLite database in your system's app-data folder (shown in Settings).
