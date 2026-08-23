# Agent Operator worker package

[Русская версия](README.ru.md)

This archive installs one versioned worker for one macOS or Windows user. It
requires Node.js 24+, Codex, a reachable coordinator URL, a fresh one-time
enrollment code, and at least one existing project path.

Verify this archive against `SHA256SUMS` from the same GitHub Release before
extraction.

## macOS

```sh
read -r AOP_ENROLLMENT_CODE
./bin/macos/install.sh \
  --coordinator-url https://operator.example.com \
  --enrollment-code "$AOP_ENROLLMENT_CODE" \
  --project "$HOME/Projects/example"
./bin/macos/doctor.sh
./bin/macos/update.sh
./bin/macos/rollback.sh
./bin/macos/uninstall.sh --scope all
```

## Windows

```powershell
$EnrollmentCode = Read-Host "Enrollment code"
.\bin\windows\install-worker.ps1 `
  -CoordinatorUrl "https://operator.example.com" `
  -EnrollmentCode $EnrollmentCode `
  -Project "$HOME\Projects\example"
.\bin\windows\diagnose.ps1
.\bin\windows\update-worker.ps1
.\bin\windows\rollback-worker.ps1
.\bin\windows\uninstall-worker.ps1 -Scope all
```

Update retains configuration and durable state. Rollback selects the retained
previous runtime. Uninstall requires scope `integration`, `runtime`, or `all`;
config and state are preserved unless explicit delete flags are supplied.

The installer configures the local `agent-operator` MCP server and bundled
`coordinate-agents` skill. Restart Codex after integration changes.

Full guide: <https://github.com/N1arko/agent-operator/blob/main/docs/getting-started/WORKER.md>.
