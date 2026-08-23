# Архитектура

[English version](ARCHITECTURE.md)

## Форма системы

Agent Operator соединяет независимые установки Codex через один self-hosted
mailbox и presence service.

```text
┌──────────────────────── macOS host ────────────────────────┐
│ Codex Desktop/CLI ← local app-server/IPC → worker          │
│ source tree · project paths · task index · device token    │
└───────────────────────────┬─────────────────────────────────┘
                            │ исходящий HTTPS: heartbeat,
                            │ long poll, messages, files
                    ┌───────▼────────┐
                    │  coordinator   │
                    │ HTTP + MCP     │
                    │ SQLite + files │
                    └───────▲────────┘
                            │ исходящий HTTPS
┌───────────────────────────┴─────────────────────────────────┐
│ Codex Desktop/CLI ← local app-server/IPC → worker          │
│ source tree · project paths · task index · device token    │
└──────────────────────── Windows host ───────────────────────┘
```

## Компоненты

### Coordinator

- публикует authenticated MCP и worker HTTP endpoints;
- хранит device records, safe agent presence, project descriptors без путей,
  mailbox messages, task bindings, progress и terminal results в SQLite;
- атомарно выдаёт queued message одному worker process;
- применяет request lease, idempotency, queue bounds и cancellation;
- хранит temporary files до acknowledgement или TTL;
- предоставляет локальный `aopctl` для enrollment, revoke, doctor, backup и
  restore.

### Worker

- поддерживает heartbeat и long-poll inbox через исходящее соединение;
- преобразует project IDs в локальные paths;
- создаёт или продолжает локальные Codex tasks;
- последовательно исполняет один active turn и durable pending work;
- наблюдает безопасный progress и возвращает один terminal result;
- устанавливает MCP endpoint и skill `coordinate-agents` для локального user;
- сохраняет source, полный список tasks, absolute paths и OpenAI credentials на
  host.

### Codex integration

Codex вызывает coordinator MCP tools для поиска агентов и маршрутизации работы.
Worker использует локальный Codex app-server и Desktop IPC, чтобы задача была
видна на принимающем host. Coordinator не обращается в OpenAI от имени worker.

## Поток задачи

```text
caller Codex
  → agents_list / agent_projects
  → agent_start(idempotencyKey, agentId, projectId, prompt)
  → coordinator durable queue
  → recipient worker claims message
  → local Codex task and turn
  → progress updates
  → terminal completed | failed | cancelled result
  → agent_wait(cursor)
  → caller Codex
```

Follow-up использует `agent_send` с точным prior message ID. Работа в известной
Codex task использует `agent_thread_send`. Один worker запускает один active
turn; coordinator backlog ограничен тремя executable requests.

## Identity и enrollment

Владелец создаёт короткоживущий одноразовый enrollment code через локальный
`aopctl`. Coordinator хранит keyed digest. Успешный consume создаёт отдельный
device credential, возвращает его один раз и хранит только keyed digest и safe
hint. Revoke действует на следующей границе request.

## Файлы

- Committed repository file передаётся как repository, exact commit, relative
  path и SHA-256. Принимающий worker проверяет все четыре значения.
- Local file передаётся как temporary attachment с owner, recipient, filename,
  size, SHA-256, quota и expiry. Worker подтверждает и удаляет его после task
  result.

## Persistence и восстановление

Coordinator state и credential key находятся в bind-mounted data directory.
Worker config и durable state находятся вне versioned runtime directories.
Duplicate worker processes не исполняют одну delivery. Unacknowledged delivery
возвращается в очередь после короткого lease. Update сохраняет один prior
runtime для rollback. Backup manifest связывает checksums SQLite и credential
key.

## Deployment boundary

Поддерживаемый alpha deployment образует один trust domain владельца. Caddy
может завершать public TLS; VPN/private-LAN profile может привязать coordinator
к private address. Hosted multi-tenant isolation требует отдельной будущей
архитектуры.
