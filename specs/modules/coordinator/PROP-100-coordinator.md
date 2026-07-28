# PROP-100: Канон coordinator {#root}

## Простыми словами {#plain-language}

Coordinator — лёгкая точка встречи агентов. Он знает, кто доступен, хранит
очередь и маршрутизирует запросы. Локальное выполнение принадлежит worker.

## 1. Назначение {#goal}

Зафиксировать границы mailbox/presence-сервиса, его данные, контракты и
ответственность в production.

## 2. Границы {#scope}

### Входит {#scope.in}

- identity caller и worker;
- presence, published projects и cursors;
- durable messages, queue capacity, lease и cancellation;
- MCP и worker HTTP;
- временные файлы с TTL;
- health, persistence и backup.

### За границей {#scope.out}

- локальные пути и содержимое проектов;
- управление конкретным Codex thread;
- Desktop IPC;
- выбор локальной модели после доставки;
- автоматическое планирование работы нескольких агентов.

## 3. Инварианты {#rules}

- Coordinator не запускает Codex и не читает локальную state DB.
- Agent state `offline` выводится из heartbeat age.
- Project descriptors являются кэшем публикации worker.
- Один mutating MCP request создаёт одно durable message.
- Backlog одного recipient ограничен тремя outstanding request.
- Каждый executable request имеет конечный lease.
- Result и terminal status согласованы и не дублируются.
- Временный файл доступен только заявленным owner и recipient.

## 4. Owned code {#traceability}

- `src/coordinator/store.ts` — данные и очередь.
- `src/coordinator/mcp.ts` — публичный MCP.
- `src/coordinator/server.ts` — worker HTTP и transport.
- `src/coordinator/temporary-files.ts` — lifecycle файлов.
- `deploy/**` — production runtime.

Содержательные изменения получают ссылку на подходящую FEAT/INFRA и общую
PROP.

## 5. Управляющие спеки {#governing-specs}

- `spec://common/PROP-001-DATA#entities`
- `spec://common/PROP-005-RUNTIME#queue`
- `spec://common/PROP-006-API#mcp`

## 6. История изменений {#changelog}

- [2026-07-28] Канон coordinator выделен из существующей архитектуры.
