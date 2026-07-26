$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "load-env.ps1")
Push-Location $PSScriptRoot
try {
  node dist/src/worker/main.js diagnose
} finally {
  Pop-Location
}
