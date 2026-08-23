param([string]$InstallRoot, [switch]$NoService)

# @spec spec://modules/worker/INFRA-003-release-and-recovery#recovery
$arguments = @()
if ($InstallRoot) { $arguments += @("--install-root", $InstallRoot) }
if ($NoService) { $arguments += "--no-service" }
& (Join-Path $PSScriptRoot "invoke-workerctl.ps1") rollback @arguments
