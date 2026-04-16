#!/usr/bin/env pwsh

param(
  [switch]$Dev,
  [switch]$Mcp
)

$ErrorActionPreference = 'Stop'

$Repo = 'https://github.com/pfchrono/free-code.git'
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
  Write-Host '  ______                    ______          __' -ForegroundColor Cyan
  Write-Host ' / ____/_______  ___  ___  / ____/___  ____/ /__' -ForegroundColor Cyan
  Write-Host '/ /_  / ___/ _ \/ _ \/ _ \/ /   / __ \/ __  / _ \' -ForegroundColor Cyan
  Write-Host '/ __/ / /  /  __/  __/  __/ /___/ /_/ / /_/ /  __/' -ForegroundColor Cyan
  Write-Host '/_/   /_/   \___/\___/\___/\____/\____/\__,_/\___/' -ForegroundColor Cyan
  Write-Host ''
  Write-Host '  free-code installer for Windows' -ForegroundColor DarkGray
  Write-Host '  telemetry stripped | multi-provider | local-first' -ForegroundColor DarkGray
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

function Install-MCP-Servers {
  Info 'Installing MCP servers...'

  $npm = Get-Command npm -ErrorAction SilentlyContinue
  if (-not $npm) {
    Fail @'
npm is required for MCP server installation.
Install Node.js first:
  winget install --id OpenJS.NodeJS.LTS -e --source winget
'@
  }

  $mcpWorkspace = Join-Path $InstallDir 'mcp-servers'
  $localPrefix = Join-Path $HOME '.local'
  $codeSummarizerCmd = Join-Path $localPrefix 'code-summarizer.cmd'
  $tokenMonitorCmd = Join-Path $localPrefix 'token-monitor.cmd'

  if (Test-Path $mcpWorkspace) {
    Info "Building local MCP servers from $mcpWorkspace..."
    Push-Location $mcpWorkspace
    try {
      npm install | Out-Host
      Assert-LastExitCode 'npm install failed for mcp-servers.'

      npm run build | Out-Host
      Assert-LastExitCode 'npm run build failed for mcp-servers.'

      npm install --global --prefix $localPrefix --workspaces=false ./token-monitor | Out-Host
      Assert-LastExitCode 'Failed to install token-monitor globally.'

      npm install --global --prefix $localPrefix --workspaces=false ./code-summarizer | Out-Host
      Assert-LastExitCode 'Failed to install code-summarizer globally.'
    }
    finally {
      Pop-Location
    }
  }
  else {
    Warn "MCP workspace not found at $mcpWorkspace. Skipping local MCP package install."
  }

  $mcpServers = @(
    @{ Name = 'MiniMax'; Command = 'uvx'; Args = @('minimax-coding-plan-mcp', '-y') },
    @{ Name = 'codesight'; Command = 'npx'; Args = @('codesight', '--wiki', '--mcp', '--watch', '-hook') },
    @{ Name = 'code-summarizer'; Command = $codeSummarizerCmd; Args = @() },
    @{ Name = 'token-monitor'; Command = $tokenMonitorCmd; Args = @() }
  )

  $existingServers = & free-code mcp list 2>&1 | Out-String

  foreach ($server in $mcpServers) {
    $serverName = $server.Name
    $cmd = $server.Command
    $args = $server.Args

    if ($existingServers -match $serverName) {
      Ok "  MCP server '$serverName' already installed, skipping"
      continue
    }

    if ($serverName -in @('code-summarizer', 'token-monitor') -and -not (Test-Path $cmd)) {
      Warn "  MCP server '$serverName' launcher not found at '$cmd'. Skipping."
      continue
    }

    Info "  Adding MCP server: $serverName"
    try {
      if ($args.Count -gt 0) {
        & free-code mcp add $serverName $cmd $args 2>&1 | Out-Null
      }
      else {
        & free-code mcp add $serverName $cmd 2>&1 | Out-Null
      }
      if ($LASTEXITCODE -eq 0) {
        Ok "  MCP server '$serverName' added successfully"
      }
      else {
        Warn "  MCP server '$serverName' failed (exit $LASTEXITCODE). Skipping."
      }
    }
    catch {
      Warn "  Could not add '$serverName': $_"
    }
  }

  Ok 'MCP server setup complete'
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
if ($Mcp) {
  Install-MCP-Servers
}
else {
  Info 'Skipping MCP server install (pass -Mcp to enable).'
}

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
Write-Host '  Provider bootstrap:'
Write-Host '    bun run profile:init             # initialize repo-local provider profile' -ForegroundColor Cyan
Write-Host '    bun run profile:auto             # auto-detect recommended provider' -ForegroundColor Cyan
Write-Host '    bun run doctor:provider          # validate provider wiring and auth' -ForegroundColor Cyan
Write-Host ''
Write-Host '  Launch from selected profile:'
Write-Host '    bun run dev:profile              # start using current repo profile' -ForegroundColor Cyan
Write-Host '    bun run dev:profile:auto         # auto-pick launch profile' -ForegroundColor Cyan
Write-Host ''
Write-Host '  Pick provider directly:'
Write-Host '    bun run profile:codex' -ForegroundColor Cyan
Write-Host '    bun run profile:openai' -ForegroundColor Cyan
Write-Host '    bun run profile:copilot' -ForegroundColor Cyan
Write-Host '    bun run profile:openrouter' -ForegroundColor Cyan
Write-Host '    bun run profile:lmstudio' -ForegroundColor Cyan
Write-Host '    bun run profile:zen' -ForegroundColor Cyan
Write-Host '    bun run profile:minimax' -ForegroundColor Cyan
Write-Host '    bun run profile:firstparty' -ForegroundColor Cyan
Write-Host ''
Write-Host '  gRPC dev helpers:'
Write-Host '    bun run dev:grpc' -ForegroundColor Cyan
Write-Host '    bun run dev:grpc:cli' -ForegroundColor Cyan
Write-Host ''
Write-Host '  Provider notes:' -ForegroundColor DarkGray
Write-Host '    Profiles stay repo-local and avoid redoing shell env setup each launch.' -ForegroundColor DarkGray
Write-Host '    Use doctor:provider after switching auth, env, or provider targets.' -ForegroundColor DarkGray
Write-Host '    Use dev:profile for normal startup; use dev:grpc or dev:grpc:cli for transport testing.' -ForegroundColor DarkGray
Write-Host ''
Write-Host '  Manual API key setup if needed:'
Write-Host '    $env:OPENAI_API_KEY="sk-..."' -ForegroundColor Cyan
Write-Host '    setx OPENAI_API_KEY "sk-..."     # persist across sessions' -ForegroundColor Cyan
Write-Host '    $env:ANTHROPIC_API_KEY="sk-ant-..."' -ForegroundColor Cyan
Write-Host '    setx ANTHROPIC_API_KEY "sk-ant-..."   # persist across sessions' -ForegroundColor Cyan
Write-Host ''
Write-Host "  Source: $InstallDir" -ForegroundColor DarkGray
Write-Host "  Link:   $LinkDir\free-code.cmd" -ForegroundColor DarkGray
Write-Host ''
