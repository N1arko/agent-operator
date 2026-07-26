param(
  [Parameter(Mandatory = $true)][string]$CoordinatorUrl,
  [Parameter(Mandatory = $true)][string]$AgentId,
  [Parameter(Mandatory = $true)][string]$AgentName,
  [Parameter(Mandatory = $true)][string]$DeviceToken,
  [Parameter(Mandatory = $true)][string]$ProjectsFile
)

$ErrorActionPreference = "Stop"
$nodeVersion = (& node --version 2>$null)
if (-not $nodeVersion) {
  throw "Node.js 24 or newer is required."
}
$nodeMajor = [int]($nodeVersion.TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 24) {
  throw "Node.js 24 or newer is required. Found $nodeVersion."
}
& codex --version | Out-Null

Push-Location $PSScriptRoot
try {
  npm install --omit=dev --ignore-scripts
  $envPath = Join-Path $PSScriptRoot "worker.env"
  @(
    "AOP_COORDINATOR_URL=$CoordinatorUrl"
    "AOP_AGENT_ID=$AgentId"
    "AOP_AGENT_NAME=$AgentName"
    "AOP_DEVICE_TOKEN=$DeviceToken"
    "AOP_PROJECTS_FILE=$ProjectsFile"
    "AOP_STATE_FILE=$(Join-Path $PSScriptRoot 'data\worker-state.json')"
    "AOP_CODEX_BIN=codex"
  ) | Set-Content -Path $envPath -Encoding UTF8
  Write-Host "Worker installed. Configuration: $envPath"
  & (Join-Path $PSScriptRoot "diagnose.ps1")
} finally {
  Pop-Location
}
