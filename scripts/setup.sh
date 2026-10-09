#!/usr/bin/env bash
# One-paste setup for Retro Arch-ade on macOS and Linux. See SETUP.md.
#
# Installs what's missing (build tools, git, Node 22+, Rust, the Tauri system
# libraries, cmake for the HEIC decoder, and the optional preview helpers),
# clones the repo to ~/Retro-Arch-ade (or updates it), runs npm install and
# starts the app. Safe to re-run: anything already there is left alone, so
# running it again is also the way to update and start the app.
#
# Settings (all optional), e.g. ARCHADE_NO_RUN=1 bash setup.sh
#   ARCHADE_DIR=path     where the repo lives (default ~/Retro-Arch-ade)
#   ARCHADE_NO_RUN=1     set everything up but don't start the app
#   ARCHADE_MINIMAL=1    skip the optional helpers (ffmpeg, exiftool, 7z, Poppler)

# shellcheck disable=SC1091
set -Eeuo pipefail

REPO="ryelikebread/Retro-Arch-ade"
REPO_URL="${ARCHADE_REPO_URL:-https://github.com/$REPO.git}"
DIR="${ARCHADE_DIR:-$HOME/Retro-Arch-ade}"
NODE_MAJOR=22

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok() { printf '    \033[32mok\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mNote:\033[0m %s\n' "$*" >&2; }
die() {
  printf '\n\033[1;31mSetup stopped:\033[0m %s\n' "$*" >&2
  exit 1
}
has() { command -v "$1" >/dev/null 2>&1; }
on_error() {
  trap - ERR
  printf '\n\033[1;31mSetup stopped\033[0m at line %s. Scroll up for the reason, then run it again (it picks up where it left off).\n' "$1" >&2
}
trap 'on_error $LINENO' ERR

if [ "$(id -u)" -eq 0 ]; then SUDO=""; else SUDO="sudo"; fi

node_ok() {
  has node || return 1
  local major
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [ "$major" -ge "$NODE_MAJOR" ]
}

# Appends a line to a shell startup file once, so new terminals find the tools.
add_to_profile() {
  local file="$1" line="$2"
  touch "$file"
  grep -qxF "$line" "$file" || printf '\n%s\n' "$line" >>"$file"
}

# ---------------------------------------------------------------- macOS

setup_mac() {
  say "Checking Homebrew (installs Apple's command line tools too)"
  if ! has brew; then
    for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do
      [ -x "$b" ] && eval "$("$b" shellenv)" && break
    done
  fi
  if ! has brew; then
    echo "    Homebrew will ask for your Mac password (nothing shows while you type)."
    NONINTERACTIVE=0 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do
      [ -x "$b" ] && eval "$("$b" shellenv)" && break
    done
    has brew || die "Homebrew didn't install. Scroll up for its message, then run this again."
  fi
  add_to_profile "$HOME/.zprofile" "eval \"\$($(command -v brew) shellenv)\""
  ok "Homebrew"

  if ! xcode-select -p >/dev/null 2>&1; then
    say "Installing Apple's command line tools (a window may pop up: click Install)"
    xcode-select --install 2>/dev/null || true
    until xcode-select -p >/dev/null 2>&1; do sleep 10; done
  fi
  ok "Apple command line tools"

  say "Installing git, Node, cmake and GitHub sign-in (skips anything already there)"
  local want=(git cmake gh)
  node_ok || want+=(node)
  [ "${ARCHADE_MINIMAL:-0}" = 1 ] || want+=(ffmpeg exiftool sevenzip poppler)
  local missing=()
  for f in "${want[@]}"; do brew list --formula "$f" >/dev/null 2>&1 || missing+=("$f"); done
  if [ ${#missing[@]} -gt 0 ]; then
    brew install "${missing[@]}"
  fi
  ok "${want[*]}"
}

# ---------------------------------------------------------------- Linux

linux_packages() {
  # $1 = package manager; prints the packages, the optional ones after a "|".
  case "$1" in
    apt)
      echo "build-essential curl wget file git cmake pkg-config libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev"
      echo "|ffmpeg libimage-exiftool-perl p7zip-full poppler-utils ffmpegthumbnailer"
      ;;
    dnf)
      echo "gcc gcc-c++ make curl wget file git cmake pkgconf-pkg-config webkit2gtk4.1-devel openssl-devel libappindicator-gtk3-devel librsvg2-devel libxdo-devel"
      echo "|ffmpeg-free perl-Image-ExifTool p7zip poppler-utils ffmpegthumbnailer"
      ;;
    pacman)
      echo "base-devel curl wget file git cmake pkgconf webkit2gtk-4.1 openssl appmenu-gtk-module libappindicator-gtk3 librsvg xdotool"
      echo "|ffmpeg perl-image-exiftool 7zip poppler ffmpegthumbnailer"
      ;;
  esac
}

pkg_installed() {
  case "$1" in
    apt) dpkg-query -W -f='${Status}' "$2" 2>/dev/null | grep -q "install ok installed" ;;
    dnf) rpm -q "$2" >/dev/null 2>&1 || rpm -q --whatprovides "$2" >/dev/null 2>&1 ;;
    pacman) pacman -Qi "$2" >/dev/null 2>&1 || pacman -Qg "$2" >/dev/null 2>&1 ;;
  esac
}

pkg_install() {
  local pm="$1"
  shift
  case "$pm" in
    apt)
      $SUDO apt-get update
      $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y "$@"
      ;;
    dnf) $SUDO dnf install -y "$@" ;;
    pacman) $SUDO pacman -S --needed --noconfirm "$@" ;;
  esac
}

setup_linux() {
  local pm=""
  if has apt-get; then
    pm=apt
  elif has dnf; then
    pm=dnf
  elif has pacman; then
    pm=pacman
  else
    die "this script knows Debian/Ubuntu (apt), Fedora (dnf) and Arch (pacman). See README.md > Setup for the packages to install by hand."
  fi

  say "Installing build tools and the Tauri system libraries ($pm)"
  local lists required optional missing=() missing_opt=()
  lists="$(linux_packages "$pm")"
  required="$(printf '%s\n' "$lists" | sed -n 1p)"
  optional="$(printf '%s\n' "$lists" | sed -n 2p | tr -d '|')"
  for p in $required; do pkg_installed "$pm" "$p" || missing+=("$p"); done
  if [ ${#missing[@]} -gt 0 ]; then
    [ -n "$SUDO" ] && echo "    This needs your password for sudo (nothing shows while you type)."
    pkg_install "$pm" "${missing[@]}" || die "installing ${missing[*]} failed. Scroll up for the reason, then run this again."
  fi
  ok "$required"

  # GitHub CLI, for signing in to clone the private repo (only used if git
  # can't read it already).
  local gh_pkg=gh
  [ "$pm" = pacman ] && gh_pkg=github-cli
  if ! has gh; then
    pkg_install "$pm" "$gh_pkg" >/dev/null 2>&1 || warn "couldn't install the GitHub CLI; cloning will ask for a GitHub token instead."
  fi

  if [ "${ARCHADE_MINIMAL:-0}" != 1 ]; then
    for p in $optional; do pkg_installed "$pm" "$p" || missing_opt+=("$p"); done
    if [ ${#missing_opt[@]} -gt 0 ]; then
      say "Installing optional preview helpers"
      pkg_install "$pm" "${missing_opt[@]}" ||
        warn "some optional helpers didn't install (${missing_opt[*]}). The app runs without them; previews just show less."
    fi
  fi

  load_nvm_if_present
  if ! node_ok; then
    say "Installing Node $NODE_MAJOR (with nvm, in your home folder)"
    export NVM_DIR="$HOME/.nvm"
    if [ ! -s "$NVM_DIR/nvm.sh" ]; then
      curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | PROFILE="$HOME/.bashrc" bash
    fi
    set +u
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh"
    nvm install "$NODE_MAJOR"
    nvm alias default "$NODE_MAJOR" >/dev/null
    set -u
  fi
}

# ---------------------------------------------------------------- both

load_nvm_if_present() {
  if ! node_ok && [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
    set +u
    # shellcheck disable=SC1091
    . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
    nvm use --silent default >/dev/null 2>&1 || true
    set -u
  fi
}

setup_rust() {
  say "Checking Rust"
  [ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
  if ! has rustup && ! has cargo; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
    . "$HOME/.cargo/env"
  elif has rustup; then
    rustup toolchain list | grep -q '^stable' || rustup toolchain install stable --profile minimal
    rustup update stable --no-self-update >/dev/null 2>&1 || warn "couldn't update Rust; using the one installed."
    rustup default >/dev/null 2>&1 || rustup default stable
  fi
  has cargo || die "Rust didn't install. Scroll up for its message, then run this again."
  ok "$(cargo --version)"
}

# Clone (or update) the repo. It's private, so if git can't read it yet,
# sign in to GitHub once in the browser with the GitHub CLI.
setup_repo() {
  say "Getting the code into $DIR"
  if [ -d "$DIR/.git" ]; then
    cd "$DIR"
    if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
      warn "you have changes in $DIR, so it wasn't updated. Running what's there."
    elif git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
      git pull --ff-only || warn "couldn't update (see above). Running what's there."
    else
      warn "branch $(git rev-parse --abbrev-ref HEAD) has no GitHub branch to update from. Running what's there."
    fi
    ok "on branch $(git rev-parse --abbrev-ref HEAD)"
    return
  fi
  [ -e "$DIR" ] && die "$DIR exists but isn't a copy of the repo. Move it away or set ARCHADE_DIR to another folder."

  if ! GIT_TERMINAL_PROMPT=0 git ls-remote "$REPO_URL" >/dev/null 2>&1; then
    if has gh && ! gh auth status >/dev/null 2>&1; then
      say "Signing in to GitHub (the repo is private)"
      echo "    Pick GitHub.com and HTTPS if asked, then press Enter to open the browser."
      gh auth login --hostname github.com --git-protocol https --web
    fi
    if has gh; then gh auth setup-git --hostname github.com; fi
  fi
  mkdir -p "$(dirname "$DIR")"
  git clone "$REPO_URL" "$DIR"
  cd "$DIR"
  ok "cloned"
}

main() {
  case "$(uname -s)" in
    Darwin) setup_mac ;;
    Linux) setup_linux ;;
    *) die "this script is for macOS and Linux. On Windows use scripts/setup-windows.ps1 (see SETUP.md)." ;;
  esac
  load_nvm_if_present
  node_ok || die "Node $NODE_MAJOR or newer isn't on the PATH (found: $(node -v 2>/dev/null || echo none))."
  ok "Node $(node -v)"
  setup_rust
  setup_repo

  say "Installing the app's JavaScript packages (npm install)"
  npm install --no-fund --no-audit

  if [ "${ARCHADE_NO_RUN:-0}" = 1 ]; then
    say "All set. To start the app: cd \"$DIR\" && npm run tauri dev"
    return
  fi
  say "Starting Retro Arch-ade (the first build takes several minutes; later starts are quick)"
  echo "    To stop it, close the window or press Ctrl+C here."
  exec npm run tauri dev
}

main "$@"
