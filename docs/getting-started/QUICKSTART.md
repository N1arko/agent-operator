# Quick Start

[Русская версия](QUICKSTART.ru.md)

This guide creates one coordinator and enrolls one macOS worker and one Windows
worker. Replace every `operator.example.com` and project path with your own
value. Use release artifacts only.

## 1. Requirements

- Linux `amd64` or `arm64` host with Docker Engine and Docker Compose v2;
- DNS name pointing to that host and inbound TCP 80/443;
- macOS and Windows user sessions with Node.js 24 and the current official
  `codex` on `PATH` (clean-room acceptance baseline: CLI `0.149.0`);
- shell access to all three hosts.

A private-network deployment can use the profile in the
[coordinator guide](COORDINATOR.md#private-network-profile).

## 2. Download and verify the coordinator bundle

Run on the Linux host:

```sh
VERSION=0.2.0-alpha
BASE_URL="https://github.com/N1arko/agent-operator/releases/download/v${VERSION}"
curl -fLO "${BASE_URL}/agent-operator-self-hosted-${VERSION}.tar.gz"
curl -fLO "${BASE_URL}/SHA256SUMS"
grep "  agent-operator-self-hosted-${VERSION}.tar.gz$" SHA256SUMS | sha256sum --check -
mkdir agent-operator
tar -xzf "agent-operator-self-hosted-${VERSION}.tar.gz" -C agent-operator
cd agent-operator/self-hosted
```

## 3. Start the coordinator

The first bootstrap creates a private `.env` and exits with code 2:

```sh
./bootstrap.sh || test $? -eq 2
```

Edit `.env` and set these values:

```dotenv
AOP_PUBLIC_URL=https://operator.example.com
AOP_ALLOWED_HOSTS=operator.example.com,127.0.0.1,localhost
AOP_TLS=true
AOP_DOMAIN=operator.example.com
```

Start the services and verify health:

```sh
./bootstrap.sh
./compose.sh ps
curl -fsS https://operator.example.com/health
./aopctl.sh doctor --json
```

## 4. Enroll the macOS worker

Create a one-time code on the coordinator host:

```sh
./aopctl.sh device create --id dev-mac --name "Development Mac"
```

Copy the displayed `Code` to the macOS host. It expires after 10 minutes and
can be consumed once. Download the worker package on macOS:

```sh
VERSION=0.2.0-alpha
BASE_URL="https://github.com/N1arko/agent-operator/releases/download/v${VERSION}"
curl -fLO "${BASE_URL}/agent-operator-worker-macos-${VERSION}.tar.gz"
curl -fLO "${BASE_URL}/SHA256SUMS"
grep "  agent-operator-worker-macos-${VERSION}.tar.gz$" SHA256SUMS | shasum -a 256 --check
mkdir agent-operator-worker
tar -xzf "agent-operator-worker-macos-${VERSION}.tar.gz" -C agent-operator-worker
cd agent-operator-worker
read -r AOP_ENROLLMENT_CODE
./bin/macos/install.sh \
  --coordinator-url https://operator.example.com \
  --enrollment-code "$AOP_ENROLLMENT_CODE" \
  --project "$HOME/Projects/example"
./bin/macos/doctor.sh
```

The installer verifies the package manifest, consumes the code, stores the
device credential with user-only permissions, configures the `agent-operator`
MCP server and `coordinate-agents` skill, runs doctor, and starts a LaunchAgent.
Restart Codex after the first integration install.

## 5. Enroll the Windows worker

Create another one-time code:

```sh
./aopctl.sh device create --id dev-windows --name "Development Windows PC"
```

In PowerShell on Windows:

```powershell
$Version = "0.2.0-alpha"
$BaseUrl = "https://github.com/N1arko/agent-operator/releases/download/v$Version"
$Asset = "agent-operator-worker-windows-$Version.zip"
Invoke-WebRequest "$BaseUrl/$Asset" -OutFile $Asset
Invoke-WebRequest "$BaseUrl/SHA256SUMS" -OutFile "SHA256SUMS"
$Line = Get-Content "SHA256SUMS" | Where-Object { $_ -match "  $([regex]::Escape($Asset))$" }
$Expected = ($Line -split "\s+")[0].ToLowerInvariant()
$Actual = (Get-FileHash -Algorithm SHA256 $Asset).Hash.ToLowerInvariant()
if ($Actual -ne $Expected) { throw "Checksum mismatch for $Asset" }
Expand-Archive $Asset -DestinationPath "agent-operator-worker"
Set-Location "agent-operator-worker"
$EnrollmentCode = Read-Host "Enrollment code"
.\bin\windows\install-worker.ps1 `
  -CoordinatorUrl "https://operator.example.com" `
  -EnrollmentCode $EnrollmentCode `
  -Project "$HOME\Projects\example"
.\bin\windows\diagnose.ps1
```

The installer creates a current-user Scheduled Task and the same Codex MCP and
skill integration. Restart Codex after installation.

## 6. Send the first task

Open a new Codex chat on either enrolled computer and ask:

```text
Show my connected agents and their available projects. On the other computer,
open the example project, inspect its README, and return a two-sentence summary.
```

The bundled skill resolves the agent, reads `agent_projects`, calls
`agent_start`, waits through `agent_wait`, and returns the final result. The
remote Codex task remains visible on its host.

Verify both devices from the coordinator host:

```sh
./aopctl.sh device list
```

## 7. Next steps

- [Operations and backup](../OPERATIONS.md)
- [Worker update, rollback, and uninstall](WORKER.md)
- [Security and privacy model](../security/SECURITY-MODEL.md)
- [Troubleshooting](../operations/TROUBLESHOOTING.md)
