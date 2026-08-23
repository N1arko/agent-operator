# FEAT-005: Видимое выполнение в Codex Desktop {#root}

## Простыми словами {#plain-language}

Удалённый prompt, ход работы и ответ появляются в обычной карточке Codex
Desktop получателя сразу, включая первый turn новой задачи.

## 1. Цель {#goal}

Сделать удалённое выполнение полноценной пользовательской задачей Desktop с
одним фактическим turn и достоверным result.

## 2. Управляющие спеки {#governing-specs}

- `spec://modules/worker/PROP-101-worker#rules`
- `spec://common/PROP-003-UI#surfaces`
- `spec://common/PROP-005-RUNTIME#lifecycle`
- `spec://common/PROP-006-API#idempotency`

## 3. Границы {#scope}

Входят новая и существующая задача, follower handshake, history load,
read-only result extraction, fallback до принятия команды и interrupt.
Управление интерфейсом мышью или клавиатурой не используется.

## 4. Контекст {#context}

Codex Desktop владеет renderer state. Самостоятельный headless turn сохранялся
в общей state DB, открытая карточка могла не получить prompt и patches.
Follower IPC передаёт turn локальному host Desktop.

## 5. Сценарии {#scenarios}

### Существующая задача {#scenarios.existing}

1. Worker читает thread через read-only app-server.
2. Подключается к локальному IPC и регистрирует following version 1.
3. Открывает `codex://threads/{threadId}`.
4. Ждёт исходный snapshot owner.
5. Отправляет `thread-follower-start-turn`.
6. Desktop выполняет turn и обновляет renderer.
7. Read-only app-server ждёт сохранённый successful turn и берёт финальный
   `agentMessage`.
8. Worker загружает complete history, снимает following и закрывает IPC.

### Новая проектная задача {#scenarios.new}

Worker создаёт пустой именованный thread с нужным cwd, выполняет тот же
handshake и передаёт первый prompt владельцу Desktop.

### Недоступный IPC {#scenarios.fallback}

Если Desktop-команда ещё не принята, worker может выполнить turn через
app-server и открыть deep link. После принятия follower start fallback
запрещён, чтобы не создать дубль.

### Завершение и отмена {#scenarios.terminal}

Сохранённый `completed` с финальным agent message даёт result. Переходный
`interrupted` read-only snapshot продолжает polling. Cancel/lease вызывает
follower interrupt и терминальный cancelled result. После подтверждённого
interrupt worker завершает read-only observation. При timeout interrupt
observation продолжает сопровождать исходный turn, а worker удерживает очередь
до его terminal boundary.

## 6. Данные {#data}

Follower держит connection, conversation snapshot, patches и request map
только во время turn. Thread/turn сохраняются Codex. Worker state хранит
binding и pending request.

## 7. Контракты {#contracts}

- macOS IPC: локальный Unix socket Codex.
- Windows IPC: `\\.\pipe\codex-ipc`.
- `thread-stream-following-changed` v1.
- `thread-follower-start-turn` v2 с `turnStart.request` и
  `turnStart.context`.
- `thread-follower-interrupt-turn`.
- `thread-follower-load-complete-history`.
- app-server `thread/start`, `thread/read`, `turn/*`.

## 8. Ошибки {#errors}

Timeout snapshot, закрытый IPC, rejected follower request, unsupported frame,
не найденный thread и terminal failed/cancelled публикуют конкретный result.
Промежуточное состояние не завершает request раньше Desktop. Read-only
app-server перезапускается и перечитывает thread после потери процесса;
idle timeout не действует при наличии активных observation leases.

## 9. Трассировка реализации {#traceability}

- `src/worker/desktop-follower.ts`, `src/worker/desktop-ipc.ts`
- `src/worker/desktop.ts`, `src/worker/app-server.ts`, `src/worker/worker.ts`
- `test/desktop-follower.test.ts`, `test/desktop-ipc.test.ts`
- `docs/adr/0006-desktop-thread-visibility.md` – `0013`
- исторический live E2E для `v0.1.18` доступен в Git tag `v0.1.18`

## 10. Критерии готовности {#acceptance}

- Новая задача сразу показывает первый prompt и ответ.
- Existing thread сразу показывает новый turn и ответ.
- Каждый request создаёт один user turn, один final answer и один result.
- Открытая карточка обновляется без restart Desktop.
- Mac и Windows проходят живой двусторонний E2E.
- Worker возвращается idle, очередь пуста.
- Timeout follower interrupt оставляет следующий prompt в очереди до
  завершения исходного Desktop turn.
- Несколько observation одного thread не останавливают app-server друг у друга.

## 11. Связи {#relations}

FEAT-002 управляет request lifecycle; FEAT-003 выбирает thread/project.

## 12. История изменений {#changelog}

- [2026-08-23] Актуализирован Desktop follower: отдельный app-server
  освобождает writer после создания thread, start-turn использует v2 envelope,
  ожидание принятия учитывает запуск актуального Desktop host.
- [2026-07-31] Версия 0.1.23 реализовала безопасную cancellation boundary и
  reference-counted lifecycle read-only observations; живой Windows
  post-cutover turn завершился через новый worker.
- [2026-07-28] Сведены AOP-073, 076 и 078, подтверждённые E2E 0.1.18.
