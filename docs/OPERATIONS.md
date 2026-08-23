# Operations and recovery

[Русская версия](OPERATIONS.ru.md)

Run coordinator commands from the extracted `self-hosted` directory. Run
worker commands from the extracted package or the installed `workerctl.mjs`.

## Routine checks

```sh
./compose.sh ps
./compose.sh logs --tail=100 coordinator
./aopctl.sh doctor --json
./aopctl.sh device list
curl -fsS https://operator.example.com/health
```

A healthy worker updates heartbeat about every 10 seconds. Coordinator marks a
heartbeat older than 45 seconds offline. Use the local worker doctor after a
Codex, network, project, or integration change.

macOS:

```sh
./bin/macos/doctor.sh
launchctl print "gui/$(id -u)/org.agent-operator.worker"
```

Windows:

```powershell
.\bin\windows\diagnose.ps1
Get-ScheduledTask -TaskName "Agent Operator Worker"
Get-ScheduledTaskInfo -TaskName "Agent Operator Worker"
```

## Restart

Coordinator:

```sh
./compose.sh restart coordinator
./aopctl.sh doctor --json
```

macOS worker:

```sh
launchctl kickstart -k "gui/$(id -u)/org.agent-operator.worker"
```

Windows worker:

```powershell
Stop-ScheduledTask -TaskName "Agent Operator Worker"
Start-ScheduledTask -TaskName "Agent Operator Worker"
```

After restart, confirm two heartbeats and one read-only agent status request.
Durable pending messages and worker state live outside the versioned runtime.

## Queue, lease, and cancellation

One worker executes one active turn and accepts up to three outstanding
executable requests. The default request lease is two hours and can be changed
with `AOP_REQUEST_LEASE_MS`; the minimum is 60 seconds.

Use the exact request message ID with `agent_cancel`. Treat `completed`,
`failed`, and `cancelled` as separate terminal outcomes. If the queue is full,
inspect agent status, wait for the current request, or cancel an obsolete exact
request.

## Backup and restore

Create a consistent backup:

```sh
./backup.sh
```

The command writes a manifest, SQLite snapshot, and credential key copy under
`data/backups/`. Copy the complete set to storage protected at the same level as
the coordinator database. Schedule `backup.sh` with the host scheduler and set
your own retention policy.

Restore during an operator-controlled maintenance window:

```sh
./restore.sh BACKUP_MANIFEST.json --confirm
```

The script stops coordinator, verifies manifest checksums and SQLite integrity,
creates a pre-restore backup, restores the set, starts coordinator, and runs
offline doctor. Then verify public health, device list, fresh heartbeat, and a
control task.

The database and `credential.key` belong to one backup set. Keep them together.

## Coordinator update

1. Read release notes and compatibility changes.
2. Download and verify the new self-hosted bundle and `SHA256SUMS`.
3. Run `./backup.sh` in the current deployment.
4. Copy the new Compose/operator files into a staging directory and preserve
   the current `.env` and `data/` paths.
5. Set `AOP_IMAGE` to the new exact tag or digest.
6. Validate and start:

```sh
./compose.sh config --quiet
./compose.sh pull coordinator
./compose.sh up -d coordinator
./aopctl.sh doctor --json
```

7. Verify health, both workers, and a control task before removing staging or
   prior bundle files.

## Coordinator rollback

Set `AOP_IMAGE` to the previously recorded exact tag or digest and run:

```sh
./compose.sh pull coordinator
./compose.sh up -d coordinator
./aopctl.sh doctor --json
```

Use `restore.sh` with the pre-update backup when the release notes require a
database rollback or integrity checks fail. Preserve the failed data directory
for diagnosis.

## Worker update and rollback

Download and verify the new platform package. Run update from that package,
then doctor and a control task.

macOS:

```sh
./bin/macos/update.sh
./bin/macos/doctor.sh
./bin/macos/rollback.sh
./bin/macos/doctor.sh
```

Windows:

```powershell
.\bin\windows\update-worker.ps1
.\bin\windows\diagnose.ps1
.\bin\windows\rollback-worker.ps1
.\bin\windows\diagnose.ps1
```

Update preserves configuration and durable state. Rollback switches to the one
retained previous runtime.

## Revoke and remove

Revoke a lost or retired device on the coordinator host:

```sh
./aopctl.sh device revoke AGENT_ID
./aopctl.sh device list
```

Use the worker's scoped uninstall commands from the [worker guide](getting-started/WORKER.md).
Stop a deployment while preserving its data:

```sh
./compose.sh down
```

Archive a verified backup before removing the `data/` directory or host.

## Incident checklist

1. Preserve exact version, image digest, package checksum, time, and affected
   request IDs.
2. Revoke a suspected device credential.
3. Restrict network access when coordinator compromise is possible.
4. Create a backup before repair when state remains trustworthy.
5. Keep prompts, results, tokens, project paths, and file contents out of shared
   issue logs.
6. Use [private vulnerability reporting](../SECURITY.md) for security impact.
