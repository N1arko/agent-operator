# Worker guide

[Русская версия](WORKER.ru.md)

Each worker belongs to one OS user and one coordinator trust domain. It keeps
project paths, Codex state access, and the device credential on its own host.
The coordinator receives path-free project descriptors and task messages.

## Prerequisites

- a supported macOS or Windows version;
- Node.js 24 available to the user session and background service;
- Codex CLI/Desktop installed and `codex --version` working;
- an exact worker package and matching `SHA256SUMS`;
- a fresh one-time enrollment code;
- at least one existing local project directory.

## macOS lifecycle

From the extracted macOS package:

```sh
read -r AOP_ENROLLMENT_CODE
./bin/macos/install.sh \
  --coordinator-url https://operator.example.com \
  --enrollment-code "$AOP_ENROLLMENT_CODE" \
  --project "$HOME/Projects/example"
./bin/macos/doctor.sh
node ./bin/workerctl.mjs status
```

Repeat `--project PATH` for several projects, or pass
`--projects-file FILE`. The default install root is
`~/Library/Application Support/Agent Operator`. The service is LaunchAgent
`org.agent-operator.worker`.

Update from a newly downloaded and verified package:

```sh
./bin/macos/update.sh
./bin/macos/doctor.sh
```

Rollback uses the previously retained version:

```sh
./bin/macos/rollback.sh
./bin/macos/doctor.sh
```

Removal is explicitly scoped:

```sh
./bin/macos/uninstall.sh --scope integration
./bin/macos/uninstall.sh --scope all
./bin/macos/uninstall.sh --scope all --delete-config --delete-state
```

The first form removes Codex MCP/skill integration. `--scope all` also removes
the service and installed runtimes while preserving configuration and state by
default. The last form removes all worker-owned local data.

## Windows lifecycle

From the extracted Windows package:

```powershell
$EnrollmentCode = Read-Host "Enrollment code"
.\bin\windows\install-worker.ps1 `
  -CoordinatorUrl "https://operator.example.com" `
  -EnrollmentCode $EnrollmentCode `
  -Project "$HOME\Projects\example"
.\bin\windows\diagnose.ps1
node .\bin\workerctl.mjs status
```

Pass several values to `-Project` for several projects. The default install
root is `%LOCALAPPDATA%\Agent Operator`. The service is the current-user
Scheduled Task `Agent Operator Worker`.

Update, rollback, and remove:

```powershell
.\bin\windows\update-worker.ps1
.\bin\windows\diagnose.ps1
.\bin\windows\rollback-worker.ps1
.\bin\windows\diagnose.ps1
.\bin\windows\uninstall-worker.ps1 -Scope integration
.\bin\windows\uninstall-worker.ps1 -Scope all
.\bin\windows\uninstall-worker.ps1 -Scope all -DeleteConfig -DeleteState
```

## Codex integration

The installer:

1. stores the device token in the Codex user environment file;
2. adds the `agent-operator` MCP endpoint with bearer-token indirection;
3. installs the bundled `coordinate-agents` skill;
4. saves a receipt for scoped removal and restoration of a previous skill;
5. runs worker doctor before service cutover.

Restart Codex after integration changes. Existing third-party MCP entries and
skills remain untouched. If an unmanaged `agent-operator` MCP entry already
exists, remove or rename it explicitly before installation.

## Projects and privacy

Project config is stored locally. Heartbeats publish project ID, display name,
tags, and availability. Absolute paths stay on the worker. Use stable unique
project IDs when providing a JSON projects file.

## Revocation and re-enrollment

Run `./aopctl.sh device revoke AGENT_ID` on the coordinator host. The worker
will receive an authentication error on its next request boundary. Remove the
old worker installation or enroll it under an explicitly chosen new identity.
Agent IDs are not silently reused.
