# Архитектура MVP

## 1. Общая схема

```mermaid
flowchart LR
    A["Codex · Mac"] -->|"MCP HTTPS"| C["Coordinator · VPS"]
    B["Codex · Windows"] -->|"MCP HTTPS"| C

    C --> DB[("SQLite")]
    C --> TF["Temporary files · local disk"]

    WM["Worker · Mac"] -->|"outbound HTTPS"| C
    WW["Worker · Windows"] -->|"outbound HTTPS"| C

    WM -->|"STDIO"| CAM["codex app-server"]
    WW -->|"STDIO"| CAW["codex app-server"]
```

Coordinator реализует mailbox и presence. Worker управляет локальным агентом.
Production coordinator размещается на SSH-host `clawvpn`.

## 2. Стек

- TypeScript;
- Node.js LTS;
- SQLite;
- Streamable HTTP MCP;
- HTTPS API для worker;
- long polling;
- `codex app-server` по STDIO;
- Caddy для TLS;
- локальная папка временных файлов на VPS.

## 3. Coordinator

Обязанности:

- аутентифицировать worker и MCP-клиентов;
- хранить состояние агентов;
- принимать heartbeat;
- хранить краткие project descriptors, опубликованные worker;
- сохранять и маршрутизировать сообщения;
- выдавать cursor для ожидания;
- хранить временные файлы и удалять их по TTL.

Coordinator не управляет Codex thread и не читает локальные проекты.
Coordinator назначает исполняемым сообщениям конечный lease, фиксирует
`cancelled` отдельно от `failed` и освобождает backlog после истечения срока.

## 4. Worker

Обязанности:

- поддерживать agent identity;
- long polling входящих сообщений;
- публиковать доступные локальные Codex-проекты;
- разрешать `projectId` в primary folder и дополнительные roots;
- запускать app-server по запросу;
- хранить локальное сопоставление корневого `messageId` с `threadId` и
  `projectId`;
- выводить status из событий app-server;
- вести очередь новых запусков;
- доставлять связанное сообщение в активную сессию;
- автоматически публиковать result;
- проверять и разрешать Git-вложения в выбранном проекте;
- задавать понятный заголовок удалённой задаче;
- передавать Desktop deep link как best-effort навигацию;
- загружать и скачивать временные файлы;
- останавливать app-server после idle timeout.

Локальное состояние worker:

```json
{
  "agentId": "mac-codex",
  "threads": {
    "msg_123": {
      "threadId": "019bbb20-...",
      "projectId": "project_agent_operator"
    },
    "msg_456": {
      "threadId": "019ccc30-...",
      "projectId": null
    }
  },
  "activeRequestId": "msg_123",
  "currentProject": {
    "id": "project_agent_operator",
    "displayName": "Agent Operator"
  }
}
```

## 5. SQLite

### `agents`

```text
id
name
token_hash
status
current_project_id
current_project_name
current_activity
active_request_id
last_seen_at
created_at
updated_at
```

### `agent_projects`

```text
agent_id
project_id
display_name
availability
primary_folder_name
additional_folder_count
last_seen_at
```

Worker остаётся источником истины. Таблица является кэшем дескрипторов и не
содержит абсолютные пути.

### `messages`

```text
id
sender_agent_id
recipient_agent_id
kind
body
project_id
project_name
target_thread_id
reply_to
delivery_mode
status
cursor
created_at
delivered_at
completed_at
```

### `temporary_files`

```text
id
owner_agent_id
recipient_agent_id
idempotency_key
name
path
size
sha256
expires_at
created_at
```

Вложения сообщения хранятся как JSON-метаданные. `temporary_file` ссылается на
запись `temporary_files`.

## 6. MCP-контракт

### `agents_list`

Возвращает краткий список зарегистрированных worker-агентов. Чаты и полный
список проектов в ответ не входят.

```json
{
  "agents": [
    {
      "id": "mac-codex",
      "status": "busy",
      "currentProject": "Agent Operator",
      "currentActivity": "Изучаю структуру проектов"
    }
  ]
}
```

### `agent_status`

Возвращает подробное состояние конкретного агента и cursor последнего
изменения.

### `agent_projects`

```json
{
  "agentId": "mac-codex"
}
```

Возвращает опубликованные project descriptors:

```json
{
  "projects": [
    {
      "id": "project_agent_operator",
      "displayName": "Agent Operator",
      "availability": "available"
    }
  ]
}
```

### `agent_start`

```json
{
  "agentId": "mac-codex",
  "projectId": "project_agent_operator",
  "message": "Изучи структуру проектов и подготовь рекомендации.",
  "attachments": [
    {
      "type": "git_file",
      "repository": "git@github.com:example/project.git",
      "revision": "a12bc34d",
      "path": "docs/plan.md",
      "sha256": "..."
    }
  ]
}
```

Создаёт корневое сообщение без `replyTo`. Свободный агент создаёт свежий
thread в выбранном проекте. Занятый агент сохраняет запуск в очереди.
Coordinator принимает до трёх незавершённых запросов на одного worker.
`attachments` принимает до 20 Git-файлов.
Опциональные `model` и `reasoningEffort` проверяются принимающим worker по
локальному каталогу Codex.

### `agent_models`

Ставит bounded-запрос `model/list` на выбранный worker. Результат через
`agent_wait` содержит доступные модели, модель по умолчанию и поддерживаемые
reasoning efforts.

### `agent_threads`

```json
{
  "agentId": "windows-codex",
  "query": "обновление worker",
  "limit": 10
}
```

Создаёт mailbox-запрос к выбранному worker. Worker читает только локальную
state DB Codex через `thread/list` с `useStateDbOnly: true`. Лимит составляет
от 1 до 20 записей. Результат приходит через `agent_wait` и содержит краткие
метаданные без абсолютных путей.

### `agent_thread_send`

```json
{
  "agentId": "windows-codex",
  "threadId": "019bbb20-...",
  "message": "Продолжи работу и верни текущий статус."
}
```

Продолжает существующую локальную задачу по точному ID. `projectId` не
требуется. Worker сохраняет исходный `cwd` задачи. Активная задача возвращает
результат со статусом `failed`; отправитель повторяет запрос после её
освобождения.

### `agent_send`

```json
{
  "agentId": "mac-codex",
  "message": "Обрати внимание на архивные проекты.",
  "replyTo": "msg_123",
  "attachments": []
}
```

`replyTo` должен указывать активный или известный запрос получателя.
Если связанный thread сейчас активен, worker использует steering или безопасную
границу. Если thread завершён, worker вызывает `thread/resume` и начинает новый
turn. Если агент занят другим thread, сообщение ожидает освобождения.

### `agent_wait`

```json
{
  "agentId": "mac-codex",
  "afterCursor": 42,
  "timeoutMs": 30000
}
```

Возвращает новые сообщения и актуальный status. Timeout ограничен серверной
конфигурацией.

### `agent_cancel`

Принимает точный ID запроса исходного отправителя. Coordinator переводит
запрос в `cancelled`, создаёт один result и передаёт worker команду остановки.
Для активного Desktop-owned turn worker вызывает
`thread-follower-interrupt-turn`.

## 7. Worker API

```text
POST /v1/agents/register
POST /v1/agents/heartbeat
POST /v1/agents/projects
POST /v1/messages/poll
POST /v1/messages/{id}/delivered
POST /v1/messages
POST /v1/files
GET  /v1/files/{id}
POST /v1/files/{id}/ack
```

Worker использует только исходящие HTTPS-запросы.

## 8. Доставка сообщений

### Свободный агент

```text
agent_start queued
  → worker получает сообщение
  → worker разрешает projectId
  → lazy-start app-server
  → thread/start
  → cwd = primary folder
  → additional roots = secondary project folders
  → turn/start
  → busy
```

### Занятый агент

Связанный `agent_send` доставляется в активный turn через поддерживаемый
механизм steering или на ближайшей безопасной границе. Точное поведение
проверяется в техническом эксперименте.

Несвязанный `agent_start` остаётся в очереди до `turn/completed`.

### Завершение

```text
item/completed(agentMessage)
  → worker сохраняет финальный текст
turn/completed
  → worker выбирает final_answer для завершённого turn
  → создаёт result
  → result.replyTo = activeRequestId
  → status = idle
  → запускает следующий agent_start
```

При ошибке worker создаёт сообщение `error` и продолжает очередь.

## 9. Локальная Codex-сессия

Worker хранит mapping `rootMessageId → threadId + projectId` локально.
Coordinator получает status, активное входящее сообщение и снимок названия
проекта. `projectId` имеет значение `null`, если существующая задача не
сопоставлена опубликованному проекту.

### Новый запуск

1. Worker получает `agent_start`.
2. Разрешает `projectId` в локальный проект Codex.
3. Проверяет availability.
4. Создаёт свежий thread.
5. Запускает turn с primary folder как `cwd`.
6. Сохраняет mapping по ID корневого сообщения.

### Продолжение

`agent_send` с `replyTo` проходит по цепочке сообщений к корневому запросу.
Worker находит mapping и продолжает соответствующий thread в прежнем проекте.

После перезапуска:

1. Worker загружает локальные bindings и `pendingMessages`.
2. Восстанавливает очередь из общего state file.
3. Запускает app-server для первого ожидающего запроса.
4. Вызывает `thread/resume` для связанной задачи.

### Существующая задача

1. `agent_threads` выполняет bounded-поиск по state DB без обхода rollout.
2. Worker удаляет `cwd` из результата и добавляет project descriptor при
   локальном совпадении.
3. `agent_thread_send` проверяет точный ID через `thread/read` без turns.
4. На Windows worker подключается к локальному Desktop follower IPC.
5. Worker открывает `codex://threads/<threadId>` и отправляет
   `thread-follower-start-turn`.
6. Локальный host Desktop выполняет turn и публикует поток в открытом
   интерфейсе.
7. Read-only app-server ждёт сохранённый успешный turn и извлекает финальный
   `agentMessage`.
8. Завершение возвращается обычным result-сообщением с `threadId`.

После принятия Desktop-команды fallback не применяется, что исключает
дублирование turn. Если Desktop IPC недоступен до принятия команды, worker
использует headless app-server и открывает deep link. Решение и Windows E2E
зафиксированы в ADR-0010 и `docs/E2E_WINDOWS_DESKTOP_0.1.14.md`.

### Новая проектная задача в Desktop

Для `agent_start` worker сначала создаёт пустую именованную задачу через
app-server с `cwd` выбранного проекта. Первый prompt передаётся владельцу
Desktop через тот же `thread-follower-start-turn`, который используется при
продолжении. macOS принимает IPC через `$CODEX_HOME/ipc/ipc.sock`, Windows —
через `\\.\pipe\codex-ipc`.

Такой порядок сохраняет проект и заголовок до запуска, а renderer получает
первый turn из собственного host. Read-only app-server отвечает только за
возврат сохранённого результата coordinator. Решение и Mac E2E зафиксированы
в ADR-0011 и `docs/E2E_MAC_DESKTOP_0.1.15.md`.

Codex App Server поддерживает создание, возобновление, steering, interrupt,
передачу `cwd` и поток событий. Официальное описание:
<https://learn.chatgpt.com/docs/app-server>.

Публичная документация не фиксирует API списка локальных Codex-проектов и
стабильность их ID. `AOP-001` проверяет сгенерированные app-server schemas и
локальную модель проекта. Fallback — worker-local registry с непрозрачными ID;
coordinator получает только дескрипторы.

## 10. Передача Git-файла

Отправитель формирует:

```json
{
  "type": "git_file",
  "repository": "git@github.com:example/project.git",
  "revision": "a12bc34d",
  "path": "docs/plan.md",
  "sha256": "..."
}
```

Получатель:

1. Проверяет относительный Git path и формат commit hash.
2. Сопоставляет repository с remote выбранного локального проекта, учитывая
   SSH- и HTTPS-формы одного URL.
3. Проверяет наличие commit в локальной object database.
4. Выполняет `git fetch` совпавшего remote, если commit отсутствует.
5. Разрешает полный commit hash и проверяет наличие path через `git cat-file`.
6. Потоково вычисляет SHA-256 содержимого blob.
7. Добавляет в prompt проверенный manifest и инструкцию
   `git show <revision>:<path>`.

Worker не выполняет checkout, не меняет текущую ветку и не применяет commit
автоматически. Ошибка repository, revision, path или checksum завершает запрос
со статусом `failed` до запуска Codex turn.

## 11. Передача временного файла

1. Отправляющий локальный клиент загружает бинарное содержимое через
   `POST /v1/files` и указывает получателя, имя и idempotency key.
2. Coordinator проверяет размер и quota, вычисляет SHA-256 и создаёт
   непрозрачный `fileId`.
3. MCP проверяет владельца, получателя и точное совпадение метаданных перед
   созданием сообщения.
4. Получающий worker скачивает файл через `GET /v1/files/:fileId` в каталог,
   привязанный к `messageId` и `fileId`.
5. Worker проверяет срок действия, размер и SHA-256.
6. Codex получает абсолютный локальный временный путь в manifest prompt.
7. После публикации результата worker вызывает
   `POST /v1/files/:fileId/ack` и удаляет локальную копию.
8. Просроченные файлы очищаются во время файловых операций и на heartbeat.

Coordinator принимает файлы только через явную операцию отправителя.

Начальные ограничения:

```text
maximum file size: 10 MiB
retention period: 24 hours
per-agent quota: 50 MiB
attachments per message: 20
```

Подробное решение зафиксировано в
[`ADR-0009`](adr/0009-temporary-file-lifecycle.md).

## 12. Жизненный цикл app-server

```text
worker online
  → входящее сообщение
  → start app-server
  → initialize
  → resume thread
  → start turn
  → open active thread in ChatGPT Desktop
  → process turn events
  → idle timeout
  → graceful shutdown
```

Worker остаётся онлайн после остановки app-server.

Стартовая конфигурация:

```text
max active turns: 1
idle timeout: 5 minutes
heartbeat: configurable
polling: long polling
```

Технический эксперимент измеряет:

- idle CPU worker;
- idle RSS worker;
- RSS app-server;
- cold-start time;
- `thread/resume` time;
- active CPU/RSS;
- корректное освобождение процесса.

Документация Codex не задаёт численные resource budgets, поэтому пороги
фиксируются после измерения на Mac и Windows.

## 13. Безопасность MVP

- HTTPS;
- случайный token на агента;
- хеш token в SQLite;
- отзыв token;
- ограничение размера файлов;
- безопасные имена файлов;
- непрозрачные storage names;
- checksum;
- TTL;
- очистка содержимого сообщений и путей из технических логов;
- OpenAI credentials только на локальном host.

## 14. Структура репозитория

```text
agent-operator/
├── apps/
│   ├── coordinator/
│   └── worker/
├── packages/
│   ├── protocol/
│   └── app-server-client/
├── docs/
│   ├── adr/
│   ├── ARCHITECTURE.md
│   ├── CHECKPOINT_WINDOWS.md
│   ├── DEPLOYMENT_CLAWVPN.md
│   └── PROJECT_BRIEF.md
├── KANBAN.md
└── README.md
```

## 15. Вертикальный прототип

```text
Windows Codex
  → agent_status(mac-codex)
  → agent_projects(mac-codex)
  → agent_start(mac-codex, projectId)
  → Mac worker starts Codex
  → Windows agent_wait(cursor)
  → Mac turn/completed
  → automatic result
  → Windows receives Git or temporary attachment
```

## 16. Production target

Coordinator разворачивается контейнером на `clawvpn`. Профиль сервера и
ограничения deployment описаны в
[`DEPLOYMENT_CLAWVPN.md`](DEPLOYMENT_CLAWVPN.md).

Реальный Windows-worker подключается на обязательной контрольной точке
[`CP-WIN-01`](CHECKPOINT_WINDOWS.md). До неё используются локальные тестовые
agent identities. На checkpoint основной Codex формирует актуальную задачу для
Windows Codex с фактическими командами, URL и версией worker.
