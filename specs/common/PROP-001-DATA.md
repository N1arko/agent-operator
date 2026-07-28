# PROP-001: Данные и хранение {#root}

## Простыми словами {#plain-language}

Coordinator хранит минимальные метаданные связи и временные файлы. Worker
хранит локальные пути, очередь и сопоставление запросов с задачами Codex.

## 1. Назначение {#goal}

Зафиксировать сущности, владельцев, источники истины, идентификаторы, сроки
хранения и восстановление.

## 2. Сущности {#entities}

| Сущность | Владелец | Хранилище | Инварианты |
| --- | --- | --- | --- |
| Agent | coordinator | SQLite `agents` | один ID на worker; статус выводится из heartbeat |
| ProjectDescriptor | worker | локальный registry; кэш SQLite | публичный ID непрозрачен; абсолютного пути в coordinator нет |
| Message | coordinator | SQLite `messages` | UUID, монотонный cursor, один root, явный recipient |
| ThreadBinding | worker | локальный state JSON | `rootMessageId → threadId + projectId` |
| PendingMessage | worker | локальный state JSON | переживает restart; один активный turn |
| TemporaryFile | coordinator + recipient worker | локальные временные каталоги | owner/recipient, SHA-256, TTL и quota |
| GitFileAttachment | Git | Git object database | repository, commit, relative path и checksum |

## 3. Состояния и связи {#states}

Agent: `idle | busy | offline | error`.

Message kind:
`start | send | threads_query | thread_send | models_query | cancel | result`.

Message status:
`queued → delivered → completed`, с терминальными ветками `failed` и
`cancelled`.

`rootMessageId` связывает весь обмен. `replyTo` указывает конкретное предыдущее
сообщение. `targetThreadId` используется для точного продолжения локальной
задачи. Result содержит `threadId`, когда он известен.

## 4. Источники истины {#sources}

- SQLite coordinator — agents, опубликованные дескрипторы, сообщения, cursors
  и метаданные временных файлов.
- Локальный worker state — bindings, pending queue и active request.
- Локальный `projects.json` — project ID, display name и абсолютный путь.
- Codex state/app-server — существующие thread и сохранённые turn.
- Git commit — содержимое `git_file`.
- Файл coordinator до TTL и скачанная копия worker до результата —
  содержимое `temporary_file`.

Project descriptor в SQLite является кэшем. Worker публикует его заново.
Скачанный временный файл можно получить повторно до acknowledgement или TTL.

## 5. Идентификаторы и время {#conventions}

- Message, thread и temporary file используют UUID.
- Cursor — возрастающее целое coordinator.
- Project и agent ID — стабильные строки локальной конфигурации.
- Время передаётся в UTC ISO 8601.
- Offline выводится по давности heartbeat.
- Удаление временного файла выполняется после result/ack либо по TTL.
- История сообщений сохраняется для маршрутизации и аудита текущего MVP.

## 6. Миграции и восстановление {#migrations}

SQLite создаёт отсутствующие таблицы и совместимые колонки при старте.
Перед production rollout создаётся согласованный snapshot. Rollback версии
сопровождается проверкой совместимости базы. Worker state записывается
атомарной заменой файла и загружается при старте.

## 7. История изменений {#changelog}

- [2026-07-28] Описана фактическая модель данных версии 0.1.18.
