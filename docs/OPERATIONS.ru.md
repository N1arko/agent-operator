# Эксплуатация и восстановление

[English version](OPERATIONS.md)

Команды coordinator выполняются из распакованного каталога `self-hosted`.
Команды worker выполняются из package либо через установленный `workerctl.mjs`.

## Регулярные проверки

```sh
./compose.sh ps
./compose.sh logs --tail=100 coordinator
./aopctl.sh doctor --json
./aopctl.sh device list
curl -fsS https://operator.example.com/health
```

Здоровый worker обновляет heartbeat примерно раз в 10 секунд. Coordinator
считает heartbeat старше 45 секунд offline. После изменений Codex, сети,
проектов или integration запускайте локальный worker doctor.

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

После restart проверьте два heartbeat и один read-only agent status request.
Durable pending messages и worker state находятся вне versioned runtime.

## Queue, lease и cancellation

Один worker исполняет один active turn и принимает до трёх outstanding
executable requests. Default request lease равен двум часам и задаётся через
`AOP_REQUEST_LEASE_MS`; минимальное значение — 60 секунд.

Передавайте точный request message ID в `agent_cancel`. `completed`, `failed` и
`cancelled` являются разными terminal outcomes. При заполненной очереди
проверьте agent status, дождитесь текущего request или отмените точный
неактуальный request.

## Backup и restore

Создайте согласованный backup:

```sh
./backup.sh
```

Команда записывает manifest, SQLite snapshot и копию credential key в
`data/backups/`. Копируйте полный set в storage с тем же уровнем защиты, что и
coordinator database. Запускайте `backup.sh` через host scheduler и задайте
собственную retention policy.

Restore выполняется в operator-controlled maintenance window:

```sh
./restore.sh BACKUP_MANIFEST.json --confirm
```

Script останавливает coordinator, проверяет manifest checksums и SQLite
integrity, создаёт pre-restore backup, восстанавливает set, запускает
coordinator и выполняет offline doctor. Затем проверьте public health, device
list, свежий heartbeat и контрольную задачу.

Database и `credential.key` принадлежат одному backup set. Храните их вместе.

## Update coordinator

1. Прочитайте release notes и изменения compatibility.
2. Скачайте и проверьте новый self-hosted bundle и `SHA256SUMS`.
3. Выполните `./backup.sh` в текущем deployment.
4. Скопируйте новые Compose/operator files в staging directory и сохраните пути
   текущих `.env` и `data/`.
5. Задайте `AOP_IMAGE` как новый exact tag или digest.
6. Проверьте и запустите:

```sh
./compose.sh config --quiet
./compose.sh pull coordinator
./compose.sh up -d coordinator
./aopctl.sh doctor --json
```

7. Проверьте health, оба worker и контрольную задачу до удаления staging или
   прежних bundle files.

## Rollback coordinator

Укажите в `AOP_IMAGE` прежний зафиксированный exact tag или digest:

```sh
./compose.sh pull coordinator
./compose.sh up -d coordinator
./aopctl.sh doctor --json
```

Используйте `restore.sh` с pre-update backup, когда release notes требуют
database rollback или integrity check завершился ошибкой. Сохраните failed data
directory для diagnosis.

## Update и rollback worker

Скачайте и проверьте новый platform package. Запустите update из него, затем
doctor и контрольную задачу.

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

Update сохраняет config и durable state. Rollback переключает worker на один
сохранённый previous runtime.

## Revoke и удаление

Отзовите потерянное или выведенное из эксплуатации устройство на coordinator
host:

```sh
./aopctl.sh device revoke AGENT_ID
./aopctl.sh device list
```

Scoped uninstall worker описан в [инструкции worker](getting-started/WORKER.ru.md).
Остановка deployment с сохранением данных:

```sh
./compose.sh down
```

До удаления `data/` или host сохраните проверенный backup.

## Incident checklist

1. Сохраните exact version, image digest, package checksum, время и affected
   request IDs.
2. Выполните revoke подозрительного device credential.
3. Ограничьте network access при возможной компрометации coordinator.
4. Создайте backup до repair, если state остаётся доверенным.
5. Исключите prompts, results, tokens, project paths и file contents из общих
   issue logs.
6. Для security impact используйте [private vulnerability reporting](../SECURITY.ru.md).
