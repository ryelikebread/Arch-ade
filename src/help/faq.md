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

## Do I need the AI for Categorize?
No. Without it, music and video are named from their tags, files similar to ones you sorted before follow your earlier choice, and the rest are sorted by kind and keywords. The AI adds reading the text and looking at images.

## Does the AI send my files anywhere?
No. Arch-ade only talks to Ollama running on your own computer and refuses any other address. Install Ollama and run `ollama pull gemma3:4b` to use it.

## Does Arch-ade learn from my choices?
Yes, without training anything. When you apply a categorize plan, each approved choice is saved and shown to the AI as an example next time (and used directly for very similar files). **Settings > Local AI and categories > Forget learned decisions** clears them.

## What's the difference between More Refined and More Consistent?
*Consistent* always picks from your whitelist and gives the same answer for the same file. *Refined* may suggest a new subcategory when nothing fits; you can add it to the whitelist from the suggestion.

## Can File by File decisions be undone?
Yes, one at a time with Cmd/Ctrl+Z, newest first, except **Delete permanently**. That one skips the trash, so it asks first and can't be undone; Undo moves on to the decision before it.

## Do the skins slow anything down?
Minimal (the default) draws nothing. Volcano and Space draw a small pixel scene, at most 30 frames per second while an animation plays and a few per second otherwise, and stop completely while the window is hidden.

## Can I make my own skin?
Yes. A skin is a PNG sprite sheet plus a `manifest.json` in a folder under `skins` in the app-data folder (shown in Settings). See `docs/SKINS.md` in the source for the format. A broken skin is skipped with a note saying why.
