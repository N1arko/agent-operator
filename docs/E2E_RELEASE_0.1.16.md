# Release E2E 0.1.16

Дата: 2026-07-28

## Deployment

- coordinator health: `0.1.16`;
- Mac-worker: `idle / 0.1.16`;
- Windows-worker: `idle / 0.1.16`;
- onboarding package SHA-256:
  `d4f7220b82a770f92a94281688357f6ea54f36428d25a422e251202128b5a75d`;
- server package совпадает с локальным release;
- backlog после миграции пуст.

## Lease и отмена

Live request:

```text
c6cd4824-a3b6-4555-8bd8-e685c936f992
```

Windows получил `gpt-5.4-mini` и reasoning `high`, перешёл в `busy` и начал
Desktop-owned turn с безопасным ожиданием 120 секунд. `agent_cancel` вернул
`cancelled`; worker остановил turn и вернулся в `idle` до окончания ожидания.

## Модели

`agent_models(agentId: "windows")` вернул семь моделей:

```text
gpt-5.6-sol
gpt-5.6-terra
gpt-5.6-luna
gpt-5.5
gpt-5.4
gpt-5.4-mini
gpt-5.3-codex-spark
```

Ответ содержал локальные default и supported reasoning efforts.

## Backup

- `agent-operator-backup.timer`: `active`;
- следующий запуск назначен systemd;
- ручной service run завершился успешно;
- создан snapshot
  `coordinator-20260728T040443Z.sqlite`;
- `PRAGMA integrity_check`: `ok`.

## Пользовательская интеграция

- Mac: MCP `agent-operator` и skill `coordinate-agents` установлены;
- Windows: MCP и skill установлены вместе с worker `0.1.16`;
- новые turns до активации распознали skill и сообщили, что MCP
  требует перечитать конфигурацию;
- Codex app-server поддерживает `config/mcpServer/reload`; в установленной
  версии Desktop отдельный элемент управления MCP не отображается, поэтому
  проверенный пользовательский путь активации — полный перезапуск приложения;
- свежий Mac app-server обнаружил MCP `agent-operator` версии `0.1.16` со всеми
  десятью инструментами и skill `coordinate-agents` в состоянии `enabled`;
- первый restart действующего Desktop подтвердил, что переменная, добавленная
  через `launchctl` после запуска приложения, не наследуется дочерним
  app-server; отдельный E2E подтвердил загрузку из `~/.codex/.env` без
  наследования окружения основного процесса;
- после перезапуска Mac обычный projectless-чат
  `019fa851-9f5d-7290-93db-6c5c51090e82` самостоятельно нашёл Windows через
  MCP, создал ровно одну задачу
  `019fa851-e8ea-7ab1-a5e9-690d31cea6c2` и получил
  `WINDOWS_ORDINARY_MCP_OK_016` со статусом `completed`;
- после перезапуска Windows обычный чат
  `019f9ff2-42a3-7c43-92e9-ab1b9794e043` самостоятельно нашёл Mac через MCP,
  создал ровно одну задачу
  `019fa858-eb2d-7c93-8a8d-a1d1cd9005c3` и получил
  `MAC_ORDINARY_MCP_OK_016` со статусом `completed`;
- coordinator хранит по одному связанному result на каждый контрольный start,
  незавершённых исполняемых запросов нет;
- Mac-worker и Windows-worker вернулись в `idle` со свежими heartbeat;
- опубликованный onboarding package повторно скачан на Windows, совпал с
  `d4f7220b82a770f92a94281688357f6ea54f36428d25a422e251202128b5a75d`,
  а его integration installer успешно выполнил идемпотентную повторную
  установку; процессы worker и Desktop, Scheduled Task и проекты сохранились.

Двусторонний E2E из обычных чатов завершён.

## Нагрузка

Idle-снимок:

```text
coordinator: 52.39 MiB, 0.69% CPU
caddy:       29.76 MiB, 0.00% CPU
Mac worker:  76.2 MiB RSS, 0.0% CPU
SQLite data: 4.0 MiB
backups:     1.4 MiB
```
