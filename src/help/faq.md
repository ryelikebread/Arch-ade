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

## Why didn't a rule touch a file in a subfolder?
Rules only look at files sitting directly in the folder (like Downloads), never inside subfolders. That keeps them predictable.

## What is a "project" folder?
A folder that looks like a code, game or 3D project: it has `.git`, `package.json`, `Cargo.toml`, a Unity `Assets` + `ProjectSettings` pair, a `.uproject`, `project.godot`, a `.blend` file and so on. Arch-ade treats it as one unit: scans don't go inside, and nothing inside it is ever moved, renamed or trashed. You can still move the whole folder yourself.

## Will rules move files while they are still downloading?
No. A watched folder waits until a file has stopped changing for a few seconds and the browser's partial file (`.part`, `.crdownload`, …) is gone.

## I undid a rule and the file stayed put. Is that right?
Yes. Files you put back with Undo aren't sorted again straight away. They'll only be picked up again if they change.

## Does Arch-ade check for updates?
Not over the internet. It only reads an optional local file, `update-manifest.json`, in its app-data folder.
