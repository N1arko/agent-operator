param(
  [Parameter(Mandatory = $true)][string]$CoordinatorUrl,
  [Parameter(Mandatory = $true)][string]$EnrollmentCode,
  [Parameter(Mandatory = $true)][string[]]$Project,
  [string]$InstallRoot,
  [string]$CodexBin,
  [string[]]$CodexArg,
  [string]$CodexHome,
  [switch]$NoService,
  [switch]$NoIntegration
)

# @spec spec://modules/distribution/INFRA-004-open-source-release#worker-lifecycle
$arguments = @(
  "--coordinator-url", $CoordinatorUrl,
  "--enrollment-code", $EnrollmentCode
)
foreach ($path in $Project) { $arguments += @("--project", $path) }
if ($InstallRoot) { $arguments += @("--install-root", $InstallRoot) }
if ($CodexBin) { $arguments += @("--codex-bin", $CodexBin) }
foreach ($value in $CodexArg) { $arguments += @("--codex-arg", $value) }
if ($CodexHome) { $arguments += @("--codex-home", $CodexHome) }
if ($NoService) { $arguments += "--no-service" }
if ($NoIntegration) { $arguments += "--no-integration" }
& (Join-Path $PSScriptRoot "invoke-workerctl.ps1") install @arguments
