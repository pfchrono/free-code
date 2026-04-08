#!/usr/bin/env pwsh

param(
  [switch]$Dev
)

$ErrorActionPreference = 'Stop'

$Repo = 'https://github.com/paoloanzn/free-code.git'
$DefaultInstallDir = Join-Path $HOME 'free-code'
$BunMinVersion = [version]'1.3.11'
$LinkDir = Join-Path $HOME '.local\bin'
$ScriptRootDir = if ($PSScriptRoot) { $PSScriptRoot } elseif ($PSCommandPath) { Split-Path -Parent $PSCommandPath } else { $null }
$UseLocalSource =
$ScriptRootDir -and
(Test-Path (Join-Path $ScriptRootDir 'package.json')) -and
(Test-Path (Join-Path $ScriptRootDir 'scripts\build.ts'))
$InstallDir = if ($UseLocalSource) { $ScriptRootDir } else { $DefaultInstallDir }

function Info([string]$Message) {
  Write-Host "[*] $Message" -ForegroundColor Cyan
}

function Ok([string]$Message) {
  Write-Host "[+] $Message" -ForegroundColor Green
}

function Warn([string]$Message) {
  Write-Host "[!] $Message" -ForegroundColor Yellow
}

function Fail([string]$Message) {
  Write-Host "[x] $Message" -ForegroundColor Red
  exit 1
}

function Assert-LastExitCode([string]$Message) {
  if ($LASTEXITCODE -ne 0) {
    Fail $Message
  }
}

function Header {
  Write-Host ''
  Write-Host '   ___                            _' -ForegroundColor Cyan
  Write-Host '  / _|_ __ ___  ___        ___ __| | ___' -ForegroundColor Cyan
  Write-Host ' | |_| ''__/ _ \/ _ \_____ / __/ _` |/ _ \' -ForegroundColor Cyan
  Write-Host ' |  _| | |  __/  __/_____| (_| (_| |  __/' -ForegroundColor Cyan
  Write-Host ' |_| |_|  \___|\___|      \___\__,_|\___|' -ForegroundColor Cyan
  Write-Host ''
  Write-Host '  The free build of Claude Code' -ForegroundColor DarkGray
  Write-Host ''
}

function Compare-Version([string]$RawVersion) {
  try {
    return [version]$RawVersion
  }
  catch {
    return [version]'0.0.0'
  }
}

function Refresh-BunPath {
  $bunBin = Join-Path $HOME '.bun\bin'
  if (Test-Path $bunBin) {
    $pathEntries = @($env:PATH -split ';' | Where-Object { $_ })
    if ($pathEntries -notcontains $bunBin) {
      $env:PATH = "$bunBin;$env:PATH"
    }
  }
}

function Check-OS {
  $onWindows = $IsWindows -or ($env:OS -eq 'Windows_NT')
  if (-not $onWindows) {
    Fail 'This installer is for Windows only. Use install.sh on macOS or Linux.'
  }

  Ok "OS: Windows $([System.Environment]::OSVersion.VersionString)"
}

function Check-Git {
  $git = Get-Command git -ErrorAction SilentlyContinue
  if (-not $git) {
    Fail @'
git is not installed. Install it first:
  winget install --id Git.Git -e --source winget
'@
  }

  Ok "git: $((git --version) | Select-Object -First 1)"
}

function Install-Bun {
  Info 'Installing Bun...'
  Invoke-RestMethod https://bun.sh/install.ps1 | Invoke-Expression
  Refresh-BunPath

  if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    Fail @'
bun installation succeeded but the binary is not on PATH.
Restart PowerShell or add this directory to your user PATH:
  %USERPROFILE%\.bun\bin
'@
  }

  Ok "bun: v$(bun --version) (just installed)"
}

function Check-Bun {
  Refresh-BunPath
  $bun = Get-Command bun -ErrorAction SilentlyContinue

  if (-not $bun) {
    Install-Bun
    return
  }

  $rawVersion = (bun --version).Trim()
  $parsedVersion = Compare-Version $rawVersion
  if ($parsedVersion -ge $BunMinVersion) {
    Ok "bun: v$rawVersion"
    return
  }

  Warn "bun v$rawVersion found but v$BunMinVersion+ required. Upgrading..."
  Install-Bun
}

function Clone-Repo {
  if ($UseLocalSource) {
    Info 'Using local checkout as install source...'
    Ok "Source: $InstallDir"
    return
  }

  if (Test-Path $InstallDir) {
    Warn "$InstallDir already exists"
    if (Test-Path (Join-Path $InstallDir '.git')) {
      Info 'Pulling latest changes...'
      try {
        git -C $InstallDir pull --ff-only origin main | Out-Null
      }
      catch {
        Warn 'Pull failed, continuing with existing copy'
      }
    }
    else {
      Fail "$InstallDir exists but is not a git checkout. Remove it or choose a different install location."
    }
  }
  else {
    Info 'Cloning repository...'
    git clone --depth 1 $Repo $InstallDir | Out-Null
    Assert-LastExitCode 'git clone failed.'
  }

  Ok "Source: $InstallDir"
}

function Install-Deps {
  Info 'Installing dependencies...'
  Push-Location $InstallDir
  try {
    bun install --frozen-lockfile | Out-Null
    if ($LASTEXITCODE -ne 0) {
      bun install | Out-Null
      Assert-LastExitCode 'bun install failed.'
    }
  }
  finally {
    Pop-Location
  }
  Ok 'Dependencies installed'
}

function Resolve-BuiltBinary {
  $candidates = if ($Dev) {
    @(
      (Join-Path $InstallDir 'dist\cli-dev.exe'),
      (Join-Path $InstallDir 'dist\cli-dev'),
      (Join-Path $InstallDir 'dist\cli.exe'),
      (Join-Path $InstallDir 'dist\cli')
    )
  }
  else {
    @(
      (Join-Path $InstallDir 'dist\cli.exe'),
      (Join-Path $InstallDir 'dist\cli')
    )
  }
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }
  return $null
}

function Build-Binary {
  $buildLabel = if ($Dev) {
    'Building free-code dev executable (all experimental features enabled, no telemetry)...'
  }
  else {
    'Building free-code standard executable (no telemetry)...'
  }
  $buildScript = if ($Dev) { 'compile:dev:full:no-telemetry' } else { 'compile:no-telemetry' }
  $buildArgs = @('run', $buildScript)
  $expectedBinary = if ($Dev) { 'cli-dev' } else { 'cli' }

  Info $buildLabel
  Push-Location $InstallDir
  try {
    & bun @buildArgs | Out-Host
    Assert-LastExitCode "bun $($buildArgs -join ' ') failed."

    $binaryPath = Resolve-BuiltBinary
    if (-not $binaryPath) {
      Fail "Build completed but $expectedBinary was not found."
    }

    Info "Verifying $binaryPath for phone-home patterns..."
    & bun run verify:no-phone-home -- $binaryPath | Out-Host
    Assert-LastExitCode "bun run verify:no-phone-home -- $binaryPath failed."
  }
  finally {
    Pop-Location
  }

  Ok "Binary built: $binaryPath"
  return [string]$binaryPath
}

function Ensure-UserPath([string]$Directory) {
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $entries = @($userPath -split ';' | Where-Object { $_ })
  if ($entries -notcontains $Directory) {
    $newUserPath = if ([string]::IsNullOrWhiteSpace($userPath)) {
      $Directory
    }
    else {
      "$userPath;$Directory"
    }
    [Environment]::SetEnvironmentVariable('Path', $newUserPath, 'User')
    $env:PATH = "$Directory;$env:PATH"
    Warn "$Directory was added to your user PATH. New shells will pick it up automatically."
  }
  elseif (($env:PATH -split ';' | Where-Object { $_ }) -notcontains $Directory) {
    $env:PATH = "$Directory;$env:PATH"
  }
}

function Link-Binary([string]$BinaryPath) {
  New-Item -ItemType Directory -Force -Path $LinkDir | Out-Null

  $exeLauncherPath = Join-Path $LinkDir 'free-code.exe'
  $launcherPath = Join-Path $LinkDir 'free-code.cmd'
  $escapedBinaryPath = $BinaryPath.Replace('%', '%%')
  $launcher = @(
    '@echo off',
    'setlocal',
    ('set "TARGET=' + $escapedBinaryPath + '"'),
    'if not exist "%TARGET%" (',
    '  echo free-code binary not found: %TARGET%',
    '  exit /b 1',
    ')',
    '"%TARGET%" %*'
  ) -join "`r`n"

  # Prefer a native .exe launcher on Windows so PowerShell and VS Code
  # terminals invoke the console binary directly instead of routing through
  # cmd.exe via a .cmd shim, which can interfere with fullscreen TUIs.
  try {
    Copy-Item -Path $BinaryPath -Destination $exeLauncherPath -Force
    Ok "Native launcher created: $exeLauncherPath"
  }
  catch {
    Warn "Could not replace $exeLauncherPath because it is in use. Keeping the existing .exe launcher and updating the .cmd launcher instead."
  }

  Set-Content -Path $launcherPath -Value $launcher -Encoding ASCII
  Ok "Launcher created: $launcherPath"

  Ensure-UserPath $LinkDir
}

Header
Info 'Starting installation...'
Write-Host ''

Check-OS
Check-Git
Check-Bun
if ($UseLocalSource) {
  Warn 'Local install script detected. Building and linking the current checkout instead of cloning from GitHub.'
}
Write-Host ''

Clone-Repo
Install-Deps
$binaryPath = Build-Binary
Link-Binary $binaryPath

Write-Host ''
Write-Host '  Installation complete!' -ForegroundColor Green
Write-Host ''
Write-Host '  Run it:'
if ($Dev) {
  Write-Host '    free-code                         # interactive REPL (dev/experimental build)' -ForegroundColor Cyan
}
else {
Write-Host '    free-code                         # interactive REPL (standard build)' -ForegroundColor Cyan
}
Write-Host '    free-code -p "your prompt"        # one-shot mode' -ForegroundColor Cyan
Write-Host ''
Write-Host '  Recommended first-party setup (Anthropic / Claude.ai):'
Write-Host '    free-code /login' -ForegroundColor Cyan
Write-Host ''
Write-Host '  Native OpenAI API setup:'
Write-Host '    $env:OPENAI_API_KEY="sk-..."' -ForegroundColor Cyan
Write-Host '    setx OPENAI_API_KEY "sk-..."     # persist across sessions' -ForegroundColor Cyan
Write-Host '    free-code /openai on             # store native OpenAI provider preference for this repo' -ForegroundColor Cyan
Write-Host '    free-code /openai status         # show stored preference and current provider' -ForegroundColor Cyan
Write-Host '    free-code /openai models         # list discovered OpenAI models' -ForegroundColor Cyan
Write-Host '    free-code /openai capabilities gpt-5.4' -ForegroundColor Cyan
Write-Host ''
Write-Host '  ChatGPT Codex setup:'
Write-Host '    free-code /login                 # choose the ChatGPT Codex account option in the login flow' -ForegroundColor Cyan
Write-Host '    free-code /codex on              # store ChatGPT Codex provider preference for this repo' -ForegroundColor Cyan
Write-Host '    free-code /codex status          # show stored preference and current provider' -ForegroundColor Cyan
Write-Host '    free-code /codex models          # list curated Codex models' -ForegroundColor Cyan
Write-Host ''
Write-Host '  GitHub Copilot setup:'
Write-Host '    free-code /login                 # choose the GitHub Copilot account option in the login flow' -ForegroundColor Cyan
Write-Host '    free-code /copilot on            # store Copilot provider preference for this repo' -ForegroundColor Cyan
Write-Host '    free-code /copilot status        # show stored preference and current provider' -ForegroundColor Cyan
Write-Host '    free-code /copilot models        # list discovered models, usable models, and compatibility reasons' -ForegroundColor Cyan
Write-Host ''
Write-Host '  Provider notes:' -ForegroundColor DarkGray
Write-Host '    /openai uses the native OpenAI API and requires OPENAI_API_KEY.' -ForegroundColor DarkGray
Write-Host '    /codex uses ChatGPT Codex OAuth, not the native OpenAI API.' -ForegroundColor DarkGray
Write-Host '    /copilot uses GitHub Copilot OAuth and probes model compatibility on /chat/completions.' -ForegroundColor DarkGray
Write-Host '    /openai, /codex, and /copilot store repo-local preferences in .claude/settings.json and apply after restart.' -ForegroundColor DarkGray
Write-Host ''
Write-Host '  Anthropic API key setup (optional alternative to /login):'
Write-Host '    $env:ANTHROPIC_API_KEY="sk-ant-..."' -ForegroundColor Cyan
Write-Host '    setx ANTHROPIC_API_KEY "sk-ant-..."   # persist across sessions' -ForegroundColor Cyan
Write-Host ''
Write-Host "  Source: $InstallDir" -ForegroundColor DarkGray
Write-Host "  Link:   $LinkDir\free-code.cmd" -ForegroundColor DarkGray
Write-Host ''
