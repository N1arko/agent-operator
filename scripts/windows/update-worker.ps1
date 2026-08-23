param(
  [string]$InstallRoot,
  [string]$CodexHome,
  [switch]$NoService,
  [switch]$NoIntegration
)

# @spec spec://modules/worker/INFRA-003-release-and-recovery#recovery
$arguments = @()
if ($InstallRoot) { $arguments += @("--install-root", $InstallRoot) }
if ($CodexHome) { $arguments += @("--codex-home", $CodexHome) }
if ($NoService) { $arguments += "--no-service" }
if ($NoIntegration) { $arguments += "--no-integration" }
& (Join-Path $PSScriptRoot "invoke-workerctl.ps1") update @arguments
