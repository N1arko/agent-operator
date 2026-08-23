param(
  [Parameter(Mandatory = $true)][ValidateSet("integration", "runtime", "all")][string]$Scope,
  [string]$InstallRoot,
  [switch]$DeleteConfig,
  [switch]$DeleteState
)

# @spec spec://modules/distribution/INFRA-004-open-source-release#worker-lifecycle
$arguments = @("--scope", $Scope)
if ($InstallRoot) { $arguments += @("--install-root", $InstallRoot) }
if ($DeleteConfig) { $arguments += "--delete-config" }
if ($DeleteState) { $arguments += "--delete-state" }
& (Join-Path $PSScriptRoot "invoke-workerctl.ps1") uninstall @arguments
