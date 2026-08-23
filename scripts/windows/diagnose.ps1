param([string]$InstallRoot)

$arguments = @()
if ($InstallRoot) { $arguments += @("--install-root", $InstallRoot) }
& (Join-Path $PSScriptRoot "invoke-workerctl.ps1") doctor @arguments
