# ──────────────────────────────────────────────────────────────────────────────
# PolarChat Installer for Windows
# Usage: iwr -useb https://polarchat.animalcoat.com/install.ps1 | iex
# ──────────────────────────────────────────────────────────────────────────────
$ErrorActionPreference = "Stop"

$REPO = "https://github.com/sambulbo-ship-it/Polarchat.git"
$INSTALL_DIR = "$env:LOCALAPPDATA\PolarChat"
$BRANCH = "main"

# ── Colors ───────────────────────────────────────────────────────────────────
function Write-Info  { Write-Host "[PolarChat] " -ForegroundColor Blue -NoNewline; Write-Host $args }
function Write-Ok    { Write-Host "[PolarChat] " -ForegroundColor Green -NoNewline; Write-Host $args }
function Write-Err   { Write-Host "[PolarChat] " -ForegroundColor Red -NoNewline; Write-Host $args }
function Write-Step  { Write-Host "`n> $args" -ForegroundColor Cyan }

# ── Banner ───────────────────────────────────────────────────────────────────
Write-Host @"

    ____        __           ________          __
   / __ \____  / /___ ______/ ____/ /_  ____ _/ /_
  / /_/ / __ \/ / __ `/ ___/ /   / __ \/ __ `/ __/
 / ____/ /_/ / / /_/ / /  / /___/ / / / /_/ / /_
/_/    \____/_/\__,_/_/   \____/_/ /_/\__,_/\__/

"@ -ForegroundColor Cyan

Write-Host "  Private messaging. End-to-end encrypted. No tracking.`n" -ForegroundColor DarkGray

# ── Check Git ────────────────────────────────────────────────────────────────
Write-Step "Checking dependencies"

try {
    $gitVersion = git --version 2>$null
    Write-Ok "  Git found: $gitVersion"
} catch {
    Write-Err "Git is required. Download from: https://git-scm.com/download/win"
    Write-Host "  Or run: winget install Git.Git" -ForegroundColor DarkGray
    exit 1
}

# ── Check / Install Node.js ─────────────────────────────────────────────────
$NEED_NODE = $false
try {
    $nodeVersion = node -v 2>$null
    $major = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($major -lt 18) {
        Write-Err "Node.js 18+ required (found $nodeVersion)"
        $NEED_NODE = $true
    } else {
        Write-Ok "  Node.js found: $nodeVersion"
    }
} catch {
    $NEED_NODE = $true
}

if ($NEED_NODE) {
    Write-Step "Installing Node.js"
    try {
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        Write-Ok "  Node.js installed: $(node -v)"
    } catch {
        Write-Err "Failed to install Node.js automatically."
        Write-Host "  Please install manually: https://nodejs.org" -ForegroundColor DarkGray
        exit 1
    }
}

try {
    $npmVersion = npm -v 2>$null
    Write-Ok "  npm found: v$npmVersion"
} catch {
    Write-Err "npm not found. Reinstall Node.js from https://nodejs.org"
    exit 1
}

# ── Clone / Update ──────────────────────────────────────────────────────────
Write-Step "Downloading PolarChat"

if (Test-Path "$INSTALL_DIR\.git") {
    Write-Info "Updating existing installation..."
    Set-Location $INSTALL_DIR
    git fetch origin $BRANCH --quiet 2>$null
    git reset --hard "origin/$BRANCH" --quiet 2>$null
    Write-Ok "  Updated to latest version"
} else {
    Write-Info "Cloning repository..."
    if (Test-Path $INSTALL_DIR) { Remove-Item -Recurse -Force $INSTALL_DIR }
    git clone --depth 1 --branch $BRANCH $REPO $INSTALL_DIR --quiet 2>$null
    Write-Ok "  Downloaded"
}

Set-Location $INSTALL_DIR

# ── Install dependencies ────────────────────────────────────────────────────
Write-Step "Installing dependencies"
npm ci --omit=dev --silent 2>$null
if ($LASTEXITCODE -ne 0) { npm install --omit=dev --silent 2>$null }
Write-Ok "  Dependencies installed"

# ── Build ────────────────────────────────────────────────────────────────────
Write-Step "Building PolarChat"
npm run build 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Err "Build failed. Check Node.js version and try again."
    exit 1
}
Write-Ok "  Build complete"

# ── Create launcher ─────────────────────────────────────────────────────────
Write-Step "Creating launcher"

$LAUNCHER_BAT = "$INSTALL_DIR\PolarChat.bat"
@"
@echo off
title PolarChat
cd /d "%LOCALAPPDATA%\PolarChat"
start "" http://localhost:3001
node server\dist\index.js
"@ | Set-Content -Path $LAUNCHER_BAT -Encoding ASCII

$LAUNCHER_PS1 = "$INSTALL_DIR\Start-PolarChat.ps1"
@"
Set-Location "`$env:LOCALAPPDATA\PolarChat"
Start-Process "http://localhost:3001"
node server\dist\index.js
"@ | Set-Content -Path $LAUNCHER_PS1 -Encoding UTF8

Write-Ok "  Launcher created"

# ── Desktop shortcut ────────────────────────────────────────────────────────
Write-Step "Creating shortcuts"

$WshShell = New-Object -ComObject WScript.Shell

# Desktop shortcut
$DesktopLink = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\PolarChat.lnk")
$DesktopLink.TargetPath = $LAUNCHER_BAT
$DesktopLink.WorkingDirectory = $INSTALL_DIR
$DesktopLink.Description = "PolarChat - Private & Secure Chat"
$DesktopLink.Save()
Write-Ok "  Desktop shortcut created"

# Start Menu shortcut
$StartMenuDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\PolarChat"
if (-not (Test-Path $StartMenuDir)) { New-Item -ItemType Directory -Path $StartMenuDir -Force | Out-Null }
$StartLink = $WshShell.CreateShortcut("$StartMenuDir\PolarChat.lnk")
$StartLink.TargetPath = $LAUNCHER_BAT
$StartLink.WorkingDirectory = $INSTALL_DIR
$StartLink.Description = "PolarChat - Private & Secure Chat"
$StartLink.Save()
Write-Ok "  Start Menu shortcut created"

# ── Add to PATH ─────────────────────────────────────────────────────────────
$UserPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$INSTALL_DIR*") {
    [System.Environment]::SetEnvironmentVariable("Path", "$UserPath;$INSTALL_DIR", "User")
    $env:Path += ";$INSTALL_DIR"
    Write-Ok "  Added to PATH"
}

# ── Done ─────────────────────────────────────────────────────────────────────
Write-Host "`n" -NoNewline
Write-Host "  PolarChat installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "  Launch:    Double-click the PolarChat shortcut on your Desktop"
Write-Host "             Or run: PolarChat.bat" -ForegroundColor DarkGray
Write-Host "  Location:  $INSTALL_DIR"
Write-Host ""
Write-Host "  Uninstall: Remove-Item -Recurse '$INSTALL_DIR'" -ForegroundColor DarkGray
Write-Host "             Remove shortcuts from Desktop and Start Menu" -ForegroundColor DarkGray
Write-Host ""

# Ask to launch
$launch = Read-Host "Launch PolarChat now? (Y/n)"
if ($launch -ne "n" -and $launch -ne "N") {
    Start-Process $LAUNCHER_BAT
}
