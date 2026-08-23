# Пакет Agent Operator worker

[English version](README.md)

Archive устанавливает один versioned worker для одного пользователя macOS или
Windows. Нужны Node.js 24+, Codex, доступный coordinator URL, fresh одноразовый
enrollment code и хотя бы один существующий project path.

До распаковки проверьте archive по `SHA256SUMS` из того же GitHub Release.

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

Update сохраняет config и durable state. Rollback выбирает retained previous
runtime. Uninstall требует scope `integration`, `runtime` или `all`; config и
state сохраняются без явных delete flags.

Installer настраивает local MCP server `agent-operator` и bundled skill
`coordinate-agents`. После изменений integration перезапустите Codex.

Полная инструкция: <https://github.com/N1arko/agent-operator/blob/main/docs/getting-started/WORKER.ru.md>.
