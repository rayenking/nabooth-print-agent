# Nabooth Print Agent — one-line install (Windows)
# irm https://raw.githubusercontent.com/rayenking/nabooth-print-agent/main/install.ps1 | iex
$ErrorActionPreference = "Stop"

$Repo = "rayenking/nabooth-print-agent"
$Name = "nabooth-print-agent"
$Port = if ($env:NABOOTH_PRINT_PORT) { $env:NABOOTH_PRINT_PORT } else { "17890" }
$UI = "http://127.0.0.1:$Port"
$Asset = "nabooth-print-agent-windows-amd64.exe"

$InstallDir = Join-Path $env:LOCALAPPDATA "nabooth-print-agent"
$BinPath = Join-Path $InstallDir "$Name.exe"

Write-Host "Nabooth Print Agent install (windows/amd64)"

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

$downloadUrl = $null
try {
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ "User-Agent" = "nabooth-print-agent-install" }
  $asset = $release.assets | Where-Object { $_.name -eq $Asset } | Select-Object -First 1
  if ($asset) {
    $downloadUrl = $asset.browser_download_url
  } elseif ($release.tag_name) {
    $downloadUrl = "https://github.com/$Repo/releases/download/$($release.tag_name)/$Asset"
  }
} catch {
  Write-Warning "Could not query GitHub releases: $_"
}

if (-not $downloadUrl) {
  Write-Host @"
No release binary found for $Asset.

Build from source (needs Go 1.22+):
  git clone https://github.com/$Repo.git
  cd nabooth-print-agent\agent
  go build -o `"$BinPath`" .
  & `"$BinPath`"
"@
  exit 1
}

Write-Host "Downloading $downloadUrl"
$tmp = Join-Path $env:TEMP $Asset
Invoke-WebRequest -Uri $downloadUrl -OutFile $tmp -UseBasicParsing
Copy-Item -Force $tmp $BinPath
Write-Host "Installed → $BinPath"

# Optional startup shortcut
if ($env:NABOOTH_NO_STARTUP -ne "1") {
  $startup = [Environment]::GetFolderPath("Startup")
  $lnkPath = Join-Path $startup "Nabooth Print Agent.lnk"
  $wsh = New-Object -ComObject WScript.Shell
  $lnk = $wsh.CreateShortcut($lnkPath)
  $lnk.TargetPath = $BinPath
  $lnk.Arguments = "-open=false"
  $lnk.WorkingDirectory = $InstallDir
  $lnk.Save()
  Write-Host "Startup shortcut: $lnkPath"
}

# Start if not healthy
$healthy = $false
try {
  $h = Invoke-WebRequest -Uri "$UI/api/health" -UseBasicParsing -TimeoutSec 2
  if ($h.StatusCode -eq 200) { $healthy = $true }
} catch { }

if (-not $healthy) {
  Write-Host "Starting agent…"
  Start-Process -FilePath $BinPath -ArgumentList "-open=true" -WorkingDirectory $InstallDir
  Start-Sleep -Seconds 1
}

try { Start-Process $UI } catch { }

Write-Host @"

Nabooth Print Agent is ready.

  Control panel: $UI
  Binary:        $BinPath

Next:
  1. Open $UI
  2. Log in with dashboard Print Agent credentials
  3. Pick your printer and leave this running
  4. Booth → Print with Nabooth

"@
