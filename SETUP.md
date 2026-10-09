# Setup in one paste

One script per OS installs everything Retro Arch-ade needs, puts the code in a
`Retro-Arch-ade` folder in your home folder, and starts the app. It skips
anything already installed, so it's safe to run again: running it again is also
how you update to the latest code and start the app.

The repository is private, so the script can't be downloaded with a public link.
Download it once while signed in to GitHub (or from the Claude thread it was
shared in), then paste one line.

## Mac

1. Download [scripts/setup.sh](https://github.com/ryelikebread/Retro-Arch-ade/raw/main/scripts/setup.sh)
   into your Downloads folder (if Safari shows the text instead, press Cmd+S and save it as `setup.sh`).
2. Open **Terminal** and paste:

   ```sh
   bash ~/Downloads/setup.sh
   ```

It asks for your Mac password once (for Homebrew; nothing shows while you type)
and, if Apple's command line tools are missing, a window asks you to install them.
If GitHub sign-in is needed, it opens your browser; copy the code it shows into
the page.

## Windows

1. Download [scripts/setup-windows.ps1](https://github.com/ryelikebread/Retro-Arch-ade/raw/main/scripts/setup-windows.ps1)
   into your Downloads folder.
2. Open **PowerShell** (Start menu, type PowerShell) and paste:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\Downloads\setup-windows.ps1"
   ```

Windows asks for permission a few times while installing. The C++ Build Tools and
the HEIC photo library are big; the first run can take 20 to 40 minutes. If a
GitHub sign-in window opens, choose **Sign in with your browser**.

## Linux (Ubuntu/Debian, Fedora, Arch)

1. Download [scripts/setup.sh](https://github.com/ryelikebread/Retro-Arch-ade/raw/main/scripts/setup.sh)
   into your Downloads folder.
2. Open a terminal and paste:

   ```sh
   bash ~/Downloads/setup.sh
   ```

It asks for your password once for `sudo`.

## What it installs

| | Mac | Windows | Linux |
| --- | --- | --- | --- |
| Package manager | Homebrew | winget (built in) | apt, dnf or pacman |
| Build tools | Apple command line tools, cmake | Microsoft C++ Build Tools | compiler, cmake, pkg-config |
| Git, Node 22+, Rust | yes | yes | yes (Node via nvm) |
| App libraries | (built in) | WebView2, libheif via vcpkg | WebKitGTK and friends |
| Optional preview helpers | ffmpeg, exiftool, 7-Zip, Poppler | (not needed) | ffmpeg, exiftool, 7-Zip, Poppler, ffmpegthumbnailer |
| GitHub sign-in | GitHub CLI (`gh`), only if needed | Git's own sign-in window | GitHub CLI, only if needed |

The local AI (Ollama) is optional and not installed; see README.md > Categorize.

## Starting the app later

Run the same line again, or in a terminal:

```sh
cd ~/Retro-Arch-ade
npm run tauri dev
```

The first start compiles the app and takes several minutes; later starts are quick.
Close the app window (or press Ctrl+C in the terminal) to stop it.

## Options

Set these before the command, e.g. `ARCHADE_NO_RUN=1 bash ~/Downloads/setup.sh`
(on Windows: `$env:ARCHADE_NO_RUN = "1"` on its own line first).

- `ARCHADE_DIR`: put the code somewhere other than `~/Retro-Arch-ade`.
- `ARCHADE_NO_RUN=1`: set everything up but don't start the app.
- `ARCHADE_MINIMAL=1` (Mac/Linux): skip the optional preview helpers.
- `ARCHADE_NO_HEIC=1` (Windows): skip the HEIC library; HEIC photos won't preview.

## If something goes wrong

The script stops with a message saying what failed. Fix that (often a lost
network connection or a declined permission prompt) and paste the same line
again; it carries on from where it got to. If you've changed files in
`~/Retro-Arch-ade`, the script leaves them alone and doesn't update.
