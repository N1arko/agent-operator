# PROP-006: API-контракты и ошибки {#root}

## Простыми словами {#plain-language}

Codex обращается к coordinator через MCP. Worker обращается к нему через HTTPS.
Все изменяющие операции имеют явного отправителя, получателя и проверяемое
состояние.

## 1. Общий формат {#format}

- Transport: JSON over HTTPS; MCP использует Streamable HTTP.
- Время: UTC ISO 8601.
- Message/thread/file ID: UUID.
- Cursor: непрозрачное для клиента возрастающее целое.
- Входы валидируются Zod.
- Ответ MCP содержит structured content.

## 2. Доступ {#auth}

Coordinator сопоставляет bearer token с caller agent ID. Worker и MCP-клиент
видят только операции, доступные этой identity. Worker использует исходящие
запросы. Связанный message и cancel проверяют принадлежность исходному caller.

## 3. MCP {#mcp}

| Tool | Семантика |
| --- | --- |
| `agents_list` | список зарегистрированных агентов и состояния |
| `agent_status` | состояние одного агента |
| `agent_projects` | опубликованные project descriptors |
| `agent_start` | свежая задача в выбранном проекте |
| `agent_models` | bounded discovery моделей recipient |
| `agent_threads` | bounded поиск до 20 локальных задач |
| `agent_thread_send` | новый turn по точному thread ID |
| `agent_send` | follow-up по `replyTo` |
| `agent_cancel` | отмена точного request ID |
| `agent_wait` | обновления после cursor, timeout до 30 секунд |

`agent_start`, `agent_thread_send` и `agent_send` принимают опциональные
`model` и `reasoningEffort`. Recipient сверяет их со своим каталогом.

## 4. Worker HTTP {#worker-http}

Канонические группы endpoint:

- `GET /health`;
- heartbeat и long-poll inbox;
- acknowledgement доставки и публикация result;
- upload, download и acknowledgement временных файлов;
- `POST /mcp`.

Точный route contract принадлежит текущей реализации
`src/coordinator/server.ts` и проверяется HTTP-тестами.

## 5. Ошибки {#errors}

Ошибки должны сохранять конкретную причину: неизвестный agent, недоступный
project, переполненная очередь, неверная attachment metadata, истёкший lease,
недоступный Desktop IPC, неподдерживаемая model/reasoning, checksum mismatch
или отсутствующий thread. Терминальный request получает один result со
статусом `failed` либо `cancelled`.

## 6. Идемпотентность и повторы {#idempotency}

- Cursor позволяет безопасно повторять ожидание.
- Message ID и durable status предотвращают повторное исполнение.
- Publish result дедуплицируется по завершённому request.
- Upload временного файла использует idempotency key.
- Ack и cleanup безопасны при повторе.
- Сетевые вызовы имеют bounded timeout; повтор не должен создавать второй
  Desktop turn после принятия follower-команды.

## 7. История изменений {#changelog}

- [2026-07-28] Описаны MCP и worker API версии 0.1.18.
