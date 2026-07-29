# FEAT-006: Промежуточные обновления удалённой задачи {#root}

## Простыми словами {#plain-language}

Пока удалённый Codex работает, отправитель получает осмысленные промежуточные
сообщения, видит текущий план и понимает, что итог ещё готовится.

## 1. Цель {#goal}

Сделать длительную удалённую работу наблюдаемой через существующий mailbox и
`agent_wait`, сохранив явную границу финального результата.

## 2. Управляющие спеки {#governing-specs}

- `spec://modules/coordinator/PROP-100-coordinator#rules`
- `spec://modules/worker/FEAT-005-desktop-visible-delivery#contracts`
- `spec://common/PROP-003-UI#states`
- `spec://common/PROP-005-RUNTIME#queue`
- `spec://common/PROP-006-API#idempotency`

## 3. Границы {#scope}

### Входит {#scope.in}

- завершённые `agentMessage` с phase `commentary`;
- актуальный snapshot `turn/plan/updated`;
- компактные activity-события выполнения инструментов;
- явный признак промежуточного сообщения;
- доставка через cursor и `agent_wait`;
- дедупликация, debounce, restart recovery и bounded retention.

### За границей {#scope.out}

- raw reasoning и reasoning text deltas;
- полный stdout/stderr команд;
- поток каждого текстового токена;
- отдельный web-интерфейс;
- изменение финальной границы `turn/completed`.

## 4. Участники и trigger {#actors}

Recipient worker наблюдает активный Codex turn. После появления нового
осмысленного progress item он публикует update исходному caller. Caller
показывает update пользователю и продолжает ожидание того же root request.

## 5. Сценарии {#scenarios}

### Commentary {#scenarios.commentary}

Завершённый `agentMessage` с `phase: commentary` создаёт immutable update.
Длинный message может обновляться с debounce; coordinator хранит только
значимые revision.

### План {#scenarios.plan}

`turn/plan/updated` публикуется как заменяемый snapshot с текущими step и
status. Следующая revision заменяет представление плана у клиента.

### Activity {#scenarios.activity}

Command, file change и tool items переводятся в компактные статусы вроде
«выполняет команды» или «проверяет тесты». Локальные пути и сырой command
output в update не включаются.

### Финал {#scenarios.final}

`agentMessage` с `phase: final_answer` ожидает `turn/completed`. После
терминального события worker публикует `result` с `isFinal: true`. Update
всегда содержит `isFinal: false`.

### Восстановление {#scenarios.recovery}

После restart worker перечитывает активный turn, сравнивает item/revision с
последней подтверждённой публикацией и продолжает без повторов.

## 6. Данные и состояние {#data}

Progress update содержит:

- `rootMessageId`, `replyTo`, `threadId`, `turnId`;
- `itemId` и монотонную `revision`;
- `phase: commentary | plan | activity`;
- `isFinal: false`;
- текст или структурированный plan snapshot;
- timestamp.

Ключ дедупликации:
`requestId + turnId + itemId + revision`. Coordinator хранит updates в
порядке cursor вместе с цепочкой запроса. Retention совпадает с retention
связанного request.

## 7. Контракты {#contracts}

- Worker progress publication принимает idempotency key и update payload.
- `agent_wait` возвращает `update` и `result` в общем cursor-порядке.
- `update` не меняет request в терминальный status.
- `result` после `turn/completed` остаётся единственным терминальным
  сообщением.
- Routing skill продолжает ожидание после `isFinal: false`.

## 8. Источники событий {#event-sources}

Headless app-server:

- `item/completed` для `agentMessage`;
- `turn/plan/updated`;
- lifecycle command, file и tool items;
- `turn/completed` для терминальной границы.

Desktop-owned turn:

- follower conversation snapshot и patches;
- read-only `thread/read` для сохранённого состояния;
- `thread-follower-load-complete-history` после завершения.

Follower state является предпочтительным источником того, что отображается в
Desktop. Item ID и revision связывают live patches с сохранённой историей.

## 9. Ошибки и ограничения {#errors}

- Потеря отдельного update не завершает request.
- Retry с тем же ключом не создаёт второй update.
- Переполнение progress quota объединяет старые activity updates и сохраняет
  последние commentary, plan и terminal result.
- Недоступный progress source оставляет heartbeat/activity и финальный result.
- Ошибка публикации update повторяется с bounded backoff и не блокирует
  выполнение turn.

## 10. Трассировка реализации {#traceability}

- `src/shared/protocol.ts` — update schema и phase.
- `src/coordinator/store.ts`, `src/coordinator/server.ts` — idempotent storage.
- `src/coordinator/mcp.ts` — выдача update через `agent_wait`.
- `src/worker/app-server.ts` — extraction app-server events.
- `src/worker/desktop-follower.ts` — extraction follower patches.
- `src/worker/worker.ts` — progress lifecycle и retry.
- `integrations/skills/coordinate-agents/SKILL.md` — ожидание до final.

## 11. Критерии готовности {#acceptance}

- Caller получает commentary до завершения длительного turn.
- Каждый update явно содержит `isFinal: false`.
- Final result появляется только после terminal turn status.
- Один item/revision доставляется не более одного раза.
- Restart worker не повторяет уже подтверждённые updates.
- Поток ограничен по частоте, размеру и количеству.
- Raw reasoning и полный command output отсутствуют в coordinator.
- Mac → Windows и Windows → Mac E2E показывают минимум один update и один
  terminal result в правильном cursor-порядке.

## 12. Связи {#relations}

Расширяет FEAT-002 и использует event lifecycle FEAT-005.

## 13. История изменений {#changelog}

- [2026-07-28] Спецификация создана по результатам исследования app-server и
  Desktop follower событий.
- [2026-07-28] Реализован поток версии 0.1.19: idempotent update, cursor-order,
  follower/app-server extraction, bounded activity и явный final boundary.
- [2026-07-28] Версия 0.1.20 добавила read-only snapshot extraction активного
  Desktop turn после живого Windows E2E без update.
- [2026-07-28] Версия 0.1.22 подтверждена двусторонним E2E: Mac → Windows
  update пришёл до трёх последовательных results, Windows → Mac update cursor
  459 предшествовал terminal result cursor 460.
