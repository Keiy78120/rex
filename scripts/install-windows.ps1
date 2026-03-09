# REX — Windows Bootstrap
# Idempotent one-command install for Windows (PowerShell 5+ / Windows 10+)
# Usage: powershell -ExecutionPolicy Bypass -File scripts\install-windows.ps1 [-Profile desktop-full] [-Yes]
param(
  [string]$Profile = "local-dev",
  [switch]$Yes
)

$ErrorActionPreference = "Stop"

function Write-Ok($msg)   { Write-Host "  $([char]0x2713) $msg" -ForegroundColor Green }
function Write-Info($msg) { Write-Host "  -> $msg" -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host "  ! $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "  X $msg" -ForegroundColor Red }
function Write-Step($msg) { Write-Host "`n$msg" -ForegroundColor White }

Write-Host "`nREX — Windows Bootstrap" -ForegroundColor White
Write-Host "Profile: $Profile`n" -ForegroundColor DarkGray

# ── Windows check ─────────────────────────────────────────────────────────
if (-not $IsWindows -and $PSVersionTable.PSVersion.Major -lt 6) {
  # PSVersion < 6 means Windows PowerShell — assume Windows
}

# ── Winget availability ───────────────────────────────────────────────────
$hasWinget = $null -ne (Get-Command "winget" -ErrorAction SilentlyContinue)

# ── Node.js ───────────────────────────────────────────────────────────────
Write-Step "1. Node.js"
$nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
if ($nodeCmd) {
  Write-Ok "Node.js already installed: $(node --version)"
} else {
  Write-Warn "Node.js not found."
  if ($hasWinget) {
    Write-Info "Installing via winget..."
    winget install --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
    # Refresh PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
    Write-Ok "Node.js installed: $(node --version)"
  } else {
    Write-Fail "winget not available. Download Node.js from: https://nodejs.org"
    exit 1
  }
}

# ── pnpm ──────────────────────────────────────────────────────────────────
Write-Step "2. pnpm"
$pnpmCmd = Get-Command "pnpm" -ErrorAction SilentlyContinue
if ($pnpmCmd) {
  Write-Ok "pnpm already installed: $(pnpm --version)"
} else {
  Write-Info "Installing pnpm..."
  npm install -g pnpm
  Write-Ok "pnpm installed"
}

# ── git ───────────────────────────────────────────────────────────────────
Write-Step "3. git"
$gitCmd = Get-Command "git" -ErrorAction SilentlyContinue
if ($gitCmd) {
  Write-Ok "git already installed: $((git --version)[0])"
} else {
  Write-Warn "git not found."
  if ($hasWinget) {
    Write-Info "Installing via winget..."
    winget install --id Git.Git --silent --accept-source-agreements --accept-package-agreements
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
    Write-Ok "git installed"
  } else {
    Write-Fail "Download git from: https://git-scm.com"
    exit 1
  }
}

# ── rex-claude ────────────────────────────────────────────────────────────
Write-Step "4. rex-claude"
$rexCmd = Get-Command "rex" -ErrorAction SilentlyContinue
if ($rexCmd) {
  $rexVer = try { rex --version 2>$null | Select-Object -First 1 } catch { "unknown" }
  Write-Ok "rex already installed: $rexVer"
} else {
  Write-Info "Installing rex-claude..."
  npm install -g rex-claude
  Write-Ok "rex installed"
}

# ── Ollama ────────────────────────────────────────────────────────────────
Write-Step "5. Ollama (local AI — optional)"
$ollamaCmd = Get-Command "ollama" -ErrorAction SilentlyContinue
if ($ollamaCmd) {
  Write-Ok "Ollama already installed"
} else {
  $installOllama = $Yes
  if (-not $installOllama) {
    $ans = Read-Host "  Install Ollama? [y/N]"
    $installOllama = $ans -match "^[Yy]$"
  }
  if ($installOllama) {
    if ($hasWinget) {
      Write-Info "Installing Ollama via winget..."
      winget install --id Ollama.Ollama --silent --accept-source-agreements --accept-package-agreements
      Write-Ok "Ollama installed"
    } else {
      Write-Warn "Download Ollama from: https://ollama.ai/download"
    }
  } else {
    Write-Warn "Skipped Ollama"
  }
}

# ── Windows Scheduled Task (headless) ────────────────────────────────────
Write-Step "6. Background daemon"
$taskName = "REX Daemon"
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
  Write-Ok "REX Daemon scheduled task already exists"
} else {
  $rexPath = (Get-Command "rex" -ErrorAction SilentlyContinue)?.Source
  if ($rexPath) {
    Write-Info "Creating Windows scheduled task for rex daemon..."
    $action  = New-ScheduledTaskAction -Execute $rexPath -Argument "daemon"
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([System.TimeSpan]::Zero) -RestartCount 3 -RestartInterval ([System.TimeSpan]::FromMinutes(1))
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force | Out-Null
    Write-Ok "Scheduled task created (starts at logon)"
    Write-Info "Start now with: Start-ScheduledTask -TaskName '$taskName'"
  } else {
    Write-Warn "rex binary not found in PATH — skipping scheduled task"
  }
}

# ── rex install ───────────────────────────────────────────────────────────
Write-Step "7. REX initialization"
Write-Info "Running: rex install --profile=$Profile"
if ($Yes) {
  rex install --profile=$Profile --yes
} else {
  rex install --profile=$Profile
}

Write-Host "`nREX Windows setup complete!" -ForegroundColor Green
Write-Host "Run 'rex doctor' to verify the installation." -ForegroundColor DarkGray
Write-Host ""
