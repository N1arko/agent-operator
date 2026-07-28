param(
  [string]$CodexBin = "codex",
  [string]$CodexHome = (Join-Path $HOME ".codex")
)

$ErrorActionPreference = "Stop"
$envPath = Join-Path $PSScriptRoot "worker.env"
if (-not (Test-Path $envPath)) {
  throw "Worker configuration was not found: $envPath"
}

$settings = @{}
foreach ($line in Get-Content -Path $envPath) {
  $separator = $line.IndexOf("=")
  if ($separator -le 0) {
    continue
  }
  $settings[$line.Substring(0, $separator)] = $line.Substring($separator + 1)
}
if (-not $settings.ContainsKey("AOP_DEVICE_TOKEN")) {
  throw "Worker configuration is incomplete."
}

$env:AOP_DEVICE_TOKEN = $settings["AOP_DEVICE_TOKEN"]
[Environment]::SetEnvironmentVariable(
  "AOP_DEVICE_TOKEN",
  $env:AOP_DEVICE_TOKEN,
  "User"
)
$codexEnvPath = Join-Path $CodexHome ".env"
New-Item -ItemType Directory -Path $CodexHome -Force | Out-Null
$codexEnvLines = if (Test-Path $codexEnvPath) {
  @(Get-Content -Path $codexEnvPath)
} else {
  @()
}
$updatedCodexEnvLines = [System.Collections.Generic.List[string]]::new()
$wroteDeviceToken = $false
foreach ($line in $codexEnvLines) {
  if ($line -match "^\s*(?:export\s+)?AOP_DEVICE_TOKEN=") {
    if (-not $wroteDeviceToken) {
      $updatedCodexEnvLines.Add(
        "AOP_DEVICE_TOKEN=$($env:AOP_DEVICE_TOKEN)"
      )
      $wroteDeviceToken = $true
    }
    continue
  }
  $updatedCodexEnvLines.Add($line)
}
if (-not $wroteDeviceToken) {
  $updatedCodexEnvLines.Add(
    "AOP_DEVICE_TOKEN=$($env:AOP_DEVICE_TOKEN)"
  )
}
[System.IO.File]::WriteAllLines(
  $codexEnvPath,
  $updatedCodexEnvLines,
  [System.Text.UTF8Encoding]::new($false)
)

& $CodexBin mcp get agent-operator *> $null
if ($LASTEXITCODE -eq 0) {
  & $CodexBin mcp remove agent-operator | Out-Null
}
& $CodexBin mcp add agent-operator `
  --url "https://agent-operator.188-241-197-83.sslip.io/mcp" `
  --bearer-token-env-var AOP_DEVICE_TOKEN | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Unable to configure Agent Operator MCP."
}

$skillSource = Join-Path $PSScriptRoot "integration\coordinate-agents"
$skillTarget = Join-Path $CodexHome "skills\coordinate-agents"
New-Item -ItemType Directory -Path $skillTarget -Force | Out-Null
Copy-Item -Path (Join-Path $skillSource "*") `
  -Destination $skillTarget -Recurse -Force

Write-Host "Agent Operator MCP and coordinate-agents skill configured for Codex."
Write-Host "In Codex Desktop, open Settings > MCP servers and restart the local app-server."
