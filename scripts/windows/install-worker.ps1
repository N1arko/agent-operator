param(
  [Parameter(Mandatory = $true)][string]$CoordinatorUrl,
  [Parameter(Mandatory = $true)][string]$AgentId,
  [Parameter(Mandatory = $true)][string]$AgentName,
  [Parameter(Mandatory = $true)][string]$DeviceToken,
  [Parameter(Mandatory = $true)][string]$ProjectsFile,
  [switch]$UseNpmCodex
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
Push-Location $PSScriptRoot
try {
  if ($UseNpmCodex) {
    npm pkg set "dependencies.@openai/codex=0.145.0"
  }
  npm install --omit=dev --ignore-scripts
  $codexBin = "codex"
  $codexArgsJson = "[]"
  if ($UseNpmCodex) {
    $codexScript = Join-Path $PSScriptRoot "node_modules\@openai\codex\bin\codex.js"
    if (-not (Test-Path $codexScript)) {
      throw "npm Codex entrypoint was not installed: $codexScript"
    }
    $codexBin = (Get-Command node.exe).Source
    $codexArgsJson = ConvertTo-Json -Compress -InputObject @($codexScript)
  } else {
    & codex --version | Out-Null
  }
  $installRoot = Split-Path -Parent $PSScriptRoot
  $stateFile = Join-Path $installRoot "data\worker-state.json"
  if (-not (Test-Path $stateFile)) {
    $previousState = Get-ChildItem -Path $installRoot -Directory |
      ForEach-Object {
        $candidate = Join-Path $_.FullName "data\worker-state.json"
        if (Test-Path $candidate) {
          Get-Item $candidate
        }
      } |
      Sort-Object LastWriteTimeUtc -Descending |
      Select-Object -First 1
    if ($previousState) {
      New-Item -ItemType Directory -Path (Split-Path -Parent $stateFile) -Force |
        Out-Null
      Copy-Item -Path $previousState.FullName -Destination $stateFile
    }
  }
  $envPath = Join-Path $PSScriptRoot "worker.env"
  @(
    "AOP_COORDINATOR_URL=$CoordinatorUrl"
    "AOP_AGENT_ID=$AgentId"
    "AOP_AGENT_NAME=$AgentName"
    "AOP_DEVICE_TOKEN=$DeviceToken"
    "AOP_PROJECTS_FILE=$ProjectsFile"
    "AOP_STATE_FILE=$stateFile"
    "AOP_CODEX_BIN=$codexBin"
    "AOP_CODEX_ARGS_JSON=$codexArgsJson"
  ) | Set-Content -Path $envPath -Encoding UTF8
  Write-Host "Worker installed. Configuration: $envPath"
  & (Join-Path $PSScriptRoot "diagnose.ps1")
} finally {
  Pop-Location
}
