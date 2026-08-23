param(
  [Parameter(Mandatory = $true)][string]$Command,
  [Parameter(ValueFromRemainingArguments = $true)][string[]]$LifecycleArgs
)

$ErrorActionPreference = "Stop"
$packageRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
& node (Join-Path $packageRoot "bin\workerctl.mjs") `
  $Command --package-root $packageRoot @LifecycleArgs
if ($LASTEXITCODE -ne 0) {
  throw "Agent Operator workerctl exited $LASTEXITCODE."
}
