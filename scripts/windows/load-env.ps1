$envPath = Join-Path $PSScriptRoot "worker.env"
if (-not (Test-Path $envPath)) {
  throw "Run install-worker.ps1 first."
}
Get-Content $envPath | ForEach-Object {
  if ($_ -match "^\s*([^#][^=]*)=(.*)$") {
    [Environment]::SetEnvironmentVariable(
      $matches[1].Trim(),
      $matches[2],
      "Process"
    )
  }
}
