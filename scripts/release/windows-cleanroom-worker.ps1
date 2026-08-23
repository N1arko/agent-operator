[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$PackageZip,
  [Parameter(Mandatory = $true)][string]$ExpectedSha256,
  [Parameter(Mandatory = $true)][string]$CoordinatorUrl,
  [Parameter(Mandatory = $true)][string]$EnrollmentCode,
  [Parameter(Mandatory = $true)][string]$Root,
  [string]$CodexBin
)

# @spec spec://modules/distribution/INFRA-004-open-source-release#environments.clean-room
$ErrorActionPreference = "Stop"

function Write-Utf8NoBom {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Value
  )

  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Value, $encoding)
}

$PackageZip = [System.IO.Path]::GetFullPath($PackageZip)
$Root = [System.IO.Path]::GetFullPath($Root)
if (Test-Path -LiteralPath $Root) { throw "Clean-room root already exists: $Root" }
$actualSha = (Get-FileHash -LiteralPath $PackageZip -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualSha -ne $ExpectedSha256.ToLowerInvariant()) { throw "Worker package checksum mismatch" }

$packageRoot = Join-Path $Root "package"
$installRoot = Join-Path $Root "worker"
$projectRoot = Join-Path $Root "fixture-project"
$logsRoot = Join-Path $Root "logs"
New-Item -ItemType Directory -Path $packageRoot, $projectRoot, $logsRoot -Force | Out-Null
Expand-Archive -LiteralPath $PackageZip -DestinationPath $packageRoot
Write-Utf8NoBom -Path (Join-Path $projectRoot "README.md") -Value "WINDOWS-CEDAR-731"

$manifest = Get-Content -LiteralPath (Join-Path $packageRoot "manifest.json") -Raw | ConvertFrom-Json
if ($manifest.platform -ne "windows") { throw "Attached package is not a Windows worker" }
if (-not $CodexBin) {
  $CodexBin = (Get-Command codex -CommandType Application -ErrorAction Stop).Source
}
$nodeBin = (Get-Command node -CommandType Application -ErrorAction Stop).Source
$installScript = Join-Path $packageRoot "bin\windows\install-worker.ps1"
$doctorScript = Join-Path $packageRoot "bin\windows\diagnose.ps1"

& $installScript `
  -CoordinatorUrl $CoordinatorUrl `
  -EnrollmentCode $EnrollmentCode `
  -Project $projectRoot `
  -InstallRoot $installRoot `
  -CodexBin $CodexBin `
  -NoIntegration `
  -NoService
if ($LASTEXITCODE -ne 0) { throw "Worker installation failed with exit code $LASTEXITCODE" }

$doctorText = & $doctorScript -InstallRoot $installRoot | Out-String
if ($LASTEXITCODE -ne 0) { throw "Worker doctor failed with exit code $LASTEXITCODE" }
$doctor = $doctorText | ConvertFrom-Json
$workerctl = Join-Path $installRoot "bin\workerctl.mjs"
$stdout = Join-Path $logsRoot "worker.log"
$stderr = Join-Path $logsRoot "worker.error.log"
$workerArguments = @("`"$workerctl`"", "run", "--install-root", "`"$installRoot`"")
$worker = Start-Process -FilePath $nodeBin -ArgumentList $workerArguments -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
Start-Sleep -Seconds 5
if ($worker.HasExited) { throw "Clean-room worker exited during startup; inspect $stderr" }

$receipt = [ordered]@{
  schemaVersion = 1
  status = "passed"
  verifiedAt = [DateTime]::UtcNow.ToString("o")
  artifact = [ordered]@{
    name = [System.IO.Path]::GetFileName($PackageZip)
    sha256 = $actualSha
    version = [string]$manifest.version
    revision = [string]$manifest.revision
  }
  host = [ordered]@{
    platform = "windows"
    architecture = $env:PROCESSOR_ARCHITECTURE
    osBuild = [System.Environment]::OSVersion.Version.ToString()
    node = (& $nodeBin --version | Out-String).Trim()
    codex = (& $CodexBin --version | Out-String).Trim()
  }
  coordinator = [ordered]@{
    status = [int]$doctor.coordinator.status
    version = [string]$doctor.coordinator.version
    revision = [string]$doctor.coordinator.revision
    compatible = [bool]$doctor.coordinator.compatible
    authenticated = [bool]$doctor.coordinator.authenticated
  }
  projectMarker = "WINDOWS-CEDAR-731"
  workerPid = $worker.Id
  integrationChanged = $false
  serviceInstalled = $false
}
$receiptPath = Join-Path $Root "clean-room-worker-receipt.json"
Write-Utf8NoBom -Path $receiptPath -Value ($receipt | ConvertTo-Json -Depth 8)
Write-Output $receiptPath
