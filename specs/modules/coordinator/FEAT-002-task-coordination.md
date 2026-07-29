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

### Сериализация follow-up {#followup-serialization}

Запросы к одному локальному thread выполняются последовательно. Один
пользовательский intent выбирает один delivery tool и создаёт один исполняемый
request.

- Caller выбирает `agent_send` для связанного Agent Operator request либо
  `agent_thread_send` для точного thread ID. Автоматическая отправка одного
  intent обоими инструментами запрещена.
- Пока исход предыдущего вызова неизвестен, caller ждёт status/result и не
  повторяет эквивалентный запрос.
- Remote follow-up не использует steering активного turn. Queued delivery
  запускает отдельный turn после освобождения worker.
- Повторное получение message ID после restart или сетевого retry не создаёт
  второй input.
- Coordinator атомарно claim-ит queued message до HTTP-ответа. Второй worker
  той же identity не получает его; неподтверждённый claim освобождается после
  короткого delivery lease.
- Второй явно созданный request к тому же thread ждёт завершения активного
  turn.
- Cancel корневого request завершает его связанные queued follow-up и
  освобождает worker.

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

### Выбор профиля выполнения {#execution-profile-selection}

Routing skill выбирает профиль выполнения перед dispatch:

- `fast` — status, короткая read-only проверка, поиск факта;
- `balanced` — стандартная разработка, анализ и ревью;
- `deep` — сложная архитектура, диагностика и рискованные изменения.

Профили являются устойчивыми терминами. Exact model и reasoning разрешаются из
актуального `agent_models` конкретного recipient. Долгоживущие правила skill не
содержат названия моделей.

Явный выбор пользователя имеет приоритет. Слова о скорости и краткости
выбирают `fast`, если риск задачи не требует большей глубины. Крайний
reasoning budget применяется по явному запросу или после управляемой
эскалации. Настройки существующего thread можно переопределить для нового turn.

## 6. Данные и состояние {#data}

Message содержит sender, recipient, root, replyTo, project/thread target,
attachments, model, reasoning, execution profile, selection reason,
idempotency key, lease, cursor и status. Backlog recipient ограничен тремя
outstanding request.

Автоматический выбор сохраняет profile, источник выбора и краткую причину.
Exact model ID остаётся runtime-значением из каталога recipient.

## 7. Контракты {#contracts}

- `agent_start(agentId, projectId, message, attachments?, model?,
  reasoningEffort?, executionProfile?, selectionReason?, idempotencyKey?)`
- `agent_thread_send(agentId, threadId, message, attachments?, model?,
  reasoningEffort?, executionProfile?, selectionReason?, idempotencyKey?)`
- `agent_send(replyTo, message, attachments?, model?, reasoningEffort?,
  executionProfile?, selectionReason?, idempotencyKey?)`
- `agent_cancel(messageId)`
- `agent_wait(afterCursor?, timeoutMs?)`

Model и reasoning проверяются локальным `model/list`; отсутствующие overrides
оставляют настройки recipient.

Routing skill получает model catalog один раз на актуальную сессию или
обновляет его при отказе validation. Versioned mapping разрешает `fast`,
`balanced` и `deep` в поддерживаемые exact values.

## 8. Ошибки {#errors}

Unknown agent, unavailable project, queue capacity, invalid ownership,
unsupported model/reasoning, expired lease и execution failure завершаются
предсказуемой ошибкой или одним failed result. Принятая Desktop-команда не
повторяется через headless path.

## 9. Зарегистрированный дефект {#known-issues}

`FIX-001` зарегистрирован после инцидента
[`docs/incidents/2026-07-28-followup-overlap.md`](../../../docs/incidents/2026-07-28-followup-overlap.md).
Mac-агент отправил доуточнение дважды, а два запроса наложились в одной
Windows-задаче. Coordinator-аудит показывает один `send`, поэтому второй
delivery path требуется восстановить по caller и worker trace. После отмены
корневого request связанный follow-up остался активным.

## 10. Трассировка реализации {#traceability}

- `src/coordinator/mcp.ts`, `src/coordinator/store.ts`
- `src/worker/client.ts`, `src/worker/worker.ts`
- `integrations/skills/coordinate-agents/SKILL.md`
- `test/mcp.test.ts`, `test/store.test.ts`, `test/vertical.test.ts`

## 11. Критерии готовности {#acceptance}

- Новый, связанный и exact-thread request возвращают по одному result.
- Busy worker не теряет активную работу и сохраняет очередь.
- Cursor wait не требует частого polling.
- Cancel и lease освобождают worker.
- Overrides валидируются на принимающем host.
- Короткая задача не получает крайний reasoning budget автоматически.
- Замена model ID в каталоге не требует изменения routing rules.
- Каждый автоматический выбор объясняется profile и причиной.
- Обычные чаты Mac и Windows проходят двусторонний E2E.
- Один пользовательский intent создаёт один request и один input.
- Два явно созданных request к одному thread исполняются последовательно при
  active, boundary, queued и restart сценариях.
- Cancel корневого request не оставляет исполняемый follow-up того же root.

## 12. Связи {#relations}

Использует FEAT-001, FEAT-003 и FEAT-005; attachments определяет FEAT-004;
промежуточные сообщения определяет FEAT-006.

## 13. История изменений {#changelog}

- [2026-07-28] FIX-001 уточнён как двойной dispatch и наложение связанных
  запросов.
- [2026-07-28] Зарегистрирован FIX-002 с model-agnostic профилями выполнения.
- [2026-07-28] Версия 0.1.19 добавила request idempotency, последовательные
  follow-up, каскадную отмену и сохраняемые execution profile/reason.
- [2026-07-28] Версия 0.1.21 добавила atomic inbox claim после живого
  обнаружения двух worker одной identity.
- [2026-07-28] Версия 0.1.22 закрыла гонку cancellation во время принятия
  Desktop-turn: принятый локальный turn прерывается до регистрации active,
  очередь продолжает работу.
- [2026-07-28] Сведены AOP-020–026, 074, 075 и 077 версии 0.1.18.
