# One-paste setup for Retro Arch-ade on Windows 10/11. See SETUP.md.
#
# Installs what's missing with winget (Git, Node 22+, Rust, the Microsoft C++
# Build Tools, WebView2), builds libheif with vcpkg for HEIC previews, clones
# the repo to %USERPROFILE%\Retro-Arch-ade (or updates it), runs npm install
# and starts the app. Safe to re-run: anything already there is left alone, so
# running it again is also the way to update and start the app.
#
# Settings (all optional), set before running, e.g. $env:ARCHADE_NO_RUN = "1"
#   ARCHADE_DIR      where the repo lives (default %USERPROFILE%\Retro-Arch-ade)
#   ARCHADE_NO_RUN   "1": set everything up but don't start the app
#   ARCHADE_NO_HEIC  "1": skip libheif/vcpkg (HEIC photos won't preview)

# 'Continue', not 'Stop': Windows PowerShell 5.1 turns any stderr output from
# git/rustup/npm into a fatal error under 'Stop'. Failures are checked explicitly.
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

$Repo = 'ryelikebread/Retro-Arch-ade'
$RepoUrl = if ($env:ARCHADE_REPO_URL) { $env:ARCHADE_REPO_URL } else { "https://github.com/$Repo.git" }
$Dir = if ($env:ARCHADE_DIR) { $env:ARCHADE_DIR } else { Join-Path $HOME 'Retro-Arch-ade' }
$NodeMajor = 22
$HeifTriplet = 'x64-windows-static-md'

function Say($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok($msg) { Write-Host "    ok $msg" -ForegroundColor Green }
function Note($msg) { Write-Host "Note: $msg" -ForegroundColor Yellow }
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

# Runs a command (a script block) and stops the setup if it fails.
function Run([scriptblock]$Cmd) {
    & $Cmd
    if ($LASTEXITCODE -ne 0) { throw "'$($Cmd.ToString().Trim())' failed (exit code $LASTEXITCODE). Scroll up for the reason, then run this again." }
}

# Picks up PATH changes made by installers without opening a new window.
function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
    $cargoBin = Join-Path $HOME '.cargo\bin'
    if ((Test-Path $cargoBin) -and ($env:Path -notlike "*$cargoBin*")) { $env:Path = "$cargoBin;$env:Path" }
}

function Winget-Install($id, $extra = @()) {
    Write-Host "    installing $id (Windows may ask for permission)"
    & winget install --id $id --exact --source winget --accept-source-agreements --accept-package-agreements --silent @extra
    # 0 = installed; the other two mean it's already installed.
    if ($LASTEXITCODE -notin @(0, -1978335189, -1978335135)) {
        throw "winget couldn't install $id (exit code $LASTEXITCODE). Scroll up for the reason, then run this again."
    }
    Refresh-Path
}

function Node-Ok {
    if (-not (Has node)) { return $false }
    $major = [int]((& node -p "process.versions.node.split('.')[0]") 2>$null)
    return $major -ge $NodeMajor
}

function Msvc-Ok {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (-not (Test-Path $vswhere)) { return $false }
    $path = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    return [bool]$path
}

function WebView2-Ok {
    $guid = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
    foreach ($key in @(
            "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$guid",
            "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$guid",
            "HKCU:\Software\Microsoft\EdgeUpdate\Clients\$guid")) {
        $pv = (Get-ItemProperty -Path $key -Name pv -ErrorAction SilentlyContinue).pv
        if ($pv -and $pv -ne '0.0.0.0') { return $true }
    }
    return $false
}

# ---------------------------------------------------------------- tools

Refresh-Path
if (-not (Has winget)) {
    throw "winget isn't available. Install 'App Installer' from the Microsoft Store, then run this again."
}

Say 'Installing Git, Node, Rust, C++ Build Tools and WebView2 (skips anything already there)'
if (Has git) { Ok 'Git' } else { Winget-Install 'Git.Git' }
if (Node-Ok) { Ok "Node $(node -v)" } else { Winget-Install 'OpenJS.NodeJS.LTS' }
if (-not (Node-Ok)) { throw "Node $NodeMajor or newer isn't on the PATH. Close this window, open a new PowerShell and run this again." }

if (Msvc-Ok) { Ok 'C++ Build Tools' } else {
    Write-Host '    The C++ Build Tools are a large download; this step can take a while.'
    Winget-Install 'Microsoft.VisualStudio.2022.BuildTools' @('--override', '--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended')
    if (-not (Msvc-Ok)) { throw 'The C++ Build Tools did not finish installing. Run this again; if it repeats, restart Windows first.' }
}

if (WebView2-Ok) { Ok 'WebView2' } else { Winget-Install 'Microsoft.EdgeWebView2Runtime' }

if (-not (Has rustup)) { Winget-Install 'Rustlang.Rustup' }
if (-not ((& rustup toolchain list) -match '^stable')) { Run { rustup toolchain install stable --profile minimal } }
& rustup update stable --no-self-update 2>&1 | Out-Null
& rustup default 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Run { rustup default stable } }
Refresh-Path
if (-not (Has cargo)) { throw 'Rust did not install. Close this window, open a new PowerShell and run this again.' }
Ok (& cargo --version)

# ---------------------------------------------------------------- libheif

if ($env:ARCHADE_NO_HEIC -eq '1') {
    Note 'skipping HEIC support (ARCHADE_NO_HEIC=1); the app will be built without it.'
} else {
    Say 'Setting up libheif for HEIC photo previews (vcpkg; the first time takes a while)'
    $vcpkgRoot = $env:VCPKG_ROOT
    if (-not $vcpkgRoot) { $vcpkgRoot = [Environment]::GetEnvironmentVariable('VCPKG_ROOT', 'User') }
    if (-not $vcpkgRoot) { $vcpkgRoot = Join-Path $HOME 'vcpkg' }
    $vcpkg = Join-Path $vcpkgRoot 'vcpkg.exe'
    if (-not (Test-Path $vcpkg)) {
        if (-not (Test-Path (Join-Path $vcpkgRoot '.git'))) { Run { git clone https://github.com/microsoft/vcpkg $vcpkgRoot } }
        Run { & (Join-Path $vcpkgRoot 'bootstrap-vcpkg.bat') -disableMetrics }
    }
    $installed = & $vcpkg list libheif 2>$null
    if ($installed -match "libheif:$HeifTriplet") { Ok 'libheif' } else { Run { & $vcpkg install "libheif[core]:$HeifTriplet" } }
    $env:VCPKG_ROOT = $vcpkgRoot
    if ([Environment]::GetEnvironmentVariable('VCPKG_ROOT', 'User') -ne $vcpkgRoot) {
        [Environment]::SetEnvironmentVariable('VCPKG_ROOT', $vcpkgRoot, 'User')
    }
    Ok "VCPKG_ROOT=$vcpkgRoot"
}

# ---------------------------------------------------------------- repo

Say "Getting the code into $Dir"
if (Test-Path (Join-Path $Dir '.git')) {
    Set-Location $Dir -ErrorAction Stop
    $changes = & git status --porcelain --untracked-files=no
    $branch = (& git rev-parse --abbrev-ref HEAD)
    if ($changes) {
        Note "you have changes in $Dir, so it wasn't updated. Running what's there."
    } else {
        & git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            & git pull --ff-only
            if ($LASTEXITCODE -ne 0) { Note "couldn't update (see above). Running what's there." }
        } else {
            Note "branch $branch has no GitHub branch to update from. Running what's there."
        }
    }
    Ok "on branch $branch"
} elseif (Test-Path $Dir) {
    throw "$Dir exists but isn't a copy of the repo. Move it away or set `$env:ARCHADE_DIR to another folder."
} else {
    # The repo is private: Git for Windows opens a GitHub sign-in window if needed.
    Write-Host '    If a GitHub sign-in window opens, choose "Sign in with your browser".'
    Run { git clone $RepoUrl $Dir }
    Set-Location $Dir -ErrorAction Stop
    Ok 'cloned'
}

# ---------------------------------------------------------------- run

Say "Installing the app's JavaScript packages (npm install)"
Run { npm install --no-fund --no-audit }

# Through cmd so PowerShell doesn't eat the "--" separators.
$devCmd = if ($env:ARCHADE_NO_HEIC -eq '1') { 'npm run tauri -- dev -- --no-default-features' } else { 'npm run tauri dev' }

if ($env:ARCHADE_NO_RUN -eq '1') {
    Say "All set. To start the app: cd `"$Dir`"; $devCmd"
    return
}
Say 'Starting Retro Arch-ade (the first build takes several minutes; later starts are quick)'
Write-Host '    To stop it, close the window or press Ctrl+C here.'
& cmd /c $devCmd
