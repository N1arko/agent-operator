# Worker

[English version](WORKER.md)

Каждый worker принадлежит одному OS user и одному coordinator trust domain. Он
хранит project paths, доступ к Codex state и device credential на своём host.
Coordinator получает описания проектов без путей и task messages.

## Требования

- поддерживаемая версия macOS или Windows;
- Node.js 24, доступный пользовательской сессии и background service;
- установленный Codex CLI/Desktop и рабочий `codex --version`;
- точный worker package и соответствующий `SHA256SUMS`;
- свежий одноразовый enrollment code;
- хотя бы один существующий локальный project directory.

## Lifecycle на macOS

В распакованном macOS package:

```sh
read -r AOP_ENROLLMENT_CODE
./bin/macos/install.sh \
  --coordinator-url https://operator.example.com \
  --enrollment-code "$AOP_ENROLLMENT_CODE" \
  --project "$HOME/Projects/example"
./bin/macos/doctor.sh
node ./bin/workerctl.mjs status
```

Повторите `--project PATH` для нескольких проектов либо передайте
`--projects-file FILE`. Default install root —
`~/Library/Application Support/Agent Operator`. Service — LaunchAgent
`org.agent-operator.worker`.

Update из нового скачанного и проверенного package:

```sh
./bin/macos/update.sh
./bin/macos/doctor.sh
```

Rollback использует сохранённую предыдущую версию:

```sh
./bin/macos/rollback.sh
./bin/macos/doctor.sh
```

Uninstall имеет явный scope:

```sh
./bin/macos/uninstall.sh --scope integration
./bin/macos/uninstall.sh --scope all
./bin/macos/uninstall.sh --scope all --delete-config --delete-state
```

Первая команда удаляет Codex MCP/skill integration. `--scope all` также удаляет
service и установленные runtimes, сохраняя config и state. Последняя команда
удаляет все локальные данные, принадлежащие worker.

## Lifecycle на Windows

В распакованном Windows package:

```powershell
$EnrollmentCode = Read-Host "Enrollment code"
.\bin\windows\install-worker.ps1 `
  -CoordinatorUrl "https://operator.example.com" `
  -EnrollmentCode $EnrollmentCode `
  -Project "$HOME\Projects\example"
.\bin\windows\diagnose.ps1
node .\bin\workerctl.mjs status
```

Передайте несколько значений `-Project` для нескольких проектов. Default
install root — `%LOCALAPPDATA%\Agent Operator`. Service — Scheduled Task
текущего пользователя `Agent Operator Worker`.

Update, rollback и uninstall:

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

Installer:

1. сохраняет device token в пользовательском environment file Codex;
2. добавляет MCP endpoint `agent-operator` с bearer-token indirection;
3. устанавливает bundled skill `coordinate-agents`;
4. сохраняет receipt для scoped removal и восстановления прежнего skill;
5. запускает worker doctor до переключения service.

После изменений integration перезапустите Codex. Сторонние MCP entries и skills
сохраняются. Если unmanaged MCP entry `agent-operator` уже существует, явно
удалите или переименуйте его до установки.

## Проекты и приватность

Project config хранится локально. Heartbeat публикует project ID, display name,
tags и availability. Абсолютные пути остаются на worker. В JSON projects file
используйте стабильные уникальные project IDs.

## Revoke и повторный enrollment

Запустите `./aopctl.sh device revoke AGENT_ID` на coordinator host. Worker
получит authentication error на следующей границе request. Удалите прежнюю
установку либо подключите host с явно выбранной новой identity. Agent IDs не
переиспользуются автоматически.
