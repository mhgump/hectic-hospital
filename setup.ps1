$ErrorActionPreference = "Stop"
$script:TranscriptStarted = $false

function Log($Message) {
  Write-Host "`n==> $Message"
}

function Fail($Message) {
  throw [System.Exception]::new($Message)
}

function Warn($Message) {
  Write-Host "WARNING: $Message" -ForegroundColor Yellow
}

function Command-Exists($Name) {
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Refresh-Path {
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
              [System.Environment]::GetEnvironmentVariable("Path", "User")
}

function Parse-SetupArgs {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$InputArgs
  )

  $mode = "auto"
  $forward = New-Object System.Collections.Generic.List[string]

  foreach ($arg in $InputArgs) {
    $lower = $arg.ToLowerInvariant()

    if ($lower -eq "--skip-network-check" -or $lower -eq "--no-network-check") {
      $mode = "off"
      continue
    }

    if ($lower -eq "--strict-network-check") {
      $mode = "strict"
      continue
    }

    if ($lower.StartsWith("--network-check=")) {
      $value = $lower.Substring("--network-check=".Length)
      if ($value -in @("auto", "strict", "off")) {
        $mode = $value
      } else {
        Fail "Invalid value for --network-check. Use auto, strict, or off."
      }
      continue
    }

    $null = $forward.Add($arg)
  }

  return [PSCustomObject]@{
    Mode = $mode
    Forward = $forward.ToArray()
  }
}

function Get-NpmRegistry {
  if (-not [string]::IsNullOrWhiteSpace($env:NPM_CONFIG_REGISTRY)) {
    return $env:NPM_CONFIG_REGISTRY
  }
  return "https://registry.npmjs.org/"
}

function Test-Network {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Registry
  )

  try {
    $response = Invoke-WebRequest -Uri $Registry -UseBasicParsing -TimeoutSec 8 -ErrorAction Stop
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400)
  } catch {
    return $false
  }
}

function Run-NetworkCheck {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("auto", "strict", "off")]
    [string]$Mode
  )

  if ($Mode -eq "off") {
    Log "Skipping network connectivity precheck (--network-check=off)"
    return
  }

  $registry = Get-NpmRegistry
  Log "Checking network connectivity"

  if (Test-Network -Registry $registry) {
    return
  }

  if ($Mode -eq "strict") {
    Fail "Could not reach $registry. Check internet/proxy settings, or run with --network-check=off."
  }

  Warn "Could not reach $registry during precheck. Continuing because --network-check=auto."
  Warn "If setup later fails due to network, retry with internet/proxy configured."
}

function Initialize-Logging {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  try {
    Start-Transcript -Path $Path -Append -ErrorAction Stop | Out-Null
    $script:TranscriptStarted = $true
    Log "Setup started"
    Write-Host "Log file: $Path"
  } catch {
    Warn "Could not start transcript logging: $($_.Exception.Message)"
  }
}

function Get-RequiredNodeMajor {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectDir
  )

  $packageJsonPath = Join-Path $ProjectDir "package.json"
  if (-not (Test-Path $packageJsonPath)) {
    Fail "package.json not found."
  }

  $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
  $nodeRange = [string]$packageJson.engines.node
  if ([string]::IsNullOrWhiteSpace($nodeRange)) {
    Fail "package.json is missing engines.node."
  }

  $match = [regex]::Match($nodeRange, "\d+")
  if (-not $match.Success) {
    Fail "Could not parse engines.node value: $nodeRange"
  }

  return [int]$match.Value
}

function Get-NodeMajor {
  $major = & node -p "process.versions.node.split('.')[0]"
  if ($LASTEXITCODE -ne 0) {
    Fail "Failed to read Node.js version."
  }
  return [int]$major
}

function Test-WingetPackageInstalled {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Id
  )

  & winget list --id $Id -e --accept-source-agreements 1>$null 2>$null
  return ($LASTEXITCODE -eq 0)
}

function Get-WingetArgsWithOptionalDisableInteractivity {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$BaseArgs,
    [Parameter(Mandatory = $true)]
    [string]$Command
  )

  $helpOutput = (& winget $Command --help 2>$null | Out-String)
  if ($helpOutput -match "disable-interactivity") {
    return $BaseArgs + "--disable-interactivity"
  }

  return $BaseArgs
}

function Install-WingetPackage {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Id,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  Log "Installing $Label"
  $baseArgs = @(
    "install", "--id", $Id, "-e", "--source", "winget",
    "--silent", "--accept-package-agreements", "--accept-source-agreements"
  )
  $wingetArgs = Get-WingetArgsWithOptionalDisableInteractivity -BaseArgs $baseArgs -Command "install"

  & winget @wingetArgs
  if ($LASTEXITCODE -ne 0) {
    Fail "$Label installation failed. Try running PowerShell as Administrator and re-run .\setup.ps1."
  }
}

function Install-WingetPackageIfMissing {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Id,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  if (Test-WingetPackageInstalled -Id $Id) {
    Write-Host "$Label already installed."
    return
  }

  Install-WingetPackage -Id $Id -Label $Label
}

function Upgrade-WingetPackage {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Id,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  Log "Upgrading $Label"
  $baseArgs = @(
    "upgrade", "--id", $Id, "-e", "--source", "winget",
    "--silent", "--accept-package-agreements", "--accept-source-agreements"
  )
  $wingetArgs = Get-WingetArgsWithOptionalDisableInteractivity -BaseArgs $baseArgs -Command "upgrade"

  & winget @wingetArgs
  if ($LASTEXITCODE -ne 0) {
    Fail "Failed to upgrade $Label."
  }
}

try {
  Log "Checking Windows"
  if ($env:OS -notlike "*Windows*") {
    Fail "This setup script is for Windows only."
  }

  $ProjectDir = if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
  $SetupPostScript = Join-Path $ProjectDir "scripts\setup-post.mjs"
  $LogFile = Join-Path $ProjectDir "setup.log"

  $parsedArgs = Parse-SetupArgs -InputArgs $args
  $NetworkCheckMode = $parsedArgs.Mode
  $ForwardArgs = @($parsedArgs.Forward)

  Initialize-Logging -Path $LogFile
  Run-NetworkCheck -Mode $NetworkCheckMode

  Log "Checking winget"
  if (-not (Command-Exists "winget")) {
    Fail "winget is missing. Install 'App Installer' from the Microsoft Store, restart PowerShell, then re-run .\setup.ps1.`nSee: https://learn.microsoft.com/en-us/windows/package-manager/winget/#install-winget"
  }

  $requiredNodeMajor = Get-RequiredNodeMajor -ProjectDir $ProjectDir

  if (-not (Command-Exists "git")) {
    Install-WingetPackageIfMissing -Id "Git.Git" -Label "Git"
    Refresh-Path
  } else {
    Log "Git already available"
  }

  if (-not (Command-Exists "node")) {
    Install-WingetPackageIfMissing -Id "OpenJS.NodeJS.LTS" -Label "Node.js LTS"
  }

  Refresh-Path

  if (-not (Command-Exists "node")) {
    Fail "Node.js was installed, but is not visible in this shell. Open a new PowerShell window and re-run .\setup.ps1."
  }

  $currentNodeMajor = Get-NodeMajor
  if ($currentNodeMajor -lt $requiredNodeMajor) {
    if (Test-WingetPackageInstalled -Id "OpenJS.NodeJS.LTS") {
      Upgrade-WingetPackage -Id "OpenJS.NodeJS.LTS" -Label "Node.js LTS"
    } else {
      Install-WingetPackage -Id "OpenJS.NodeJS.LTS" -Label "Node.js LTS"
    }

    Refresh-Path
    $currentNodeMajor = Get-NodeMajor
    if ($currentNodeMajor -lt $requiredNodeMajor) {
      Fail "Node.js $requiredNodeMajor+ is required. Found major version $currentNodeMajor. Install Node $requiredNodeMajor+ manually from https://nodejs.org."
    }
  }

  if (-not (Test-Path $SetupPostScript)) {
    Fail "Missing scripts\setup-post.mjs."
  }

  Set-Location $ProjectDir
  Log "Running shared post-setup checks"
  & node $SetupPostScript @ForwardArgs
  if ($LASTEXITCODE -ne 0) {
    Fail "Shared post-setup checks failed with exit code $LASTEXITCODE."
  }
} catch {
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
} finally {
  if ($script:TranscriptStarted) {
    try {
      Stop-Transcript | Out-Null
    } catch {
      # Ignore transcript shutdown errors
    }
  }
}
