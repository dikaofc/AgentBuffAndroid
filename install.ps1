# =============================================================================
#  DikaBuff — one-shot installer (Windows PowerShell)
#  Builds the CLI and installs `dikabuff.cmd` into %USERPROFILE%\.dikabuff-bin,
#  then adds that folder to your user PATH (registry, idempotent).
#
#  Usage:
#    powershell -ExecutionPolicy Bypass -File .\install.ps1
#    .\install.ps1 -Full        # force fresh npm install + build
# =============================================================================

$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BinDir = Join-Path $env:USERPROFILE ".dikabuff-bin"
$FULL = $args -contains "-Full" -or $args -contains "--full"

function Write-Note($msg) { Write-Host "[dikabuff] $msg" }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is required but not found. Install from https://nodejs.org and re-run."
    exit 1
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm is required but not found."
    exit 1
}

Set-Location $ProjectDir

if (-not (Test-Path node_modules) -or $FULL) {
    Write-Note "installing dependencies (npm install)…"
    npm install --no-audit --no-fund
} else {
    Write-Note "node_modules present — skipping npm install."
}

if (-not (Test-Path "apps\dikabuff-cli\dist\index.js") -or $FULL) {
    Write-Note "building the CLI (npm run build)…"
    npm run build
} else {
    Write-Note "CLI already built — skipping build."
}

New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
$wrapper = Join-Path $BinDir "dikabuff.cmd"
$nodeExe = (Get-Command node).Source
$content = "@echo off`r`n`"$nodeExe`" `"$ProjectDir\apps\dikabuff-cli\dist\index.js`" %*`r`n"
Set-Content -Path $wrapper -Value $content -Encoding ascii
Write-Note "installed dikabuff.cmd -> $wrapper"

# --- Add to user PATH (registry), idempotent ---------------------------------
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$BinDir*") {
    $newPath = if ([string]::IsNullOrEmpty($userPath)) { $BinDir } else { $userPath + ";" + $BinDir }
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    Write-Note "added $BinDir to your user PATH."
} else {
    Write-Note "$BinDir is already on your user PATH."
}

Write-Host ""
Write-Host "dikabuff is ready. Open a NEW terminal (PATH takes effect per-session) and run:"
Write-Host "  dikabuff --help"
Write-Host "  dikabuff"