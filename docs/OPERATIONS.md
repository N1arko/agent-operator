# Эксплуатация Agent Operator

## Компоненты

- coordinator и Caddy: SSH-host `clawvpn`, каталог
  `/opt/agent-operator/deploy`;
- Mac-worker: LaunchAgent `ru.agent-operator.worker`;
- Windows-worker: Scheduled Task `Agent Operator Worker`;
- production endpoint:
  `https://agent-operator.188-241-197-83.sslip.io`.

## Быстрая проверка

Coordinator:

```sh
curl -fsS https://agent-operator.188-241-197-83.sslip.io/health
ssh clawvpn 'cd /opt/agent-operator/deploy && docker compose ps'
ssh clawvpn 'cd /opt/agent-operator/deploy && docker compose logs --tail=100 coordinator'
```

Mac-worker:

```sh
launchctl print "gui/$(id -u)/ru.agent-operator.worker"
tail -n 100 data/mac-worker.error.log
```

Windows-worker:

```powershell
Get-ScheduledTask -TaskName "Agent Operator Worker"
Get-ScheduledTaskInfo -TaskName "Agent Operator Worker"
& "$env:LOCALAPPDATA\AgentOperator\0.1.23\diagnose.ps1"
```

Через MCP проверить `agents_list`, затем `agent_status` для `mac` и `windows`.
Heartbeat старше 45 секунд переводит worker в `offline`.

## Перезапуск

Coordinator:

```sh
ssh clawvpn 'cd /opt/agent-operator/deploy && docker compose restart coordinator'
```

Mac-worker:

```sh
launchctl kickstart -k "gui/$(id -u)/ru.agent-operator.worker"
```

Windows-worker:

```powershell
Stop-ScheduledTask -TaskName "Agent Operator Worker"
Start-ScheduledTask -TaskName "Agent Operator Worker"
```

После перезапуска проверить два последовательных heartbeat и состояние
локальной очереди. Durable state worker расположен вне каталога версии.

## Очередь, lease и отмена

Coordinator допускает три незавершённых исполняемых запроса на worker.
Стандартный lease — два часа. Значение задаётся переменной
`AOP_REQUEST_LEASE_MS`, минимальное значение — 60 секунд.

`agent_cancel(messageId)` отменяет запрос отправителя. Активный Desktop-turn
получает локальную команду остановки. Результаты имеют отдельные статусы:
`completed`, `failed`, `cancelled`.

При заполненном backlog:

1. получить `agent_status`;
2. дождаться текущего результата через `agent_wait`;
3. отменить ненужный запрос по точному ID;
4. проверить автоматическое истечение исторических записей.

## Модели

`agent_models(agentId)` ставит локальный запрос `model/list`. Результат содержит
доступные модели, модель по умолчанию и поддерживаемые reasoning efforts.
Выбранные `model` и `reasoningEffort` передаются в `agent_start`,
`agent_send` или `agent_thread_send`.

## Резервное копирование

Systemd timer `agent-operator-backup.timer` ежедневно запускает согласованный
SQLite backup. Копии хранятся семь дней:

```text
/opt/agent-operator/deploy/backups/coordinator-YYYYMMDDTHHMMSSZ.sqlite
```

Проверка:

```sh
ssh clawvpn 'systemctl status agent-operator-backup.timer --no-pager'
ssh clawvpn 'systemctl list-timers agent-operator-backup.timer --no-pager'
ssh clawvpn 'ls -lh /opt/agent-operator/deploy/backups'
```

Ручной snapshot:

```sh
ssh clawvpn 'sudo systemctl start agent-operator-backup.service'
```

Восстановление выполняется в окно остановки coordinator:

```sh
cd /opt/agent-operator/deploy
docker compose stop coordinator
cp data/db/coordinator.sqlite "backups/pre-restore-$(date -u +%Y%m%dT%H%M%SZ).sqlite"
cp backups/coordinator-YYYYMMDDTHHMMSSZ.sqlite data/db/coordinator.sqlite
sqlite3 data/db/coordinator.sqlite 'PRAGMA integrity_check;'
docker compose start coordinator
```

После восстановления проверить `/health`, список агентов и новый heartbeat.

## Обновление

1. Запустить полный локальный набор typecheck, lint и tests.
2. Собрать Windows package и проверить SHA-256.
3. Создать SQLite snapshot.
4. Обновить файлы в `/opt/agent-operator`, пересобрать coordinator и проверить
   `/health`.
5. Перезапустить Mac-worker и дождаться heartbeat новой версии.
6. Обновить action Windows Scheduled Task на новый каталог версии.
7. После добавления или изменения MCP полностью завершить ChatGPT/Codex
   Desktop и открыть приложение снова. Установщик сохраняет переменные MCP в
   `~/.codex/.env`, который Codex читает при старте app-server.
8. Проверить MCP и skill в новом обычном чате Codex на обоих компьютерах.
9. Выполнить двусторонний E2E и проверить пустой backlog.

Предыдущий каталог Windows-worker сохраняется для отката.
