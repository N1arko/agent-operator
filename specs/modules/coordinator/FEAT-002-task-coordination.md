# FEAT-002: Координация задач {#root}

## Простыми словами {#plain-language}

Один Codex отправляет другому новую работу или уточнение, видит очередь,
ожидает обновление, может отменить запрос и получает единственный итог.

## 1. Цель {#goal}

Обеспечить последовательную, устойчивую и наблюдаемую координацию между
независимыми агентами.

## 2. Управляющие спеки {#governing-specs}

- `spec://modules/coordinator/PROP-100-coordinator#rules`
- `spec://common/PROP-004-PRODUCT#rules`
- `spec://common/PROP-005-RUNTIME#queue`
- `spec://common/PROP-006-API#idempotency`

## 3. Границы {#scope}

Входят создание request, follow-up, очередь, wait, result, model overrides,
lease и cancel. Локальное разрешение project/thread описывает FEAT-003,
Desktop-представление — FEAT-005.

## 4. Участники и trigger {#actors}

Caller выбирает recipient и отправляет:

- свежую работу в project через `agent_start`;
- turn в точный thread через `agent_thread_send`;
- связанное уточнение через `agent_send`.

Routing skill позволяет выполнить этот выбор из обычного чата после
`agents_list`.

## 5. Сценарии {#scenarios}

### Новый запрос {#scenarios.start}

1. Coordinator проверяет agent, project, очередь и attachments.
2. Создаёт durable `start` message.
3. Свободный worker получает его через long poll.
4. Занятый worker сохраняет request в очереди.
5. Worker выполняет turn и публикует один result.

### Follow-up {#scenarios.followup}

`agent_send` проверяет принадлежность `replyTo`, находит противоположную сторону
и сохраняет message с тем же root. Worker продолжает связанный thread после
освобождения безопасной границы.

### Ожидание {#scenarios.wait}

`agent_wait(afterCursor, timeoutMs)` возвращает новые адресованные сообщения и
следующий cursor. Timeout до 30 секунд можно повторять без дубликатов.

### Отмена и lease {#scenarios.cancel}

Caller отменяет свой request по точному ID. Coordinator ставит `cancelled`;
worker прерывает активный Desktop turn либо удаляет queued item. Истёкший lease
даёт терминальный результат и освобождает очередь.

### Параллельность {#scenarios.concurrency}

Разные worker выполняют независимые запросы одновременно. Один worker
исполняет один turn, discovery и новые request остаются упорядоченными в его
mailbox.

## 6. Данные и состояние {#data}

Message содержит sender, recipient, root, replyTo, project/thread target,
attachments, model, reasoning, lease, cursor и status. Backlog recipient
ограничен тремя outstanding request.

## 7. Контракты {#contracts}

- `agent_start(agentId, projectId, message, attachments?, model?,
  reasoningEffort?)`
- `agent_thread_send(agentId, threadId, message, attachments?, model?,
  reasoningEffort?)`
- `agent_send(replyTo, message, attachments?, model?, reasoningEffort?)`
- `agent_cancel(messageId)`
- `agent_wait(afterCursor?, timeoutMs?)`

Model и reasoning проверяются локальным `model/list`; отсутствующие overrides
оставляют настройки recipient.

## 8. Ошибки {#errors}

Unknown agent, unavailable project, queue capacity, invalid ownership,
unsupported model/reasoning, expired lease и execution failure завершаются
предсказуемой ошибкой или одним failed result. Принятая Desktop-команда не
повторяется через headless path.

## 9. Трассировка реализации {#traceability}

- `src/coordinator/mcp.ts`, `src/coordinator/store.ts`
- `src/worker/client.ts`, `src/worker/worker.ts`
- `integrations/skills/coordinate-agents/SKILL.md`
- `test/mcp.test.ts`, `test/store.test.ts`, `test/vertical.test.ts`

## 10. Критерии готовности {#acceptance}

- Новый, связанный и exact-thread request возвращают по одному result.
- Busy worker не теряет активную работу и сохраняет очередь.
- Cursor wait не требует частого polling.
- Cancel и lease освобождают worker.
- Overrides валидируются на принимающем host.
- Обычные чаты Mac и Windows проходят двусторонний E2E.

## 11. Связи {#relations}

Использует FEAT-001, FEAT-003 и FEAT-005; attachments определяет FEAT-004.

## 12. История изменений {#changelog}

- [2026-07-28] Сведены AOP-020–026, 074, 075 и 077 версии 0.1.18.
